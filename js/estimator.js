// On-device "describe what you ate" estimator. No network, no AI service.
// Matches free text against the food database, reads quantities/units/sizes, and
// reports how confident it is. Vague or unmatched parts must be estimated by the user.

import { NUTRIENT_KEYS, applySweetness } from "./calc.js";

const NUMWORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, half: 0.5, quarter: 0.25, double: 2, couple: 2, dozen: 12 };
const STOP = new Set(["a", "an", "the", "of", "some", "my", "i", "ate", "had", "drank", "for", "at", "in", "on",
  "about", "around", "approx", "with", "and", "plus", "small", "large", "big", "medium", "mini", "extra", "jumbo", "xl"]);
const GENERIC = new Set(["food", "meal", "dinner", "lunch", "breakfast", "snack", "stuff", "something", "dish",
  "thing", "takeaway", "leftover", "lot", "bit", "drink", "supper", "tea", "bite", "item"]);
const PIECE_UNITS = new Set(["piece", "pcs", "pc", "slice", "stick", "skewer", "egg", "roll", "bun"]);
const DRINK_UNITS = ["pint", "shot", "can", "bottle", "glass", "jug", "tower", "double", "nip"];
const UNIT_RE = /^(half pints?|bowls?|plates?|cups?|glass(?:es)?|cans?|bottles?|pints?|shots?|slices?|pieces?|pcs?|sticks?|skewers?|rolls?|buns?|packets?|tbsp|tsp|jugs?|nips?|servings?|portions?)\b\s*(?:of\b\s*)?/;
const SWEET_LESS = /\b(less sweet|less sugar|low sugar|half sweet|siew dai|siu dai|shao tian)\b/;
const SWEET_NONE = /\b(kosong|no sugar|zero sugar|sugar[- ]free|unsweetened|without sugar)\b/;
const SIZE_WORDS = [[/\b(extra[- ]large|xl|jumbo)\b/, 1.5], [/\b(large|big)\b/, 1.3], [/\b(small|mini)\b/, 0.7], [/\bmedium\b/, 1]];

const norm = t => {
  t = t.toLowerCase().replace(/[^a-z0-9]/g, "");
  return t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
};
export const tokens = s => s.toLowerCase().split(/[^a-z0-9']+/).map(norm).filter(t => t && !/^\d+$/.test(t) && !STOP.has(t));

export function buildIndex(foods) {
  const df = new Map();
  const rows = foods.map(f => {
    const toks = new Set(tokens(f.name));
    toks.forEach(t => df.set(t, (df.get(t) || 0) + 1));
    return { f, toks };
  });
  const total = rows.length;
  const idf = t => Math.log(1 + total / (1 + (df.get(t) || 0)));
  return { rows, idf };
}

function rank(qToks, index, limit = 4) {
  const { rows, idf } = index;
  const wq = qToks.reduce((s, t) => s + idf(t), 0) || 1;
  const out = [];
  for (const { f, toks } of rows) {
    let wc = 0, hit = 0, wn = 0;
    for (const t of toks) wn += idf(t);
    for (const t of qToks) if (toks.has(t)) { wc += idf(t); hit++; }
    if (!hit) continue;
    let score = (wc / wq) * 0.65 + (wc / (wn || 1)) * 0.35;
    if (hit === qToks.length) score += 0.1;
    if (hit === qToks.length && toks.size === hit) score += 0.2;   // exact name match
    out.push({ food: f, score });
  }
  out.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return out.slice(0, limit);
}

function countInName(name) {
  const m = name.match(/(\d+)\s*(?:pieces?|slices?|sticks?|skewers?|rolls?|eggs?|pcs?|tablet)/i);
  return m ? Number(m[1]) : 0;
}

/** Break a phrase into quantity / unit / explicit amount / size / remaining words. */
export function parsePhrase(raw) {
  let s = (" " + raw.toLowerCase() + " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  let qty = null, unit = null, size = 1, amount = null, sweet = null;

  const am = s.match(/(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\b/);
  if (am) {
    const v = Number(am[1]);
    amount = am[2] === "l" || am[2] === "kg" ? { value: v * 1000, unit: am[2] === "l" ? "ml" : "g" } : { value: v, unit: am[2] };
    s = s.replace(am[0], " ").trim();
  }
  const noneM = s.match(SWEET_NONE), lessM = s.match(SWEET_LESS);        // "kopi siew dai", "teh o kosong"
  if (noneM) { sweet = 0; s = s.replace(noneM[0], " ").trim(); }
  else if (lessM) { sweet = 0.5; s = s.replace(lessM[0], " ").trim(); }
  for (const [re, f] of SIZE_WORDS) if (re.test(s)) { size = f; s = s.replace(re, " ").trim(); }

  const qm = s.match(/^(\d+(?:\.\d+)?\s*\/\s*\d+|\d+(?:\.\d+)?|a couple of|a couple|couple|an|a|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|double|dozen)\b\s*(?:x|×)?\s*/);
  if (qm) {
    const q = qm[1].replace(/\s+/g, "");
    qty = q.includes("/") ? q.split("/").reduce((a, b) => a / b)
      : q.startsWith("acouple") || q === "couple" ? 2 : NUMWORDS[q] ?? Number(q);
    s = s.slice(qm[0].length).replace(/^(?:a|an)\s+/, "");   // "half a pint"
    const um = s.match(UNIT_RE);
    if (um) {
      const u = um[1];
      unit = /^half pint/.test(u) ? "pint" : /^glass/.test(u) ? "glass" : u.replace(/s$/, "");
      unit = { pc: "piece", portion: "serving" }[unit] || unit;
      if (/^half pint/.test(u)) qty = qty * 0.5;
      s = s.slice(um[0].length);
    }
  }
  return { text: raw.trim(), qty, unit, size, amount, sweet, words: s.trim() };
}

function multiplierFor(food, p) {
  const base = food.serving?.amount || 1;
  if (p.amount) return { m: p.amount.value / base, label: `${p.amount.value} ${p.amount.unit}` };
  const qty = p.qty ?? 1;
  if (food.category === "alcohol" && p.unit && DRINK_UNITS.includes(p.unit)) {
    const opts = food.serving_options || [];
    const opt = opts.find(o => o.label.toLowerCase().startsWith(p.unit)) ||
      opts.find(o => o.label.toLowerCase().includes(p.unit));
    if (opt) return { m: (qty * opt.amount * p.size) / base, label: `${qty} × ${opt.label}` };
  }
  const n = countInName(food.name);
  const pieceLike = p.unit ? PIECE_UNITS.has(p.unit) : p.qty != null;
  if (food.piece?.grams && pieceLike) {                        // database knows the weight of one piece
    const m = (qty * p.size * food.piece.grams) / base;
    return { m, label: `${qty} ${food.piece.label}${qty === 1 ? "" : "s"} (${+(qty * p.size * food.piece.grams).toFixed(1)} ${food.serving.unit})` };
  }
  if (n && pieceLike) return { m: (qty * p.size) / n, label: `${qty} piece${qty === 1 ? "" : "s"} (listed serving = ${n})` };
  const m = qty * p.size;
  return { m, label: `${+m.toFixed(2)} × serving (${food.serving?.amount} ${food.serving?.unit})` };
}

/** Nutrition for `mult` servings of a food; `factor` is the sweetness (1 regular, 0.5 less sweet, 0 no added sugar). */
export function nutritionOfFood(food, mult, factor = 1) {
  const out = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 0]));
  const n = food.nutrition_per_serving || {};
  for (const k of NUTRIENT_KEYS) out[k] = Math.round((Number(n[k]) || 0) * mult * 10) / 10;
  return food.sweetness && factor !== 1 ? applySweetness(out, food.sweetness.added_sugar_g * mult, factor) : out;
}

function matchPhrase(p, index) {
  const qToks = tokens(p.words);
  const vague = !qToks.length || qToks.every(t => GENERIC.has(t));
  const candidates = vague ? [] : rank(qToks, index);
  const top = candidates[0], second = candidates[1];
  let confidence = "unknown";
  if (top && top.score >= 0.35) {
    const clear = !second || top.score - second.score >= 0.06;
    confidence = top.score >= 0.6 && clear ? "high" : "check";
  }
  const item = { ...p, candidates, food: confidence === "unknown" ? null : top.food, confidence, vague,
    mult: null, label: "", nutrition: null, sweetFactor: 1 };
  if (item.food) {
    const { m, label } = multiplierFor(item.food, p);
    const sweetFactor = item.food.sweetness ? (p.sweet ?? 1) : 1;
    Object.assign(item, { mult: m, label, sweetFactor, nutrition: nutritionOfFood(item.food, m, sweetFactor) });
  }
  return item;
}

/** Re-pick a different candidate food for an item. */
export function chooseFood(item, food) {
  const { m, label } = multiplierFor(food, item);
  const sweetFactor = food.sweetness ? (item.sweetFactor ?? item.sweet ?? 1) : 1;
  return { ...item, food, confidence: "high", mult: m, label, sweetFactor, nutrition: nutritionOfFood(food, m, sweetFactor) };
}

export function setMultiplier(item, mult) {
  return { ...item, mult, label: `${+mult.toFixed(2)} × serving`, nutrition: nutritionOfFood(item.food, mult, item.sweetFactor ?? 1) };
}

export function setSweetness(item, factor) {
  return { ...item, sweetFactor: factor, nutrition: nutritionOfFood(item.food, item.mult, factor) };
}

/** Parse a free-text description into items. */
export function parseDescription(text, index) {
  const clean = text.trim();
  if (!clean) return { items: [], needsInput: false };
  const whole = matchPhrase(parsePhrase(clean), index);
  let items;
  const covered = whole.food && (() => {            // every word of the text is explained by the dish name
    const names = new Set(tokens(whole.food.name));
    return tokens(whole.words).every(t => names.has(t));
  })();
  if (covered && whole.candidates[0].score >= 0.75 && whole.confidence === "high") {
    items = [whole];
  } else {
    const parts = clean.split(/\s*(?:,|;|\+|&|\band\b|\bwith\b|\bplus\b|\bw\/)\s*/i).filter(Boolean);
    items = parts.length > 1 ? parts.map(x => matchPhrase(parsePhrase(x), index)) : [whole];
  }
  return { items, needsInput: items.some(i => i.confidence === "unknown") };
}

// ---- Manual fallback: user supplies an estimated amount ----
// Per 100 g/ml: [kcal, protein, carbs, fat, sat fat, fibre, sugars, sodium, cholesterol, trans]
export const PRESETS = [
  { id: "mixed", label: "Mixed cooked meal", per100: [150, 7, 18, 5.5, 1.8, 2, 1.5, 450, 25, 0] },
  { id: "starch", label: "Rice / noodles / bread", per100: [140, 4, 27, 2, 0.6, 1.5, 1, 250, 5, 0] },
  { id: "meat", label: "Meat / fish / egg dish", per100: [190, 20, 3, 11, 3.5, 0.3, 1, 400, 85, 0.1] },
  { id: "fried", label: "Fried / oily food", per100: [270, 8, 28, 14, 3.5, 2, 2, 500, 35, 0.3] },
  { id: "veg", label: "Vegetables / salad", per100: [50, 2, 6, 2.5, 0.4, 2.2, 3, 250, 0, 0] },
  { id: "soup", label: "Soup / broth", per100: [45, 3, 4, 1.8, 0.6, 0.5, 1, 350, 8, 0] },
  { id: "sweet", label: "Sweet snack / dessert", per100: [380, 5, 55, 15, 7, 1.5, 32, 150, 30, 0.1] },
  { id: "drink", label: "Sugary drink", per100: [42, 0, 10.5, 0, 0, 0, 10.5, 10, 0, 0] },
  { id: "fruit", label: "Fruit", per100: [55, 0.7, 13, 0.2, 0, 2, 10, 2, 0, 0] },
];

export const SIZE_PRESETS = [
  { id: "snack", label: "Small snack (~150 kcal)", kcal: 150 },
  { id: "light", label: "Light meal (~400 kcal)", kcal: 400 },
  { id: "regular", label: "Regular meal (~600 kcal)", kcal: 600 },
  { id: "heavy", label: "Heavy meal (~900 kcal)", kcal: 900 },
];

const FIELD_ORDER = ["energy_kcal", "protein_g", "carbohydrate_g", "total_fat_g", "saturated_fat_g", "fibre_g", "sugars_g", "sodium_mg", "cholesterol_mg", "trans_fat_g"];

/**
 * Estimate nutrition from what the user knows. Provide grams (with a preset type) and/or kcal.
 * Any macro the user enters overrides the estimate.
 */
export function estimateManual({ presetId = "mixed", grams, kcal, protein, carbs, fat, sugars, sodium } = {}) {
  const preset = PRESETS.find(p => p.id === presetId) || PRESETS[0];
  let scale;
  if (kcal > 0) scale = kcal / preset.per100[0];
  else if (grams > 0) scale = grams / 100;
  else return null;
  const out = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 0]));
  FIELD_ORDER.forEach((k, i) => { out[k] = Math.round(preset.per100[i] * scale * 10) / 10; });
  const set = (k, v) => { if (v != null && v !== "" && !Number.isNaN(Number(v))) out[k] = Number(v); };
  set("protein_g", protein); set("carbohydrate_g", carbs); set("total_fat_g", fat);
  set("sugars_g", sugars); set("sodium_mg", sodium);
  if (kcal > 0) out.energy_kcal = Number(kcal);
  return out;
}

export function sumNutritionObjects(list) {
  const t = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 0]));
  for (const n of list) for (const k of NUTRIENT_KEYS) t[k] += Number(n?.[k]) || 0;
  for (const k of NUTRIENT_KEYS) t[k] = Math.round(t[k] * 10) / 10;
  return t;
}
