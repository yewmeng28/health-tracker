// Dependency-free SVG line chart for weight over time, with an optional goal line.
import { diffDays, minutesOf, parseDate } from "./dates.js";

const W = 360, H = 230, PAD = { l: 42, r: 14, t: 14, b: 28 };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = s => parseDate(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function niceStep(span) {
  const raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

export function weightChart(points, goalKg) {
  if (!points.length) return `<div class="empty">Log your weight to see your trend.</div>`;
  const vals = points.map(p => p.kg).concat(goalKg ? [goalKg] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo);
  lo = Math.floor((lo - step * 0.3) / step) * step;
  hi = Math.ceil((hi + step * 0.3) / step) * step;

  const d0 = points[0].date, d1 = points[points.length - 1].date;
  const at = p => diffDays(p.date, d0) + minutesOf(p.time) / 1440;       // days since first point, incl. time of day
  const span = Math.max(1e-6, at(points[points.length - 1]) - at(points[0]));
  const x = p => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : ((at(p) - at(points[0])) / span) * (W - PAD.l - PAD.r));
  const y = v => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  let grid = "";
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
      `<text x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${+v.toFixed(1)}</text>`;
  }
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const dots = points.map(p =>
    `<circle cx="${x(p).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.5" class="dot"><title>${esc(short(p.date))}${p.time ? " " + esc(p.time) : ""}: ${p.kg} kg</title></circle>`).join("");
  const last = points[points.length - 1];
  const goal = goalKg
    ? `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(goalKg)}" y2="${y(goalKg)}" class="goal"/>` +
      `<text x="${W - PAD.r}" y="${y(goalKg) - 5}" text-anchor="end" class="goaltext">Goal ${goalKg} kg</text>` : "";
  const xl = points.length > 1
    ? `<text x="${PAD.l}" y="${H - 8}" class="axis">${esc(short(d0))}</text><text x="${W - PAD.r}" y="${H - 8}" text-anchor="end" class="axis">${esc(short(d1))}</text>`
    : `<text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="axis">${esc(short(d0))}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time chart. Latest ${last.kg} kilograms${goalKg ? `, goal ${goalKg} kilograms` : ""}." class="wchart">
    ${grid}${goal}<path d="${line}" class="wline"/>${dots}
    <text x="${x(last).toFixed(1)}" y="${(y(last.kg) - 9).toFixed(1)}" text-anchor="middle" class="lasttext">${last.kg}</text>
    ${xl}</svg>`;
}
