// HTML renderers for the Today, Weight, Badges and Profile tabs.
import { ACTIVITY_LEVELS, bmi, evaluateDay, healthyWeightRange, sumNutrition } from "./calc.js";
import { weightChart } from "./chart.js";
import { addDays, diffDays, MEALS, periodOf, prettyDate, timeStr } from "./dates.js";
import { MAX_OPTIONS, assessOptions, explain, winners } from "./compare.js";
import { NUTRIENTS, isFiltered, shownKeys } from "./nutrients.js";
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
  const marks = (c.min != null ? `<i class="mark min" style="left:${pct(c.min)}%"></i>` : "") +
    (c.max != null ? `<i class="mark max" style="left:${pct(c.max)}%"></i>` : "");
  const val = c.unit === "std drinks" ? fmt(c.value, 1) : fmt(c.value);
  return `<div class="nrow"><div class="nhead"><span>${esc(c.label)}</span>
    <span class="nval ${statusClass(c.status)}">${val} <small>/ ${limitText(c)}</small></span></div>
    <div class="bar"><div class="fill ${statusClass(c.status)}" style="width:${pct(c.value)}%"></div>${marks}</div></div>`;
}

/** Every limit that is exceeded. Streak limits are always listed; the others (fat, carbs, protein, cholesterol) if their nutrient is shown. */
function overLimits(ev, shown) {
  return ev.checks.filter(c => c.status === "over" && (c.streak || shown.has(c.key)));
}

const joinList = xs => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs[0] || "");

function dayMessage(ev, t, kcal, overs) {
  const named = joinList(overs.map(c => c.label.toLowerCase()));
  if (ev.state === "empty") return ["muted", "Nothing logged yet — add your first meal below."];
  if (ev.state === "pending") return ["medium", `${fmt(t.kcal.min - kcal)} kcal to go to reach your daily minimum.${overs.length ? ` Already over your limit for ${named}.` : ""}`];
  if (ev.state === "pass") return ["low", `Within your limits — this day counts towards your streak.${overs.length ? ` Over a guideline for ${named}.` : ""}`];
  if (overs.length) return ["high", `Over your limit for ${named}.`];
  return ["high", `Under your minimum of ${fmt(t.kcal.min)} kcal — this day won't count towards your streak.`];
}

/** One line per exceeded limit: value, limit and how far over. */
function overDetails(overs) {
  if (!overs.length) return "";
  const d = c => (c.unit === "std drinks" ? 1 : 0);
  return `<ul class="overlist">${overs.map(c => `<li><b>${esc(c.label)}</b>: ${fmt(c.value, d(c))} / ${fmt(c.max, d(c))} ${c.unit === "std drinks" ? "std drinks" : esc(c.unit)}
    <span class="high">(+${fmt(c.value - c.max, d(c))})</span>${c.streak ? "" : ' <small class="muted">guideline only</small>'}</li>`).join("")}</ul>`;
}

/** Today's weight (or the last one, with a reminder to weigh in) for the Today dashboard. */
function weightCard(s, date, today) {
  const onDay = s.weights.filter(w => w.date === date);
  const goal = s.profile?.goalKg;
  const toGoal = kg => (goal ? `<span class="muted"> · ${fmt(Math.abs(kg - goal), 1)} kg ${kg > goal ? "to lose" : kg < goal ? "to gain" : "— at goal"}</span>` : "");
  if (date !== today) {
    if (!onDay.length) return `<div class="card wcard"><span>⚖️ <span class="muted">No weigh-in on this day</span></span></div>`;
    const last = onDay[onDay.length - 1];
    return `<div class="card wcard"><span>⚖️ Weight <b>${fmt(last.kg, 1)} kg</b>${last.time ? ` <span class="muted">(${esc(last.time)})</span>` : ""}${toGoal(last.kg)}</span></div>`;
  }
  if (onDay.length) {
    const last = onDay[onDay.length - 1];
    return `<div class="card wcard"><span>⚖️ Weighed today: <b>${fmt(last.kg, 1)} kg</b>${last.time ? ` <span class="muted">(${esc(last.time)})</span>` : ""}${toGoal(last.kg)}</span>
      <a class="link" href="#weight">Details</a></div>`;
  }
  const last = s.weights[s.weights.length - 1];
  const ago = last ? diffDays(today, last.date) : null;
  return `<div class="card wcard remind">
    <div>⚖️ <b>Time to weigh yourself!</b>${last ? ` <span class="muted">Last: ${fmt(last.kg, 1)} kg, ${ago === 1 ? "yesterday" : ago + " days ago"}${toGoal(last.kg)}</span>` : ""}</div>
    <form id="quickWeight" class="row"><label>Weight (kg)<input type="number" name="kg" step="0.1" min="20" max="400" inputmode="decimal" value="${last ? last.kg : ""}" required></label>
      <button class="btn primary" type="submit">Log now</button></form></div>`;
}

function dayView(s, date, today, info) {
  const shown = shownKeys(s);
  const t = targetsFor(s, date);
  const entries = s.log[date] || [];
  const totals = sumNutrition(entries);
  const ev = evaluateDay(totals, t, { final: date < today, hasEntries: entries.length > 0 });
  const kc = ev.checks[0];
  const top = Math.max(t.kcal.max * 1.15, kc.value * 1.02);
  const pct = v => Math.min(100, (v / top) * 100);
  const kcls = ev.state === "pass" ? "low" : ev.state === "fail" ? "high" : "medium";
  const overs = overLimits(ev, shown);
  const [mcls, msg] = dayMessage(ev, t, kc.value, overs);

  const meals = MEALS.map(m => {
    const list = entries.filter(e => e.meal === m.id);
    const sub = list.reduce((a, e) => a + (e.n?.energy_kcal || 0), 0);
    return `<section class="meal card" id="meal-${m.id}"><header><h3>${m.icon} ${m.label} <small>${m.range}</small></h3><span class="msub">${fmt(sub)} kcal</span></header>
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
    ${weightCard(s, date, today)}
    <div class="card">
      <div class="khead"><div><span class="kbig">${fmt(kc.value)}</span> <span class="muted">/ ${fmt(t.kcal.target)} kcal target</span></div>
        <span class="streakchip">🔥 ${info.stats.streak}-day streak</span></div>
      <div class="bar kbar"><div class="fill ${kcls}" style="width:${pct(kc.value)}%"></div>
        <i class="mark min" style="left:${pct(t.kcal.min)}%" title="Minimum"></i><i class="mark tgt" style="left:${pct(t.kcal.target)}%" title="Your target"></i><i class="mark max" style="left:${pct(t.kcal.max)}%" title="Ideal maximum"></i></div>
      <div class="kzones" aria-hidden="true"><i class="z low" style="width:${pct(t.kcal.min)}%"></i><i class="z ok" style="width:${pct(t.kcal.max) - pct(t.kcal.min)}%"></i><i class="z high" style="width:${100 - pct(t.kcal.max)}%"></i></div>
      <ul class="klegend">
        <li><i class="sw min"></i><span><b>Minimum</b> ${fmt(t.kcal.min)} kcal <small>eat at least this</small></span></li>
        <li><i class="sw tgt"></i><span><b>Your target</b> ${fmt(t.kcal.target)} kcal <small>your daily goal</small></span></li>
        <li><i class="sw max"></i><span><b>Ideal max</b> ${fmt(t.kcal.max)} kcal <small>try not to go above</small></span></li></ul>
      <p class="fine">Shading: <i class="sw low"></i>too low · <i class="sw ok"></i>healthy range (${fmt(t.kcal.min)}–${fmt(t.kcal.max)}) · <i class="sw high"></i>above max</p>
      <p class="msg ${mcls}">${esc(msg)}</p>
      ${overDetails(overs)}
    </div>
    <div class="card"><h2>Nutrients</h2>
      <p class="fine tickkey"><i class="sw min"></i>minimum <i class="sw max"></i>limit (ticks on each bar)</p>${ev.checks.slice(1).filter(c => shown.has(c.key)).map(meter).join("")}
      ${isFiltered(s) ? `<p class="fine">Some nutrients are hidden (<a href="#profile">Profile → Display</a>). They still count towards your limits and streak.</p>` : ""}
      <p class="fine">Streak limits: calories within min–max, plus sodium, sugars, saturated fat and alcohol under their caps. Sugars are total sugars (database doesn't split added sugar), so fruit and milk count.</p></div>
    ${meals}
    <div class="center"><a class="btn" href="#compare">⚖ Can't decide? Compare meal options</a></div>`;
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

function displayCard(s) {
  const custom = isFiltered(s), on = shownKeys(s);
  return `<div class="card"><h2>Display: nutrients to show</h2>
    <p class="muted">Choose what appears on Today, food details and meal comparisons. Calories are always shown. Hidden nutrients are still tracked for your limits and streak.</p>
    <div class="radios">
      <label class="check"><input type="radio" name="nutrientMode" data-pref="mode" value="all" ${custom ? "" : "checked"}> Show all nutrients</label>
      <label class="check"><input type="radio" name="nutrientMode" data-pref="mode" value="custom" ${custom ? "checked" : ""}> Show only the ones I pick</label></div>
    <div class="checklist ${custom ? "" : "off"}">${NUTRIENTS.map(n => `<label class="check"><input type="checkbox" data-pref="nutrient" value="${n.key}" ${on.has(n.key) ? "checked" : ""} ${custom ? "" : "disabled"}> ${esc(n.label)}</label>`).join("")}</div></div>`;
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
    ${displayCard(s)}
    <div class="card"><h2>Your data</h2>
      <p class="muted">Everything is stored on this device only. Export a backup before clearing browser data or switching phones.</p>
      <div class="row"><button class="btn" data-action="export">Export backup</button>
        <label class="btn">Import backup<input type="file" id="importFile" accept="application/json" hidden></label>
        <button class="btn danger" data-action="reset">Erase everything</button></div></div>`;
}


// ---------------------------------------------------------------- meal comparison
const FIT_TEXT = { ok: "Within your limits", warn: "Slightly over", over: "Over a limit" };
const FIT_ICON = { ok: "✓", warn: "!", over: "✕" };

export function compareView(s, today) {
  const cmp = s.compare || { options: [], includeToday: true };
  const opts = cmp.options;
  const hasProfile = !!(s.profile && s.weights.length);
  const t = hasProfile ? targetsFor(s, today) : null;
  const dayTotals = t && cmp.includeToday ? sumNutrition(s.log[today] || []) : null;
  const direction = t ? t.direction : "maintain";
  const shown = shownKeys(s);
  const r = assessOptions(opts, { targets: t, dayTotals, direction });

  const optionCards = opts.map(o => {
    const tot = o.items.reduce((a, i) => a + (i.n?.energy_kcal || 0), 0);
    return `<section class="card cmpopt"><div class="cmphead">
        <input class="cmpname" data-cmp-name="${esc(o.id)}" value="${esc(o.name)}" maxlength="30" aria-label="Option name">
        ${opts.length > 2 ? `<button class="icon" data-action="cmp-remove" data-opt="${esc(o.id)}" aria-label="Remove ${esc(o.name)}">✕</button>` : ""}</div>
      ${o.items.length ? `<ul class="entries">${o.items.map(i => `<li><div class="einfo"><div class="ename">${esc(i.name)}</div>
          <div class="esub">${esc(i.amountLabel || "")}${i.estimated ? ' <span class="tag est">estimate</span>' : ""}</div></div>
          <div class="ekcal">${fmt(i.n?.energy_kcal)}</div>
          <button class="icon" data-action="cmp-del-item" data-opt="${esc(o.id)}" data-id="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">✕</button></li>`).join("")}</ul>
        <p class="cmptotal"><b>${fmt(tot)} kcal</b> total</p>` : '<p class="muted">Nothing added yet.</p>'}
      <div class="mealbtns"><button class="btn" data-action="cmp-add" data-opt="${esc(o.id)}">＋ Add food</button>
        <button class="btn" data-action="cmp-describe" data-opt="${esc(o.id)}">✎ Describe it</button>
        <button class="btn" data-action="cmp-copy" data-opt="${esc(o.id)}">⧉ From my log</button></div></section>`;
  }).join("");

  let results = "";
  if (r.assessed.length >= 2) {
    const best = r.best, second = r.assessed[1];
    const ex = explain(best, second, direction);
    const sentence = r.tie ? "These options are very similar. Pick whichever you prefer."
      : `${esc(best.name)} ${best.fit && best.fit.level === "ok" && second.fit && second.fit.level !== "ok" ? "keeps you within your limits and " : ""}comes out ahead${ex.pros.length ? `: ${esc(ex.pros.join(", "))}` : ""}.${ex.cons.length ? ` Trade-off: ${esc(ex.cons.join(", "))}.` : ""}`;
    const win = winners(r.assessed, direction);
    const cell = (a, field, text) => `<td class="${(win[field] || []).includes(a.id) ? "win" : ""}">${text}${(win[field] || []).includes(a.id) ? ' <span class="winmark" aria-label="best">✓</span>' : ""}</td>`;
    const anyAlcohol = r.assessed.some(a => a.totals.alcohol_g > 0);
    const rows = NUTRIENTS.filter(n => shown.has(n.key) && (n.key !== "alcohol" || anyAlcohol))
      .map(n => `<tr><th>${esc(n.short)}</th>${r.assessed.map(a => cell(a, n.field, `${fmt(a.totals[n.field], n.unit === "mg" ? 0 : 1)} ${n.unit}`)).join("")}</tr>`).join("");
    results = `<div class="card verdict ${r.tie ? "tie" : "best"}"><h2>${r.tie ? "⚖ Too close to call" : `✅ Best fit: ${esc(best.name)}`}</h2><p>${sentence}</p></div>
      <div class="card"><div class="tablewrap"><table class="cmptable"><thead><tr><th></th>${r.assessed.map(a =>
          `<th>${esc(a.name)}${!r.tie && a.id === best.id ? ' <span class="bestbadge">★ best</span>' : ""}</th>`).join("")}</tr></thead>
        <tbody><tr><th>Calories</th>${r.assessed.map(a => cell(a, "energy_kcal", `<b>${fmt(a.totals.energy_kcal)}</b> kcal`)).join("")}</tr>${rows}
        ${t ? `<tr class="fitrow"><th>Fits your day?</th>${r.assessed.map(a => `<td class="fit ${a.fit.level}">${FIT_ICON[a.fit.level]} ${FIT_TEXT[a.fit.level]}${a.fit.over.length ? `<small>${esc(a.fit.over.map(o => o.label.toLowerCase()).join(", "))}</small>` : ""}</td>`).join("")}</tr>` : ""}
        <tr><th></th>${r.assessed.map(a => `<td><button class="btn ${a.id === best.id && !r.tie ? "primary" : ""} small" data-action="cmp-choose" data-opt="${esc(a.id)}">Go with this</button></td>`).join("")}</tr>
        </tbody></table></div>
      <p class="fine">${t ? `Judged against your daily limits${cmp.includeToday ? ", counting what you've already eaten today" : ""}. ` : ""}Calories: ${direction === "lose" ? "fewer is better while you're losing weight" : direction === "gain" ? "more is better while you're gaining weight" : "not scored, as you're maintaining"}. ✓ marks the best value in a row. Overall balance (protein, fibre, saturated fat, sugar, sodium) breaks ties.</p></div>`;
  } else {
    results = `<div class="card center"><p class="muted">Add food to at least two options to see how they compare.</p></div>`;
  }

  return `<div class="card"><p>Build two or more possible meals, see how each fits your day, then pick the better one.</p>
      ${t ? `<label class="check"><input type="checkbox" data-cmp="include-today" ${cmp.includeToday ? "checked" : ""}> Count what I've already eaten today (${fmt(sumNutrition(s.log[today] || []).energy_kcal)} kcal)</label>`
          : `<p class="fine">Set up your <a href="#profile">profile</a> to also see how each option fits your daily limits.</p>`}</div>
    ${optionCards}
    <div class="row spread"><button class="btn" data-action="cmp-new" ${opts.length >= MAX_OPTIONS ? "disabled" : ""}>＋ Add another option</button>
      <button class="btn" data-action="cmp-reset">Start over</button></div>
    ${results}`;
}
