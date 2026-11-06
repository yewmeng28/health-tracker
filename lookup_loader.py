"""Robust loader for nutrition_lookup.csv (hand/LLM-produced; names and notes may contain unquoted commas)."""
import csv
import io
from pathlib import Path

COLS = ["serving_g", "energy_kcal", "protein_g", "carbohydrate_g", "total_fat_g", "saturated_fat_g",
        "trans_fat_g", "fibre_g", "sugars_g", "sodium_mg", "cholesterol_mg", "potassium_mg",
        "calcium_mg", "iron_mg", "confidence", "source_name", "source_url", "source_serving_note", "notes"]
NUM = COLS[:14]


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def load_lookup(path, names_by_id):
    """Return ({id: record}, [warnings]). Uses known dish names to realign comma-shifted rows."""
    p = Path(path)
    if not p.exists():
        return {}, []
    text = p.read_text(encoding="utf-8-sig")
    # a row starts at a line beginning with an id; join continuation lines
    rows, warnings = [], []
    for line in text.splitlines()[1:]:
        if line.startswith("food-"):
            rows.append(line)
        elif rows and line.strip():
            rows[-1] += " " + line
    out = {}
    for line in rows:
        fid = line.split(",", 1)[0]
        name = names_by_id.get(fid)
        if name is None:
            warnings.append(f"{fid}: unknown id, skipped")
            continue
        rest = None
        for prefix in (f'{fid},{name},', f'{fid},"{name}",'):
            if line.startswith(prefix):
                rest = line[len(prefix):]
                break
        if rest is None:  # name edited (e.g. trailing ", 1 piece" dropped): skip the name field naively
            parts = next(csv.reader([line]))
            warnings.append(f"{fid}: name differs from dataset, using column order as-is")
            fields = parts[2:]
        else:
            fields = next(csv.reader([rest]))
        if len(fields) > len(COLS):  # unquoted commas inside notes
            fields = fields[:len(COLS) - 1] + [", ".join(fields[len(COLS) - 1:])]
        fields += [""] * (len(COLS) - len(fields))
        rec = dict(zip(COLS, (f.strip() for f in fields)))
        for k in NUM:
            rec[k] = _num(rec[k])
        out[fid] = rec
    return out, warnings


def validate(rec):
    """Return None if usable, else reason string."""
    e, p, c, f = (rec[k] for k in ("energy_kcal", "protein_g", "carbohydrate_g", "total_fat_g"))
    if e is None:
        return "no energy"
    if None not in (p, c, f):
        calc = 4 * p + 4 * c + 9 * f
        if e > 0 and abs(calc - e) / e > 0.35:
            return f"macros ({calc:.0f} kcal) disagree with energy ({e:.0f} kcal)"
    elif any(v is not None for v in (p, c, f)):
        return "partial macros"
    else:
        return "energy without macros"
    return None
