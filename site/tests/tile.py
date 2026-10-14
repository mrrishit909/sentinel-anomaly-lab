"""python3 tests/tile.py frames_dir out.png cols tile_height : tile all PNGs of a directory into one contact sheet."""
import sys, glob
from PIL import Image
d, out, cols, th = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
fs = sorted(glob.glob(d + "/*.png"))
ims = []
for f in fs:
    im = Image.open(f).convert("RGB")
    ims.append(im.resize((max(1, int(im.width * th / im.height)), th)))
w = max(i.width for i in ims)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 4) + 4, rows * (th + 4) + 4), (40, 40, 40))
for k, im in enumerate(ims):
    sheet.paste(im, (4 + (k % cols) * (w + 4), 4 + (k // cols) * (th + 4)))
sheet.save(out)
print(out, sheet.size, len(ims))
