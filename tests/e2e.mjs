// End-to-end smoke test: serves the app, drives headless Chrome over the DevTools protocol.
// Run: node tests/e2e.mjs   (needs Google Chrome; set CHROME=/path/to/chrome to override)
import http from "node:http";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.env.SHOTS || (await mkdtemp(path.join(tmpdir(), "ht-shots-")));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) throw new Error("bad path");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const profileDir = await mkdtemp(path.join(tmpdir(), "ht-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profileDir}`, "--remote-debugging-port=0", "--window-size=420,900", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  chrome.stderr.on("data", d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
  setTimeout(() => reject(new Error("Chrome did not start: " + buf.slice(-300))), 15000);
});

const browser = new WebSocket(wsUrl);
await new Promise(r => browser.addEventListener("open", r));
let nextId = 1; const pending = new Map(); const events = [];
browser.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
  else if (m.method) events.push(m);
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++; pending.set(id, { resolve, reject });
  browser.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const cmd = (m, p) => send(m, p, sessionId);
await cmd("Page.enable"); await cmd("Runtime.enable");
await cmd("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const ev = async expr => {
  const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + "\n" + expr);
  return r.result.value;
};
const shot = async name => {
  const { data } = await cmd("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(OUT, name + ".png"), Buffer.from(data, "base64"));
};
let passed = 0, failed = 0;
const check = (name, cond, extra = "") => { cond ? passed++ : failed++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); };
const go = async hash => { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(250); };
const text = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`);
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);

try {
  await cmd("Page.navigate", { url: base });
  await sleep(1200);

  // --- first run: setup prompt, no errors
  check("first run shows setup prompt", (await text("#view-today")).includes("Set up your profile"));

  // --- profile
  await go("#profile");
  await ev(`(() => { const f = document.querySelector('#profileForm');
    f.sex.value='male'; f.age.value='30'; f.heightCm.value='175'; f.kg.value='82'; f.activity.value='moderate'; f.goalKg.value='75'; f.rateKgPerWeek.value='0.5';
    f.requestSubmit(); })()`);
  await sleep(300);
  const prof = await text("#view-profile");
  check("profile shows calorie targets", /Calories\s+1,?\d{3}\s*–\s*2,?\d{3}\s*kcal/.test(prof), prof.slice(0, 400));
  check("profile shows alcohol limit 2 for male", /≤ 2 std drinks/.test(prof));
  await shot("1-profile");

  // --- weight tracking
  await go("#weight");
  for (const [daysAgo, kg] of [[20, 82.4], [13, 81.6], [6, 80.9], [0, 80.2]]) {
    await ev(`(() => { const f = document.querySelector('#weightForm'); const d = new Date(); d.setDate(d.getDate() - ${daysAgo});
      const p = n => String(n).padStart(2,'0'); f.date.value = d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); f.kg.value='${kg}'; f.requestSubmit(); })()`);
    await sleep(150);
  }
  check("weight chart rendered with goal line", await ev(`!!document.querySelector('#view-weight svg.wchart .goal') && document.querySelectorAll('#view-weight svg.wchart .dot').length === 4`));
  check("weight history lists entries", (await ev(`document.querySelectorAll('#view-weight .wlist li').length`)) === 4);
  check("weight stats show change", /-2\.2 kg/.test(await text("#view-weight")), await text("#view-weight"));
  await shot("2-weight");

  // --- today: empty, then log a database food via search flow
  await go("#today");
  check("today shows 5 mealtimes", (await ev(`document.querySelectorAll('#view-today .meal').length`)) === 5);
  await click('[data-action="add-search"][data-meal="lunch"]');
  await sleep(500);
  check("foods tab opens in adding mode", await ev(`!document.querySelector('#addbanner').hidden && location.hash === '#foods'`));
  await ev(`(() => { const q = document.querySelector('#q'); q.value = 'laksa'; q.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(200);
  check("search finds Laksa", /Laksa/.test(await text("#results")));
  await ev(`document.querySelector('[data-action="log-food"]').click()`);
  await sleep(200);
  check("log sheet opens with preview", (await text("#logPreview")).includes("kcal"));
  await ev(`document.querySelector('#logForm').requestSubmit()`);
  await sleep(300);
  await go("#today");
  check("laksa logged under Lunch", /Laksa/.test(await ev(`document.querySelectorAll('#view-today .meal')[1].innerText`)));
  check("calories reflect entry", /585/.test(await text("#view-today .kbig")), await text("#view-today .kbig"));

  // --- edit portion + move to another mealtime
  await ev(`document.querySelector('[data-action="edit-entry"]').click()`);
  await sleep(250);
  await ev(`(() => { const f = document.querySelector('#editForm'); f.elements.mult.value = '0.5'; f.elements.mult.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  check("edit sheet previews the new portion", /29[23] kcal/.test(await text("#editPreview")), await text("#editPreview"));
  await ev(`(() => { const f = document.querySelector('#editForm'); f.elements.meal.value = 'dinner'; f.requestSubmit(); })()`);
  await sleep(300);
  check("entry moved to Dinner with half portion", /Laksa/.test(await ev(`document.querySelectorAll('#view-today .meal')[3].innerText`)) && /29[23]/.test(await text("#view-today .kbig")), await text("#view-today .kbig"));

  // --- calendar: pick a day, then jump to its full breakdown
  await click('[data-action="mode-today"][data-mode="calendar"]');
  await sleep(200);
  check("calendar view shows month grid", await ev(`!!document.querySelector('#view-today .calgrid .cal-day.today')`));
  await click('.cal-day.today');
  await sleep(250);
  check("selecting a day shows details", await ev(`!!document.querySelector('.caldetail') && /Show full breakdown/.test(document.querySelector('.caldetail').innerText)`));
  await shot("2b-calendar");
  await click('[data-action="show-day"]');
  await sleep(250);
  check("'Show full breakdown' opens that day in the Today view", await ev(`document.querySelectorAll('#view-today .meal').length === 5`));

  // --- second weigh-in on the same day with a time of day
  await go("#weight");
  await ev(`(() => { const f = document.querySelector('#weightForm'); f.time.value = '21:15'; f.kg.value = '80.9'; f.requestSubmit(); })()`);
  await sleep(200);
  check("evening weigh-in listed with its time of day", /21:15 · Evening/.test(await text("#view-weight")), await text("#view-weight"));
  await click('[data-action="mode-weight"][data-mode="calendar"]');
  await sleep(200);
  check("weight calendar renders", await ev(`!!document.querySelector('#view-weight .calgrid')`));
  await click('[data-action="mode-weight"][data-mode="chart"]');
  await sleep(100);

  // --- favourites + calm Foods landing page
  await go("#foods");
  await ev(`(() => { const q = document.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(200);
  check("Foods tab opens on favourites/browse, not a long list", await ev(`!document.querySelector('#browse').hidden && document.querySelector('#resultsWrap').hidden && document.querySelectorAll('#results .card').length === 0`));
  await ev(`(() => { const q = document.querySelector('#q'); q.value = 'laksa'; q.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(200);
  await ev(`document.querySelector('#results [data-action="toggle-fav"]').click()`);
  await sleep(200);
  await ev(`(() => { const q = document.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(200);
  check("starred food appears under Favourites", /Laksa/.test(await text("#browse")), await text("#browse"));
  await go("#today");
  await click('[data-action="add-fav"][data-meal="supper"]');
  await sleep(250);
  check("meal's Favourites picker lists the favourite", /Laksa/.test(await text("#sheet")));
  await ev(`document.querySelector('[data-action="fav-pick"]').click()`);
  await sleep(250);
  check("picking a favourite opens the log sheet for that mealtime", await ev(`document.querySelector('#logForm')?.meal.value === 'supper'`));
  await ev(`document.querySelector('#sheet').close()`);

  // --- drinks with serving selection
  await go("#foods");
  await ev(`(() => { const q = document.querySelector('#q'); q.value = 'tiger beer'; q.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(200);
  await ev(`(() => { const s = document.querySelector('.serving-select'); s.value = '500'; s.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await sleep(150);
  check("pint serving rescales Tiger to ~2 std drinks", /2\.0 standard drinks/.test(await text("#results")), await text("#results"));

  // --- custom description: confident match
  await go("#today");
  await click('[data-action="add-describe"][data-meal="dinner"]');
  await sleep(300);
  await ev(`(() => { document.querySelector('#csText').value = 'a pint of tiger beer and 2 slices kaya toast'; document.querySelector('[data-action="cs-calc"]').click(); })()`);
  await sleep(300);
  const out1 = await text("#csOut");
  check("custom: two items parsed", (await ev(`document.querySelectorAll('#csOut .ci:not(.total)').length`)) === 2, out1);
  check("custom: add button enabled when all matched", await ev(`!document.querySelector('#csAdd').disabled`));
  await shot("3-describe-matched");

  // --- custom description: vague -> asks for estimate, blocks add until given
  await ev(`(() => { document.querySelector('#csText').value = 'some rice dish at a friend\\'s place'; document.querySelector('[data-action="cs-calc"]').click(); })()`);
  await sleep(300);
  const unknown = await ev(`document.querySelectorAll('#csOut .ci.unknown').length`);
  check("custom: unmatched/vague asks user for estimate", unknown >= 1, await text("#csOut"));
  check("custom: add disabled until estimate given", await ev(`document.querySelector('#csAdd').disabled`));
  await ev(`(() => { const i = document.querySelector('#csOut [data-f="kcal"]'); i.value = '650'; i.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(150);
  check("custom: estimate enables add", await ev(`!document.querySelector('#csAdd').disabled`));
  check("custom: estimate fills macros", /650 kcal/.test(await text("#csOut")), await text("#csOut"));
  await shot("4-describe-estimate");
  await ev(`(() => { const f = document.querySelector('#csForm'); f.save.checked = true; f.save.dispatchEvent(new Event('input',{bubbles:true})); f.elements.name.value = 'Friend rice dish'; f.requestSubmit(); })()`);
  await sleep(400);
  check("custom entry logged and flagged as estimate", /estimate/.test(await text("#view-today")));
  await go("#foods");
  await ev(`(() => { const q = document.querySelector('#q'); q.value = 'friend rice'; q.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(200);
  check("custom food saved and searchable", /Friend rice dish/.test(await text("#results")));

  // --- vague one-word input
  await go("#today");
  await click('[data-action="add-describe"][data-meal="tea"]');
  await sleep(200);
  await ev(`(() => { document.querySelector('#csText').value = 'a snack'; document.querySelector('[data-action="cs-calc"]').click(); })()`);
  await sleep(250);
  check("custom: 'a snack' is too vague -> estimate prompt", /a bit vague/.test(await text("#csOut")), await text("#csOut"));
  await ev(`document.querySelector('#sheet').close()`);

  // --- badges + streak across several seeded days
  await ev(`(() => { const k='health-tracker:v1'; const s = JSON.parse(localStorage.getItem(k)); const t = {kcal: 0};
    const p = n => String(n).padStart(2,'0'); const day = a => { const d = new Date(); d.setDate(d.getDate() - a); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); };
    for (let a = 1; a <= 4; a++) s.log[day(a)] = ['breakfast','lunch','tea','dinner','supper'].map(m => ({id: m+a, meal: m, name: 'seed '+m, amountLabel: '', n: {energy_kcal: 450, protein_g: 30, carbohydrate_g: 50, total_fat_g: 12, saturated_fat_g: 3, fibre_g: 7, sugars_g: 8, sodium_mg: 300, cholesterol_mg: 50, alcohol_g: 0}}));
    localStorage.setItem(k, JSON.stringify(s)); location.reload(); })()`);
  await sleep(1200);
  await go("#badges");
  check("badges tab shows a streak", /[1-9]\d*\s*day streak/.test((await text("#view-badges")).replace(/\n/g, " ")), await text("#view-badges"));
  check("3-day streak badge earned", await ev(`[...document.querySelectorAll('#view-badges .badge.earned .bname')].some(e => e.textContent === '3-day streak')`));
  check("full-day badge earned", await ev(`[...document.querySelectorAll('#view-badges .badge.earned .bname')].some(e => e.textContent === 'Full day logged')`));
  await shot("5-badges");
  await go("#today");
  await shot("6-today");

  // --- PWA bits
  const manifestOk = await ev(`fetch('manifest.webmanifest').then(r => r.json()).then(m => m.icons.length >= 3 && m.display === 'standalone')`);
  check("manifest valid", manifestOk);
  const swState = await ev(`navigator.serviceWorker.getRegistration().then(r => r ? 'registered' : 'none')`);
  check("service worker registered", swState === "registered", swState);
  await sleep(800);
  const cached = await ev(`caches.keys().then(async ks => { const c = await caches.open(ks[0]); return (await c.keys()).length; })`);
  check("app shell + data precached", cached >= 15, String(cached));

  for (const e of events) {
    if (e.method === "Runtime.exceptionThrown") errors.push(e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
    if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") errors.push(e.params.args.map(a => a.value ?? a.description).join(" "));
  }
  check("no console errors / exceptions", errors.length === 0, errors.join(" | "));
} catch (e) {
  failed++; console.log("FAIL  test crashed: " + e.message);
} finally {
  console.log(`\n${passed} passed, ${failed} failed. Screenshots: ${OUT}`);
  try { await send("Browser.close"); } catch {}
  chrome.kill(); server.close();
  process.exit(failed ? 1 : 0);
}
