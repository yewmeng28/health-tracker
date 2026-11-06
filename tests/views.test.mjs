import test from "node:test";
import assert from "node:assert/strict";
import { todayView, weightView, badgesView, profileView } from "../js/views.js";
import { evaluateBadges } from "../js/badges.js";
import { computeTargets } from "../js/calc.js";
import { addDays } from "../js/dates.js";
import { defaultState } from "../js/store.js";
import { weightChart } from "../js/chart.js";

const today = "2026-11-10";
const profile = { sex: "male", age: 30, heightCm: 175, activity: "moderate", goalKg: 75, rateKgPerWeek: 0.5 };
const t = computeTargets(profile, 82);
const mk = () => {
  const s = defaultState();
  s.profile = profile;
  s.weights = [[-20, 84], [-13, 83.2], [-6, 82.5], [0, 82]].map(([d, kg]) => ({ date: addDays(today, d), kg }));
  return s;
};
const n = (kcal, extra = {}) => ({ energy_kcal: kcal, protein_g: 20, carbohydrate_g: 40, total_fat_g: 10, saturated_fat_g: 3, fibre_g: 5, sugars_g: 8, sodium_mg: 500, cholesterol_mg: 50, alcohol_g: 0, ...extra });

test("today: setup prompt without profile", () => {
  const html = todayView(defaultState(), today, today, evaluateBadges(defaultState(), today));
  assert.match(html, /Set up your profile/);
});

test("today: renders five meals, calorie bar, nutrient meters", () => {
  const s = mk();
  s.log[today] = [{ id: "a", meal: "lunch", name: "Laksa", amountLabel: "1 × serving", n: n(585) }];
  const html = todayView(s, today, today, evaluateBadges(s, today));
  assert.equal((html.match(/class="meal card"/g) || []).length, 5);
  for (const label of ["Breakfast", "Lunch", "Tea break", "Dinner", "Supper"]) assert.ok(html.includes(label), label);
  assert.match(html, /585/);
  assert.match(html, /Laksa/);
  assert.match(html, /to go to reach your daily minimum/);
  assert.match(html, /Sodium/);
  assert.match(html, /data-action="del-entry" data-id="a"/);
  assert.ok(!html.includes("NaN") && !html.includes("undefined"), "no NaN/undefined");
});

test("today: pass, over-limit messages and estimate tag", () => {
  const s = mk();
  s.log[today] = [{ id: "a", meal: "lunch", name: "x", n: n(t.kcal.min + 100), estimated: true }];
  let html = todayView(s, today, today, evaluateBadges(s, today));
  assert.match(html, /Within your limits/);
  assert.match(html, /tag est/);
  s.log[today][0].n.sodium_mg = 3000;
  html = todayView(s, today, today, evaluateBadges(s, today));
  assert.match(html, /Over your limit for sodium/);
});

test("today: past day without enough food is flagged; next button disabled today", () => {
  const s = mk();
  const y = addDays(today, -1);
  s.log[y] = [{ id: "b", meal: "lunch", name: "x", n: n(400) }];
  const html = todayView(s, y, today, evaluateBadges(s, today));
  assert.match(html, /Under your minimum/);
  assert.match(html, /Yesterday/);
  const tHtml = todayView(s, today, today, evaluateBadges(s, today));
  assert.match(tHtml, /data-action="day-next"[^>]*disabled/);
});

test("weight view: chart, stats, history, goal", () => {
  const s = mk();
  const html = weightView(s, today, "all");
  assert.match(html, /svg/);
  assert.match(html, /Goal 75 kg/);
  assert.match(html, /-2\.0 kg|−2\.0 kg|-2 kg/);
  assert.equal((html.match(/data-action="del-weight"/g) || []).length, 4);
  assert.match(html, /to lose/);
  assert.match(html, /BMI/);
  assert.ok(!html.includes("NaN"));
  assert.ok(weightView(defaultState(), today, "30").includes("form"));
});

test("weight chart edge cases", () => {
  assert.match(weightChart([], null), /Log your weight/);
  assert.match(weightChart([{ date: today, kg: 80 }], 75), /svg/);
  const flat = weightChart([{ date: "2026-11-01", kg: 80 }, { date: today, kg: 80 }], null);
  assert.ok(!flat.includes("NaN") && !flat.includes("Infinity"));
});

test("badges view: streak hero, earned and locked badges", () => {
  const s = mk();
  const good = n(t.kcal.min + 50, { protein_g: t.protein.min, fibre_g: t.fibre.min, sodium_mg: 1500 });
  for (let i = 1; i <= 3; i++) s.log[addDays(today, -i)] = [{ id: "e" + i, meal: "lunch", name: "x", n: good }];
  const html = badgesView(evaluateBadges(s, today));
  assert.match(html, /3<\/div><div class="muted">day streak/);
  assert.match(html, /badge earned/);
  assert.match(html, /badge locked/);
  assert.ok(!html.includes("NaN"));
});

test("profile view: form prefilled, targets table, safety warnings", () => {
  const s = mk();
  let html = profileView(s, today);
  assert.match(html, /name="heightCm"[^>]*value="175"/);
  assert.match(html, /Your daily targets/);
  assert.match(html, /Alcohol/);
  assert.match(html, /not medical advice/);
  s.profile = { ...profile, goalKg: 50 };
  html = profileView(s, today);
  assert.match(html, /underweight/);
  s.profile = { ...profile, age: 16 };
  assert.match(profileView(s, today), /under-18/);
  assert.ok(profileView(defaultState(), today).includes("profileForm"));
});
