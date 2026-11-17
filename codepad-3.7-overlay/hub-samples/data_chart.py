# title: نمودار با Pillow
# desc: رسم نمودار خطی و میله‌ای بدون matplotlib
# cat: data
# level: 3
import math
from PIL import Image, ImageDraw
import codepad

W, H = 640, 360
img = Image.new("RGB", (W, H), (8, 16, 14))
d = ImageDraw.Draw(img)
for i in range(0, W, 64):
    d.line([(i, 0), (i, H)], fill=(20, 40, 34))
for i in range(0, H, 45):
    d.line([(0, i), (W, i)], fill=(20, 40, 34))
pts = [(x, H / 2 - math.sin(x / 40) * 90 * (1 - x / W * 0.4)) for x in range(W)]
d.line(pts, fill=(53, 255, 160), width=3)
pts2 = [(x, H / 2 - math.cos(x / 55) * 60) for x in range(W)]
d.line(pts2, fill=(0, 208, 255), width=2)
for i, v in enumerate([40, 90, 65, 120, 80, 150, 110]):
    x = 40 + i * 85
    d.rectangle([x, H - v, x + 50, H - 8], fill=(255, 207, 90))
codepad.display(img, "Chart")
