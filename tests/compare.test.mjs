import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { computeTargets, applySweetness, sumNutrition } = await import("../js/calc.js");
const { assessOptions, explain, winners, newOption, optionTotals, cloneItem, quality, MAX_OPTIONS } = await import("../js/compare.js");
const { NUTRIENTS, shownKeys, isFiltered } = await import("../js/nutrients.js");
const { buildIndex, parseDescription, nutritionOfFood, chooseFood, setSweetness } = await import("../js/estimator.js");

const foods = JSON.parse(readFileSync(new URL("../food_nutrition.json", import.meta.url))).foods;
const byName = n => foods.find(f => f.name === n);
const profile = { sex: "male", age: 30, heightCm: 175, activity: "moderate", goalKg: 75, rateKgPerWeek: 0.5 };
const t = computeTargets(profile, 82);
const item = (name, n) => ({ name, n: { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, total_fat_g: 0, saturated_fat_g: 0, trans_fat_g: 0, fibre_g: 0, sugars_g: 0, sodium_mg: 0, cholesterol_mg: 0, alcohol_g: 0, ...n } });

// ---------- sweetness ----------
test("applySweetness reduces sugars, carbs and calories together", () => {
  const n = { energy_kcal: 162.5, sugars_g: 18.8, carbohydrate_g: 23.5, protein_g: 3.3 };
  const less = applySweetness(n, 12, 0.5);
  assert.equal(less.sugars_g, 12.8);          // 18.8 - 6
  assert.equal(less.carbohydrate_g, 17.5);
  assert.equal(less.energy_kcal, 138.5);      // - 4 * 6
  assert.equal(less.protein_g, 3.3);
  const none = applySweetness(n, 12, 0);
  assert.equal(none.sugars_g, 6.8);
  assert.equal(applySweetness(n, 12, 1), n);
  assert.equal(applySweetness(n, 0, 0), n);
  assert.equal(applySweetness({ energy_kcal: 5, sugars_g: 2, carbohydrate_g: 2 }, 100, 0).sugars_g, 0);   // never negative
});

test("database: hawker drinks and sweetness options", () => {
  for (const name of ["Kopi O (coffee with sugar)", "Teh (tea with condensed milk)", "Teh O kosong (tea, no sugar)", "Milo (hot)", "Bandung (rose syrup milk)",
    "Soya bean milk, sweetened", "Chrysanthemum tea", "Lemon barley drink", "Iced lemon tea", "Sour plum drink (asam boi)", "100PLUS isotonic drink, 1 can", "Coca-Cola, 1 can"]) {
    assert.ok(byName(name), name);
  }
  const kopi = byName("Kopi (with condensed milk)");
  assert.deepEqual(kopi.sweetness.options.map(o => o.factor), [1, 0.5, 0]);
  assert.ok(kopi.sweetness.added_sugar_g <= kopi.nutrition_per_serving.sugars_g);
  assert.equal(byName("Coca-Cola, 1 can").sweetness, undefined);
  for (const f of foods.filter(x => x.sweetness)) assert.ok(f.sweetness.added_sugar_g <= f.nutrition_per_serving.sugars_g + 0.01, f.name);
});

test("nutritionOfFood with sweetness factor", () => {
  const kopi = byName("Kopi (with condensed milk)");
  const reg = nutritionOfFood(kopi, 1), less = nutritionOfFood(kopi, 1, 0.5), none = nutritionOfFood(kopi, 1, 0);
  assert.ok(less.sugars_g < reg.sugars_g && none.sugars_g < less.sugars_g);
  assert.ok(Math.abs((reg.energy_kcal - less.energy_kcal) - 24) < 0.5);       // 6 g sugar x 4 kcal
  const two = nutritionOfFood(kopi, 2, 0.5);
  assert.ok(Math.abs(two.sugars_g - (reg.sugars_g * 2 - 12)) < 0.2);          // cut scales with portion
  assert.equal(nutritionOfFood(byName("Laksa"), 1, 0).energy_kcal, nutritionOfFood(byName("Laksa"), 1).energy_kcal);   // no-op for other foods
});

test("describe: 'kopi siew dai' and 'teh o kosong' set the sweetness", () => {
  const index = buildIndex(foods);
  const reg = parseDescription("a kopi", index).items[0];
  const less = parseDescription("kopi siew dai", index).items[0];
  const none = parseDescription("kopi kosong", index).items[0];
  assert.equal(less.food.name, reg.food.name);
  assert.equal(less.sweetFactor, 0.5);
  assert.equal(none.sweetFactor, 0);
  assert.ok(less.nutrition.sugars_g < reg.nutrition.sugars_g && none.nutrition.sugars_g < less.nutrition.sugars_g);
  const teh = parseDescription("teh o less sweet", index).items[0];
  assert.equal(teh.sweetFactor, 0.5);
  const ch = chooseFood(less, byName("Teh tarik"));
  assert.equal(ch.sweetFactor, 0.5);                                           // keeps the chosen sweetness
  assert.equal(setSweetness(ch, 1).nutrition.sugars_g, nutritionOfFood(byName("Teh tarik"), ch.mult).sugars_g);
});

// ---------- nutrient display prefs ----------
test("shownKeys: all vs custom selection", () => {
  assert.equal(shownKeys({}).size, NUTRIENTS.length);
  assert.equal(shownKeys({ prefs: { nutrientMode: "all", nutrients: ["protein"] } }).size, NUTRIENTS.length);
  const custom = shownKeys({ prefs: { nutrientMode: "custom", nutrients: ["protein", "sodium"] } });
  assert.deepEqual([...custom].sort(), ["protein", "sodium"]);
  assert.equal(isFiltered({ prefs: { nutrientMode: "custom", nutrients: [] } }), true);
  assert.equal(isFiltered({}), false);
});

// ---------- meal comparison ----------
test("newOption names A, B, C without clashes", () => {
  const a = newOption([]), b = newOption([a]), c = newOption([a, b]);
  assert.deepEqual([a.name, b.name, c.name], ["Option A", "Option B", "Option C"]);
  assert.equal(newOption([a, c]).name, "Option B");
  assert.ok(MAX_OPTIONS >= 2);
});

test("comparison prefers the meal that stays within limits", () => {
  const salty = { id: "a", name: "A", items: [item("Salty", { energy_kcal: 700, sodium_mg: 2200, protein_g: 30 })] };
  const mild = { id: "b", name: "B", items: [item("Mild", { energy_kcal: 650, sodium_mg: 700, protein_g: 25 })] };
  const r = assessOptions([salty, mild], { targets: t, dayTotals: sumNutrition([]), direction: "lose" });
  assert.equal(r.best.id, "b");
  assert.equal(r.assessed[0].fit.level, "ok");
  assert.equal(r.assessed[1].fit.level, "warn");                           // 2200 vs 2000: 10% over
  assert.ok(r.assessed[1].fit.over.some(o => o.key === "sodium"));
});

test("what you already ate today changes the verdict", () => {
  const a = { id: "a", name: "A", items: [item("A", { energy_kcal: 600, sodium_mg: 1200 })] };
  const b = { id: "b", name: "B", items: [item("B", { energy_kcal: 600, sodium_mg: 400 })] };
  const fresh = assessOptions([a, b], { targets: t, dayTotals: sumNutrition([]) });
  assert.equal(fresh.assessed.find(x => x.id === "a").fit.level, "ok");
  const eaten = sumNutrition([{ n: { energy_kcal: 1000, sodium_mg: 950 } }]);
  const later = assessOptions([a, b], { targets: t, dayTotals: eaten });
  assert.equal(later.assessed.find(x => x.id === "a").fit.level, "warn");  // 950 + 1200 = 2150 sodium: 7.5% over
  assert.equal(later.best.id, "b");
});

test("without targets, falls back to nutrition balance; empty options ignored; tie flagged", () => {
  const a = { id: "a", name: "A", items: [item("A", { energy_kcal: 500, protein_g: 40, fibre_g: 8, sodium_mg: 400 })] };
  const b = { id: "b", name: "B", items: [item("B", { energy_kcal: 500, protein_g: 10, sugars_g: 40, sodium_mg: 900 })] };
  const empty = { id: "c", name: "C", items: [] };
  const r = assessOptions([b, a, empty]);
  assert.equal(r.assessed.length, 2);
  assert.equal(r.best.id, "a");
  assert.equal(r.assessed[0].fit, null);
  assert.equal(r.tie, false);
  const twin = assessOptions([a, { ...a, id: "z", name: "Z" }]);
  assert.equal(twin.tie, true);
  assert.equal(assessOptions([empty]).best, null);
});

test("explain: advantages and trade-offs in words", () => {
  const best = { totals: { energy_kcal: 600, sodium_mg: 700, protein_g: 40, sugars_g: 10, fibre_g: 2, saturated_fat_g: 5, trans_fat_g: 0, cholesterol_mg: 100, alcohol_g: 0 } };
  const other = { totals: { energy_kcal: 520, sodium_mg: 1800, protein_g: 22, sugars_g: 11, fibre_g: 2, saturated_fat_g: 5, trans_fat_g: 0, cholesterol_mg: 100, alcohol_g: 0 } };
  const e = explain(best, other, "lose");
  assert.ok(e.pros.some(p => /1100 mg less sodium/.test(p)), e.pros.join("|"));
  assert.ok(e.pros.some(p => /18 g more protein/.test(p)));
  assert.ok(e.cons.some(c => /80 kcal more calories/.test(c)), e.cons.join("|"));      // 600 vs 520 when losing weight
  assert.ok(!e.pros.some(p => /sugars/.test(p)));                                        // 10 vs 11 g is not meaningful
});

test("winners marks the best value per nutrient only when it matters", () => {
  const a = { id: "a", totals: { energy_kcal: 500, sodium_mg: 400, protein_g: 20, fibre_g: 5 } };
  const b = { id: "b", totals: { energy_kcal: 510, sodium_mg: 900, protein_g: 35, fibre_g: 5 } };
  const w = winners([a, b], "lose");
  assert.deepEqual(w.sodium_mg, ["a"]);
  assert.deepEqual(w.protein_g, ["b"]);
  assert.equal(w.energy_kcal, undefined);       // 2% apart
  assert.equal(w.fibre_g, undefined);           // equal
  assert.equal(winners([a], "lose").sodium_mg, undefined);
});

test("cloneItem drops id and meal; optionTotals sums items", () => {
  const e = { id: "x1", meal: "lunch", name: "Egg", n: { energy_kcal: 72 }, base: { energy_kcal: 72 } };
  const c = cloneItem(e);
  assert.equal(c.id, undefined); assert.equal(c.meal, undefined); assert.equal(c.name, "Egg");
  c.n.energy_kcal = 1; assert.equal(e.n.energy_kcal, 72);                                // deep copy
  assert.equal(optionTotals({ items: [item("a", { energy_kcal: 100 }), item("b", { energy_kcal: 50 })] }).energy_kcal, 150);
  assert.ok(quality({ protein_g: 30, fibre_g: 5 }) > quality({ sugars_g: 40, sodium_mg: 1500 }));
});
