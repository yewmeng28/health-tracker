"""Per-100g nutrition profiles (estimates, prepared/cooked dish level).

Tuple order:
(kcal, protein_g, carbs_g, fat_g, sat_fat_g, fibre_g, sugars_g, sodium_mg, cholesterol_mg, trans_fat_g)

Values are rounded category-level estimates informed by typical USDA FoodData Central
and HPB (Singapore) food-composition ranges. They are NOT verified lab values.
"""

FIELDS = ("energy_kcal", "protein_g", "carbohydrate_g", "total_fat_g", "saturated_fat_g",
          "fibre_g", "sugars_g", "sodium_mg", "cholesterol_mg", "trans_fat_g")

profiles = {
    "noodles":      (130, 5.0, 20.0, 3.5, 1.0, 1.2, 1.5, 330, 15, 0.0),
    "soup":         (45, 3.0, 4.0, 1.8, 0.6, 0.5, 1.0, 350, 8, 0.0),
    "curry":        (130, 6.0, 8.0, 8.0, 4.0, 1.5, 3.0, 330, 25, 0.1),
    "chicken":      (170, 22.0, 3.0, 7.0, 2.0, 0.3, 0.5, 320, 75, 0.1),
    "fish":         (130, 19.0, 3.0, 5.0, 1.0, 0.2, 0.5, 330, 60, 0.0),
    "fried_rice":   (170, 5.0, 26.0, 5.5, 1.2, 1.0, 1.0, 420, 40, 0.1),
    "fried_noodle": (185, 5.0, 25.0, 7.0, 1.5, 1.5, 2.0, 450, 30, 0.1),
    "pork":         (230, 17.0, 5.0, 16.0, 5.5, 0.3, 1.5, 380, 70, 0.1),
    "tofu":         (110, 9.0, 4.0, 7.0, 1.0, 1.2, 1.0, 250, 0, 0.0),
    "rice":         (150, 6.0, 23.0, 3.5, 1.0, 0.6, 0.5, 280, 25, 0.0),
    "brown_rice":   (135, 4.0, 25.0, 2.0, 0.5, 2.0, 0.5, 200, 5, 0.0),
    "vegetable":    (55, 2.0, 6.0, 2.8, 0.5, 2.0, 3.0, 260, 0, 0.0),
    "leafy":        (45, 2.2, 4.0, 2.5, 0.4, 2.0, 1.5, 280, 0, 0.0),
    "pastry":       (330, 6.0, 42.0, 15.0, 6.0, 1.5, 10.0, 380, 35, 0.2),
    "bread":        (265, 9.0, 48.0, 3.5, 1.0, 3.0, 5.0, 490, 0, 0.0),
    "egg":          (155, 11.0, 2.0, 11.0, 3.3, 0.0, 1.0, 300, 370, 0.0),
    "milk":         (65, 3.2, 8.0, 2.5, 1.5, 0.0, 7.5, 45, 10, 0.1),
    "fruit":        (55, 0.7, 13.0, 0.2, 0.0, 2.0, 10.0, 2, 0, 0.0),
    "dessert":      (180, 3.0, 32.0, 5.0, 2.5, 1.0, 22.0, 60, 10, 0.1),
    "beans":        (120, 7.0, 17.0, 2.5, 0.4, 5.0, 1.5, 200, 0, 0.0),
    "dumpling":     (210, 9.0, 26.0, 7.0, 2.0, 1.3, 2.0, 480, 30, 0.1),
    "beef":         (200, 20.0, 3.0, 12.0, 4.5, 0.3, 1.0, 350, 70, 0.4),
    "salmon":       (200, 21.0, 2.0, 12.0, 2.5, 0.2, 0.5, 300, 60, 0.0),
    "potato":       (120, 2.5, 18.0, 4.5, 0.8, 2.0, 1.5, 250, 0, 0.1),
    "seaweed":      (45, 5.0, 6.0, 1.0, 0.2, 4.0, 1.0, 300, 0, 0.0),
    "sweet_potato": (90, 1.6, 21.0, 0.1, 0.0, 3.0, 6.5, 40, 0, 0.0),
    "oats":         (130, 5.0, 22.0, 3.0, 0.6, 3.0, 6.0, 60, 2, 0.0),
    "soy_milk":     (45, 3.3, 3.0, 2.0, 0.3, 0.5, 2.0, 50, 0, 0.0),
    "yogurt":       (75, 7.0, 7.0, 2.5, 1.5, 0.0, 6.0, 50, 10, 0.1),
    "protein":      (80, 12.0, 5.0, 1.5, 0.8, 0.3, 3.0, 90, 15, 0.0),
    "nuts":         (600, 20.0, 20.0, 52.0, 6.0, 8.0, 4.0, 5, 0, 0.0),
    "tempeh":       (193, 20.3, 7.6, 10.8, 2.2, 3.8, 0.8, 9, 0, 0.0),
    "egg_boiled":   (143, 12.6, 0.7, 9.5, 3.1, 0.0, 0.4, 124, 372, 0.0),
    "kaya_toast":   (320, 6.0, 45.0, 12.0, 6.0, 1.5, 20.0, 400, 25, 0.1),
    "vitamin_drink": (4, 0.0, 0.8, 0.0, 0.0, 0.0, 0.3, 100, 0, 0.0),
    "satay":        (200, 18.0, 10.0, 10.0, 3.0, 1.0, 6.0, 450, 50, 0.1),
    "omelette_fried": (225, 9.0, 12.0, 15.0, 3.5, 0.5, 1.0, 450, 130, 0.1),
    "glutinous_rice": (190, 5.5, 30.0, 5.5, 1.8, 1.0, 1.0, 330, 20, 0.0),
    "bkt":          (80, 7.0, 1.5, 5.0, 1.8, 0.3, 0.5, 350, 35, 0.0),
    "black_coffee": (2, 0.1, 0.3, 0.0, 0.0, 0.0, 0.0, 5, 0, 0.0),
    "ytf_soup":     (80, 6.0, 9.0, 2.5, 0.7, 1.2, 1.5, 300, 15, 0.0),
    "ytf_dry":      (115, 7.0, 12.0, 4.0, 1.0, 1.3, 4.0, 420, 15, 0.1),
    "mala_soup":    (110, 6.0, 8.0, 6.5, 2.0, 1.5, 1.5, 450, 25, 0.1),
    "mala_dry":     (170, 8.0, 10.0, 11.0, 3.0, 2.0, 2.0, 600, 30, 0.1),
    "plain_rice":   (130, 2.7, 28.2, 0.3, 0.1, 0.4, 0.1, 1, 0, 0.0),
    "egg_fried":    (196, 13.6, 0.8, 15.0, 4.2, 0.0, 0.4, 190, 400, 0.1),
    "egg_scrambled": (166, 10.5, 2.5, 12.5, 4.5, 0.0, 2.0, 300, 320, 0.1),
    "chicken_breast": (165, 31.0, 0.0, 3.6, 1.0, 0.0, 0.0, 74, 85, 0.0),
    "broccoli":     (35, 2.4, 7.2, 0.4, 0.1, 3.3, 1.4, 41, 0, 0.0),
    "salmon_baked": (206, 22.1, 0.0, 12.4, 2.5, 0.0, 0.0, 60, 63, 0.0),
    "yuan_yang":    (55, 1.4, 9.0, 1.4, 0.9, 0.0, 8.5, 28, 5, 0.0),
    "teh_c_bing":   (40, 1.1, 6.0, 1.3, 0.9, 0.0, 5.5, 22, 4, 0.0),
    "kopi_bing":    (48, 1.3, 7.5, 1.5, 1.0, 0.0, 7.2, 28, 5, 0.0),
    "mocha":        (80, 3.3, 10.0, 3.0, 1.8, 0.5, 9.0, 50, 12, 0.0),
    "lime_juice":   (38, 0.1, 9.5, 0.0, 0.0, 0.0, 9.0, 5, 0, 0.0),
    "kopi_o":       (17, 0.1, 4.2, 0.0, 0.0, 0.0, 4.0, 3, 0, 0.0),
    "kopi_o_bing":  (15, 0.1, 3.6, 0.0, 0.0, 0.0, 3.4, 3, 0, 0.0),
    "teh_con":      (58, 1.4, 9.5, 1.6, 1.0, 0.0, 9.0, 30, 6, 0.0),
    "teh_c_hot":    (46, 1.3, 7.2, 1.4, 0.9, 0.0, 6.5, 28, 5, 0.0),
    "teh_o":        (16, 0.0, 4.0, 0.0, 0.0, 0.0, 4.0, 3, 0, 0.0),
    "teh_o_bing":   (14, 0.0, 3.4, 0.0, 0.0, 0.0, 3.4, 2, 0, 0.0),
    "black_tea":    (1, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 3, 0, 0.0),
    "teh_halia":    (21, 0.0, 5.2, 0.0, 0.0, 0.1, 5.0, 3, 0, 0.0),
    "milo_hot":     (80, 2.8, 12.5, 2.3, 1.5, 0.4, 10.5, 45, 8, 0.0),
    "milo_bing":    (65, 2.2, 10.5, 1.9, 1.2, 0.3, 8.8, 38, 6, 0.0),
    "horlicks":     (80, 2.8, 13.0, 2.0, 1.2, 0.2, 10.5, 50, 8, 0.0),
    "bandung":      (60, 1.5, 11.0, 1.3, 0.8, 0.0, 10.5, 25, 5, 0.0),
    "soya_sweet":   (45, 2.8, 6.5, 1.4, 0.2, 0.4, 5.5, 30, 0, 0.0),
    "chrysanthemum": (30, 0.0, 7.5, 0.0, 0.0, 0.0, 7.5, 5, 0, 0.0),
    "lemon_barley": (35, 0.2, 8.5, 0.0, 0.0, 0.1, 8.0, 5, 0, 0.0),
    "winter_melon": (30, 0.0, 7.5, 0.0, 0.0, 0.0, 7.2, 5, 0, 0.0),
    "ice_lemon_tea": (28, 0.0, 7.0, 0.0, 0.0, 0.0, 7.0, 4, 0, 0.0),
    "sour_plum":    (45, 0.1, 11.0, 0.0, 0.0, 0.0, 10.5, 60, 0, 0.0),
    "longan_date":  (40, 0.2, 10.0, 0.0, 0.0, 0.1, 9.5, 5, 0, 0.0),
    "plus100":      (30, 0.0, 7.4, 0.0, 0.0, 0.0, 7.0, 41, 0, 0.0),
    "cola":         (42, 0.0, 10.6, 0.0, 0.0, 0.0, 10.6, 7, 0, 0.0),
    "sprite":       (38, 0.0, 9.5, 0.0, 0.0, 0.0, 9.5, 10, 0, 0.0),
    "cheese":       (350, 25.0, 2.0, 27.0, 17.0, 0.0, 1.0, 650, 95, 0.8),
}

# Blend: 110 g kaya toast + 100 g soft-boiled eggs, expressed per 100 g of the 210 g set.
profiles["kaya_toast_egg_set"] = tuple(
    round((a * 110 + b * 100) / 210, 2) for a, b in zip(profiles["kaya_toast"], profiles["egg_boiled"])
)

# Name-based adjustments applied on top of the profile (regex -> field overrides, per 100g).
# Shellfish/offal are much higher in cholesterol; deep-fried items carry some trans fat.
OVERRIDES = [
    # optional 3rd element limits an override to certain profiles (seafood-main dishes vs mixed dishes)
    (r"prawn|shrimp",                       {"cholesterol_mg": 130}, {"fish", "salmon"}),
    (r"prawn|shrimp",                       {"cholesterol_mg_min": 45}, {"noodles", "soup", "rice", "fried_rice", "fried_noodle", "curry", "dumpling", "chicken", "pork", "vegetable"}),
    (r"crab|lobster",                       {"cholesterol_mg": 130}),
    (r"squid|sotong|cuttlefish|octopus",    {"cholesterol_mg": 180}),
    (r"clam|lala|oyster|kaki",              {"cholesterol_mg": 60}),
    (r"pig organ|offal|liver|intestine",    {"cholesterol_mg": 80}),
    (r"abalone|sea cucumber|fish maw",      {"cholesterol_mg": 40}),
    (r"century egg|egg tart|omurice|tamago|egg",
                                            {"cholesterol_mg_min": 60}),
    (r"fried|fry\b|tempura|katsu|schnitzel|nugget|fritter|puff|prata|croquette|korokke|corn dog|fries|vada|samosa|pakora",
                                            {"trans_fat_g_min": 0.3}),
]
