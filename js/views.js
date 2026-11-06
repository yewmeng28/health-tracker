// HTML renderers for the Today, Weight, Badges and Profile tabs.
import { ACTIVITY_LEVELS, bmi, evaluateDay, healthyWeightRange, sumNutrition } from "./calc.js";
import { weightChart } from "./chart.js";
import { addDays, MEALS, periodOf, prettyDate, timeStr } from "./dates.js";
import { calendarView } from "./calendar.js";
import { targetsFor } from "./badges.js";
import { computeTargets } from "./calc.js";
import { latestWeightOn } from "./store.js";
import { esc, fmt, statusClass } from "./ui.js";

const setupPrompt = () => `<div class="card center">
  <h2>Set up your profile</h2>
  <p>Add your age, height, weight and activity so I can work out your daily minimum and ideal maximum.</p>
  <a class="btn primary" href="#profile">Set up profile</a></div>`;

function limitText(c) {
  const u = c.unit === "std drinks" ? " std" : c.unit === "kcal" ? "" : ` ${c.unit}`;
  if (c.min != null && c.max != null) return `${fmt(c.min)}–${fmt(c.max)}${u}`;
  if (c.max != null) return `≤ ${fmt(c.max)}${u}`;
  return `≥ ${fmt(c.min)}${u}`;
}

function meter(c) {
  const top = (c.max ?? c.min * 1.5) * 1.25;
  const pct = v => Math.min(100, (v / top) * 100);
  const marks = (c.min != null ? `<i class="mark" style="left:${pct(c.min)}%"></i>` : "") +
    (c.max != null ? `<i class="mark max" style="left:${pct(c.max)}%"></i>` : "");
  const val = c.unit === "std drinks" ? fmt(c.value, 1) : fmt(c.value);
  return `<div class="nrow"><div class="nhead"><span>${esc(c.label)}</span>
    <span class="nval ${statusClass(c.status)}">${val} <small>/ ${limitText(c)}</small></span></div>
    <div class="bar"><div class="fill ${statusClass(c.status)}" style="width:${pct(c.value)}%"></div>${marks}</div></div>`;
}

function dayMessage(ev, t, kcal) {
  if (ev.state === "empty") return ["muted", "Nothing logged yet — add your first meal below."];
  if (ev.state === "pending") return ["medium", `${fmt(t.kcal.min - kcal)} kcal to go to reach your daily minimum.`];
  if (ev.state === "pass") return ["low", "Within your limits — this day counts towards your streak."];
  const over = ev.checks.filter(c => c.streak && c.status === "over").map(c => c.label.toLowerCase());
  if (over.length) return ["high", `Over your limit for ${over.join(", ")}.`];
  return ["high", `Under your minimum of ${fmt(t.kcal.min)} kcal — this day won't count towards your streak.`];
}

function dayView(s, date, today, info) {
  const t = targetsFor(s, date);
  const entries = s.log[date] || [];
  const totals = sumNutrition(entries);
  const ev = evaluateDay(totals, t, { final: date < today, hasEntries: entries.length > 0 });
  const kc = ev.checks[0];
  const top = Math.max(t.kcal.max * 1.15, kc.value * 1.02);
  const pct = v => Math.min(100, (v / top) * 100);
  const kcls = ev.state === "pass" ? "low" : ev.state === "fail" ? "high" : "medium";
  const [mcls, msg] = dayMessage(ev, t, kc.value);

  const meals = MEALS.map(m => {
    const list = entries.filter(e => e.meal === m.id);
    const sub = list.reduce((a, e) => a + (e.n?.energy_kcal || 0), 0);
    return `<section class="meal card"><header><h3>${m.icon} ${m.label} <small>${m.range}</small></h3><span class="msub">${fmt(sub)} kcal</span></header>
      ${list.length ? `<ul class="entries">${list.map(e => `<li><div class="einfo"><div class="ename">${esc(e.name)}</div>
        <div class="esub">${esc(e.amountLabel || "")}${e.estimated ? ' <span class="tag est">estimate</span>' : ""}</div></div>
        <div class="ekcal">${fmt(e.n?.energy_kcal)}</div>
        <button class="icon" data-action="edit-entry" data-id="${e.id}" aria-label="Edit ${esc(e.name)}">✎</button>
        <button class="icon" data-action="del-entry" data-id="${e.id}" aria-label="Remove ${esc(e.name)}">✕</button></li>`).join("")}</ul>` : ""}
      <div class="mealbtns"><button class="btn" data-action="add-search" data-meal="${m.id}">＋ Search foods</button>
        <button class="btn" data-action="add-fav" data-meal="${m.id}">★ Favourites</button>
        <button class="btn" data-action="add-describe" data-meal="${m.id}">✎ Describe it</button></div></section>`;
  }).join("");

  return `<div class="datenav"><button class="icon" data-action="day-prev" aria-label="Previous day">‹</button>
      <div><strong>${esc(prettyDate(date, today))}</strong>${date !== today ? ` <button class="link" data-action="day-today">Back to today</button>` : ""}</div>
      <button class="icon" data-action="day-next" aria-label="Next day" ${date >= today ? "disabled" : ""}>›</button></div>
    <div class="card">
      <div class="khead"><div><span class="kbig">${fmt(kc.value)}</span> <span class="muted">/ ${fmt(t.kcal.target)} kcal target</span></div>
        <span class="streakchip">🔥 ${info.stats.streak}-day streak</span></div>
      <div class="bar kbar"><div class="fill ${kcls}" style="width:${pct(kc.value)}%"></div>
        <i class="mark" style="left:${pct(t.kcal.min)}%"></i><i class="mark tgt" style="left:${pct(t.kcal.target)}%"></i><i class="mark max" style="left:${pct(t.kcal.max)}%"></i></div>
      <div class="klabels"><span>Min ${fmt(t.kcal.min)}</span><span>Target ${fmt(t.kcal.target)}</span><span>Ideal max ${fmt(t.kcal.max)}</span></div>
      <p class="msg ${mcls}">${esc(msg)}</p>
    </div>
    <div class="card"><h2>Nutrients</h2>${ev.checks.slice(1).map(meter).join("")}
      <p class="fine">Streak limits: calories within min–max, plus sodium, sugars, saturated fat and alcohol under their caps. Sugars are total sugars (database doesn't split added sugar), so fruit and milk count.</p></div>
    ${meals}`;
}

const segToggle = (action, mode, options) => `<div class="seg wide">${options.map(([v, l]) =>
  `<button class="${mode === v ? "on" : ""}" data-action="${action}" data-mode="${v}">${l}</button>`).join("")}</div>`;

const DEFAULT_UI = { todayMode: "day", weightMode: "chart", calMonth: null, calSelected: null };

export function todayView(s, date, today, info, ui = { ...DEFAULT_UI, calMonth: today.slice(0, 7) }) {
  if (!s.profile || !s.weights.length) return setupPrompt();
  const seg = segToggle("mode-today", ui.todayMode, [["day", "Day"], ["calendar", "Calendar"]]);
  return seg + (ui.todayMode === "calendar" ? calendarView(s, today, ui, "food") : dayView(s, date, today, info));
}

export function weightView(s, today, range, ui = { ...DEFAULT_UI, calMonth: today.slice(0, 7) }) {
  const w = s.weights;
  const cur = w[w.length - 1], first = w[0];
  const goal = s.profile?.goalKg;
  const cutoff = range === "all" ? null : addDays(today, -Number(range));
  const pts = cutoff ? w.filter(p => p.date >= cutoff) : w;
  const h = s.profile?.heightCm;
  let stats = "";
  if (cur) {
    const change = cur.kg - first.kg;
    const toGoal = goal ? cur.kg - goal : null;
    const bm = h ? bmi(cur.kg, h) : null;
    const [lo, hi] = h ? healthyWeightRange(h) : [];
    stats = `<div class="stats">
      <div><span>Current</span><b>${fmt(cur.kg, 1)} kg</b></div>
      <div><span>Change</span><b class="${change <= 0 ? "low" : "medium"}">${change > 0 ? "+" : ""}${fmt(change, 1)} kg</b></div>
      <div><span>${goal ? "To goal" : "Goal"}</span><b>${goal ? `${toGoal > 0 ? "" : "+"}${fmt(Math.abs(toGoal), 1)} kg ${toGoal > 0 ? "to lose" : toGoal < 0 ? "to gain" : "— reached!"}` : `<a href="#profile">set</a>`}</b></div>
      ${bm ? `<div><span>BMI</span><b>${fmt(bm, 1)}</b></div>` : ""}</div>
      ${h ? `<p class="fine">Healthy BMI range for ${h} cm is about ${fmt(lo, 1)}–${fmt(hi, 1)} kg.</p>` : ""}`;
  }
  let progress = "";
  if (cur && goal && first.kg !== goal) {
    const done = Math.max(0, Math.min(100, ((first.kg - cur.kg) / (first.kg - goal)) * 100));
    progress = `<div class="nrow"><div class="nhead"><span>Progress to goal</span><span class="nval">${fmt(done)}%</span></div>
      <div class="bar"><div class="fill low" style="width:${done}%"></div></div></div>`;
  }
  const rows = [...w].reverse().slice(0, 30).map((p, i, arr) => {
    const prev = arr[i + 1];
    const d = prev ? p.kg - prev.kg : null;
    return `<li><span>${esc(prettyDate(p.date, today))}${p.time ? ` <small>${esc(p.time)} · ${periodOf(p.time)}</small>` : ""}</span><b>${fmt(p.kg, 1)} kg</b>
      <span class="${d == null ? "muted" : d <= 0 ? "low" : "medium"}">${d == null ? "" : (d > 0 ? "+" : "") + fmt(d, 1)}</span>
      <button class="icon" data-action="del-weight" data-date="${p.date}" data-time="${p.time || ""}" aria-label="Delete weigh-in">✕</button></li>`;
  }).join("");

  const form = `<div class="card"><h2>Log weight</h2>
      <form id="weightForm" class="row">
        <label>Date <input type="date" name="date" value="${today}" max="${today}" required></label>
        <label>Time <input type="time" name="time" value="${timeStr()}"></label>
        <label>Weight (kg) <input type="number" name="kg" step="0.1" min="20" max="400" inputmode="decimal" value="${cur ? cur.kg : ""}" required></label>
        <button class="btn primary" type="submit">Save</button></form>
      <p class="fine">Body weight can swing 0.5–1.5 kg over a day, so weighing at a similar time (e.g. first thing in the morning) gives a clearer trend. You can log more than one weigh-in a day.</p></div>`;
  const seg = segToggle("mode-weight", ui.weightMode, [["chart", "Chart"], ["calendar", "Calendar"]]);
  if (ui.weightMode === "calendar") return form + seg + calendarView(s, today, ui, "weight");

  return `${form}${seg}
    <div class="card"><div class="chead"><h2>Weight over time</h2>
        <div class="seg">${[["30", "30d"], ["90", "90d"], ["all", "All"]].map(([v, l]) =>
          `<button class="${range === v ? "on" : ""}" data-action="range" data-range="${v}">${l}</button>`).join("")}</div></div>
      ${weightChart(pts, goal)}${progress}${stats}</div>
    ${w.length ? `<div class="card"><h2>History</h2><ul class="wlist">${rows}</ul></div>` : ""}`;
}

export function badgesView(info) {
  const { stats, list } = info;
  const earned = list.filter(b => b.earned).length;
  return `<div class="card hero"><div class="bigflame">🔥</div>
      <div><div class="kbig">${stats.streak}</div><div class="muted">day streak</div></div>
      <div class="hstat"><b>${stats.bestStreak}</b><span>best streak</span></div>
      <div class="hstat"><b>${stats.passDays}</b><span>days in limits</span></div>
      <div class="hstat"><b>${earned}/${list.length}</b><span>badges</span></div></div>
    <p class="fine pad">A day counts when calories are between your minimum and ideal maximum, and sodium, sugars, saturated fat and alcohol stay under their caps. Today never breaks your streak until a limit is exceeded.</p>
    <div class="badges">${list.map(b => `<div class="badge ${b.earned ? "earned" : "locked"}">
      <div class="bicon" aria-hidden="true">${b.icon}</div><div class="bname">${esc(b.name)}</div>
      <div class="bdesc">${esc(b.desc)}</div>
      ${b.earned ? `<div class="bdone">${b.earnedOn ? "Earned " + esc(b.earnedOn) : "Earned"}</div>`
        : `<div class="bar small"><div class="fill low" style="width:${Math.min(100, (b.have / b.need) * 100)}%"></div></div><div class="bprog">${fmt(Math.min(b.have, b.need), b.have % 1 ? 1 : 0)} / ${b.need}</div>`}
    </div>`).join("")}</div>`;
}

export function profileView(s, today) {
  const p = s.profile || {};
  const cur = latestWeightOn(s.weights, today);
  let targets = "";
  if (s.profile && cur) {
    const t = computeTargets(s.profile, cur.kg);
    const row = (l, v, note = "") => `<tr><th>${l}</th><td>${v}</td><td class="muted">${note}</td></tr>`;
    const warn = [];
    if (s.profile.age < 18) warn.push("These formulas are designed for adults. Please ask a doctor or dietitian for guidance for under-18s.");
    const gb = s.profile.goalKg ? bmi(s.profile.goalKg, s.profile.heightCm) : null;
    if (gb && gb < 18.5) warn.push(`A goal of ${s.profile.goalKg} kg gives a BMI of ${fmt(gb, 1)}, which is underweight. Consider a higher goal.`);
    warn.push(...t.notes);
    targets = `<div class="card"><h2>Your daily targets</h2>
      <p class="muted">Based on ${fmt(cur.kg, 1)} kg · BMR ${fmt(t.bmr)} kcal · maintenance ${fmt(t.tdee)} kcal · goal: <b>${t.direction}</b></p>
      ${warn.map(w => `<p class="msg high">${esc(w)}</p>`).join("")}
      <table class="targets">
        ${row("Calories", `${fmt(t.kcal.min)} – ${fmt(t.kcal.max)} kcal`, `target ${fmt(t.kcal.target)}`)}
        ${row("Protein", `${fmt(t.protein.min)} – ${fmt(t.protein.max)} g`, "by body weight &amp; activity")}
        ${row("Carbohydrate", `${fmt(t.carbs.min)} – ${fmt(t.carbs.max)} g`, "45–65% of energy, ≥130 g")}
        ${row("Fat", `${fmt(t.fat.min)} – ${fmt(t.fat.max)} g`, "20–35% of energy")}
        ${row("Saturated fat", `≤ ${fmt(t.satFat.max)} g`, "&lt;10% of energy")}
        ${row("Sugars", `≤ ${fmt(t.sugars.max)} g`, "WHO: &lt;10% of energy")}
        ${row("Fibre", `≥ ${fmt(t.fibre.min)} g`, "14 g per 1000 kcal")}
        ${row("Sodium", `${fmt(t.sodium.min)} – ${fmt(t.sodium.max)} mg`, "WHO: &lt;2000 mg")}
        ${row("Cholesterol", `≤ ${fmt(t.cholesterol.max)} mg`, "general guide")}
        ${row("Alcohol", `≤ ${t.alcohol.maxStd} std drink${t.alcohol.maxStd > 1 ? "s" : ""}`, "HPB low-risk guide; none is safest")}
      </table>
      <p class="fine">General guidance from standard formulas (Mifflin-St Jeor) and public-health guidelines, not medical advice. Check with a doctor or dietitian, especially if you have a medical condition.</p></div>`;
  }
  const opt = (v, cur, l) => `<option value="${v}"${String(cur) === String(v) ? " selected" : ""}>${l}</option>`;
  return `<div class="card"><h2>About you</h2>
      <form id="profileForm" class="form">
        <label>Sex (used for the BMR formula)<select name="sex" required>${opt("female", p.sex, "Female")}${opt("male", p.sex, "Male")}</select></label>
        <label>Age<input type="number" name="age" min="10" max="110" value="${p.age ?? ""}" required></label>
        <label>Height (cm)<input type="number" name="heightCm" min="100" max="230" value="${p.heightCm ?? ""}" required></label>
        <label>Current weight (kg)<input type="number" name="kg" step="0.1" min="20" max="400" value="${cur ? cur.kg : ""}" required></label>
        <label>Exercise frequency<select name="activity" required>${ACTIVITY_LEVELS.map(a => opt(a.id, p.activity || "light", a.label)).join("")}</select></label>
        <label>Goal weight (kg)<input type="number" name="goalKg" step="0.1" min="20" max="400" value="${p.goalKg ?? ""}" required></label>
        <label>Pace<select name="rateKgPerWeek">${[0.25, 0.5, 0.75].map(v => opt(v, p.rateKgPerWeek || 0.5, `${v} kg / week${v === 0.5 ? " (recommended)" : ""}`)).join("")}</select></label>
        <button class="btn primary" type="submit">Save profile</button></form></div>
    ${targets}
    <div class="card"><h2>Your data</h2>
      <p class="muted">Everything is stored on this device only. Export a backup before clearing browser data or switching phones.</p>
      <div class="row"><button class="btn" data-action="export">Export backup</button>
        <label class="btn">Import backup<input type="file" id="importFile" accept="application/json" hidden></label>
        <button class="btn danger" data-action="reset">Erase everything</button></div></div>`;
}
