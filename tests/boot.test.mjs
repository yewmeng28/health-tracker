// Boots js/app.js against a tiny fake DOM, walks every tab and simulates key actions.
// Catches syntax/reference errors at startup and in the main flows (it is not a real browser).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ---------------- fake DOM ----------------
class Opt { constructor(t, v) { this.textContent = t; this.value = v; } }
class El {
  constructor(sel) {
    Object.assign(this, { sel, id: sel.replace(/^#/, ""), value: "", checked: false, hidden: false, innerHTML: "", textContent: "", open: false,
      placeholder: "", title: "", dataset: {}, options: [new Opt("", "")], listeners: {}, style: {}, files: [] });
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  append() {} setAttribute() {} removeAttribute() {} toggleAttribute() {} scrollIntoView() {} focus() {} click() {}
  querySelector() { return null; } querySelectorAll() { return []; } closest() { return null; }
  showModal() { this.open = true; }
  close() { this.open = false; (this.listeners.close || []).forEach(f => f()); }
}
const els = {};
const viewIds = ["today", "foods", "compare", "weight", "badges", "profile"].map(t => "#view-" + t);
const get = sel => (els[sel] ||= new El(sel));
get("#sort").value = "name";             // a real <select> starts on its first option
const docListeners = {};
const winListeners = {};
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
globalThis.Option = Opt;
globalThis.FormData = class { constructor(f) { this.f = f; } [Symbol.iterator]() { return Object.entries(this.f.values)[Symbol.iterator](); } };
globalThis.confirm = () => true;
globalThis.document = {
  querySelector: get,
  querySelectorAll: sel => (sel === ".view" ? viewIds.map(get) : []),
  addEventListener: (t, f) => (docListeners[t] ||= []).push(f),
  createElement: () => new El("a"),
};
let hash = "#today";
globalThis.location = { protocol: "http:", hostname: "localhost", get hash() { return hash; }, set hash(v) { hash = v; (winListeners.hashchange || []).forEach(f => f()); } };
globalThis.window = { scrollTo() {}, addEventListener: (t, f) => (winListeners[t] ||= []).push(f) };
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
const dbText = readFileSync(new URL("../food_nutrition.json", import.meta.url), "utf8");
globalThis.fetch = async () => ({ json: async () => JSON.parse(dbText) });

const errors = [];
process.on("unhandledRejection", e => errors.push(e));

// click / submit / input helpers: emulate the real event target
const click = (action, data = {}) => {
  const target = { closest: sel => (sel === "[data-action]" ? { dataset: { action, ...data } } : null) };
  docListeners.click.forEach(f => f({ target }));
};
const submit = form => docListeners.submit.forEach(f => f({ target: form, preventDefault() {} }));
const go = h => { location.hash = h; };
const html = sel => els[sel].innerHTML;
const tick = ms => new Promise(r => setTimeout(r, ms));

await import("../js/app.js");
await tick(50);   // let the food database "download"

test("boot renders the setup prompt on first run", () => {
  assert.match(html("#view-today"), /Set up your profile/);
  assert.equal(errors.length, 0, String(errors[0]));
});

test("profile form saves, targets appear", () => {
  go("#profile");
  submit({ id: "profileForm", values: { sex: "male", age: "30", heightCm: "175", kg: "82", activity: "moderate", goalKg: "75", rateKgPerWeek: "0.5" } });
  assert.match(html("#view-profile"), /Your daily targets/);
  go("#today");
  assert.match(html("#view-today"), /Breakfast/);
  assert.match(html("#view-today"), /data-action="add-fav"/);
});

test("weight form saves with a time of day; chart and calendar render", () => {
  go("#weight");
  submit({ id: "weightForm", date: { value: "2026-11-01" }, time: { value: "07:30" }, kg: { value: "81.5" } });
  assert.match(html("#view-weight"), /07:30 · Morning/);
  click("mode-weight", { mode: "calendar" });
  assert.match(html("#view-weight"), /calgrid/);
  click("mode-weight", { mode: "chart" });
  assert.match(html("#view-weight"), /wchart/);
});

test("Foods tab opens on the calm landing page, not a long list", () => {
  go("#foods");
  assert.equal(els["#browse"].hidden, false);
  assert.equal(els["#resultsWrap"].hidden, true);
  assert.match(html("#browse"), /Favourites/);
  assert.match(html("#browse"), /Browse/);
  assert.doesNotMatch(html("#browse"), /class="card food"/);
});

test("search shows results; starring a food puts it under Favourites", () => {
  els["#q"].value = "laksa";
  docListeners.input.forEach(f => f({ target: { id: "q", closest: () => null, dataset: {} } }));
  assert.equal(els["#resultsWrap"].hidden, false);
  assert.match(html("#results"), /Laksa/);
  click("toggle-fav", { id: "food-557" });
  els["#q"].value = "";
  docListeners.input.forEach(f => f({ target: { id: "q", closest: () => null, dataset: {} } }));
  assert.equal(els["#browse"].hidden, false);
  assert.match(html("#browse"), /Laksa/);
});

test("browse chip shows a filtered list and 'back' returns to favourites", () => {
  click("browse-cat", { cat: "alcohol" });
  assert.equal(els["#resultsWrap"].hidden, false);
  assert.match(html("#results"), /Absolut vodka/);                 // first page (30) of the alcohol category, sorted by name
  assert.equal(els["#more"].hidden, false);                         // more pages available
  assert.doesNotMatch(html("#results"), /Laksa/);
  assert.match(els["#filtersSummary"].textContent, /1 active/);
  click("clear-filters");
  assert.equal(els["#browse"].hidden, false);
});

test("favourites picker and log sheet open from a mealtime", () => {
  go("#today");
  click("add-fav", { meal: "dinner" });
  assert.equal(els["#sheet"].open, true);
  assert.match(html("#sheet"), /Laksa/);
  const today = new Date(); const p = n => String(n).padStart(2, "0");
  const d = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  const logForm = { id: "logForm", dataset: { food: "food-557" }, amount: { value: "450", selectedOptions: [{ textContent: "serving (450 g)" }] },
    count: { value: "1" }, meal: { value: "dinner" }, date: { value: d } };
  els["#logForm"] = logForm;                                       // what the browser would build from the sheet HTML
  click("fav-pick", { id: "food-557" });
  assert.match(html("#sheet"), /id="logForm"/);
  assert.match(html("#logPreview"), /585 kcal/);                    // live preview computed from the form
  submit(logForm);
  assert.match(html("#view-today"), /Laksa/);
  assert.match(html("#view-today"), /585/);
});

test("edit a logged entry: change portion and move to another mealtime", () => {
  const state = JSON.parse(store["health-tracker:v1"]);
  const [date, entries] = Object.entries(state.log)[0];
  const form = { id: "editForm", elements: { mult: { value: "0.5" }, meal: { value: "lunch" } }, preventDefault() {} };
  els["#editForm"] = form;
  click("edit-entry", { id: entries[0].id });
  assert.match(html("#sheet"), /id="editForm"/);
  assert.match(html("#sheet"), /name="mult"/);
  assert.match(html("#editPreview"), /293 kcal|292 kcal/);           // 585 x 0.5
  submit(form);
  const after = JSON.parse(store["health-tracker:v1"]).log[date][0];
  assert.equal(after.meal, "lunch");
  assert.ok(Math.abs(after.n.energy_kcal - 292.5) < 1, String(after.n.energy_kcal));
});

test("calendar: select a day then 'Show full breakdown'", () => {
  go("#today");
  click("mode-today", { mode: "calendar" });
  assert.match(html("#view-today"), /calgrid/);
  const today = new Date(); const p = n => String(n).padStart(2, "0");
  const d = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  click("cal-select", { date: d });
  assert.match(html("#view-today"), /Show full breakdown/);
  click("cal-prev");
  click("cal-next");
  click("show-day", { date: d });
  assert.match(html("#view-today"), /Breakfast/);
});

test("badges tab renders; custom 'describe it' sheet opens", () => {
  go("#badges");
  assert.match(html("#view-badges"), /First bite/);
  click("describe-open");
  assert.match(html("#sheet"), /Describe what you ate/);
});

test("describe it: matched part + vague part -> asks for an estimate, blocks add until given, saves custom food", () => {
  go("#today");
  click("add-describe", { meal: "tea" });
  document.querySelector("#csText").value = "a pint of tiger beer and a snack";   // the textarea the sheet creates
  click("cs-calc");
  assert.match(html("#csOut"), /Tiger Beer/);
  assert.match(html("#csOut"), /needs your estimate/);
  assert.match(html("#csOut"), /a bit vague/);
  // user types an estimate for the vague item (index 1)
  docListeners.input.forEach(f => f({ target: { id: "", dataset: { ci: "1", f: "kcal" }, value: "300", closest: () => null } }));
  const d = new Date(); const p = n => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const before = Object.values(JSON.parse(store["health-tracker:v1"]).log).flat().length;
  submit({ id: "csForm", meal: { value: "tea" }, date: { value: date }, save: { checked: true }, elements: { name: { value: "Beer and a snack" } }, preventDefault() {} });
  const st = JSON.parse(store["health-tracker:v1"]);
  const entries = Object.values(st.log).flat();
  assert.equal(entries.length, before + 2);
  assert.ok(entries.some(e => e.name === "Tiger Beer" && e.meal === "tea" && !e.estimated));
  assert.ok(entries.some(e => e.estimated && e.n.energy_kcal === 300));
  assert.equal(st.customFoods[0].name, "Beer and a snack");
  assert.ok(Math.abs(st.customFoods[0].nutrition_per_serving.energy_kcal - (300 + 134.7 * 500 / 330)) < 2);
});

// ---------------- feedback round: simple cards, clear button, Done, weight card, prefs, sweetness, comparison ----------------
const DB = JSON.parse(dbText).foods;
const idOf = name => DB.find(f => f.name === name).id;
const stateNow = () => JSON.parse(store["health-tracker:v1"]);
const localDate = () => { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const typeQ = v => { els["#q"].value = v; docListeners.input.forEach(f => f({ target: { id: "q", closest: () => null, dataset: {} } })); };

test("food cards are simple; 'More info' reveals details; search has a working clear button", () => {
  go("#foods");
  typeQ("laksa");
  assert.equal(els["#clearQ"].hidden, false);                         // clear button appears once there is text
  assert.match(html("#results"), /More info/);
  assert.doesNotMatch(html("#results"), /class="nutrients"/);         // nothing but name, serving, kcal and buttons
  assert.doesNotMatch(html("#results"), /class="tags"/);
  click("toggle-info", { id: idOf("Laksa") });
  const opened = document.querySelector(`article[data-id="${idOf("Laksa")}"]`).outerHTML;
  assert.match(opened, /class="nutrients"/);
  assert.match(opened, /Less info/);
  click("toggle-info", { id: idOf("Laksa") });                        // collapse again so later tests start closed
  click("clear-search");
  assert.equal(els["#q"].value, "");
  assert.equal(els["#clearQ"].hidden, true);
  assert.equal(els["#browse"].hidden, false);                         // back to the calm landing page
});

test("Done after 'Adding to <meal>' returns to that meal's day on the Today tab", () => {
  go("#today");
  click("day-prev");                                                   // look at yesterday
  click("add-search", { meal: "tea" });
  assert.equal(location.hash, "#foods");
  assert.match(html("#addbanner"), /Adding to/);
  click("cancel-add");
  assert.equal(location.hash, "#today");
  assert.match(html("#view-today"), /id="meal-tea"/);
  assert.match(html("#view-today"), /Yesterday/);                      // the day we were adding to
  assert.equal(els["#addbanner"].hidden, false);                       // (banner re-evaluated on the next Foods render)
  go("#foods"); assert.equal(els["#addbanner"].hidden, true);
  go("#today"); click("day-today");
});

test("Today shows a weigh-in reminder with the last weight, then today's weight once logged", () => {
  // saving the profile earlier logged a weigh-in today; remove it so we are back to "not weighed yet today"
  assert.match(html("#view-today"), /Weighed today:/);
  for (const w of stateNow().weights.filter(x => x.date === localDate())) click("del-weight", { date: w.date, time: w.time || "" });
  const v = html("#view-today");
  assert.match(v, /Time to weigh yourself/);
  assert.match(v, /Last: 81\.5 kg/);
  assert.match(v, /id="quickWeight"/);
  submit({ id: "quickWeight", kg: { value: "80.8" }, preventDefault() {} });
  const after = html("#view-today");
  assert.match(after, /Weighed today:/);
  assert.match(after, /80\.8 kg/);
  assert.doesNotMatch(after, /Time to weigh yourself/);
  const w = stateNow().weights.at(-1);
  assert.equal(w.kg, 80.8); assert.ok(/^\d\d:\d\d$/.test(w.time));
});

test("Profile: choose which nutrients to show; Today and food details follow", () => {
  go("#profile");
  assert.match(html("#view-profile"), /Show all nutrients/);
  const change = t => docListeners.change.forEach(f => f({ target: { classList: { contains: () => false }, closest: () => null, ...t } }));
  change({ dataset: { pref: "mode" }, value: "custom" });
  let st = stateNow().prefs;
  assert.equal(st.nutrientMode, "custom");
  assert.ok(st.nutrients.length >= 9);                                 // starts with everything ticked
  change({ dataset: { pref: "nutrient" }, value: "cholesterol", checked: false });
  change({ dataset: { pref: "nutrient" }, value: "transFat", checked: false });
  assert.ok(!stateNow().prefs.nutrients.includes("cholesterol"));
  assert.match(html("#view-profile"), /name="nutrientMode"[^>]*value="custom" checked/);
  go("#today");
  assert.doesNotMatch(html("#view-today"), /<span>Cholesterol<\/span>/);
  assert.match(html("#view-today"), /<span>Sodium<\/span>/);
  assert.match(html("#view-today"), /Some nutrients are hidden/);
  go("#foods"); typeQ("laksa");
  click("toggle-info", { id: idOf("Laksa") });
  const card = document.querySelector(`article[data-id="${idOf("Laksa")}"]`).outerHTML;
  assert.doesNotMatch(card, /<span>Cholesterol<\/span>/);
  assert.match(card, /<span>Protein<\/span>/);
  change({ dataset: { pref: "mode" }, value: "all" });
  go("#today");
  assert.match(html("#view-today"), /<span>Cholesterol<\/span>/);
  typeQ(""); go("#today");
});

test("drinks: less sweet / no sugar lowers sugar and calories, and can be changed after logging", () => {
  const kopi = idOf("Kopi (with condensed milk)");
  const date = localDate();
  const logForm = sweet => ({ id: "logForm", dataset: { food: kopi }, amount: { value: "250", selectedOptions: [{ textContent: "serving (250 g)" }] },
    count: { value: "1" }, meal: { value: "breakfast" }, date: { value: date },
    sweet: { value: sweet, selectedOptions: [{ textContent: "x" }] } });
  els["#logForm"] = logForm("1");
  click("log-food", { id: kopi });
  assert.match(html("#sheet"), /name="sweet"/);                        // sweetness choice appears for this drink
  assert.match(html("#sheet"), /siew dai/);
  submit(logForm("1"));
  submit(logForm("0.5"));
  const entries = Object.values(stateNow().log).flat().filter(e => e.foodId === kopi);
  const reg = entries.find(e => e.sweetFactor === 1), less = entries.find(e => e.sweetFactor === 0.5);
  assert.ok(reg && less);
  assert.ok(Math.abs((reg.n.energy_kcal - less.n.energy_kcal) - 24) < 0.6, `${reg.n.energy_kcal} vs ${less.n.energy_kcal}`);
  assert.ok(less.n.sugars_g < reg.n.sugars_g);
  assert.match(less.amountLabel, /less sweet/);
  // edit it to "no added sugar"
  const form = { id: "editForm", elements: { mult: { value: "1" }, meal: { value: "breakfast" }, sweet: { value: "0" } }, preventDefault() {} };
  els["#editForm"] = form;
  go("#today");
  click("edit-entry", { id: less.id });
  assert.match(html("#sheet"), /name="sweet"/);
  submit(form);
  const edited = Object.values(stateNow().log).flat().find(e => e.id === less.id);
  assert.equal(edited.sweetFactor, 0);
  assert.ok(edited.n.sugars_g < less.n.sugars_g);
});

test("Compare meals: build two options, see the verdict, go with the better one", () => {
  go("#compare");
  assert.match(html("#view-compare"), /Option A/);
  assert.match(html("#view-compare"), /Option B/);
  assert.match(html("#view-compare"), /at least two options/);
  assert.match(location.hash, /compare/);
  const [a, b] = stateNow().compare.options;
  const date = localDate();
  const addVia = (optId, name, sweet) => {
    click("cmp-add", { opt: optId });
    assert.match(html("#sheet"), /id="pickQ"/);
    document.querySelector("#pickQ").value = name.toLowerCase();
    docListeners.input.forEach(f => f({ target: { id: "pickQ", closest: () => null, dataset: {} } }));
    assert.match(html("#pickList"), new RegExp(name.split(" ")[0]));
    const id = idOf(name);
    els["#logForm"] = { id: "logForm", dataset: { food: id, compare: optId }, amount: { value: String(DB.find(f => f.id === id).serving.amount), selectedOptions: [{ textContent: "serving" }] },
      count: { value: "1" }, ...(sweet ? { sweet: { value: sweet, selectedOptions: [{ textContent: "x" }] } } : {}) };
    click("pick-food", { id });
    assert.match(html("#sheet"), /id="logForm"/);
    assert.doesNotMatch(html("#sheet"), /name="meal"/);                // no mealtime/date when building an option
    submit(els["#logForm"]);
  };
  addVia(a.id, "Mala dry (mala xiang guo)");                           // very salty
  addVia(b.id, "Hainanese chicken rice, steamed");
  addVia(b.id, "Teh O (tea with sugar)", "0");
  const cmp = stateNow().compare;
  assert.equal(cmp.options[0].items.length, 1);
  assert.equal(cmp.options[1].items.length, 2);
  assert.ok(cmp.options[1].items.every(i => i.id));
  const v = html("#view-compare");
  assert.match(v, /Best fit: Option B/);                               // mala dry carries ~2400 mg sodium
  assert.match(v, /Fits your day\?/);
  assert.match(v, /less sodium/);
  assert.match(v, /data-action="cmp-choose"/);
  // rename an option, then go with the winner
  docListeners.change.forEach(f => f({ target: { dataset: { cmpName: b.id }, value: "Chicken rice + tea", classList: { contains: () => false }, closest: () => null } }));
  assert.match(html("#view-compare"), /Chicken rice \+ tea/);
  const before = Object.values(stateNow().log).flat().length;
  click("cmp-choose", { opt: b.id });
  assert.match(html("#sheet"), /Go with Chicken rice \+ tea/);
  submit({ id: "cmpLogForm", dataset: { opt: b.id }, meal: { value: "dinner" }, date: { value: date }, preventDefault() {} });
  const logged = Object.values(stateNow().log).flat();
  assert.equal(logged.length, before + 2);
  assert.ok(logged.filter(e => e.meal === "dinner").some(e => /chicken rice/i.test(e.name)));
  assert.equal(location.hash, "#today");
});

test("Compare meals: remove/add options, include-today toggle, copy from log", () => {
  go("#compare");
  click("cmp-new");
  assert.equal(stateNow().compare.options.length, 3);
  assert.match(html("#view-compare"), /Option B/);                    // the free name is reused ("Option B" was renamed earlier)
  const c = stateNow().compare.options[2];
  click("cmp-remove", { opt: c.id });
  assert.equal(stateNow().compare.options.length, 2);
  docListeners.change.forEach(f => f({ target: { dataset: { cmp: "include-today" }, checked: false, classList: { contains: () => false }, closest: () => null } }));
  assert.equal(stateNow().compare.includeToday, false);
  // copy a logged meal into option A
  const a = stateNow().compare.options[0];
  click("cmp-copy", { opt: a.id });
  assert.match(html("#sheet"), /id="cmpCopyForm"/);
  const date = localDate();
  const before = stateNow().compare.options[0].items.length;
  submit({ id: "cmpCopyForm", dataset: { opt: a.id }, date: { value: date }, meal: { value: "dinner" }, preventDefault() {} });
  assert.ok(stateNow().compare.options[0].items.length > before);
  click("cmp-reset");
  assert.equal(stateNow().compare.options.length, 2);
  assert.ok(stateNow().compare.options.every(o => o.items.length === 0));
});

test("no pinch-zoom: viewport locks scale and iOS gesturestart is blocked", () => {
  const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(indexHtml, /maximum-scale=1/);
  assert.match(indexHtml, /user-scalable=no/);
  let prevented = false;
  (docListeners.gesturestart || []).forEach(f => f({ preventDefault() { prevented = true; } }));
  assert.equal(prevented, true);
});

test("no unhandled errors during the whole walk-through", () => {
  assert.equal(errors.length, 0, String(errors[0]?.stack || errors[0]));
});
