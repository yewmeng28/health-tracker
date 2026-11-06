// Local-date helpers (YYYY-MM-DD strings, local timezone).
const p2 = n => String(n).padStart(2, "0");

export const dateStr = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayStr = () => dateStr(new Date());

export function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

export const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);

export function prettyDate(s, today = todayStr()) {
  if (s === today) return "Today";
  if (s === addDays(today, -1)) return "Yesterday";
  if (s === addDays(today, 1)) return "Tomorrow";
  return parseDate(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// The five logging sections of the day.
export const MEALS = [
  { id: "breakfast", label: "Breakfast", icon: "🍳", range: "before 10:30" },
  { id: "lunch", label: "Lunch", icon: "🍜", range: "10:30 – 14:30" },
  { id: "tea", label: "Tea break", icon: "☕", range: "14:30 – 17:30" },
  { id: "dinner", label: "Dinner", icon: "🍛", range: "17:30 – 21:00" },
  { id: "supper", label: "Supper", icon: "🌙", range: "after 21:00" },
];

export function mealByTime(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h < 10.5 ? "breakfast" : h < 14.5 ? "lunch" : h < 17.5 ? "tea" : h < 21 ? "dinner" : "supper";
}

// ---- Time of day (used for weight entries) ----
const pad = n => String(n).padStart(2, "0");
export const timeStr = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const monthOf = s => s.slice(0, 7);

export function periodOf(time) {
  if (!time) return null;
  const h = Number(time.slice(0, 2));
  return h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
}

/** Minutes since midnight; entries without a time count as midday. */
export const minutesOf = time => (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : 720);
