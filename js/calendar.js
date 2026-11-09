// Month calendar showing how each day went (food or weight), plus a detail panel for a selected day.
import { dayColor, evaluateDay, goalDirection, sumNutrition } from "./calc.js";
import { targetsFor } from "./badges.js";
import { MEALS, addDays, monthOf, parseDate, periodOf, prettyDate, dateStr } from "./dates.js";
import { esc, fmt } from "./ui.js";

const SYMBOL = { green: "✓", yellow: "!", red: "✕", empty: "" };

export function dayInfo(state, date, today) {
  const entries = state.log[date] || [];
  const t = targetsFor(state, date);
  const totals = sumNutrition(entries);
  let ev = null, color = "empty";
  if (t) {
    ev = evaluateDay(totals, t, { final: date < today, hasEntries: entries.length > 0 });
    color = dayColor(ev, { isToday: date === today });
  }
  return { date, entries, totals, t, ev, color };
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const WEIGHT_NOISE = 0.2;   // kg of tolerance: scales read to 0.1 kg and the average is only an estimate

/**
 * Weight colour for a day: the day's average weight versus the average of the previous 7 days
 * (each day counted once, however many weigh-ins it has). If there is nothing in the last 7 days it falls back to the
 * most recent earlier weigh-in; the very first weigh-in is green.
 * Towards your goal (or within 0.5 kg when maintaining) is green; a small move the wrong way is yellow; a bigger one red.
 */
export function weightDay(state, date) {
  const todays = state.weights.filter(w => w.date === date);
  if (!todays.length) return { color: "empty", entries: [], mean: null, delta: null, ref: null };
  const dayMean = mean(todays.map(w => w.kg));

  const from = addDays(date, -7), to = addDays(date, -1);
  const byDay = new Map();
  for (const w of state.weights) {
    if (w.date >= from && w.date <= to) { if (!byDay.has(w.date)) byDay.set(w.date, []); byDay.get(w.date).push(w.kg); }
  }
  let ref = null;
  if (byDay.size) ref = { kg: mean([...byDay.values()].map(mean)), kind: byDay.size === 1 ? "previous weigh-in" : `${byDay.size}-day average`, days: byDay.size };
  else {
    const prev = state.weights.filter(w => w.date < date).pop();
    if (prev) ref = { kg: prev.kg, kind: `last weigh-in (${prev.date})`, days: 1 };
  }
  if (!ref) return { color: "green", entries: todays, mean: dayMean, delta: null, ref: null };

  const delta = dayMean - ref.kg;
  const dir = goalDirection(ref.kg, state.profile?.goalKg);
  let color;
  if (dir === "maintain") color = Math.abs(delta) <= 0.5 ? "green" : Math.abs(delta) <= 1 ? "yellow" : "red";
  else {
    const wrong = dir === "lose" ? delta : -delta;                  // positive = moving away from the goal
    color = wrong <= WEIGHT_NOISE ? "green" : wrong <= 0.5 ? "yellow" : "red";
  }
  return { color, entries: todays, mean: dayMean, delta, ref };
}

/** Weeks (Monday first) for a YYYY-MM month; null for padding cells. */
export function monthGrid(month) {
  const first = parseDate(month + "-01");
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(dateStr(new Date(first.getFullYear(), first.getMonth(), d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const shiftMonth = (month, n) => monthOf(dateStr(new Date(parseDate(month + "-01").getFullYear(), parseDate(month + "-01").getMonth() + n, 1)));

const LABEL = {
  food: { green: "Within limits", yellow: "Warning", red: "Over a limit", empty: "Nothing logged" },
  weight: { green: "Towards your goal", yellow: "Small move away from goal", red: "Bigger move away from goal", empty: "No weigh-in" },
};

function foodDetail(state, info, today) {
  const { ev, t, totals, entries } = info;
  if (!t) return `<p class="muted">Set up your profile to see targets for this day.</p>`;
  const k = ev.checks[0];
  const flagged = ev.checks.filter(c => c.status === "over" || (c.status === "under" && (c.streak || c.key === "kcal" || c.key === "protein" || c.key === "fibre")));
  const flags = flagged.map(c => {
    const u = c.unit === "std drinks" ? " std drinks" : c.unit === "kcal" ? " kcal" : " " + c.unit;
    const lim = c.status === "over" ? `limit ${fmt(c.max, c.unit === "std drinks" ? 1 : 0)}` : `minimum ${fmt(c.min)}`;
    return `<li class="${c.status === "over" ? "high" : "medium"}">${esc(c.label)}: ${fmt(c.value, c.unit === "std drinks" ? 1 : 0)}${u} — ${c.status} (${lim})</li>`;
  }).join("");
  const meals = MEALS.map(m => {
    const list = entries.filter(e => e.meal === m.id);
    return list.length ? `<li>${m.icon} ${m.label}: <b>${fmt(list.reduce((a, e) => a + (e.n?.energy_kcal || 0), 0))}</b> kcal · ${list.length} item${list.length > 1 ? "s" : ""}</li>` : "";
  }).join("");
  return `<p><b>${fmt(k.value)}</b> kcal <span class="muted">(minimum ${fmt(t.kcal.min)}, ideal max ${fmt(t.kcal.max)})</span></p>
    ${flags ? `<ul class="plain">${flags}</ul>` : entries.length ? `<p class="low">Everything is within range.</p>` : ""}
    ${meals ? `<ul class="plain muted">${meals}</ul>` : ""}`;
}

function weightDetail(state, wd, date) {
  if (!wd.entries.length) return `<p class="muted">No weight logged on this day.</p>`;
  const goal = state.profile?.goalKg;
  const rows = wd.entries.map(w => `<li><b>${fmt(w.kg, 1)} kg</b>${w.time ? ` <span class="muted">· ${esc(w.time)} (${periodOf(w.time)})</span>` : ""}</li>`).join("");
  const last = wd.entries[wd.entries.length - 1];
  return `<ul class="plain">${rows}</ul>
    ${wd.entries.length > 1 ? `<p class="muted">Day average: ${fmt(wd.mean, 1)} kg</p>` : ""}
    ${wd.delta != null ? `<p>Versus your ${esc(wd.ref.kind)} of ${fmt(wd.ref.kg, 1)} kg: <b class="${wd.color === "green" ? "low" : wd.color === "yellow" ? "medium" : "high"}">${wd.delta > 0 ? "+" : ""}${fmt(wd.delta, 1)} kg</b></p>` : `<p class="muted">First weigh-in, nothing to compare with yet.</p>`}
    ${goal ? `<p class="muted">${fmt(Math.abs(last.kg - goal), 1)} kg ${last.kg > goal ? "above" : last.kg < goal ? "below" : "at"} your ${goal} kg goal.</p>` : ""}`;
}

export function dayDetail(state, date, today, mode) {
  const info = dayInfo(state, date, today);
  const wd = weightDay(state, date);
  const color = mode === "weight" ? wd.color : info.color;
  return `<div class="card caldetail" data-date="${date}">
    <div class="calhead"><h2>${esc(prettyDate(date, today))} <small>${esc(date)}</small></h2>
      <span class="calbadge ${color}">${SYMBOL[color]} ${esc(LABEL[mode][color])}</span></div>
    ${mode === "weight" ? weightDetail(state, wd, date) + `<p class="fine">Food that day: ${esc(LABEL.food[info.color])}.</p>`
      : foodDetail(state, info, today) + (wd.entries.length ? `<p class="fine">Weight that day: ${wd.entries.map(w => fmt(w.kg, 1) + " kg").join(", ")}.</p>` : "")}
    <button class="btn primary" data-action="show-day" data-date="${date}">Show full breakdown</button></div>`;
}

export function calendarView(state, today, ui, mode) {
  const month = ui.calMonth;
  const weeks = monthGrid(month);
  const counts = { green: 0, yellow: 0, red: 0 };
  const grid = weeks.map(week => week.map(d => {
    if (!d) return `<span class="cal-pad"></span>`;
    const future = d > today;
    const color = future ? "empty" : mode === "weight" ? weightDay(state, d).color : dayInfo(state, d, today).color;
    if (counts[color] != null) counts[color]++;
    const label = `${prettyDate(d, today)}: ${future ? "upcoming" : LABEL[mode][color]}`;
    return `<button class="cal-day ${color}${d === today ? " today" : ""}${d === ui.calSelected ? " sel" : ""}" data-action="cal-select" data-date="${d}" aria-label="${esc(label)}" ${future ? "disabled" : ""}>
      <span>${Number(d.slice(8))}</span><i aria-hidden="true">${SYMBOL[color]}</i></button>`;
  }).join("")).join("");
  const title = parseDate(month + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const atCurrent = month >= monthOf(today);
  const legend = mode === "weight"
    ? [["green", "Towards goal / stable"], ["yellow", "Small move away"], ["red", "Bigger move away"], ["empty", "No weigh-in"]]
    : [["green", "Within limits"], ["yellow", "Warning"], ["red", "Over a limit"], ["empty", "Nothing logged"]];
  return `<div class="card">
    <div class="calnav"><button class="icon" data-action="cal-prev" aria-label="Previous month">‹</button>
      <strong>${esc(title)}</strong>
      <button class="icon" data-action="cal-next" aria-label="Next month" ${atCurrent ? "disabled" : ""}>›</button></div>
    <div class="calgrid" role="group" aria-label="${esc(title)}">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<span class="calwd">${d}</span>`).join("")}${grid}</div>
    <div class="callegend">${legend.map(([c, l]) => `<span><i class="dotc ${c}"></i>${esc(l)}</span>`).join("")}</div>
    <p class="fine">${mode === "weight" ? "Each day's average weight is compared with your average over the previous 7 days, so normal daily swings don't count against you (0.2 kg tolerance)." :
      "Green days count towards your streak. Yellow: under your calorie minimum (often an incomplete log) or a limit exceeded by up to 10%. Red: a limit exceeded by more than 10%."}
      ${counts.green + counts.yellow + counts.red ? ` This month: ${counts.green} green · ${counts.yellow} yellow · ${counts.red} red.` : ""}</p>
  </div>${ui.calSelected ? dayDetail(state, ui.calSelected, today, mode) : `<p class="fine pad">Tap a day for details.</p>`}`;
}
