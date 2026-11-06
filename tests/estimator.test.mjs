import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIndex, parseDescription, parsePhrase, estimateManual, chooseFood, sumNutritionObjects } from "../js/estimator.js";

const foods = JSON.parse(readFileSync(new URL("../food_nutrition.json", import.meta.url))).foods;
const index = buildIndex(foods);
const run = t => parseDescription(t, index);

test("parsePhrase reads quantity, unit, size and explicit amounts", () => {
  assert.deepEqual(
    (({ qty, unit, size, words }) => ({ qty, unit, size, words }))(parsePhrase("2 slices kaya toast")),
    { qty: 2, unit: "slice", size: 1, words: "kaya toast" });
  assert.equal(parsePhrase("half a pint of tiger beer").qty, 0.5);
  assert.equal(parsePhrase("half a pint of tiger beer").unit, "pint");
  assert.equal(parsePhrase("large laksa").size, 1.3);
  assert.deepEqual(parsePhrase("250ml heineken").amount, { value: 250, unit: "ml" });
  assert.equal(parsePhrase("two glasses of red wine").unit, "glass");
  assert.equal(parsePhrase("1/2 bowl laksa").qty, 0.5);
});

test("single dish match", () => {
  const r = run("laksa");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].food.name, "Laksa");
  assert.equal(r.items[0].confidence, "high");
  assert.ok(Math.abs(r.items[0].nutrition.energy_kcal - 585) < 1);
});

test("multi-item description with quantities", () => {
  const r = run("2 soft boiled eggs and laksa");
  assert.equal(r.items.length, 2);
  assert.match(r.items[0].food.name, /Soft-boiled eggs/);
  assert.equal(r.items[0].mult, 1);                 // listed serving is 2 eggs
  assert.equal(r.items[1].food.name, "Laksa");
});

test("a described combo can match a combo dish", () => {
  const r = run("2 soft boiled eggs and kaya toast");
  assert.match(r.items[0].food.name, /Kaya toast set with 2 soft-boiled eggs/);
});

test("piece counts scale from the listed serving", () => {
  const r = run("3 slices kaya toast");
  assert.ok(r.items[0].food.name.startsWith("Kaya toast"));
  assert.equal(r.items[0].mult, 1.5);              // 3 slices / listed 2 slices
});

test("drink servings: pint of Tiger and shots of whisky", () => {
  const pint = run("a pint of tiger beer").items[0];
  assert.equal(pint.food.name, "Tiger Beer");
  assert.ok(Math.abs(pint.nutrition.alcohol_g - 19.7) < 0.3);   // 500 ml * 5% * 0.789
  const shots = run("2 shots of johnnie walker black label").items[0];
  assert.match(shots.food.name, /Johnnie Walker Black/);
  assert.ok(Math.abs(shots.nutrition.alcohol_g - 18.9) < 0.3);  // 60 ml * 40% * 0.789
});

test("explicit ml amount", () => {
  const it = run("500ml heineken").items[0];
  assert.equal(it.food.name, "Heineken");
  assert.ok(Math.abs(it.nutrition.alcohol_g - 19.7) < 0.3);
});

test("vague text is flagged for user input, not guessed", () => {
  for (const t of ["some food", "dinner", "a snack", "stuff i ate"]) {
    const r = run(t);
    assert.equal(r.needsInput, true, t);
    assert.equal(r.items[0].food, null, t);
  }
});

test("unknown food is flagged", () => {
  const r = run("a can of coke");
  assert.equal(r.needsInput, true);
});

test("ambiguous brand asks to confirm", () => {
  const r = run("tiger");
  assert.ok(["check", "high"].includes(r.items[0].confidence));
  assert.ok(r.items[0].candidates.length > 1);
});

test("whole-phrase dish names containing 'with' stay together", () => {
  const r = run("prata with cheese");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].food.name, "Prata with cheese");
});

test("fish and chips matches as one dish", () => {
  const r = run("fish and chips");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].food.name, "Fish and chips");
});

test("chooseFood switches candidate and recomputes", () => {
  const r = run("tiger").items[0];
  const alt = r.candidates.find(c => c.food.name === "Tiger Crystal").food;
  const next = chooseFood(r, alt);
  assert.equal(next.food.name, "Tiger Crystal");
  assert.equal(next.confidence, "high");
});

test("manual estimate from kcal only fills in macros", () => {
  const n = estimateManual({ presetId: "mixed", kcal: 450 });
  assert.equal(n.energy_kcal, 450);
  assert.ok(n.protein_g > 10 && n.carbohydrate_g > 30 && n.total_fat_g > 10);
});

test("manual estimate from grams and type; user macros override", () => {
  const n = estimateManual({ presetId: "fried", grams: 200 });
  assert.equal(Math.round(n.energy_kcal), 540);
  const o = estimateManual({ presetId: "fried", grams: 200, protein: 30 });
  assert.equal(o.protein_g, 30);
  assert.equal(estimateManual({}), null);
});

test("sumNutritionObjects totals", () => {
  const t = sumNutritionObjects([{ energy_kcal: 100, sodium_mg: 5 }, { energy_kcal: 50.5 }]);
  assert.equal(t.energy_kcal, 150.5);
  assert.equal(t.sodium_mg, 5);
});
