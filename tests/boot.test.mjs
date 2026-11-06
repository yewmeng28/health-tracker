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
const viewIds = ["today", "foods", "weight", "badges", "profile"].map(t => "#view-" + t);
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

test("no unhandled errors during the whole walk-through", () => {
  assert.equal(errors.length, 0, String(errors[0]?.stack || errors[0]));
});
