"""Turns a 2x capture into a picture for the review page.

    python3 scripts/teacher-redesign/to-webp.py <in.png> <out.webp> [phone]

A laptop capture (1280 x 800 at scale 2) becomes 1920 x 1200; a phone capture (390 x 844 at scale 2) becomes 585 x 1266. The review
page's <img> tags carry these sizes, so keep them.
"""
import sys

from PIL import Image

src, out = sys.argv[1], sys.argv[2]
size = (585, 1266) if len(sys.argv) > 3 and sys.argv[3] == "phone" else (1920, 1200)
Image.open(src).convert("RGB").resize(size, Image.LANCZOS).save(out, quality=86)
