// Streaks and badges, derived from the log + weights. Pure functions.
import { computeTargets, evaluateDay, sumNutrition } from "./calc.js";
import { addDays, diffDays } from "./dates.js";
import { latestWeightOn } from "./store.js";

/** Targets for a given date use the weight on or before that date. */
export function targetsFor(state, date) {
  const w = latestWeightOn(state.weights, date);
  if (!state.profile || !w) return null;
  return computeTargets(state.profile, w.kg);
}

export function dayResult(state, date, today) {
  const t = targetsFor(state, date);
  const entries = state.log[date] || [];
  if (!t) return null;
  return { date, entries, ...evaluateDay(sumNutrition(entries), t, { final: date < today, hasEntries: entries.length > 0 }) };
}

/**
 * Streak = consecutive days (ending yesterday, plus today if it already passes) that stayed within limits.
 * Today never breaks the streak unless a cap is already exceeded.
 */
export function computeStreaks(state, today) {
  const dates = Object.keys(state.log).sort();
  const results = new Map();
  for (const d of dates) { const r = dayResult(state, d, today); if (r) results.set(d, r); }

  const passes = d => results.get(d)?.state === "pass";
  let current = 0;
  let cursor = today;
  const todayState = results.get(today)?.state;
  if (todayState === "pass") { current = 1; cursor = addDays(today, -1); }
  else if (todayState === "fail") { cursor = null; }              // already over a limit today
  else cursor = addDays(today, -1);                                // pending/empty: judge from yesterday
  while (cursor && passes(cursor)) { current++; cursor = addDays(cursor, -1); }

  let best = 0, run = 0, prevPass = null;
  for (const d of dates) {
    if (passes(d)) {
      run = prevPass && diffDays(d, prevPass) === 1 ? run + 1 : 1;
      prevPass = d;
      best = Math.max(best, run);
    } else { run = 0; prevPass = null; }
  }
  return { current, best, results };
}

function weighStreakBest(weights) {
  let best = 0, run = 0, prev = null;
  for (const date of [...new Set(weights.map(w => w.date))]) {   // several weigh-ins a day count once
    run = prev && diffDays(date, prev) === 1 ? run + 1 : 1;
    prev = date; best = Math.max(best, run);
  }
  return best;
}

export function computeStats(state, today) {
  const { current, best, results } = computeStreaks(state, today);
  const days = [...results.values()].filter(r => r.entries.length);
  const check = (r, key) => r.checks.find(c => c.key === key);
  const finished = days.filter(r => r.date < today || r.state === "pass");

  const w = state.weights;
  let goalProgress = 0, goalReached = false;
  const goal = state.profile?.goalKg;
  if (w.length && goal) {
    const start = w[0].kg, now = w[w.length - 1].kg;
    const total = Math.abs(goal - start);
    goalProgress = Math.max(0, (goal < start ? start - now : now - start));
    goalReached = total >= 0.5 && (goal < start ? now <= goal : now >= goal);
  }
  return {
    streak: current, bestStreak: best,
    loggedDays: days.length,
    totalEntries: days.reduce((s, r) => s + r.entries.length, 0),
    passDays: finished.filter(r => r.state === "pass").length,
    sodiumOkDays: finished.filter(r => check(r, "sodium").status !== "over" && check(r, "kcal").value > 0).length,
    sugarOkDays: finished.filter(r => check(r, "sugars").status !== "over" && check(r, "kcal").value > 0).length,
    fullMealDays: days.filter(r => new Set(r.entries.map(e => e.meal)).size >= 5).length,
    balancedDays: finished.filter(r => r.state === "pass" && check(r, "protein").status !== "under" && check(r, "fibre").status !== "under").length,
    weighIns: w.length, weighStreakBest: weighStreakBest(w),
    goalProgressKg: goalProgress, goalReached,
    customFoods: state.customFoods.length,
  };
}

export const BADGES = [
  { id: "first_log", icon: "🍽️", name: "First bite", desc: "Log your first food.", progress: s => [s.totalEntries, 1] },
  { id: "streak_3", icon: "🔥", name: "3-day streak", desc: "Stay within your daily limits 3 days in a row.", progress: s => [s.bestStreak, 3] },
  { id: "streak_7", icon: "🏅", name: "Week warrior", desc: "7 days in a row within limits.", progress: s => [s.bestStreak, 7] },
  { id: "streak_14", icon: "🥈", name: "Fortnight focus", desc: "14 days in a row within limits.", progress: s => [s.bestStreak, 14] },
  { id: "streak_30", icon: "🥇", name: "Monthly master", desc: "30 days in a row within limits.", progress: s => [s.bestStreak, 30] },
  { id: "streak_100", icon: "💎", name: "Centurion", desc: "100 days in a row within limits.", progress: s => [s.bestStreak, 100] },
  { id: "full_day", icon: "🗓️", name: "Full day logged", desc: "Log all 5 mealtimes in one day.", progress: s => [s.fullMealDays, 1] },
  { id: "balanced", icon: "⚖️", name: "Balanced day", desc: "Hit calories, protein and fibre targets in a day.", progress: s => [s.balancedDays, 1] },
  { id: "sodium_smart", icon: "🧂", name: "Sodium smart", desc: "Stay under your sodium limit on 7 logged days.", progress: s => [s.sodiumOkDays, 7] },
  { id: "sugar_smart", icon: "🍬", name: "Sugar smart", desc: "Stay under your sugar cap on 7 logged days.", progress: s => [s.sugarOkDays, 7] },
  { id: "custom", icon: "✍️", name: "Home chef", desc: "Save a custom food.", progress: s => [s.customFoods, 1] },
  { id: "weigh_in", icon: "⚖️", name: "On the scale", desc: "Record your first weight.", progress: s => [s.weighIns, 1] },
  { id: "weigh_7", icon: "📈", name: "Weekly weigher", desc: "Record 7 weigh-ins.", progress: s => [s.weighIns, 7] },
  { id: "weigh_streak", icon: "📆", name: "Daily weigher", desc: "Weigh in 7 days in a row.", progress: s => [s.weighStreakBest, 7] },
  { id: "goal_1kg", icon: "🎯", name: "First kilo", desc: "Move 1 kg towards your goal weight.", progress: s => [s.goalProgressKg, 1] },
  { id: "goal_reached", icon: "🏆", name: "Goal reached", desc: "Reach your goal weight.", progress: s => [s.goalReached ? 1 : 0, 1] },
];

/** Evaluate every badge. Returns list with earned/progress, plus ids newly earned vs saved. */
export function evaluateBadges(state, today) {
  const stats = computeStats(state, today);
  const list = BADGES.map(b => {
    const [have, need] = b.progress(stats);
    return { ...b, have, need, earned: have >= need || !!state.badges[b.id], earnedOn: state.badges[b.id] || null };
  });
  const fresh = list.filter(b => b.have >= b.need && !state.badges[b.id]).map(b => b.id);
  return { stats, list, fresh };
}
