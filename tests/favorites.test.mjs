import test from "node:test";
import assert from "node:assert/strict";

const mem = {};
globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const store = await import("../js/store.js");
const { favoriteFoods, isFavorite, recentFoods, topCategories } = await import("../js/favorites.js");

const foods = [
  { id: "food-001", name: "Laksa", category: "hawker" }, { id: "food-002", name: "Roti prata", category: "hawker" },
  { id: "food-003", name: "Teh tarik", category: "drink" }, { id: "drink-001", name: "Tiger Beer", category: "alcohol" },
  { id: "food-004", name: "Mango", category: "fruit" },
];

test("toggleFavorite adds newest first, removes, and reports state", () => {
  store.resetAll();
  assert.equal(store.toggleFavorite("food-001"), true);
  assert.equal(store.toggleFavorite("food-003"), true);
  assert.deepEqual(store.getState().favorites, ["food-003", "food-001"]);
  assert.equal(store.toggleFavorite("food-003"), false);
  assert.deepEqual(store.getState().favorites, ["food-001"]);
  assert.equal(isFavorite(store.getState(), "food-001"), true);
  assert.equal(isFavorite(store.getState(), "food-003"), false);
  store.resetAll();
  assert.deepEqual(store.getState().favorites, []);
});

test("favouriteFoods keeps order and skips ids no longer in the database", () => {
  const state = { favorites: ["drink-001", "gone", "food-001"] };
  assert.deepEqual(favoriteFoods(state, foods).map(f => f.name), ["Tiger Beer", "Laksa"]);
  assert.deepEqual(favoriteFoods({}, foods), []);
});

test("recentFoods: newest first, distinct, skips excluded and unknown, respects limit", () => {
  const e = (foodId, meal = "lunch") => ({ id: Math.random().toString(), meal, name: foodId, foodId, n: {} });
  const state = { log: {
    "2026-11-08": [e("food-001"), e("food-002")],
    "2026-11-09": [e("food-003"), e("food-001"), { id: "x", meal: "lunch", name: "My estimate", n: {} }],   // no foodId
    "2026-11-10": [e("deleted-food"), e("drink-001")],
  } };
  assert.deepEqual(recentFoods(state, foods).map(f => f.id), ["drink-001", "food-001", "food-003", "food-002"]);
  assert.deepEqual(recentFoods(state, foods, { limit: 2 }).map(f => f.id), ["drink-001", "food-001"]);
  assert.deepEqual(recentFoods(state, foods, { exclude: ["food-001"] }).map(f => f.id), ["drink-001", "food-003", "food-002"]);
  assert.deepEqual(recentFoods({ log: {} }, foods), []);
});

test("topCategories ranks by size", () => {
  assert.deepEqual(topCategories(foods, 2), [["hawker", 2], ["alcohol", 1]]);
});

test("old saved data without favourites still loads", () => {
  mem["health-tracker:v1"] = JSON.stringify({ version: 1, profile: null, weights: [], log: {}, customFoods: [], badges: {} });
  const s = store.load();
  assert.deepEqual(s.favorites, []);
  delete mem["health-tracker:v1"];
});
