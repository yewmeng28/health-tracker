"""Generate PWA icons (needs Pillow): python3 tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
GREEN, DARK, WHITE = (47, 125, 91), (31, 92, 66), (255, 255, 255)


def draw(size, maskable=False, rounded=True):
    s = size * 4                                    # supersample for smooth edges
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable or not rounded:
        d.rectangle([0, 0, s, s], fill=GREEN)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=GREEN)
    # safe zone: maskable icons keep content within the central 80%
    k = 0.72 if maskable else 0.86
    c = s / 2
    r = s * 0.30 * k / 0.86
    w = int(s * 0.055)
    d.ellipse([c - r, c - r, c + r, c + r], outline=WHITE, width=w)
    pts = [(c - r * 0.45, c + r * 0.02), (c - r * 0.1, c + r * 0.38), (c + r * 0.52, c - r * 0.36)]
    d.line(pts, fill=WHITE, width=w, joint="curve")
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, maskable=True).save(OUT / "maskable-512.png")
draw(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
