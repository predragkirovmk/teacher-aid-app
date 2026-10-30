"""Turns the captured app screens into the website's WebP files, two widths each.

    python3 scripts/site-v2-screens.py <capture-dir>

Reads the PNGs from scripts/site-v2-capture.mjs and writes public/site-v2/screens/<name>-<width>.webp:
teacher screens (16:10, for the laptop) at 1800 and 960 wide, student screens (the phone's screen
under its status bar) at 780 and 420 wide.
"""
import sys
from pathlib import Path

from PIL import Image

SIZES = {"t": (1800, 960), "s": (780, 420)}
src = Path(sys.argv[1])
dst = Path(__file__).resolve().parent.parent / "public" / "site-v2" / "screens"
dst.mkdir(parents=True, exist_ok=True)

total = 0
for png in sorted(p for p in src.glob("[ts]-*.png") if p.stem.endswith(("-mk", "-en"))):
    im = Image.open(png).convert("RGB")
    for width in SIZES[png.name[0]]:
        out = dst / f"{png.stem}-{width}.webp"
        im.resize((width, round(im.height * width / im.width)), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
        total += out.stat().st_size
        print(f"{out.name:32} {out.stat().st_size / 1024:6.1f} KB")
print(f"total {total / 1024:.0f} KB")
