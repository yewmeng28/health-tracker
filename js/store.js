// Local-only storage (localStorage). Nothing leaves the device.
const KEY = "health-tracker:v1";

export const defaultState = () => ({
  version: 1,
  profile: null,            // {sex, age, heightCm, activity, goalKg, rateKgPerWeek}
  weights: [],              // [{date, kg}] sorted ascending, one per date
  log: {},                  // {date: [{id, meal, name, amountLabel, n:{nutrients}, source, foodId?}]}
  customFoods: [],          // saved custom foods (same shape as database foods)
  badges: {},               // {badgeId: dateEarned}
  favorites: [],            // food ids, newest first
  prefs: { nutrientMode: "all", nutrients: [] },   // which nutrients to display (Profile -> Display)
  compare: { options: [], includeToday: true },    // meal comparison options
});

let state = defaultState();
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...defaultState(), ...JSON.parse(raw) };
  } catch (e) { console.warn("Could not read saved data", e); }
  return state;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn("Could not save data", e); }
}

export const getState = () => state;
export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));

/** Mutate state inside fn, then save and notify. */
export function update(fn) {
  fn(state);
  persist();
  listeners.forEach(l => l(state));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- Domain helpers ----
// Weights are {date, kg, time?}. Several weigh-ins per day are allowed (different times).
const weightKey = w => w.date + " " + (w.time || "12:00");

export function setWeight(date, kg, time = null) {
  update(s => {
    const i = s.weights.findIndex(w => w.date === date && (w.time || null) === (time || null));
    if (i >= 0) s.weights[i].kg = kg; else s.weights.push(time ? { date, kg, time } : { date, kg });
    s.weights.sort((a, b) => weightKey(a).localeCompare(weightKey(b)));
  });
}

export function deleteWeight(date, time = null) {
  update(s => { s.weights = s.weights.filter(w => !(w.date === date && (w.time || null) === (time || null))); });
}

/** Change fields of a logged entry (portion, meal, nutrition...). */
export function updateLogEntry(date, id, changes) {
  update(s => {
    const e = (s.log[date] || []).find(x => x.id === id);
    if (e) Object.assign(e, changes);
  });
}

/** Star / unstar a food. Returns true if it is now a favourite. */
export function toggleFavorite(id) {
  let now = false;
  update(s => {
    s.favorites = s.favorites || [];
    const i = s.favorites.indexOf(id);
    if (i >= 0) s.favorites.splice(i, 1); else { s.favorites.unshift(id); now = true; }
  });
  return now;
}

export function addLogEntry(date, entry) {
  update(s => { (s.log[date] ||= []).push({ id: uid(), ...entry }); });
}

export function removeLogEntry(date, id) {
  update(s => {
    s.log[date] = (s.log[date] || []).filter(e => e.id !== id);
    if (!s.log[date].length) delete s.log[date];
  });
}

export function latestWeightOn(weights, date) {
  let best = null;
  for (const w of weights) if (w.date <= date) best = w; else break;
  return best || weights[0] || null;
}

export function exportJson() { return JSON.stringify(state, null, 2); }

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (typeof parsed !== "object" || !parsed || !("log" in parsed) || !("weights" in parsed)) throw new Error("Not a Health Tracker backup");
  update(s => { Object.assign(s, defaultState(), parsed); });
}

export function resetAll() { update(s => { Object.assign(s, defaultState()); }); }
