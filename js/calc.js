// Daily targets, day evaluation. Pure functions, no DOM.
// Estimates based on Mifflin-St Jeor + common public-health guidelines (WHO / IOM AMDR / HPB).
// This is general guidance, not medical advice.

export const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Little or no exercise", factor: 1.2, protein: 0.8 },
  { id: "light", label: "Light: 1–3 days/week", factor: 1.375, protein: 1.0 },
  { id: "moderate", label: "Moderate: 3–5 days/week", factor: 1.55, protein: 1.2 },
  { id: "high", label: "Hard: 6–7 days/week", factor: 1.725, protein: 1.4 },
  { id: "athlete", label: "Very hard / physical job / 2× daily", factor: 1.9, protein: 1.6 },
];

export const NUTRIENT_KEYS = ["energy_kcal", "protein_g", "carbohydrate_g", "total_fat_g", "saturated_fat_g",
  "trans_fat_g", "fibre_g", "sugars_g", "sodium_mg", "cholesterol_mg", "alcohol_g"];

const r = (x, step = 1) => Math.round(x / step) * step;

export function bmr({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export const bmi = (kg, cm) => kg / Math.pow(cm / 100, 2);

export function healthyWeightRange(cm) {
  const m2 = Math.pow(cm / 100, 2);
  return [18.5 * m2, 24.9 * m2];
}

export function goalDirection(currentKg, goalKg) {
  if (!goalKg || Math.abs(goalKg - currentKg) < 0.5) return "maintain";
  return goalKg < currentKg ? "lose" : "gain";
}

/**
 * profile: {sex, age, heightCm, activity, goalKg, rateKgPerWeek}
 * Returns min / target / max for each nutrient plus notes.
 */
export function computeTargets(profile, weightKg) {
  const act = ACTIVITY_LEVELS.find(a => a.id === profile.activity) || ACTIVITY_LEVELS[0];
  const base = bmr({ sex: profile.sex, weightKg, heightCm: profile.heightCm, age: profile.age });
  const tdee = base * act.factor;
  const floor = profile.sex === "male" ? 1500 : 1200;           // commonly advised safe minimum
  const dir = goalDirection(weightKg, profile.goalKg);
  const rate = profile.rateKgPerWeek || 0.5;
  const notes = [];

  const min = r(Math.max(floor, base), 10);
  let target = tdee, max = tdee;
  if (dir === "lose") {
    const deficit = Math.min(rate * 1100, 0.25 * tdee);          // ~7700 kcal/kg, capped at 25% of TDEE
    target = tdee - deficit;
    max = tdee;
  } else if (dir === "gain") {
    const surplus = Math.min(rate * 1100, 0.15 * tdee);
    target = tdee + surplus;
    max = target + 150;
  }
  if (target < min) { target = min; notes.push("Your target was raised to the minimum safe intake."); }
  target = r(target, 10);
  max = Math.max(r(max, 10), target + 100);

  const kcalTarget = target;
  const protein = { min: r(act.protein * weightKg), max: r(2.0 * weightKg) };
  const carbs = { min: Math.max(130, r(0.45 * kcalTarget / 4)), max: r(0.65 * kcalTarget / 4) };
  const fat = { min: r(0.20 * kcalTarget / 9), max: r(0.35 * kcalTarget / 9) };

  return {
    bmr: r(base), tdee: r(tdee), direction: dir, floor,
    kcal: { min, target, max },
    protein, carbs, fat,
    satFat: { max: r(0.10 * kcalTarget / 9) },
    transFat: { max: Math.max(1, r(0.01 * kcalTarget / 9)) },
    fibre: { min: Math.max(25, r(14 * kcalTarget / 1000)) },
    sugars: { max: r(0.10 * kcalTarget / 4) },
    sodium: { min: 500, max: 2000 },
    cholesterol: { max: 300 },
    alcohol: { maxStd: profile.sex === "male" ? 2 : 1 },
    notes,
  };
}

export function sumNutrition(entries) {
  const t = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 0]));
  for (const e of entries) for (const k of NUTRIENT_KEYS) t[k] += Number(e.n?.[k]) || 0;
  return t;
}

/**
 * Evaluate a day's totals against targets.
 * state: empty | pending (under minimum, can still eat) | pass | fail
 * `final` = the day is over, so "pending" counts as a fail.
 * Streak rules: calories within [min, max] and sodium, sugars, saturated fat, alcohol under their caps.
 */
export function evaluateDay(totals, t, { final = false, hasEntries = true } = {}) {
  const std = (totals.alcohol_g || 0) / 10;
  const checks = [
    { key: "kcal", label: "Calories", unit: "kcal", value: totals.energy_kcal, min: t.kcal.min, max: t.kcal.max, target: t.kcal.target, streak: true },
    { key: "protein", label: "Protein", unit: "g", value: totals.protein_g, min: t.protein.min, max: t.protein.max },
    { key: "carbs", label: "Carbs", unit: "g", value: totals.carbohydrate_g, min: t.carbs.min, max: t.carbs.max },
    { key: "fat", label: "Fat", unit: "g", value: totals.total_fat_g, min: t.fat.min, max: t.fat.max },
    { key: "satFat", label: "Saturated fat", unit: "g", value: totals.saturated_fat_g, max: t.satFat.max, streak: true },
    { key: "sugars", label: "Sugars", unit: "g", value: totals.sugars_g, max: t.sugars.max, streak: true },
    { key: "sodium", label: "Sodium", unit: "mg", value: totals.sodium_mg, max: t.sodium.max, streak: true },
    { key: "fibre", label: "Fibre", unit: "g", value: totals.fibre_g, min: t.fibre.min },
    { key: "cholesterol", label: "Cholesterol", unit: "mg", value: totals.cholesterol_mg, max: t.cholesterol.max },
    { key: "alcohol", label: "Alcohol", unit: "std drinks", value: std, max: t.alcohol.maxStd, streak: true },
  ];
  for (const c of checks) {
    c.status = c.max != null && c.value > c.max ? "over"
      : c.min != null && c.value < c.min ? "under" : "ok";
  }
  if (!hasEntries) return { state: "empty", checks };
  const over = checks.some(c => c.streak && c.status === "over");
  const kcal = checks[0];
  const state = over ? "fail" : kcal.status === "under" ? (final ? "fail" : "pending") : "pass";
  return { state, checks };
}

/**
 * Calendar colour for a day: green = within limits (counts for the streak); yellow = a warning (under the calorie
 * minimum, which is often just an incomplete log, or a cap exceeded by up to 10%); red = a cap exceeded by more than 10%;
 * empty = nothing logged. Being under the calorie minimum is never red. It still doesn't count for the streak.
 */
export function dayColor(ev, { isToday = false } = {}) {
  if (ev.state === "empty") return "empty";
  if (ev.state === "pass") return "green";
  let worst = 0;
  for (const c of ev.checks) if (c.streak && c.status === "over" && c.max > 0) worst = Math.max(worst, c.value / c.max - 1);
  if (worst > 0.10 + 1e-9) return "red";       // tolerance: 2200/2000 - 1 is 0.10000000000000009 in floating point
  if (worst > 0) return "yellow";
  return "yellow";                                            // only "under the calorie minimum" is left
}

/** Multiply a nutrition object by a factor (used when a logged portion is edited). */
export function scaleNutrition(base, factor) {
  const out = {};
  for (const k of NUTRIENT_KEYS) out[k] = Math.round((Number(base?.[k]) || 0) * factor * 10) / 10;
  return out;
}

/**
 * Re-price a drink for a different sweetness. `addedGrams` is the sugar in this portion that can be reduced;
 * factor 1 = regular, 0.5 = less sweet (siew dai), 0 = no added sugar (kosong). Sugars, carbs and calories drop together.
 */
export function applySweetness(n, addedGrams, factor) {
  if (factor === 1 || !addedGrams) return n;
  const cut = (1 - factor) * addedGrams;
  const r1 = x => Math.round(x * 10) / 10;
  return {
    ...n,
    sugars_g: r1(Math.max(0, (n.sugars_g || 0) - cut)),
    carbohydrate_g: r1(Math.max(0, (n.carbohydrate_g || 0) - cut)),
    energy_kcal: r1(Math.max(0, (n.energy_kcal || 0) - 4 * cut)),
  };
}
