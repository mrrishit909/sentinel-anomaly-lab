"""Contact sheet: python3 tests/sheet.py out.png scale file1 file2 ... (tiles left to right, wrapped at 4 per row)."""
import sys
from PIL import Image, ImageDraw
out, scale, files = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
ims = []
for f in files:
    im = Image.open(f).convert("RGB")
    im = im.resize((int(im.width * scale), int(im.height * scale)))
    ims.append((f.split("/")[-1], im))
per = 4
rows = [ims[i:i + per] for i in range(0, len(ims), per)]
W = max(sum(i.width + 8 for _, i in r) for r in rows)
H = sum(max(i.height for _, i in r) + 20 for r in rows)
sheet = Image.new("RGB", (W, H), (40, 40, 40))
d = ImageDraw.Draw(sheet)
y = 0
for r in rows:
    x = 0
    for name, im in r:
        sheet.paste(im, (x, y + 16))
        d.text((x + 2, y + 2), name, fill=(255, 255, 255))
        x += im.width + 8
    y += max(i.height for _, i in r) + 20
sheet.save(out)
print(out, sheet.size)
