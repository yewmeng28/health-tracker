// Meal comparison: build 2+ possible meals, see how each fits your day, and which is the better choice.
import { evaluateDay, sumNutrition } from "./calc.js";
import { NUTRIENTS } from "./nutrients.js";

export const MAX_OPTIONS = 5;
const LETTERS = "ABCDEFGH";

export function newOption(existing = []) {
  const used = new Set(existing.map(o => o.name));
  let i = 0;
  while (used.has(`Option ${LETTERS[i]}`) && i < LETTERS.length) i++;
  return { id: "opt-" + Math.random().toString(36).slice(2, 8), name: `Option ${LETTERS[i] ?? i + 1}`, items: [] };
}

export const optionTotals = opt => sumNutrition(opt.items);

const add = (a, b) => {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = (Number(a[k]) || 0) + (Number(b[k]) || 0);
  return out;
};

/** A rough "overall balance" number for a meal (higher is better). Used only as a tie-breaker. */
export function quality(t) {
  return (t.protein_g || 0) + 2 * (t.fibre_g || 0) - 2 * (t.saturated_fat_g || 0) - 0.5 * (t.sugars_g || 0)
    - (t.sodium_mg || 0) / 150 - (t.cholesterol_mg || 0) / 40 - 5 * (t.trans_fat_g || 0) - 0.7 * (t.alcohol_g || 0);
}

const LEVEL_ORDER = { ok: 0, warn: 1, over: 2 };

/**
 * options: [{id, name, items:[{n}]}]. targets/dayTotals optional (without them only nutrition is compared).
 * Returns { assessed (in ranked order, best first), best, tie }.
 */
export function assessOptions(options, { targets = null, dayTotals = null, direction = "maintain" } = {}) {
  const filled = options.filter(o => o.items.length);
  const assessed = filled.map(o => {
    const totals = optionTotals(o);
    let fit = null;
    if (targets) {
      const after = add(dayTotals || sumNutrition([]), totals);
      const ev = evaluateDay(after, targets, { final: false, hasEntries: true });
      const over = ev.checks.filter(c => c.streak && c.status === "over")
        .map(c => ({ key: c.key, label: c.label, unit: c.unit, value: c.value, max: c.max, pct: (c.value / c.max - 1) * 100 }));
      const worst = over.reduce((m, c) => Math.max(m, c.pct), 0);
      fit = { ev, over, worst, total: over.reduce((s, c) => s + c.pct, 0), level: !over.length ? "ok" : worst <= 10 + 1e-6 ? "warn" : "over" };
    }
    return { id: o.id, name: o.name, totals, fit, quality: quality(totals) };
  });

  const kcalDir = direction === "gain" ? -1 : 1;                       // lose/maintain: fewer calories wins ties; gain: more
  const cmp = (a, b) =>
    (a.fit ? LEVEL_ORDER[a.fit.level] - LEVEL_ORDER[b.fit.level] : 0) ||
    (a.fit ? a.fit.total - b.fit.total : 0) ||
    (b.quality - a.quality) ||
    kcalDir * (a.totals.energy_kcal - b.totals.energy_kcal);
  const ranked = [...assessed].sort(cmp);
  const tie = ranked.length > 1 && (!ranked[0].fit || (ranked[0].fit.level === ranked[1].fit.level && Math.abs(ranked[0].fit.total - ranked[1].fit.total) < 1))
    && Math.abs(ranked[0].quality - ranked[1].quality) < 1;
  return { assessed: ranked, best: ranked[0] || null, tie };
}

const round = x => Math.round(x);

/** Plain-English reasons why `best` beats `other`, and what it gives up. */
export function explain(best, other, direction = "maintain") {
  const list = [{ field: "energy_kcal", label: "calories", unit: "kcal", better: direction === "gain" ? "higher" : direction === "lose" ? "lower" : null },
    ...NUTRIENTS.filter(n => n.better).map(n => ({ field: n.field, label: n.label.toLowerCase(), unit: n.unit, better: n.better }))];
  const pros = [], cons = [];
  for (const n of list) {
    if (!n.better) continue;
    const a = best.totals[n.field] || 0, b = other.totals[n.field] || 0;
    const d = a - b, base = Math.max(a, b);
    if (base < 1e-9 || Math.abs(d) / base < 0.1 || (n.unit === "g" && Math.abs(d) < 1) || (n.unit === "mg" && Math.abs(d) < 20)) continue;
    const good = n.better === "lower" ? d < 0 : d > 0;
    const text = `${round(Math.abs(d))} ${n.unit} ${d < 0 ? "less" : "more"} ${n.label}`;
    (good ? pros : cons).push({ text, weight: Math.abs(d) / base });
  }
  const top = xs => xs.sort((x, y) => y.weight - x.weight).slice(0, 3).map(x => x.text);
  return { pros: top(pros), cons: top(cons) };
}

/** For each nutrient field, which option ids have the best value (only if the options differ meaningfully). */
export function winners(assessed, direction = "maintain") {
  const out = {};
  if (assessed.length < 2) return out;
  const rows = [{ field: "energy_kcal", better: direction === "gain" ? "higher" : direction === "lose" ? "lower" : null },
    ...NUTRIENTS.filter(n => n.better).map(n => ({ field: n.field, better: n.better }))];
  for (const r of rows) {
    if (!r.better) continue;
    const vals = assessed.map(a => a.totals[r.field] || 0);
    const hi = Math.max(...vals), lo = Math.min(...vals);
    if (hi === 0 || (hi - lo) / hi < 0.05) continue;
    const target = r.better === "lower" ? lo : hi;
    out[r.field] = assessed.filter((a, i) => vals[i] === target).map(a => a.id);
  }
  return out;
}

/** Copy an entry/item so it can live in a comparison option (no id/meal). */
export function cloneItem(entry) {
  const { id, meal, ...rest } = entry;
  return JSON.parse(JSON.stringify(rest));
}
