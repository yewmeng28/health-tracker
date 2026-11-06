# Health Tracker (PWA)

An offline-capable, installable app for tracking food, weight and daily limits, backed by a database of
~690 Singapore/Asian dishes, hawker foods and alcoholic drinks. All your data stays on your device.

> **Nutrition values are estimates**, not lab measurements or verified HPB / USDA records. Daily targets use
> standard formulas and public-health guidelines and are **not medical advice**.

## Features

1. **Weight tracker** – log weight with a date **and time of day** (several weigh-ins a day are fine; history shows Morning / Afternoon /
   Evening / Night), see a weight-over-time chart (30d / 90d / all) with your goal line, progress and BMI.
2. **Daily targets** – from age, sex, height, weight and exercise frequency (Mifflin-St Jeor): a **minimum** calorie intake, a target
   for your goal pace, an **ideal maximum**, plus protein, carbs, fat, saturated fat, sugars, fibre, sodium, cholesterol and alcohol limits.
3. **Food log with 5 mealtimes** – Breakfast, Lunch, Tea break, Dinner, Supper, with live progress bars against your limits.
   Tap ✎ on a logged item to **change its portion** (serving × count, or a multiplier) or **move it to another mealtime**.
   Foods that come in pieces (eggs, slices, sticks, dumplings, nuts, berries…) have a **per-piece serving** option, e.g. "3 × egg (50 g)".
4. **Custom foods** – describe what you ate ("2 slices kaya toast and a pint of Tiger"). It is matched on-device against the
   database, reading quantities, units and sizes. Anything vague or unknown (e.g. "a snack", "a can of coke") asks you for a rough
   estimate (calories, or weight + food type, with optional macros). Descriptions can be saved as reusable custom foods.
5. **Streaks & badges** – a day counts when calories are within min–max and sodium, sugars, saturated fat and alcohol stay under
   their caps. Badges for streaks, balanced days, full-day logging, weigh-ins and reaching your goal weight.

6. **Calendar views** – on the Today tab (Day / Calendar) and the Weight tab (Chart / Calendar). Food days are green (within limits, counts for the
   streak), yellow (a warning: under your calorie minimum, which is often just an incomplete log, or a limit exceeded by up to 10%) or red
   (a limit exceeded by more than 10%). Weight days compare each day's average with your **previous 7-day average**, with 0.2 kg tolerance
   (towards your goal = green), so normal daily swings don't count against you. Tap a day for details, then
   **Show full breakdown** to open that date in the Today view.

7. **Favourites** – tap ☆ on any food to pin it. The Foods tab opens on a calm landing page (favourites, recently logged foods and
   browse-by-type chips) instead of a long list; the full list only appears when you search, filter or tap a type. Each mealtime on Today has a
   **★ Favourites** button for one-tap logging.

Plus: searchable/filterable food database (sodium, sugar, cholesterol filters), drink serving sizes (can, pint, jug, shot…),
backup export/import, offline use after the first load.

## Run it

The app is static (no build step) but must be served over HTTP:

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

To install it as an app, host it over **HTTPS** (e.g. GitHub Pages, Netlify, Cloudflare Pages) and use
"Add to Home Screen" / "Install". Service workers also work on `localhost`.

> On `localhost` the service worker is network-first, so edits show up on a normal reload. On a deployed (HTTPS) copy, bump `VERSION` in
> `sw.js` after changing app files so installed copies refresh. If a page looks stale while developing: DevTools → Application → Service
> Workers → Unregister (and "Clear site data"), then reload.

## Project layout

| Path | Purpose |
|---|---|
| `index.html`, `styles.css` | App shell and styles |
| `js/app.js` | Routing, Foods tab, log sheet, "describe it" sheet, event handling |
| `js/views.js` | HTML for Today / Weight / Badges / Profile tabs |
| `js/favorites.js` | Favourite / recently-logged helpers |
| `js/calendar.js` | Month calendar, day colours and day-detail panel (food and weight) |
| `js/calc.js` | BMR/TDEE, targets, day evaluation |
| `js/badges.js` | Streaks and badges |
| `js/estimator.js` | On-device description parser and manual-estimate fallback |
| `js/store.js`, `js/dates.js`, `js/chart.js`, `js/ui.js` | Storage, dates & mealtimes, SVG chart, helpers |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA offline cache, manifest, icons (`tools/make_icons.py` regenerates them) |
| `food_nutrition.json` | Generated food database |
| `profiles.py`, `foods_extra.py`, `alcohol_data.py`, `lookup_loader.py`, `build_food_data.py` | Database build pipeline |
| `nutrition_lookup.csv`, `LLM_DATA_PROMPT.md`, `dish_names.txt` | Sourced nutrition values and the prompt/list used to collect them |
| `tests/` | Node tests (`node --test tests/calc.test.mjs tests/estimator.test.mjs tests/views.test.mjs tests/features.test.mjs tests/favorites.test.mjs tests/boot.test.mjs`; `boot.test.mjs` boots `js/app.js` against a small fake DOM and walks the main flows) and a browser smoke test (`node tests/e2e.mjs`, needs Chrome) |

## Rebuild the database

```sh
python3 build_food_data.py
```

Requires Python 3 only. It also regenerates `dish_names.txt` (git-ignored; used for the LLM data-collection prompt). Dishes live in `foods_extra.py` (append new ones at the end so ids stay stable), profiles and
keyword overrides in `profiles.py`, drinks in `alcohol_data.py`. Verified values from `nutrition_lookup.csv` overlay the estimates
field by field (rows must pass a calories-vs-macros sanity check). Then bump `VERSION` in `sw.js`.

### Data notes

- Sodium levels: `sodium_level` per 100 g (low ≤ 120 mg, high > 600 mg); `sodium_serving_level` per serving (low ≤ 300 mg, high > 600 mg).
- Sugar levels per 100 g: low ≤ 5 g, high > 15 g. Sugars are *total* sugars (fruit and milk included).
- Per-piece info: foods whose name states a count ("2 slices", "5 pieces") get a `piece` {label, grams} and `serving_options` automatically; others are listed in `PIECES` in `foods_extra.py`.
- Drinks: ids `drink-NNN`, amounts in ml, `alcohol_g`, `abv_percent`, `serving_options`; 1 standard drink = 10 g alcohol (HPB).
  Energy = 7 kcal/g alcohol + 4 kcal/g carbs and protein.
- Targets: sodium ≤ 2000 mg (WHO), sugars < 10% of energy, saturated fat < 10%, fibre ≥ 14 g/1000 kcal, alcohol ≤ 1 (women) / 2 (men) standard
  drinks/day, calorie floor 1200 (women) / 1500 (men).

## Privacy

No accounts, no analytics, no network calls except loading the app itself. Data lives in your browser's `localStorage`;
use **Profile → Export backup** before clearing browser data or changing device.
