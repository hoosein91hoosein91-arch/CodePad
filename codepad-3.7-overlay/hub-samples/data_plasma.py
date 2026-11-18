# title: پلاسمای رنگی (numpy)
# desc: ریاضی ساده → هنر؛ تصویر موج‌های سینوسی
# cat: data
# level: 2
import numpy as np
from PIL import Image
import codepad

W, H = 640, 360
x, y = np.meshgrid(np.linspace(0, 6, W), np.linspace(0, 3.4, H))
v = np.sin(x * 2) + np.sin(y * 3 + x) + np.sin(np.hypot(x - 3, y - 1.7) * 4) + np.sin((x + y) * 2.5)
v = (v + 4) / 8
img = np.stack([255 * np.sin(v * 6.28) ** 2, 255 * np.sin(v * 6.28 + 2) ** 2, 255 * np.sin(v * 6.28 + 4) ** 2], axis=-1)
codepad.display(Image.fromarray(img.astype("uint8")), "Plasma")
