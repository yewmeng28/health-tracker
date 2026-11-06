import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// minimal localStorage so store.js can run under Node
const mem = {};
globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };

const { computeTargets, dayColor, evaluateDay, scaleNutrition, sumNutrition } = await import("../js/calc.js");
const { calendarView, dayDetail, dayInfo, monthGrid, shiftMonth, weightDay } = await import("../js/calendar.js");
const { addDays, minutesOf, periodOf } = await import("../js/dates.js");
const store = await import("../js/store.js");
const { buildIndex, parseDescription } = await import("../js/estimator.js");
const { weightChart } = await import("../js/chart.js");
const { todayView, weightView } = await import("../js/views.js");
const { evaluateBadges } = await import("../js/badges.js");

const foods = JSON.parse(readFileSync(new URL("../food_nutrition.json", import.meta.url))).foods;
const today = "2026-11-10";
const profile = { sex: "male", age: 30, heightCm: 175, activity: "moderate", goalKg: 75, rateKgPerWeek: 0.5 };
const t = computeTargets(profile, 82);
const base = () => { const s = store.defaultState(); s.profile = profile; s.weights = [{ date: addDays(today, -30), kg: 82 }]; return s; };
const n = (kcal, extra = {}) => ({ energy_kcal: kcal, protein_g: 80, carbohydrate_g: 150, total_fat_g: 50, saturated_fat_g: 10, fibre_g: 25, sugars_g: 30, sodium_mg: 1500, cholesterol_mg: 100, alcohol_g: 0, ...extra });
const day = (s, date, nut) => { s.log[date] = [{ id: date, meal: "lunch", name: "x", n: nut }]; };

// ---------- calendar colours ----------
test("dayColor: green, yellow (close), red (over), under-minimum, empty", () => {
  const ev = nut => evaluateDay(sumNutrition([{ n: nut }]), t, { final: true });
  assert.equal(dayColor(evaluateDay(sumNutrition([]), t, { hasEntries: false })), "empty");
  assert.equal(dayColor(ev(n(t.kcal.target))), "green");
  assert.equal(dayColor(ev(n(t.kcal.target, { sodium_mg: 2100 }))), "yellow");            // 5% over
  assert.equal(dayColor(ev(n(t.kcal.target, { sodium_mg: 2600 }))), "red");               // 30% over
  assert.equal(dayColor(ev(n(t.kcal.max + 200))), "yellow");                              // ~7% over the calorie max
  assert.equal(dayColor(ev(n(t.kcal.max * 1.3))), "red");
  assert.equal(dayColor(ev(n(t.kcal.min * 0.85))), "yellow");                             // under the minimum: warning
  assert.equal(dayColor(ev(n(t.kcal.min * 0.4))), "yellow");                              // far under (often an incomplete log): still not red
  assert.equal(dayColor(ev(n(t.kcal.min * 0.4, { sodium_mg: 3000 }))), "red");            // but a real cap breach is red
  const pending = evaluateDay(sumNutrition([{ n: n(t.kcal.min * 0.4) }]), t, { final: false });
  assert.equal(dayColor(pending, { isToday: true }), "yellow");                           // today is still in progress
});

test("calendar colours follow the log", () => {
  const s = base();
  day(s, "2026-11-08", n(t.kcal.target));
  day(s, "2026-11-07", n(t.kcal.target, { sodium_mg: 2100 }));
  day(s, "2026-11-06", n(t.kcal.target, { sodium_mg: 3500 }));
  assert.equal(dayInfo(s, "2026-11-08", today).color, "green");
  assert.equal(dayInfo(s, "2026-11-07", today).color, "yellow");
  assert.equal(dayInfo(s, "2026-11-06", today).color, "red");
  assert.equal(dayInfo(s, "2026-11-05", today).color, "empty");
});

test("monthGrid is Monday-first and complete", () => {
  const weeks = monthGrid("2026-11");                       // 1 Nov 2026 is a Sunday
  assert.equal(weeks[0].findIndex(d => d === "2026-11-01"), 6);
  assert.equal(weeks.flat().filter(Boolean).length, 30);
  assert.ok(weeks.every(w => w.length === 7));
  assert.equal(shiftMonth("2026-11", -1), "2026-10");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});

test("calendar view: legend, cells, selected-day detail with 'Show full breakdown'", () => {
  const s = base();
  day(s, "2026-11-08", n(t.kcal.target));
  const ui = { calMonth: "2026-11", calSelected: "2026-11-08" };
  const html = calendarView(s, today, ui, "food");
  assert.match(html, /cal-day green/);
  assert.match(html, /data-action="cal-select" data-date="2026-11-08"/);
  assert.match(html, /Show full breakdown/);
  assert.match(html, /data-action="show-day" data-date="2026-11-08"/);
  assert.match(html, /data-action="cal-next"[^>]*disabled/);          // can't go past the current month
  assert.match(html, /disabled>\s*<span>11/);                          // future day disabled
  assert.ok(!html.includes("NaN") && !html.includes("undefined"));
  assert.match(calendarView(s, today, { calMonth: "2026-11", calSelected: null }, "food"), /Tap a day for details/);
});

test("day detail lists what went wrong", () => {
  const s = base();
  day(s, "2026-11-07", n(t.kcal.target, { sodium_mg: 3500 }));
  const html = dayDetail(s, "2026-11-07", today, "food");
  assert.match(html, /Over a limit/);
  assert.match(html, /Sodium: 3,500 mg — over/);
});

// ---------- weight with time of day ----------
test("weights: several per day, kept in time order", () => {
  store.resetAll();
  store.setWeight("2026-11-09", 81.0, "21:30");
  store.setWeight("2026-11-09", 80.2, "07:15");
  store.setWeight("2026-11-09", 80.4, "07:15");              // same time replaces
  store.setWeight("2026-11-08", 80.9);                       // no time
  const w = store.getState().weights;
  assert.deepEqual(w.map(x => [x.date, x.time || null, x.kg]), [["2026-11-08", null, 80.9], ["2026-11-09", "07:15", 80.4], ["2026-11-09", "21:30", 81.0]]);
  assert.equal(store.latestWeightOn(w, "2026-11-09").kg, 81.0);
  store.deleteWeight("2026-11-09", "21:30");
  assert.equal(store.getState().weights.length, 2);
  store.deleteWeight("2026-11-08");
  assert.deepEqual(store.getState().weights.map(x => x.time), ["07:15"]);
  store.resetAll();
});

test("time-of-day helpers", () => {
  assert.equal(periodOf("07:15"), "Morning");
  assert.equal(periodOf("13:00"), "Afternoon");
  assert.equal(periodOf("19:00"), "Evening");
  assert.equal(periodOf("23:30"), "Night");
  assert.equal(periodOf(null), null);
  assert.equal(minutesOf("07:30"), 450);
  assert.equal(minutesOf(null), 720);
});

test("weight chart places same-day entries by time", () => {
  const html = weightChart([{ date: "2026-11-09", kg: 80.2, time: "07:00" }, { date: "2026-11-09", kg: 81, time: "21:00" }, { date: "2026-11-10", kg: 80.5, time: "07:00" }], 75);
  const xs = [...html.matchAll(/cx="([\d.]+)"/g)].map(m => Number(m[1]));
  assert.equal(xs.length, 3);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2]);
  assert.ok(!html.includes("NaN"));
  assert.match(html, /21:00: 81/);
});

const wState = list => { const s = base(); s.weights = list.map(([date, kg, time]) => (time ? { date, kg, time } : { date, kg })); return s; };
const flat = (from, n, kg) => Array.from({ length: n }, (_, i) => [addDays(from, i), kg]);

test("weight calendar compares each day with the previous 7-day average (goal: lose)", () => {
  const w = [...flat("2026-11-01", 5, 82), ["2026-11-06", 81.5], ["2026-11-07", 82.3], ["2026-11-08", 83.2], ["2026-11-09", 82.1]];
  const s = wState(w);
  assert.equal(weightDay(s, "2026-11-01").color, "green");                 // first weigh-in
  assert.equal(weightDay(s, "2026-11-03").color, "green");                 // flat vs average
  assert.equal(weightDay(s, "2026-11-06").color, "green");                 // 0.5 below the average
  assert.equal(weightDay(s, "2026-11-07").color, "yellow");                // ~+0.3 above the average
  assert.equal(weightDay(s, "2026-11-08").color, "red");                   // ~+1.1 above the average
  assert.equal(weightDay(s, "2026-11-09").color, "green");                 // +0.1 is inside the 0.2 kg tolerance
  assert.equal(weightDay(s, "2026-11-10").color, "empty");
});

test("one high reading after a low one is judged against the trend, not the previous reading", () => {
  // The previous reading (81.1) makes the last day look like a +0.9 kg jump (red); against the 7-day average it is ~0.
  const s = wState([["2026-11-01", 82.6], ["2026-11-02", 82.4], ["2026-11-03", 82.2], ["2026-11-04", 82.0], ["2026-11-05", 81.8], ["2026-11-06", 81.7], ["2026-11-07", 81.1], ["2026-11-08", 82.0]]);
  const wd = weightDay(s, "2026-11-08");
  assert.ok(Math.abs(wd.delta) < 0.2, String(wd.delta));
  assert.equal(wd.color, "green");
  assert.equal(wd.ref.days, 7);
});

test("weight calendar: several weigh-ins in a day are averaged and each day counts once", () => {
  const s = wState([["2026-11-01", 82, "07:00"], ["2026-11-01", 82.4, "21:00"], ["2026-11-02", 81, "07:00"], ["2026-11-02", 83, "21:00"], ["2026-11-03", 82.2, "07:00"]]);
  const d2 = weightDay(s, "2026-11-02");
  assert.equal(d2.mean, 82);
  assert.equal(d2.ref.kg, 82.2);                                              // day 1 mean
  const d3 = weightDay(s, "2026-11-03");
  assert.equal(d3.ref.days, 2);                                               // two days, not four readings
  assert.ok(Math.abs(d3.ref.kg - (82.2 + 82) / 2) < 1e-9);
});

test("weight calendar: falls back to the last weigh-in when nothing in the last 7 days", () => {
  const s = wState([["2026-10-01", 84], ["2026-11-05", 83.0]]);
  const wd = weightDay(s, "2026-11-05");
  assert.equal(wd.ref.kg, 84);
  assert.match(wd.ref.kind, /last weigh-in/);
  assert.equal(wd.color, "green");
});

test("weight calendar: gain and maintain goals", () => {
  const gain = wState(flat("2026-11-01", 5, 60)); gain.profile = { ...profile, goalKg: 65 };
  gain.weights.push({ date: "2026-11-06", kg: 59.0 });                        // losing while trying to gain
  assert.equal(weightDay(gain, "2026-11-06").color, "red");
  const keep = wState(flat("2026-11-01", 5, 70)); keep.profile = { ...profile, goalKg: 70 };
  keep.weights.push({ date: "2026-11-06", kg: 70.4 }, { date: "2026-11-07", kg: 71.5 });
  assert.equal(weightDay(keep, "2026-11-06").color, "green");
  assert.equal(weightDay(keep, "2026-11-07").color, "red");
});

test("weight calendar detail explains the comparison", () => {
  const s = wState([...flat("2026-11-01", 3, 82), ["2026-11-04", 83.2]]);
  const html = calendarView(s, today, { calMonth: "2026-11", calSelected: "2026-11-04" }, "weight");
  assert.match(html, /Bigger move away from goal/);
  assert.match(html, /Versus your 3-day average of 82\.0 kg/);
  assert.match(html, /\+1\.2 kg/);
  assert.match(html, /previous 7 days/);
  assert.ok(!html.includes("NaN") && !html.includes("undefined"));
});

test("weight view: time field, mode toggle, time shown in history", () => {
  const s = base();
  s.weights = [{ date: "2026-11-09", kg: 80.2, time: "07:15" }, { date: "2026-11-09", kg: 81, time: "21:30" }];
  const ui = { weightMode: "chart", calMonth: "2026-11", calSelected: null };
  let html = weightView(s, today, "all", ui);
  assert.match(html, /name="time"/);
  assert.match(html, /07:15 · Morning/);
  assert.match(html, /data-action="del-weight" data-date="2026-11-09" data-time="21:30"/);
  assert.match(html, /data-action="mode-weight" data-mode="calendar"/);
  html = weightView(s, today, "all", { ...ui, weightMode: "calendar" });
  assert.match(html, /calgrid/);
});

test("weigh streak counts a day once even with several weigh-ins", () => {
  const s = base();
  s.weights = [["2026-11-08", "07:00"], ["2026-11-08", "21:00"], ["2026-11-09", "07:00"], ["2026-11-10", "07:00"]].map(([date, time], i) => ({ date, time, kg: 80 - i * 0.1 }));
  assert.equal(evaluateBadges(s, today).stats.weighStreakBest, 3);
});

test("today view: day/calendar toggle and edit buttons", () => {
  const s = base();
  s.log[today] = [{ id: "e1", meal: "lunch", name: "Laksa", n: n(585) }];
  const info = evaluateBadges(s, today);
  let html = todayView(s, today, today, info, { todayMode: "day", calMonth: "2026-11", calSelected: null });
  assert.match(html, /data-action="mode-today" data-mode="calendar"/);
  assert.match(html, /data-action="edit-entry" data-id="e1"/);
  html = todayView(s, today, today, info, { todayMode: "calendar", calMonth: "2026-11", calSelected: today });
  assert.match(html, /calgrid/);
  assert.match(html, /Show full breakdown/);
});

// ---------- per-piece servings ----------
test("database: per-piece info and options", () => {
  const egg = foods.find(f => f.name === "Soft-boiled egg, 1 piece");
  assert.deepEqual(egg.piece, { label: "egg", grams: 50 });
  assert.ok(Math.abs(egg.nutrition_per_serving.cholesterol_mg - 186) < 1);
  const eggs2 = foods.find(f => f.name === "Soft-boiled eggs, 2 eggs");
  assert.equal(eggs2.piece.grams, 50);
  assert.ok(eggs2.serving_options.some(o => o.amount === 50));
  const toast = foods.find(f => f.name.startsWith("Kaya toast, 2 slices"));
  assert.equal(toast.piece.label, "slice");
  assert.ok(foods.filter(f => f.piece).length > 40);
  for (const f of foods.filter(x => x.serving_options)) assert.ok(f.serving_options.every(o => o.amount > 0 && o.label), f.name);
});

test("database: foods from foods_to_add.csv exist", () => {
  for (const name of ["White rice, 1 bowl", "Soft-boiled egg, 1 piece", "Grilled chicken breast, 1 piece", "Steamed broccoli, 1 cup", "Baked salmon, 1 fillet",
    "Yuan yang, 1 cup", "Teh C bing, 1 cup", "Mocha, 1 cup", "Lime juice, 1 cup", "Kopi bing, 1 cup"]) {
    const f = foods.find(x => x.name === name);
    assert.ok(f, name);
    assert.ok(f.nutrition_per_serving.energy_kcal > 0);
  }
});

test("describe: eggs by piece count use the per-egg weight", () => {
  const index = buildIndex(foods);
  const one = parseDescription("1 soft boiled egg", index).items[0];
  assert.match(one.food.name, /^Soft-boiled eggs?,/);                       // either egg entry gives the same answer
  assert.ok(Math.abs(one.nutrition.energy_kcal - 71.5) < 0.5);
  const three = parseDescription("3 soft boiled eggs", index).items[0];
  assert.ok(Math.abs(three.nutrition.energy_kcal - 3 * 71.5) < 1);
  const two = parseDescription("2 hard boiled eggs", index).items[0];
  assert.equal(two.food.name, "Hard-boiled egg, 1 piece");
  assert.equal(two.mult, 2);
  const nuts = parseDescription("10 almonds", index).items[0];
  assert.equal(nuts.food.name, "Almonds");
  assert.ok(Math.abs(nuts.mult - (10 * 1.2) / 30) < 0.01);
});

// ---------- editing a portion ----------
test("scaleNutrition re-scales a logged entry from its base", () => {
  const baseN = { energy_kcal: 200, protein_g: 10, sodium_mg: 400, alcohol_g: 13 };
  const half = scaleNutrition(baseN, 0.5);
  assert.equal(half.energy_kcal, 100);
  assert.equal(half.alcohol_g, 6.5);
  const triple = scaleNutrition(baseN, 3);
  assert.equal(triple.sodium_mg, 1200);
  assert.equal(scaleNutrition(null, 2).energy_kcal, 0);
});

test("updateLogEntry changes portion and moves between mealtimes", () => {
  store.resetAll();
  store.addLogEntry("2026-11-10", { meal: "lunch", name: "Egg", n: { energy_kcal: 72 }, base: { energy_kcal: 72 }, mult: 1 });
  const id = store.getState().log["2026-11-10"][0].id;
  store.updateLogEntry("2026-11-10", id, { meal: "dinner", n: { energy_kcal: 144 }, mult: 2 });
  const e = store.getState().log["2026-11-10"][0];
  assert.equal(e.meal, "dinner");
  assert.equal(e.n.energy_kcal, 144);
  assert.equal(e.name, "Egg");
  store.resetAll();
});
