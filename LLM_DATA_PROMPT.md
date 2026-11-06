# Prompt: fetch real nutrition data for the dish list

Paste the prompt below into an LLM with web search / browsing, followed by a batch of ~40 lines
from `dish_names.txt` (the whole list in one go is too long and quality drops). Repeat per batch,
then concatenate the CSV outputs (keep one header row) into `nutrition_lookup.csv`.

---

You are a nutrition data researcher. For EACH dish below, look up real nutrition data on the web and return one CSV row per dish. Do not guess when a source exists.

SOURCE PRIORITY (use the first that has the dish):
1. Singapore HPB Energy & Nutrient Composition of Food database (focos.hpb.gov.sg / "HPB SG FoodID")
2. USDA FoodData Central (fdc.nal.usda.gov)
3. Other national food databases (Malaysia MyFCD, Japan MEXT, Korea RDA food DB, FSANZ, UK CoFID)
4. Manufacturer / restaurant nutrition pages (for branded items such as Redoxon, Voost)
5. Only if nothing is found: a clearly marked estimate from the closest comparable dish

RULES
- Use the stated serving size in grams (serving_g). If the source serving differs, SCALE values to my serving_g and put the source's original serving in source_serving_note.
- Give values PER SERVING (for my serving_g), not per 100 g.
- Units: energy kcal; protein, carbs, fat, sat fat, trans fat, fibre, sugars in g; sodium, cholesterol in mg.
- Leave a field EMPTY (not 0) if the source does not report it. Use 0 only when the source says 0.
- Also include potassium_mg, calcium_mg, iron_mg if available (else empty).
- confidence: "high" = exact dish from a primary database; "medium" = close match or scaled/branded; "low" = estimated from a comparable dish.
- source_url must be a real URL you actually opened. Never invent URLs or numbers. If unsure, set confidence=low and explain in notes.
- Keep `id` and `name` EXACTLY as given so I can join the data.

OUTPUT: a single CSV code block, no commentary, with this exact header:

id,name,serving_g,energy_kcal,protein_g,carbohydrate_g,total_fat_g,saturated_fat_g,trans_fat_g,fibre_g,sugars_g,sodium_mg,cholesterol_mg,potassium_mg,calcium_mg,iron_mg,confidence,source_name,source_url,source_serving_note,notes

Quote any field containing commas. One row per input dish, in the same order.

DISHES (id | name | cuisine | serving_g):
<paste batch from dish_names.txt here>
