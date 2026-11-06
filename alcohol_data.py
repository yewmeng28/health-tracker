"""Alcoholic drinks commonly found in Singapore.

Per drink: (name, type, abv_percent, carbs_g_per_100ml, protein_g_per_100ml, sugars_g_per_100ml, serving_set)

ABV values are typical label strengths and can differ by market/bottling. Carbs/protein are
estimates (brewers/distillers rarely publish full labels). Energy is computed:
    kcal/100ml = 7 * alcohol_g + 4 * carbs + 4 * protein      (alcohol_g = ABV * 0.789)
Treat everything as approximate; check the label where it matters.
"""

ETHANOL_DENSITY = 0.789  # g/ml
SG_STANDARD_DRINK_G = 10  # 1 standard drink = 10 g pure alcohol (HPB Singapore)

# Serving sets: list of (label, ml); the first entry is the default serving.
SERVINGS = {
    "beer": [("Can / bottle (330 ml)", 330), ("Half pint (284 ml)", 284), ("Pint, SG pub (500 ml)", 500),
             ("UK pint (568 ml)", 568), ("Large bottle (640 ml)", 640), ("Jug (1.5 L)", 1500)],
    "spirit": [("Shot (30 ml)", 30), ("Standard pour (45 ml)", 45), ("Double (60 ml)", 60), ("Bottle (700 ml)", 700)],
    "wine": [("Glass (150 ml)", 150), ("Small glass (125 ml)", 125), ("Large glass (175 ml)", 175), ("Bottle (750 ml)", 750)],
    "sake": [("Glass (90 ml)", 90), ("Ochoko cup (60 ml)", 60), ("Tokkuri, 1 go (180 ml)", 180), ("Bottle (720 ml)", 720)],
    "soju": [("Shot (50 ml)", 50), ("Bottle (360 ml)", 360)],
    "cocktail": [("Glass", 200)],
}

# Sodium (mg per 100 ml) by serving set
SODIUM = {"beer": 4, "spirit": 1, "wine": 4, "sake": 3, "soju": 2, "cocktail": 5}

B = "beer"
S = "spirit"

drinks = [
    # ---- Beer / lager / stout (name, type, abv, carbs, protein, sugars, set) ----
    ("Tiger Beer", "Beer", 5.0, 2.9, 0.4, 0.3, B),
    ("Tiger Crystal", "Beer", 3.2, 2.6, 0.3, 0.3, B),
    ("Tiger Radler (lemon)", "Beer", 2.0, 6.0, 0.2, 5.5, B),
    ("Heineken", "Beer", 5.0, 3.2, 0.4, 0.3, B),
    ("Heineken 0.0 (non-alcoholic)", "Beer", 0.0, 4.5, 0.3, 3.0, B),
    ("Carlsberg", "Beer", 5.0, 3.0, 0.4, 0.3, B),
    ("Anchor Smooth Pilsner", "Beer", 5.0, 3.0, 0.4, 0.3, B),
    ("Paulaner Hefe-Weissbier", "Beer", 5.5, 3.6, 0.5, 0.3, B),
    ("Erdinger Weissbier", "Beer", 5.3, 3.4, 0.5, 0.3, B),
    ("Hoegaarden White", "Beer", 4.9, 3.7, 0.4, 0.3, B),
    ("Stella Artois", "Beer", 5.0, 2.9, 0.4, 0.3, B),
    ("Kronenbourg 1664 Blanc", "Beer", 5.0, 3.2, 0.4, 0.3, B),
    ("Sapporo Premium", "Beer", 4.9, 3.1, 0.3, 0.3, B),
    ("Asahi Super Dry", "Beer", 5.0, 3.0, 0.3, 0.2, B),
    ("Kirin Ichiban", "Beer", 5.0, 3.0, 0.4, 0.3, B),
    ("Tsingtao", "Beer", 4.7, 2.8, 0.4, 0.3, B),
    ("Singha", "Beer", 5.0, 3.0, 0.4, 0.3, B),
    ("Chang Classic", "Beer", 5.0, 3.0, 0.4, 0.3, B),
    ("Budweiser", "Beer", 5.0, 2.7, 0.3, 0.2, B),
    ("Corona Extra", "Beer", 4.5, 3.4, 0.3, 0.3, B),
    ("Guinness Draught", "Beer", 4.2, 3.0, 0.3, 0.2, B),
    ("Guinness Foreign Extra Stout", "Beer", 7.5, 3.5, 0.4, 0.3, B),
    ("Strongbow Original Dry cider", "Cider", 4.5, 4.8, 0.0, 4.3, B),
    ("Somersby Apple cider", "Cider", 4.5, 6.0, 0.0, 5.5, B),

    # ---- Whisky / whiskey ----
    ("Johnnie Walker Red Label", "Whisky", 40, 0.1, 0, 0, S),
    ("Johnnie Walker Black Label 12", "Whisky", 40, 0.1, 0, 0, S),
    ("Johnnie Walker Double Black", "Whisky", 40, 0.1, 0, 0, S),
    ("Johnnie Walker Green Label 15", "Whisky", 43, 0.1, 0, 0, S),
    ("Johnnie Walker Gold Label Reserve", "Whisky", 40, 0.1, 0, 0, S),
    ("Johnnie Walker Blue Label", "Whisky", 40, 0.1, 0, 0, S),
    ("Chivas Regal 12", "Whisky", 40, 0.1, 0, 0, S),
    ("Chivas Regal 18", "Whisky", 40, 0.1, 0, 0, S),
    ("Ballantine's Finest", "Whisky", 40, 0.1, 0, 0, S),
    ("Dewar's White Label", "Whisky", 40, 0.1, 0, 0, S),
    ("Monkey Shoulder", "Whisky", 40, 0.1, 0, 0, S),
    ("Glenfiddich 12", "Whisky", 40, 0.1, 0, 0, S),
    ("Glenfiddich 15", "Whisky", 40, 0.1, 0, 0, S),
    ("The Glenlivet 12", "Whisky", 40, 0.1, 0, 0, S),
    ("The Macallan 12 Double Cask", "Whisky", 40, 0.1, 0, 0, S),
    ("The Macallan 18 Sherry Oak", "Whisky", 43, 0.1, 0, 0, S),
    ("The Singleton of Dufftown 12", "Whisky", 40, 0.1, 0, 0, S),
    ("Talisker 10", "Whisky", 45.8, 0.1, 0, 0, S),
    ("Laphroaig 10", "Whisky", 40, 0.1, 0, 0, S),
    ("Lagavulin 16", "Whisky", 43, 0.1, 0, 0, S),
    ("Jameson Irish Whiskey", "Whisky", 40, 0.1, 0, 0, S),
    ("Jack Daniel's Old No. 7", "Whisky", 40, 0.1, 0, 0, S),
    ("Gentleman Jack", "Whisky", 40, 0.1, 0, 0, S),
    ("Jim Beam White", "Whisky", 40, 0.1, 0, 0, S),
    ("Maker's Mark", "Whisky", 45, 0.1, 0, 0, S),
    ("Bulleit Bourbon", "Whisky", 45, 0.1, 0, 0, S),
    ("Woodford Reserve", "Whisky", 43.2, 0.1, 0, 0, S),
    ("Crown Royal", "Whisky", 40, 0.1, 0, 0, S),
    ("Suntory Kakubin", "Whisky", 40, 0.1, 0, 0, S),
    ("Suntory Toki", "Whisky", 43, 0.1, 0, 0, S),
    ("Hibiki Japanese Harmony", "Whisky", 43, 0.1, 0, 0, S),
    ("Yamazaki 12", "Whisky", 43, 0.1, 0, 0, S),
    ("Nikka From The Barrel", "Whisky", 51.4, 0.1, 0, 0, S),
    ("Kavalan Classic", "Whisky", 40, 0.1, 0, 0, S),

    # ---- Other spirits ----
    ("Smirnoff Red vodka", "Vodka", 37.5, 0, 0, 0, S),
    ("Absolut vodka", "Vodka", 40, 0, 0, 0, S),
    ("Grey Goose vodka", "Vodka", 40, 0, 0, 0, S),
    ("Gordon's London Dry gin", "Gin", 37.5, 0, 0, 0, S),
    ("Tanqueray London Dry gin", "Gin", 43.1, 0, 0, 0, S),
    ("Bombay Sapphire gin", "Gin", 40, 0, 0, 0, S),
    ("Hendrick's gin", "Gin", 41.4, 0, 0, 0, S),
    ("Bacardi Carta Blanca rum", "Rum", 37.5, 0, 0, 0, S),
    ("Captain Morgan Spiced rum", "Rum", 35, 3.0, 0, 3.0, S),
    ("Havana Club 3 Anos rum", "Rum", 40, 0, 0, 0, S),
    ("Jose Cuervo Especial tequila", "Tequila", 38, 0, 0, 0, S),
    ("Patron Silver tequila", "Tequila", 40, 0, 0, 0, S),
    ("Hennessy VS cognac", "Brandy", 40, 0.1, 0, 0, S),
    ("Hennessy VSOP cognac", "Brandy", 40, 0.1, 0, 0, S),
    ("Martell VSOP cognac", "Brandy", 40, 0.1, 0, 0, S),
    ("Remy Martin VSOP cognac", "Brandy", 40, 0.1, 0, 0, S),
    ("Jagermeister", "Liqueur", 35, 20.0, 0, 20.0, S),
    ("Moutai Feitian baijiu", "Baijiu", 53, 0, 0, 0, S),
    ("Wuliangye baijiu", "Baijiu", 52, 0, 0, 0, S),

    # ---- Wine, sake, soju ----
    ("Red wine, dry", "Wine", 13.0, 2.6, 0.1, 0.6, "wine"),
    ("White wine, dry", "Wine", 12.0, 2.6, 0.1, 1.0, "wine"),
    ("Rose wine", "Wine", 12.0, 3.0, 0.1, 2.0, "wine"),
    ("Sparkling wine / Prosecco", "Wine", 11.0, 3.0, 0.1, 2.5, "wine"),
    ("Champagne, brut", "Wine", 12.0, 1.5, 0.1, 1.0, "wine"),
    ("Moscato (sweet white wine)", "Wine", 5.5, 10.0, 0.1, 9.5, "wine"),
    ("Sake, junmai", "Sake", 15.0, 4.5, 0.4, 3.5, "sake"),
    ("Jinro Chamisul Fresh soju", "Soju", 16.9, 5.0, 0.0, 5.0, "soju"),

    # ---- Cocktails (rough estimates; recipes vary a lot) ----
    ("Gin and tonic", "Cocktail", 10.0, 6.6, 0.0, 6.6, "cocktail"),
    ("Whisky highball", "Cocktail", 8.0, 0.0, 0.0, 0.0, "cocktail"),
    ("Singapore Sling", "Cocktail", 12.0, 11.0, 0.0, 11.0, "cocktail"),
]

COCKTAIL_SERVING_ML = {"Gin and tonic": 200, "Whisky highball": 150, "Singapore Sling": 160}
