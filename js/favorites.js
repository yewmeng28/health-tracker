// Favourite and recently-logged foods. Pure helpers (no DOM).

export const isFavorite = (state, id) => (state.favorites || []).includes(id);

/** Favourite foods in the order they were starred (newest first); ids no longer in the database are skipped. */
export function favoriteFoods(state, foods) {
  const byId = new Map(foods.map(f => [f.id, f]));
  return (state.favorites || []).map(id => byId.get(id)).filter(Boolean);
}

/** Distinct foods from the log, most recent first. */
export function recentFoods(state, foods, { limit = 8, exclude = [] } = {}) {
  const byId = new Map(foods.map(f => [f.id, f]));
  const seen = new Set(exclude);
  const out = [];
  for (const date of Object.keys(state.log).sort().reverse()) {
    for (const e of [...state.log[date]].reverse()) {
      if (!e.foodId || seen.has(e.foodId) || !byId.has(e.foodId)) continue;
      seen.add(e.foodId);
      out.push(byId.get(e.foodId));
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Categories by number of foods, most common first. */
export function topCategories(foods, limit = 12) {
  const counts = new Map();
  for (const f of foods) counts.set(f.category, (counts.get(f.category) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}
