// Which nutrients exist, and which ones the user wants to see (Profile → Display).
// Calories are always shown. Hidden nutrients are still tracked for limits and streaks.

export const NUTRIENTS = [
  { key: "protein", field: "protein_g", label: "Protein", short: "Protein", unit: "g", better: "higher" },
  { key: "carbs", field: "carbohydrate_g", label: "Carbohydrate", short: "Carbs", unit: "g" },
  { key: "fat", field: "total_fat_g", label: "Total fat", short: "Fat", unit: "g" },
  { key: "satFat", field: "saturated_fat_g", label: "Saturated fat", short: "Sat fat", unit: "g", better: "lower" },
  { key: "transFat", field: "trans_fat_g", label: "Trans fat", short: "Trans fat", unit: "g", better: "lower" },
  { key: "fibre", field: "fibre_g", label: "Fibre", short: "Fibre", unit: "g", better: "higher" },
  { key: "sugars", field: "sugars_g", label: "Sugars", short: "Sugars", unit: "g", better: "lower" },
  { key: "sodium", field: "sodium_mg", label: "Sodium", short: "Sodium", unit: "mg", better: "lower" },
  { key: "cholesterol", field: "cholesterol_mg", label: "Cholesterol", short: "Cholesterol", unit: "mg", better: "lower" },
  { key: "alcohol", field: "alcohol_g", label: "Alcohol", short: "Alcohol", unit: "g", better: "lower" },
];

export const DEFAULT_PREFS = () => ({ nutrientMode: "all", nutrients: NUTRIENTS.map(n => n.key) });

/** Set of nutrient keys to display. */
export function shownKeys(state) {
  const p = state.prefs;
  return p && p.nutrientMode === "custom" ? new Set(p.nutrients) : new Set(NUTRIENTS.map(n => n.key));
}

export const isFiltered = state => state.prefs?.nutrientMode === "custom";
