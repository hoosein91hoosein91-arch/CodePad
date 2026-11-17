# title: بازی زندگی (Conway)
# desc: خودکارهای سلولی؛ خروجی تصویری بعد از ۱۲۰ نسل
# cat: data
# level: 3
import numpy as np
from PIL import Image
import codepad

rng = np.random.default_rng(3)
g = (rng.random((90, 160)) < 0.28).astype(np.uint8)
def step(g):
    n = sum(np.roll(np.roll(g, i, 0), j, 1) for i in (-1, 0, 1) for j in (-1, 0, 1) if (i, j) != (0, 0))
    return ((n == 3) | ((g == 1) & (n == 2))).astype(np.uint8)
for gen in range(120):
    g = step(g)
img = Image.fromarray((g * 255).astype("uint8")).resize((640, 360), Image.NEAREST).convert("RGB")
codepad.display(img, "Game of Life - generation 120")
print("سلول‌های زنده:", int(g.sum()))
