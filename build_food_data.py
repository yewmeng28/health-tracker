import json
import re
from datetime import date
from pathlib import Path

from alcohol_data import (COCKTAIL_SERVING_ML, ETHANOL_DENSITY, SERVINGS, SG_STANDARD_DRINK_G, SODIUM, drinks)
from foods_extra import NOTES, PIECES, SERVING_OPTIONS, foods
from lookup_loader import NUM, load_lookup, validate
from profiles import FIELDS, OVERRIDES, profiles

HERE = Path(__file__).parent
OUT = HERE / "food_nutrition.json"
LOOKUP = HERE / "nutrition_lookup.csv"
EXTRA_FIELDS = ("potassium_mg", "calcium_mg", "iron_mg")  # only present where a source reports them

# HPB-style per-100g sodium labelling thresholds (mg): low <=120, high >600.
def sodium_level(mg_per_100g):
    return "low" if mg_per_100g <= 120 else "high" if mg_per_100g > 600 else "medium"


# Per-serving sodium (mg): low <=300, high >600 (30% of the 2000 mg daily limit in one serving).
SODIUM_DAILY_MG = 2000


def sodium_serving_level(mg):
    return "low" if mg <= 300 else "high" if mg > 600 else "medium"


# Per-100 g sugar thresholds (g): low <=5, high >15.
def sugar_level(g_per_100g):
    return "low" if g_per_100g <= 5 else "high" if g_per_100g > 15 else "medium"


def per_100g_for(name, profile_key):
    values = dict(zip(FIELDS, profiles[profile_key]))
    lname = name.lower()
    for pattern, ov, *only in OVERRIDES:
        if only and profile_key not in only[0]:
            continue
        if re.search(pattern, lname):
            for k, v in ov.items():
                if k.endswith("_min"):
                    base = k[:-4]
                    values[base] = max(values[base], v)
                else:
                    values[k] = v
    return values


seen, unique = set(), []
for item in foods:
    key = re.sub(r"\s+", " ", item[0].strip().lower())
    if key not in seen:
        seen.add(key)
        unique.append(item)

names_by_id = {f"food-{i:03d}": item[0] for i, item in enumerate(unique, start=1)}
lookup, lookup_warnings = load_lookup(LOOKUP, names_by_id)
for w in lookup_warnings:
    print("lookup warning:", w)
sourced_count = 0

def data_quality(profile_key, name, rec, sourced):
    extra = " " + NOTES[name] if name in NOTES else ""
    if rec is None:
        return {
            "status": "estimated",
            "confidence": "low_to_medium",
            "profile": profile_key,
            "source": "Category-level profile informed by typical USDA FoodData Central / HPB ranges; not a verified record",
            "notes": "Recipe, oil, sauce, brand and portion size can materially change values." + extra,
        }
    return {
        "status": "sourced_partial",
        "confidence": rec["confidence"] or "low",
        "profile": profile_key,
        "sourced_fields": sourced,
        "source": rec["source_name"] or None,
        "source_url": rec["source_url"] or None,
        "source_serving_note": rec["source_serving_note"] or None,
        "notes": "Fields listed in sourced_fields come from the source (scaled to this serving); all other fields are category-level estimates. " + (rec["notes"] or "") + extra,
    }


entries = []
for idx, (name, cuisine, category, profile_key, grams) in enumerate(unique, start=1):
    per100 = per_100g_for(name, profile_key)
    per_serving = {k: round(max(0, v * grams / 100), 1) for k, v in per100.items()}

    # Overlay sourced values (per serving) from nutrition_lookup.csv where they pass validation.
    rec = lookup.get(f"food-{idx:03d}")
    sourced, quality = [], None
    if rec and (reason := validate(rec)) is None:
        scale = grams / rec["serving_g"] if rec["serving_g"] else 1.0
        for k in NUM[1:]:
            if rec[k] is not None:
                per_serving[k] = round(max(0, rec[k] * scale), 1)
                sourced.append(k)
        quality = rec
        sourced_count += 1
        per100 = {k: per_serving[k] * 100 / grams for k in per_serving}
    elif rec and rec["energy_kcal"] is not None:
        print(f"lookup rejected: food-{idx:03d} {name}: {reason}")
    entries.append({
        "id": f"food-{idx:03d}",
        "name": name,
        "cuisine": cuisine,
        "category": category,
        "serving": {"amount": grams, "unit": "g", "basis": "estimated edible portion"},
        "nutrition_per_serving": per_serving,
        "nutrition_per_100g": {k: round(v, 1) for k, v in per100.items()},
        "flags": {
            "sodium_level": sodium_level(per100["sodium_mg"]),
            "sodium_serving_level": sodium_serving_level(per_serving["sodium_mg"]),
            "sodium_pct_daily": round(per_serving["sodium_mg"] / SODIUM_DAILY_MG * 100),
            "sugar_level": sugar_level(per100["sugars_g"]),
            "high_cholesterol": per_serving["cholesterol_mg"] >= 100,
            "high_sat_fat": per_serving["saturated_fat_g"] >= 5,
        },
        "data_quality": data_quality(profile_key, name, quality, sourced),
    })

# ---- Per-piece servings (eggs, slices, sticks, dumplings...) ----
PIECE_RE = re.compile(r"(\d+)\s*(pieces?|slices?|sticks?|skewers?|rolls?|eggs?|pcs?)\b", re.I)


def add_piece_options(e):
    name, serving = e["name"], e["serving"]["amount"]
    piece = None
    if name in PIECES:
        piece = {"label": PIECES[name][0], "grams": PIECES[name][1]}
    else:
        m = PIECE_RE.search(name)
        if m and int(m.group(1)) > 1:
            n = int(m.group(1))
            label = re.sub(r"s$", "", m.group(2).lower()).replace("pc", "piece")
            piece = {"label": label, "grams": round(serving / n, 1)}
            piece["per_serving"] = n
    opts = None
    if name in SERVING_OPTIONS:
        opts = [{"label": l, "amount": a} for l, a in SERVING_OPTIONS[name]]
    elif piece:
        g = piece["grams"]
        if piece.get("per_serving"):
            opts = [{"label": f"Serving ({piece['per_serving']} {piece['label']}s, {serving:g} g)", "amount": serving},
                    {"label": f"1 {piece['label']} ({g:g} g)", "amount": g}]
        else:
            opts = [{"label": f"1 {piece['label']} ({g:g} g)", "amount": g}, {"label": "100 g", "amount": 100}]
            if serving != g and not any(o["amount"] == serving for o in opts):
                opts.insert(0, {"label": f"Serving ({serving:g} g)", "amount": serving})
    if piece:
        e["piece"] = {"label": piece["label"], "grams": piece["grams"]}
    if opts:
        e["serving_options"] = opts


for _e in entries:
    add_piece_options(_e)

# ---- Alcoholic drinks: ids use a "drink-" prefix so adding foods never shifts them ----
def alcohol_entry(idx, spec):
    name, dtype, abv, carbs, protein, sugars, sset = spec
    sset = {"beer": "beer", "spirit": "spirit"}.get(sset, sset)
    opts = SERVINGS[sset]
    default_ml = COCKTAIL_SERVING_ML.get(name, opts[0][1])
    if sset == "cocktail":
        opts = [(f"Glass ({default_ml} ml)", default_ml)]
    alcohol_g = abv * ETHANOL_DENSITY
    kcal = 7 * alcohol_g + 4 * carbs + 4 * protein
    per100 = {"energy_kcal": kcal, "protein_g": protein, "carbohydrate_g": carbs, "total_fat_g": 0.0,
              "saturated_fat_g": 0.0, "fibre_g": 0.0, "sugars_g": sugars, "sodium_mg": SODIUM[sset],
              "cholesterol_mg": 0.0, "trans_fat_g": 0.0, "alcohol_g": alcohol_g}
    per_serving = {k: round(v * default_ml / 100, 1) for k, v in per100.items()}
    return {
        "id": f"drink-{idx:03d}",
        "name": name,
        "cuisine": dtype,
        "category": "alcohol",
        "abv_percent": abv,
        "serving": {"amount": default_ml, "unit": "ml", "basis": "typical serving; nutrition per 100 g column is per 100 ml here"},
        "serving_options": [{"label": l, "amount": ml} for l, ml in opts],
        "nutrition_per_serving": per_serving,
        "nutrition_per_100g": {k: round(v, 2) for k, v in per100.items()},
        "flags": {
            "alcoholic": abv > 0,
            "standard_drinks": round(per_serving["alcohol_g"] / SG_STANDARD_DRINK_G, 1),
            "sodium_level": sodium_level(per100["sodium_mg"]),
            "sodium_serving_level": sodium_serving_level(per_serving["sodium_mg"]),
            "sodium_pct_daily": round(per_serving["sodium_mg"] / SODIUM_DAILY_MG * 100),
            "sugar_level": sugar_level(per100["sugars_g"]),
            "high_cholesterol": False,
            "high_sat_fat": False,
        },
        "data_quality": {
            "status": "estimated",
            "confidence": "low_to_medium",
            "profile": f"alcohol:{dtype.lower()}",
            "source": "ABV from typical brand label strength; carbs/protein estimated; energy = 7 kcal/g alcohol + 4 kcal/g carbs and protein",
            "notes": "ABV can differ by market or bottling, and brands rarely publish full nutrition. Check the label if it matters. 1 standard drink = 10 g alcohol.",
        },
    }


seen_drinks = set()
for i, spec in enumerate(drinks, start=1):
    assert spec[0].lower() not in seen_drinks, f"duplicate drink {spec[0]}"
    seen_drinks.add(spec[0].lower())
    entries.append(alcohol_entry(i, spec))


data = {
    "schema_version": 3,
    "dataset_name": "Asian and Everyday Foods Nutrition Estimates",
    "generated_date": date.today().isoformat(),
    "record_count": len(entries),
    "units": {"alcohol": "g (pure ethanol); drinks are per ml", "energy": "kcal", "macronutrients": "g", "sodium": "mg", "cholesterol": "mg", "serving_weight": "g"},
    "daily_reference": {"sodium_mg_max": SODIUM_DAILY_MG, "cholesterol_mg_guide": 300, "sat_fat_g_guide": 22, "note": "General adult guides; adjust per individual."},
    "important_note": "All values are approximate estimates, not lab measurements. Let users edit serving size and nutrition.",
    "nutrition_fields": list(FIELDS) + list(EXTRA_FIELDS) + ["alcohol_g"],
    "foods": entries,
}

OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
# Plain list of names for the LLM data-collection prompt (generated; git-ignored).
(HERE / "dish_names.txt").write_text(
    "id | name | cuisine | current_serving_g\n" +
    "".join(f"{e['id']} | {e['name']} | {e['cuisine']} | {e['serving']['amount']}\n" for e in entries), encoding="utf-8")
print(f"Wrote {len(entries)} records to {OUT} ({sourced_count} with sourced values)")
