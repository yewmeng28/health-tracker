import { BADGES, evaluateBadges } from "./badges.js";
import { scaleNutrition } from "./calc.js";
import { favoriteFoods, isFavorite, recentFoods, topCategories } from "./favorites.js";
import { shiftMonth } from "./calendar.js";
import { MEALS, addDays, mealByTime, monthOf, prettyDate, timeStr, todayStr } from "./dates.js";
import {
  PRESETS, SIZE_PRESETS, buildIndex, chooseFood, estimateManual, nutritionOfFood, parseDescription,
  setMultiplier, sumNutritionObjects,
} from "./estimator.js";
import {
  addLogEntry, deleteWeight, exportJson, getState, importJson, load, removeLogEntry, resetAll,
  setWeight, subscribe, toggleFavorite, uid, update, updateLogEntry,
} from "./store.js";
import { $, $$, esc, fmt, toast } from "./ui.js";
import { badgesView, profileView, todayView, weightView } from "./views.js";

// ------------------------------------------------------------------ state
const TITLES = { today: "Today", foods: "Foods & drinks", weight: "Weight", badges: "Streaks & badges", profile: "Profile" };
let foodsDb = [], dbError = false;
let tab = "today", viewDate = todayStr(), range = "90", addCtx = null;
let shown = 30;
const PAGE = 30;
let showAll = false;        // "Browse all foods" without a search or filter
let favCtx = null;          // {date, meal} while the favourites picker is open
const servingChoice = {};   // food id -> chosen serving amount (ml) for drinks
let cs = null;              // custom-food sheet state
let editCtx = null;         // {date, id} of the logged entry being edited
const ui = { todayMode: "day", weightMode: "chart", calMonth: monthOf(todayStr()), calSelected: null };
let idx = null, idxKey = "";
let awarding = false;

const allFoods = () => [...getState().customFoods, ...foodsDb];
function getIndex() {
  const key = getState().customFoods.length + ":" + foodsDb.length;
  if (key !== idxKey) { idx = buildIndex(allFoods()); idxKey = key; }
  return idx;
}

// ------------------------------------------------------------------ render
function render() {
  const s = getState(), today = todayStr();
  const info = evaluateBadges(s, today);
  if (info.fresh.length && !awarding) setTimeout(() => awardBadges(info.fresh), 0);

  $("#title").textContent = TITLES[tab];
  $("#streakchip").textContent = `🔥 ${info.stats.streak}`;
  $("#streakchip").title = `${info.stats.streak}-day streak`;
  $$(".view").forEach(v => { v.hidden = v.id !== "view-" + tab; });
  $$(".tabbar a").forEach(a => { a.classList.toggle("on", a.dataset.tab === tab); a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });

  if (tab === "today") $("#view-today").innerHTML = todayView(s, viewDate, today, info, ui);
  else if (tab === "weight") $("#view-weight").innerHTML = weightView(s, today, range, ui);
  else if (tab === "badges") $("#view-badges").innerHTML = badgesView(info);
  else if (tab === "profile") $("#view-profile").innerHTML = profileView(s, today);
  else if (tab === "foods") renderFoods();
}

function awardBadges(ids) {
  awarding = true;
  update(s => { ids.forEach(id => { s.badges[id] = todayStr(); }); });
  awarding = false;
  toast("🏆 Badge earned: " + ids.map(id => BADGES.find(b => b.id === id).name).join(", "));
}

function route() {
  const t = location.hash.replace("#", "");
  tab = TITLES[t] ? t : "today";
  render();
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ foods tab
function flagsFor(n) {
  return {
    sodium_level: "n/a",
    sodium_serving_level: n.sodium_mg <= 300 ? "low" : n.sodium_mg > 600 ? "high" : "medium",
    sodium_pct_daily: Math.round((n.sodium_mg / 2000) * 100),
    sugar_level: n.sugars_g <= 5 ? "low" : n.sugars_g > 15 ? "high" : "medium",
    high_cholesterol: n.cholesterol_mg >= 100,
    high_sat_fat: n.saturated_fat_g >= 5,
  };
}

function nutritionFor(f) {
  const amt = servingChoice[f.id] ?? f.serving.amount;
  if (amt === f.serving.amount || !f.nutrition_per_100g) return f.nutrition_per_serving;
  const out = {};
  for (const [k, v] of Object.entries(f.nutrition_per_100g)) out[k] = v == null ? null : (v * amt) / 100;
  return out;
}

function foodCard(f) {
  const n = nutritionFor(f), fl = f.flags, isDrink = f.category === "alcohol";
  const amt = servingChoice[f.id] ?? f.serving.amount;
  const item = (label, val, unit) => `<div><span>${label}</span>${fmt(val, unit === "mg" ? 0 : 1)} ${unit}</div>`;
  const std = (n.alcohol_g || 0) / 10;
  const tags = isDrink
    ? [`<span class="tag ${std >= 2 ? "high" : std >= 1 ? "medium" : "low"}" title="1 standard drink = 10 g alcohol">${std.toFixed(1)} standard drinks</span>`,
       `<span class="tag est">${f.abv_percent}% ABV</span>`, `<span class="tag ${fl.sugar_level}">${fl.sugar_level} sugar</span>`]
    : [`<span class="tag ${fl.sodium_serving_level}">${fl.sodium_serving_level} sodium · ${fl.sodium_pct_daily}% of daily limit</span>`,
       `<span class="tag ${fl.sugar_level}">${fl.sugar_level} sugar</span>`];
  const dq = f.data_quality;
  const safeUrl = /^https?:\/\//i.test(dq.source_url || "") ? dq.source_url : null;
  tags.push(dq.status === "estimated" ? '<span class="tag est">estimate</span>'
    : dq.status === "custom" ? '<span class="tag src">custom</span>'
    : safeUrl ? `<a class="tag src" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(dq.source || "")}">sourced (${esc(dq.confidence)}) ↗</a>`
    : `<span class="tag src">sourced (${esc(dq.confidence)})</span>`);
  const srcLine = dq.status === "estimated" || dq.status === "custom" ? "" :
    `<div class="srcline">Source: ${safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${esc(dq.source || safeUrl)}</a>` : esc(dq.source || "n/a")}${dq.source_serving_note ? ` — ${esc(dq.source_serving_note)}` : ""}</div>`;
  if (fl.high_cholesterol) tags.push('<span class="tag high">high cholesterol</span>');
  if (fl.high_sat_fat) tags.push('<span class="tag high">high sat fat</span>');
  const servingHtml = f.serving_options?.length > 1
    ? `<select class="serving-select" aria-label="Serving size">${f.serving_options.map(o => `<option value="${o.amount}"${o.amount === amt ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`
    : `${amt} ${esc(f.serving.unit)}${f.serving.unit === "serving" ? "" : " serving"}`;
  return `<article class="card food" data-id="${esc(f.id)}">
    <div class="head"><div><div class="name">${esc(f.name)}</div>
      <div class="sub">${esc(f.cuisine)} · ${esc(f.category.replace(/_/g, " "))} · ${servingHtml}</div></div>
      <div class="kcal">${fmt(n.energy_kcal)} kcal</div></div>
    <div class="nutrients">${isDrink ? item("Alcohol", n.alcohol_g, "g") : ""}${item("Protein", n.protein_g, "g")}${item("Carbs", n.carbohydrate_g, "g")}${item("Fat", n.total_fat_g, "g")}
      ${item("Sat fat", n.saturated_fat_g, "g")}${item("Trans fat", n.trans_fat_g, "g")}${item("Fibre", n.fibre_g, "g")}
      ${item("Sugars", n.sugars_g, "g")}${item("Sodium", n.sodium_mg, "mg")}${item("Cholesterol", n.cholesterol_mg, "mg")}</div>
    <div class="tags">${tags.join("")}</div>${srcLine}
    <div class="cardbtns"><button class="btn primary small" data-action="log-food" data-id="${esc(f.id)}">＋ Log</button>
      ${starButton(f.id, true)}
      ${dq.status === "custom" ? `<button class="btn small danger" data-action="del-custom" data-id="${esc(f.id)}">Delete</button>` : ""}</div></article>`;
}

function refreshFilterOptions() {
  const fill = (el, values) => {
    const cur = el.value, first = el.options[0];
    el.innerHTML = ""; el.append(first);
    [...new Set(values)].sort().forEach(v => el.append(new Option(v.replace(/_/g, " "), v)));
    el.value = cur;
  };
  const foods = allFoods();
  fill($("#cuisine"), foods.map(f => f.cuisine));
  fill($("#category"), foods.map(f => f.category));
}

function starButton(id, labelled = false) {
  const on = isFavorite(getState(), id);
  return `<button class="${labelled ? "btn small star" : "icon star"}${on ? " on" : ""}" data-action="toggle-fav" data-id="${esc(id)}" aria-pressed="${on}"
    aria-label="${on ? "Remove from favourites" : "Add to favourites"}">${on ? "★" : "☆"}${labelled ? (on ? " Favourite" : " Favourite") : ""}</button>`;
}

/** Compact row used for favourites and recently logged foods. */
function foodRow(f) {
  const n = f.nutrition_per_serving;
  return `<div class="favrow"><div class="favinfo"><div class="name">${esc(f.name)}</div>
      <div class="sub">${esc(f.serving.amount)} ${esc(f.serving.unit)} · ${fmt(n.energy_kcal)} kcal</div></div>
    ${starButton(f.id)}<button class="btn primary small" data-action="log-food" data-id="${esc(f.id)}">＋ Log</button></div>`;
}

function activeFilters() {
  const f = [];
  if ($("#cuisine").value) f.push("type");
  if ($("#category").value) f.push("category");
  if ($("#sodium").value) f.push("sodium");
  if ($("#sugar").value) f.push("sugar");
  if ($("#maxKcal").value) f.push("calories");
  if ($("#maxSodium").value) f.push("max sodium");
  if ($("#noChol").checked) f.push("cholesterol");
  if ($("#noSat").checked) f.push("sat fat");
  if ($("#sort").value !== "name") f.push("sort");
  return f;
}

function resetFilters() {
  ["q", "cuisine", "category", "sodium", "sugar", "maxKcal", "maxSodium"].forEach(id => { $("#" + id).value = ""; });
  $("#noChol").checked = $("#noSat").checked = false; $("#sort").value = "name";
  shown = PAGE; showAll = false;
  renderFoods();
}

/** Calm landing view: favourites, recently logged, and browse-by-type. No long list until the user asks for one. */
function renderBrowse() {
  const s = getState(), foods = allFoods();
  const favs = favoriteFoods(s, foods);
  const recents = recentFoods(s, foods, { limit: 6, exclude: favs.map(f => f.id) });
  $("#browse").innerHTML = `
    <section class="card"><h2>★ Favourites</h2>
      ${favs.length ? favs.map(foodRow).join("") : '<p class="muted">Nothing here yet. Tap ☆ on any food to pin it for one-tap logging.</p>'}</section>
    ${recents.length ? `<section class="card"><h2>🕘 Recently logged</h2>${recents.map(foodRow).join("")}</section>` : ""}
    <section class="card"><h2>Browse</h2>
      <div class="chips">${topCategories(foods).map(([c, n]) => `<button class="chip" data-action="browse-cat" data-cat="${esc(c)}">${esc(c.replace(/_/g, " "))} <small>${n}</small></button>`).join("")}
        <button class="chip" data-action="browse-all">All ${foods.length}</button></div>
      <p class="fine">Or search above. ${foods.length.toLocaleString()} foods and drinks in the database.</p></section>`;
}

function renderFoods() {
  const b = $("#addbanner");
  if (addCtx) {
    const m = MEALS.find(x => x.id === addCtx.meal);
    b.hidden = false;
    b.innerHTML = `Adding to <b>${m.icon} ${m.label}</b> · ${esc(prettyDate(addCtx.date))}
      <button class="btn small" data-action="cancel-add">Done</button>`;
  } else b.hidden = true;
  if (dbError && !foodsDb.length) {
    $("#browse").hidden = true; $("#resultsWrap").hidden = false; $("#more").hidden = true;
    $("#results").innerHTML = '<div class="empty">Could not load food_nutrition.json. Serve this folder over HTTP: <code>python3 -m http.server 8000</code></div>';
    return;
  }
  refreshFilterOptions();
  const terms = $("#q").value.toLowerCase().split(/\s+/).filter(Boolean);
  const active = activeFilters();
  $("#filtersSummary").textContent = "Filters & sorting" + (active.length ? ` (${active.length} active)` : "");

  const browsing = !terms.length && !active.length && !showAll;
  $("#browse").hidden = !browsing;
  $("#resultsWrap").hidden = browsing;
  if (browsing) { renderBrowse(); return; }

  const cu = $("#cuisine").value, ca = $("#category").value, so = $("#sodium").value, su = $("#sugar").value, sort = $("#sort").value;
  const maxK = parseFloat($("#maxKcal").value), maxS = parseFloat($("#maxSodium").value);
  const noChol = $("#noChol").checked, noSat = $("#noSat").checked;
  const foods = allFoods();
  const list = foods.filter(f => {
    const n = f.nutrition_per_serving, fl = f.flags;
    return (!cu || f.cuisine === cu) && (!ca || f.category === ca) && (!so || fl.sodium_serving_level === so) &&
      (!su || fl.sugar_level === su) && (isNaN(maxK) || n.energy_kcal <= maxK) && (isNaN(maxS) || n.sodium_mg <= maxS) &&
      !(noChol && fl.high_cholesterol) && !(noSat && fl.high_sat_fat) && terms.every(t => f.name.toLowerCase().includes(t));
  });
  list.sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (b.nutrition_per_serving[sort] || 0) - (a.nutrition_per_serving[sort] || 0));
  const visible = list.slice(0, shown);
  $("#count").innerHTML = `${list.length} of ${foods.length} items` + (list.length > visible.length ? ` (showing ${visible.length})` : "") +
    ` · <button class="link" data-action="clear-filters">Back to favourites</button>`;
  $("#results").innerHTML = list.length ? visible.map(foodCard).join("") : '<div class="empty">No foods match. Try “Describe a food” to add your own.</div>';
  $("#more").hidden = list.length <= visible.length;
  $("#more").textContent = `Show more (${list.length - visible.length} remaining)`;
}

// ------------------------------------------------------------------ sheets
const sheet = () => $("#sheet");
function openSheet(html) { sheet().innerHTML = `<div class="sheetbody">${html}</div>`; if (!sheet().open) sheet().showModal(); }
function closeSheet() { if (sheet().open) sheet().close(); cs = null; editCtx = null; }
const mealOptions = sel => MEALS.map(m => `<option value="${m.id}"${m.id === sel ? " selected" : ""}>${m.icon} ${m.label}</option>`).join("");

function openLogSheet(food, ctx = addCtx || { date: viewDate, meal: mealByTime() }) {
  const opts = food.serving_options?.length ? food.serving_options
    : [{ label: food.serving.unit === "serving" ? "serving" : `serving (${food.serving.amount} ${food.serving.unit})`, amount: food.serving.amount }];
  const def = servingChoice[food.id] ?? opts[0].amount;
  openSheet(`<h2>${esc(food.name)}</h2>
    <form id="logForm" data-food="${esc(food.id)}" class="form">
      <label>Serving<select name="amount">${opts.map(o => `<option value="${o.amount}"${o.amount === def ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>
      <label>How many?<input type="number" name="count" min="0.25" step="0.25" value="1" inputmode="decimal" required></label>
      <label>Mealtime<select name="meal">${mealOptions(ctx.meal)}</select></label>
      <label>Date<input type="date" name="date" value="${ctx.date}" max="${todayStr()}" required></label>
      <p class="preview" id="logPreview"></p>
      <div class="row"><button class="btn" type="button" data-action="close-sheet">Cancel</button><button class="btn primary" type="submit">Add to log</button></div></form>`);
  updateLogPreview();
}

function logSelection(form) {
  const food = allFoods().find(f => f.id === form.dataset.food);
  const amount = Number(form.amount.value), count = Number(form.count.value) || 1;
  const mult = (amount * count) / food.serving.amount;
  const label = form.amount.selectedOptions[0].textContent.replace(/^1 (?=\D)/, "");   // "1 egg (50 g)" -> "egg (50 g)"
  return { food, mult, count, label, amount, n: nutritionOfFood(food, mult) };
}

/** Everything needed to re-scale a logged food later (edit portion) is stored on the entry. */
function foodEntryFields(food, { mult, count, label, amount }) {
  return {
    foodId: food.id, base: nutritionOfFood(food, 1), mult, count, optionAmount: amount,
    serving: { amount: food.serving.amount, unit: food.serving.unit },
    options: food.serving_options?.length > 1 ? food.serving_options : null,
    amountLabel: `${count} × ${label}`,
  };
}

function updateLogPreview() {
  const form = $("#logForm"); if (!form) return;
  const { n } = logSelection(form);
  const std = (n.alcohol_g || 0) / 10;
  $("#logPreview").innerHTML = `<b>${fmt(n.energy_kcal)} kcal</b> · P ${fmt(n.protein_g, 1)} g · C ${fmt(n.carbohydrate_g, 1)} g · F ${fmt(n.total_fat_g, 1)} g · Na ${fmt(n.sodium_mg)} mg${std ? ` · ${std.toFixed(1)} std drinks` : ""}`;
}

// ---- custom "describe it" sheet
function openCustomSheet(ctx = {}) {
  cs = { ctx: { date: ctx.date || viewDate, meal: ctx.meal || mealByTime() }, items: null, vague: false };
  openSheet(`<h2>Describe what you ate</h2>
    <p class="muted">e.g. <i>“2 slices kaya toast and a soft boiled egg”</i>, <i>“a pint of Tiger and a bowl of laksa”</i>. I'll match it against the database.
    If something is too vague or not in the database, I'll ask you for a rough estimate.</p>
    <textarea id="csText" rows="3" placeholder="What did you eat or drink?"></textarea>
    <div class="row"><button class="btn primary" data-action="cs-calc">Calculate</button><button class="btn" data-action="close-sheet">Cancel</button></div>
    <div id="csOut"></div>`);
  setTimeout(() => $("#csText")?.focus(), 50);
}

const manualDefaults = () => ({ presetId: "mixed", kcal: "", grams: "", protein: "", carbs: "", fat: "", sugars: "", sodium: "" });

function recalcManual(item) {
  const m = item.manual, num = v => (v === "" || v == null ? undefined : Number(v));
  item.manualN = estimateManual({ presetId: m.presetId, kcal: num(m.kcal), grams: num(m.grams), protein: num(m.protein),
    carbs: num(m.carbs), fat: num(m.fat), sugars: num(m.sugars), sodium: num(m.sodium) });
}

const itemN = it => (it.confidence === "unknown" ? it.manualN : it.nutrition);

function csItemHtml(it, i) {
  if (it.confidence === "unknown") {
    const m = it.manual;
    const why = it.vague ? "That's a bit vague." : "I couldn't find this in the database.";
    return `<div class="ci unknown"><div class="cit">“${esc(it.text)}” <span class="tag high">needs your estimate</span></div>
      <p class="fine">${why} Roughly how much was it? Enter calories, <i>or</i> a weight plus the type of food.</p>
      <div class="chips">${SIZE_PRESETS.map(p => `<button type="button" class="chip" data-action="cs-size" data-i="${i}" data-kcal="${p.kcal}">${esc(p.label)}</button>`).join("")}</div>
      <div class="mgrid">
        <label>Calories (kcal)<input type="number" min="0" inputmode="decimal" data-ci="${i}" data-f="kcal" value="${esc(m.kcal)}"></label>
        <label>or weight (g / ml)<input type="number" min="0" inputmode="decimal" data-ci="${i}" data-f="grams" value="${esc(m.grams)}"></label>
        <label>Type of food<select data-ci="${i}" data-f="presetId">${PRESETS.map(p => `<option value="${p.id}"${p.id === m.presetId ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select></label></div>
      <details><summary>Know more? Add details (optional)</summary><div class="mgrid">
        ${[["protein", "Protein (g)"], ["carbs", "Carbs (g)"], ["fat", "Fat (g)"], ["sugars", "Sugars (g)"], ["sodium", "Sodium (mg)"]]
          .map(([f, l]) => `<label>${l}<input type="number" min="0" inputmode="decimal" data-ci="${i}" data-f="${f}" value="${esc(m[f])}"></label>`).join("")}</div></details>
      <div class="fine est" data-est="${i}"></div>
      ${it.candidates.length ? `<button type="button" class="link" data-action="cs-pick" data-i="${i}">Actually, it's one of the database foods</button>` : ""}</div>`;
  }
  const cands = [...new Map(it.candidates.map(c => [c.food.id, c.food])).values()];
  const n = it.nutrition;
  return `<div class="ci"><div class="cit">“${esc(it.text)}” ${it.confidence === "check" ? '<span class="tag medium">please confirm</span>' : '<span class="tag low">matched</span>'}</div>
    <label>Matched food<select data-ci="${i}" data-f="food">${cands.map(f => `<option value="${esc(f.id)}"${f.id === it.food.id ? " selected" : ""}>${esc(f.name)}</option>`).join("")}
      <option value="__manual">None of these — I'll estimate</option></select></label>
    <label>Amount (× serving)<input type="number" min="0.1" step="0.25" inputmode="decimal" data-ci="${i}" data-f="mult" value="${+it.mult.toFixed(2)}"></label>
    <div class="fine">${esc(it.label)} → <b>${fmt(n.energy_kcal)} kcal</b>, ${fmt(n.protein_g, 1)} g protein, ${fmt(n.sodium_mg)} mg sodium${n.alcohol_g ? `, ${(n.alcohol_g / 10).toFixed(1)} std drinks` : ""}</div></div>`;
}

function renderCsResults() {
  const out = $("#csOut");
  if (!cs?.items) { out.innerHTML = ""; return; }
  if (!cs.items.length) { out.innerHTML = '<p class="muted">Type a description first.</p>'; return; }
  out.innerHTML = `${cs.items.map(csItemHtml).join("")}
    <div class="ci total"><div class="cit">Total</div><div id="csTotal" class="preview"></div></div>
    <form id="csForm" class="form">
      <label>Mealtime<select name="meal">${mealOptions(cs.ctx.meal)}</select></label>
      <label>Date<input type="date" name="date" value="${cs.ctx.date}" max="${todayStr()}" required></label>
      <label class="check"><input type="checkbox" name="save" id="csSave"> Save as a custom food for next time</label>
      <label id="csNameWrap" hidden>Name<input type="text" name="name" maxlength="60" value="${esc($("#csText").value.trim().slice(0, 60))}"></label>
      <div class="row"><button class="btn primary" type="submit" id="csAdd">Add to log</button></div></form>`;
  cs.items.forEach((it, i) => { if (it.confidence === "unknown") updateEst(i); });
  updateCsTotals();
}

function updateEst(i) {
  const it = cs.items[i];
  recalcManual(it);
  const el = $(`[data-est="${i}"]`);
  if (el) el.innerHTML = it.manualN ? `≈ <b>${fmt(it.manualN.energy_kcal)} kcal</b>, ${fmt(it.manualN.protein_g, 1)} g protein, ${fmt(it.manualN.carbohydrate_g, 1)} g carbs, ${fmt(it.manualN.total_fat_g, 1)} g fat`
    : "Enter calories or a weight to get an estimate.";
}

function updateCsTotals() {
  if (!cs?.items) return;
  const ns = cs.items.map(itemN);
  const ready = ns.length > 0 && ns.every(Boolean);
  const t = sumNutritionObjects(ns.filter(Boolean));
  const el = $("#csTotal");
  if (el) el.innerHTML = `<b>${fmt(t.energy_kcal)} kcal</b> · P ${fmt(t.protein_g, 1)} g · C ${fmt(t.carbohydrate_g, 1)} g · F ${fmt(t.total_fat_g, 1)} g · Na ${fmt(t.sodium_mg)} mg${ready ? "" : " <span class='tag high'>incomplete</span>"}`;
  const btn = $("#csAdd"); if (btn) btn.disabled = !ready;
}

function csCalculate() {
  const text = $("#csText").value;
  const res = parseDescription(text, getIndex());
  cs.items = res.items.map(it => ({ ...it, manual: manualDefaults(), manualN: null }));
  renderCsResults();
}

function csSubmit(form) {
  const meal = form.meal.value, date = form.date.value;
  const items = cs.items;
  for (const it of items) {
    const n = itemN(it);
    const known = it.food && it.confidence !== "unknown";
    addLogEntry(date, {
      meal, source: known ? "database" : "estimate",
      name: known ? it.food.name : it.text,
      amountLabel: known ? it.label : "your estimate",
      estimated: !known, foodId: known ? it.food.id : undefined, n,
      base: known ? nutritionOfFood(it.food, 1) : n, mult: known ? it.mult : 1, count: known ? +it.mult.toFixed(2) : 1,
      optionAmount: known ? it.food.serving.amount : 1,
      serving: known ? { amount: it.food.serving.amount, unit: it.food.serving.unit } : { amount: 1, unit: "serving" }, options: null,
    });
  }
  if (form.save.checked) {
    const total = sumNutritionObjects(items.map(itemN));
    const name = form.elements.name.value.trim() || $("#csText").value.trim().slice(0, 60) || "My food";
    update(s => s.customFoods.unshift({
      id: "custom-" + uid(), name, cuisine: "Custom", category: "custom",
      serving: { amount: 1, unit: "serving", basis: "your saved portion" },
      nutrition_per_serving: total, nutrition_per_100g: null, flags: flagsFor(total),
      data_quality: { status: "custom", confidence: "user", notes: "Calculated from your description." },
    }));
  }
  closeSheet();
  viewDate = date;
  location.hash = "#today";
  render();
  toast(`Added to ${MEALS.find(m => m.id === meal).label}`);
}

// ---- favourites picker (from a meal on the Today tab)
function openFavSheet(ctx) {
  favCtx = ctx;
  const s = getState(), foods = allFoods();
  const favs = favoriteFoods(s, foods);
  const recents = recentFoods(s, foods, { limit: 8, exclude: favs.map(f => f.id) });
  const m = MEALS.find(x => x.id === ctx.meal);
  const pick = f => `<button class="favpick" data-action="fav-pick" data-id="${esc(f.id)}"><span class="name">${esc(f.name)}</span>
    <span class="sub">${fmt(f.nutrition_per_serving.energy_kcal)} kcal · ${esc(f.serving.amount)} ${esc(f.serving.unit)}</span></button>`;
  openSheet(`<h2>${m.icon} Add to ${m.label}</h2>
    <h3>★ Favourites</h3>
    ${favs.length ? `<div class="picklist">${favs.map(pick).join("")}</div>` : '<p class="muted">No favourites yet. Tap ☆ on a food in the Foods tab to pin it here.</p>'}
    ${recents.length ? `<h3>🕘 Recently logged</h3><div class="picklist">${recents.map(pick).join("")}</div>` : ""}
    <div class="row"><button class="btn" data-action="close-sheet">Close</button>
      <button class="btn" data-action="add-search" data-meal="${ctx.meal}">Search all foods</button></div>`);
}

// ---- edit a logged entry: change portion and/or move to another mealtime
function openEditSheet(date, id) {
  const e = (getState().log[date] || []).find(x => x.id === id);
  if (!e) return;
  editCtx = { date, id };
  const hasOpts = e.options?.length > 1 && e.serving?.amount;
  const mult = e.mult ?? 1;
  const servingNote = e.serving && e.serving.unit !== "serving" ? ` <span class="muted">(1 serving = ${esc(e.serving.amount)} ${esc(e.serving.unit)})</span>` : "";
  const portion = hasOpts
    ? `<label>Serving<select name="amount">${e.options.map(o => `<option value="${o.amount}"${o.amount === e.optionAmount ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>
       <label>How many?<input type="number" name="count" min="0.25" step="0.25" inputmode="decimal" value="${e.count ?? 1}" required></label>`
    : `<label>Portion (× serving)${servingNote}<input type="number" name="mult" min="0.1" step="0.25" inputmode="decimal" value="${+Number(mult).toFixed(2)}" required></label>`;
  openSheet(`<h2>${esc(e.name)}</h2>
    <form id="editForm" class="form">
      ${portion}
      <label>Mealtime<select name="meal">${mealOptions(e.meal)}</select></label>
      <p class="preview" id="editPreview"></p>
      <div class="row"><button class="btn" type="button" data-action="close-sheet">Cancel</button><button class="btn primary" type="submit">Save changes</button></div></form>`);
  updateEditPreview();
}

function editSelection(form) {
  const e = (getState().log[editCtx.date] || []).find(x => x.id === editCtx.id);
  const base = e.base || e.n;
  const els = form.elements;
  let mult, label, extra;
  if (els.amount) {
    const amount = Number(els.amount.value), count = Number(els.count.value) || 1;
    mult = (amount * count) / e.serving.amount;
    label = `${count} × ${els.amount.selectedOptions[0].textContent.replace(/^1 (?=\D)/, "")}`;
    extra = { optionAmount: amount, count };
  } else {
    mult = Number(els.mult.value) || 1;
    label = e.foodId ? `${+mult.toFixed(2)} × serving` : `your estimate${mult === 1 ? "" : ` × ${+mult.toFixed(2)}`}`;
    extra = { count: +mult.toFixed(2) };
  }
  return { e, base, mult, label, extra, n: scaleNutrition(base, mult) };
}

function updateEditPreview() {
  const form = $("#editForm"); if (!form || !editCtx) return;
  const { n } = editSelection(form);
  const std = (n.alcohol_g || 0) / 10;
  $("#editPreview").innerHTML = `<b>${fmt(n.energy_kcal)} kcal</b> · P ${fmt(n.protein_g, 1)} g · C ${fmt(n.carbohydrate_g, 1)} g · F ${fmt(n.total_fat_g, 1)} g · Na ${fmt(n.sodium_mg)} mg${std ? ` · ${std.toFixed(1)} std drinks` : ""}`;
}

function saveEdit(form) {
  const { e, base, mult, label, extra, n } = editSelection(form);
  const meal = form.elements.meal.value;
  updateLogEntry(editCtx.date, editCtx.id, { meal, n, base, mult, amountLabel: label, ...extra });
  const moved = meal !== e.meal;
  editCtx = null;
  closeSheet();
  toast(moved ? `Moved to ${MEALS.find(m => m.id === meal).label}` : "Portion updated");
}

// ------------------------------------------------------------------ events
document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action, today = todayStr();
  switch (a) {
    case "day-prev": viewDate = addDays(viewDate, -1); render(); break;
    case "day-next": if (viewDate < today) { viewDate = addDays(viewDate, 1); render(); } break;
    case "day-today": viewDate = today; render(); break;
    case "del-entry": removeLogEntry(viewDate, el.dataset.id); break;
    case "add-search": closeSheet(); addCtx = { date: viewDate, meal: el.dataset.meal }; location.hash = "#foods"; break;
    case "add-fav": openFavSheet({ date: viewDate, meal: el.dataset.meal }); break;
    case "fav-pick": openLogSheet(allFoods().find(f => f.id === el.dataset.id), favCtx); break;
    case "toggle-fav": toast(toggleFavorite(el.dataset.id) ? "★ Added to favourites" : "Removed from favourites"); break;
    case "browse-cat": $("#category").value = el.dataset.cat; shown = PAGE; renderFoods(); window.scrollTo(0, 0); break;
    case "browse-all": showAll = true; shown = PAGE; renderFoods(); break;
    case "clear-filters": resetFilters(); break;
    case "add-describe": openCustomSheet({ date: viewDate, meal: el.dataset.meal }); break;
    case "describe-open": openCustomSheet(addCtx || {}); break;
    case "cancel-add": addCtx = null; render(); break;
    case "log-food": openLogSheet(allFoods().find(f => f.id === el.dataset.id)); break;
    case "del-custom":
      if (confirm("Delete this custom food? Past log entries are kept.")) update(s => { s.customFoods = s.customFoods.filter(f => f.id !== el.dataset.id); s.favorites = (s.favorites || []).filter(id => id !== el.dataset.id); });
      break;
    case "close-sheet": closeSheet(); break;
    case "cs-calc": csCalculate(); break;
    case "cs-size": { const i = +el.dataset.i; cs.items[i].manual.kcal = el.dataset.kcal; renderCsResults(); break; }
    case "cs-pick": { const i = +el.dataset.i, it = cs.items[i]; cs.items[i] = chooseFood(it, it.candidates[0].food); renderCsResults(); break; }
    case "del-weight": if (confirm("Delete this weigh-in?")) deleteWeight(el.dataset.date, el.dataset.time || null); break;
    case "edit-entry": openEditSheet(viewDate, el.dataset.id); break;
    case "mode-today": ui.todayMode = el.dataset.mode; render(); break;
    case "mode-weight": ui.weightMode = el.dataset.mode; render(); break;
    case "cal-prev": ui.calMonth = shiftMonth(ui.calMonth, -1); render(); break;
    case "cal-next": if (ui.calMonth < monthOf(today)) { ui.calMonth = shiftMonth(ui.calMonth, 1); render(); } break;
    case "cal-select":
      ui.calSelected = el.dataset.date; render();
      setTimeout(() => $(".caldetail")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0);
      break;
    case "show-day":
      viewDate = el.dataset.date; ui.todayMode = "day"; location.hash = "#today"; render();
      break;
    case "range": range = el.dataset.range; render(); break;
    case "more": shown += PAGE; renderFoods(); break;
    case "export": {
      const a2 = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([exportJson()], { type: "application/json" })), download: `health-tracker-${today}.json` });
      a2.click(); URL.revokeObjectURL(a2.href); break;
    }
    case "reset":
      if (confirm("Erase ALL your data on this device? This cannot be undone.") && confirm("Really erase everything? Consider exporting a backup first.")) { resetAll(); toast("All data erased"); }
      break;
  }
});

document.addEventListener("submit", e => {
  const f = e.target;
  if (f.id === "weightForm") {
    e.preventDefault();
    setWeight(f.date.value, Number(f.kg.value), f.time.value || null);
    toast("Weight saved");
  } else if (f.id === "profileForm") {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    update(s => {
      s.profile = { sex: v.sex, age: Number(v.age), heightCm: Number(v.heightCm), activity: v.activity,
        goalKg: Number(v.goalKg), rateKgPerWeek: Number(v.rateKgPerWeek) };
    });
    const kg = Number(v.kg), latest = getState().weights.at(-1);
    if (!latest || latest.kg !== kg) setWeight(todayStr(), kg, timeStr());
    toast("Profile saved");
  } else if (f.id === "logForm") {
    e.preventDefault();
    const sel = logSelection(f);
    addLogEntry(f.date.value, { meal: f.meal.value, name: sel.food.name, n: sel.n,
      source: sel.food.data_quality?.status === "custom" ? "custom" : "database", ...foodEntryFields(sel.food, sel) });
    closeSheet();
    toast(`Added to ${MEALS.find(m => m.id === f.meal.value).label}`);
    if (!addCtx) { viewDate = f.date.value; }
  } else if (f.id === "editForm") {
    e.preventDefault();
    saveEdit(f);
  } else if (f.id === "csForm") {
    e.preventDefault();
    csSubmit(f);
  }
});

document.addEventListener("input", e => {
  const t = e.target;
  if (t.closest("#logForm")) return updateLogPreview();
  if (t.closest("#editForm")) return updateEditPreview();
  if (t.id === "csSave") { $("#csNameWrap").hidden = !t.checked; return; }
  if (t.dataset?.ci != null && cs?.items) {
    const i = +t.dataset.ci, it = cs.items[i];
    if (it.confidence === "unknown" && t.dataset.f !== "food") {
      it.manual[t.dataset.f] = t.value; updateEst(i); updateCsTotals();
    }
  }
  if (["q", "cuisine", "category", "sodium", "sugar", "maxKcal", "maxSodium", "noChol", "noSat", "sort"].includes(t.id)) { shown = PAGE; renderFoods(); }
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.classList.contains("serving-select")) {
    const id = t.closest("article").dataset.id;
    servingChoice[id] = Number(t.value);
    const f = allFoods().find(x => x.id === id);
    t.closest("article").outerHTML = foodCard(f);
  } else if (t.id === "importFile" && t.files[0]) {
    t.files[0].text().then(txt => { importJson(txt); toast("Backup imported"); }).catch(err => toast("Import failed: " + err.message));
  } else if (t.dataset?.ci != null && cs?.items) {
    const i = +t.dataset.ci, it = cs.items[i];
    if (t.dataset.f === "food") {
      if (t.value === "__manual") { it.confidence = "unknown"; it.food = null; }
      else cs.items[i] = chooseFood(it, it.candidates.find(c => c.food.id === t.value).food);
      renderCsResults();
    } else if (t.dataset.f === "mult" && it.food) {
      cs.items[i] = setMultiplier(it, Math.max(0.1, Number(t.value) || 1)); renderCsResults();
    }
  }
});

$("#reset").addEventListener("click", resetFilters);
sheet().addEventListener("click", e => { if (e.target === sheet()) closeSheet(); });
sheet().addEventListener("close", () => { cs = null; });
window.addEventListener("hashchange", route);

// ------------------------------------------------------------------ boot
load();
subscribe(render);
route();

fetch("food_nutrition.json").then(r => r.json()).then(d => {
  foodsDb = d.foods;
  $("#note").textContent = d.important_note;
  if (tab === "foods") renderFoods();
}).catch(() => { dbError = true; if (tab === "foods") renderFoods(); });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service worker failed", err));
}
