"""Composes distinctness-sheet.png at contact-sheet scale (ED #17: 240px-tall frames), 3 x 3:
row 1: real frames of P01, P02, P03 (S00 end)
row 2: P04 sketch, P05 sketch (no evidence frames exist yet), real P03 strata core (S04 p96)
row 3: P06 sketches from real CATS artifacts (S00 D, S05 lab D, S04 58-day strands)
plus the P06 mobile S00 sketch as a narrow tile on the right.
Run: uv run --with pillow python design/sketches/compose_sheet.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).parent
PJ = HERE / "../../.."
tiles = [
    (PJ / "01-atlas-human-mobility/artifacts/evidence/stage-b3/1440x900/06-futures-a-busier.png", "P01 REAL FRAME: STROKED RING OF NODES"),
    (PJ / "02-market-microstructure-lab/artifacts/evidence/stage-a/1440x900/00-s00-t1250.png", "P02 REAL FRAME: ELECTRIC ORB, S00"),
    (PJ / "03-climate-signal-observatory/artifacts/evidence/stage-a/1440x900/01-s00-t4600-end.png", "P03 REAL FRAME: SOLAR GLOBE OF CELLS, S00 END"),
    (PJ / "04-pulse-energy-grid/design/sketches/rose-s00-d.png", "P04 SKETCH (NO FRAMES YET): DAY ROSE, S00"),
    (PJ / "05-economic-atlas/design/sketches/seed-s00-d.png", "P05 SKETCH (NO FRAMES YET): SEED HEAD, S00"),
    (PJ / "03-climate-signal-observatory/artifacts/evidence/stage-a/1440x900/04-s04-p96.png", "P03 REAL FRAME: VERTICAL STRATA CORE, S04"),
    (HERE / "lens-s00-d.png", "P06 SKETCH: THE LENS, S00 (REAL CATS WINDOW 142)"),
    (HERE / "lens-s05-d.png", "P06 SKETCH: THRESHOLD LAB, S05 (REAL SCORES)"),
    (HERE / "strands-s04-d.png", "P06 SKETCH: 58-DAY STRANDS, S04 (REAL OVERVIEW)"),
]
W, H, LAB = 384, 240, 18
rows = 3
m = Image.open(HERE / "lens-s00-m.png").convert("RGB")
mh = rows * (H + LAB) + (rows - 1) * 8 - LAB
mw = round(m.width * mh / m.height)
sheet = Image.new("RGB", (3 * W + 4 * 8 + mw + 8, rows * (H + LAB) + (rows + 1) * 8), "#111")
d = ImageDraw.Draw(sheet)
for i, (p, label) in enumerate(tiles):
    x, y = 8 + (i % 3) * (W + 8), 8 + (i // 3) * (H + LAB + 8)
    sheet.paste(Image.open(p).convert("RGB").resize((W, H), Image.LANCZOS), (x, y + LAB))
    d.text((x + 2, y + 3), label, fill="#ff4c25" if label.startswith("P06") else "#fff")
x = 8 + 3 * (W + 8)
sheet.paste(m.resize((mw, mh), Image.LANCZOS), (x, 8 + LAB))
d.text((x + 2, 11), "P06 S00 M (SKETCH)", fill="#ff4c25")
sheet.save(HERE / "distinctness-sheet.png")
print("sheet", sheet.size)
