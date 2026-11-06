import test from "node:test";
import assert from "node:assert/strict";
import { bmr, computeTargets, evaluateDay, sumNutrition, goalDirection, healthyWeightRange } from "../js/calc.js";
import { addDays } from "../js/dates.js";
import { computeStreaks, evaluateBadges, targetsFor } from "../js/badges.js";
import { defaultState } from "../js/store.js";

const man = { sex: "male", age: 30, heightCm: 175, activity: "moderate", goalKg: 70, rateKgPerWeek: 0.5 };
const woman = { sex: "female", age: 30, heightCm: 160, activity: "light", goalKg: 55, rateKgPerWeek: 0.5 };

test("Mifflin-St Jeor", () => {
  assert.equal(Math.round(bmr({ sex: "male", weightKg: 80, heightCm: 175, age: 30 })), 1749);
  assert.equal(Math.round(bmr({ sex: "female", weightKg: 60, heightCm: 160, age: 30 })), 1289);
});

test("targets: losing weight gives target below maintenance, min/max sensible", () => {
  const t = computeTargets(man, 80);
  assert.equal(t.direction, "lose");
  assert.ok(t.kcal.min <= t.kcal.target && t.kcal.target < t.kcal.max, JSON.stringify(t.kcal));
  assert.equal(t.kcal.max, Math.round(t.tdee / 10) * 10);
  assert.ok(t.kcal.min >= 1500);
  assert.ok(t.protein.min >= 80 * 1.2 - 1 && t.protein.max === 160);
  assert.equal(t.sodium.max, 2000);
  assert.equal(t.alcohol.maxStd, 2);
});

test("targets never fall below safe floor", () => {
  const t = computeTargets({ ...woman, goalKg: 45, rateKgPerWeek: 0.75, activity: "sedentary", heightCm: 150 }, 50);
  assert.ok(t.kcal.min >= 1200);
  assert.ok(t.kcal.target >= t.kcal.min);
  assert.ok(t.kcal.max > t.kcal.target);
});

test("gain and maintain directions", () => {
  assert.equal(goalDirection(60, 65), "gain");
  assert.equal(goalDirection(60, 60.3), "maintain");
  const g = computeTargets({ ...man, goalKg: 90 }, 80);
  assert.ok(g.kcal.target > g.tdee && g.kcal.max > g.kcal.target);
  assert.equal(computeTargets({ ...man, goalKg: 80 }, 80).kcal.target, Math.round(computeTargets(man, 80).tdee / 10) * 10);
});

test("female alcohol limit and healthy range", () => {
  assert.equal(computeTargets(woman, 60).alcohol.maxStd, 1);
  const [lo, hi] = healthyWeightRange(160);
  assert.ok(lo > 47 && hi < 64.1);
});

const entry = (meal, n) => ({ id: Math.random().toString(), meal, name: "x", n });
const goodDay = (t) => [entry("breakfast", { energy_kcal: t.kcal.min + 50, protein_g: t.protein.min, fibre_g: t.fibre.min, sodium_mg: 1500, sugars_g: 20 })];

test("evaluateDay states", () => {
  const t = computeTargets(man, 80);
  assert.equal(evaluateDay(sumNutrition([]), t, { hasEntries: false }).state, "empty");
  const under = sumNutrition([entry("lunch", { energy_kcal: 500 })]);
  assert.equal(evaluateDay(under, t).state, "pending");
  assert.equal(evaluateDay(under, t, { final: true }).state, "fail");
  assert.equal(evaluateDay(sumNutrition(goodDay(t)), t).state, "pass");
  const salty = sumNutrition([entry("lunch", { energy_kcal: t.kcal.target, sodium_mg: 2600 })]);
  const r = evaluateDay(salty, t);
  assert.equal(r.state, "fail");
  assert.equal(r.checks.find(c => c.key === "sodium").status, "over");
  const over = sumNutrition([entry("lunch", { energy_kcal: t.kcal.max + 200 })]);
  assert.equal(evaluateDay(over, t).state, "fail");
  const drunk = sumNutrition([entry("dinner", { energy_kcal: t.kcal.target, alcohol_g: 45 })]);
  assert.equal(evaluateDay(drunk, t).checks.find(c => c.key === "alcohol").status, "over");
});

function stateWith(days, today, profile = man) {
  const s = defaultState();
  s.profile = profile;
  s.weights = [{ date: addDays(today, -60), kg: 80 }];
  const t = computeTargets(profile, 80);
  for (const d of days) s.log[d] = goodDay(t);
  return s;
}

test("streak counts consecutive passing days ending yesterday", () => {
  const today = "2026-11-10";
  const days = [1, 2, 3, 4].map(n => addDays(today, -n));
  const { current, best } = computeStreaks(stateWith(days, today), today);
  assert.equal(current, 4);
  assert.equal(best, 4);
});

test("today passing extends the streak; pending today does not break it", () => {
  const today = "2026-11-10";
  const prev = [1, 2].map(n => addDays(today, -n));
  assert.equal(computeStreaks(stateWith([...prev, today], today), today).current, 3);
  const s = stateWith(prev, today);
  s.log[today] = [entry("breakfast", { energy_kcal: 300 })];           // under minimum so far
  assert.equal(computeStreaks(s, today).current, 2);
  s.log[today] = [entry("breakfast", { energy_kcal: 300, sodium_mg: 3000 })]; // already over a cap
  assert.equal(computeStreaks(s, today).current, 0);
});

test("a missed day breaks the streak; best streak remembered", () => {
  const today = "2026-11-20";
  const days = [-1, -2, -3, -5, -6, -7, -8, -9].map(n => addDays(today, n));   // gap at -4
  const r = computeStreaks(stateWith(days, today), today);
  assert.equal(r.current, 3);
  assert.equal(r.best, 5);
});

test("targetsFor uses the weight on that date", () => {
  const s = stateWith([], "2026-11-10");
  s.weights.push({ date: "2026-11-05", kg: 75 });
  const a = targetsFor(s, "2026-11-01"), b = targetsFor(s, "2026-11-10");
  assert.ok(b.bmr < a.bmr);
});

test("badges: streak badges, first log, weigh-ins, goal", () => {
  const today = "2026-11-10";
  const days = [1, 2, 3, 4, 5, 6, 7].map(n => addDays(today, -n));
  const s = stateWith(days, today);
  const { list, fresh, stats } = evaluateBadges(s, today);
  const get = id => list.find(b => b.id === id);
  assert.equal(stats.bestStreak, 7);
  assert.ok(get("streak_3").earned && get("streak_7").earned && !get("streak_14").earned);
  assert.ok(get("first_log").earned && get("weigh_in").earned);
  assert.equal(get("streak_14").have, 7);
  assert.ok(fresh.includes("streak_7"));
  s.badges.streak_7 = today;
  assert.ok(!evaluateBadges(s, today).fresh.includes("streak_7"));
  assert.ok(evaluateBadges(s, today).list.find(b => b.id === "streak_7").earned);

  s.weights.push({ date: addDays(today, -1), kg: 78.5 }, { date: today, kg: 70 });
  const g = evaluateBadges(s, today);
  assert.ok(g.list.find(b => b.id === "goal_reached").earned);
  assert.ok(g.list.find(b => b.id === "goal_1kg").earned);
});

test("full day badge needs all five mealtimes", () => {
  const today = "2026-11-10";
  const s = stateWith([], today);
  const t = computeTargets(man, 80);
  s.log[addDays(today, -1)] = ["breakfast", "lunch", "tea", "dinner", "supper"].map(m => entry(m, { energy_kcal: (t.kcal.min + 50) / 5 }));
  assert.ok(evaluateBadges(s, today).list.find(b => b.id === "full_day").earned);
});
