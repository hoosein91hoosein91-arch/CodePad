# title: مجموعهٔ ماندلبرو (تصویر)
# desc: تصویر فراکتال با numpy و Pillow؛ در پنل تصویر نمایش داده می‌شود
# cat: data
# level: 3
import numpy as np
from PIL import Image
import codepad

W, H, N = 640, 400, 60
x = np.linspace(-2.2, 1.0, W)[None, :]
y = np.linspace(-1.2, 1.2, H)[:, None]
c = x + 1j * y
z = np.zeros_like(c)
count = np.zeros(c.shape, dtype=np.float32)
for i in range(N):
    z = z * z + c
    alive = np.abs(z) < 2
    count[alive] += 1
    z[~alive] = 2
t = count / N
rgb = np.stack([255 * t ** 0.5, 255 * t ** 1.5, 120 + 135 * np.sin(t * 6)], axis=-1)
img = Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"))
codepad.display(img, "Mandelbrot")
print("تصویر ساخته شد:", img.size)
