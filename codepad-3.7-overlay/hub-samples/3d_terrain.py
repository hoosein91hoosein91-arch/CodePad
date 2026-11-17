# title: سه‌بعدی ۷: منظره با ریاضی
# desc: ارتفاع‌های موجی تبدیل به ستون‌های رنگی؛ دوربین مداری
# cat: 3d
# level: 2
import math
from codepad3d import Scene

s = Scene("Terrain", sky="#0b1c2c", ground=None, fog=0.012)
s.light(pos=(10, 20, 10), intensity=1.2)
N = 18
cells = []
for i in range(N):
    for j in range(N):
        x, z = (i - N / 2) * 1.0, (j - N / 2) * 1.0
        h = 2.2 + 1.8 * math.sin(i * 0.45) * math.cos(j * 0.4) + 1.2 * math.sin((i + j) * 0.22)
        hue = max(0.0, min(1.0, (h - 0.2) / 5.0))
        col = "#%02x%02x%02x" % (int(40 + 200 * hue), int(110 + 90 * (1 - abs(hue - .5) * 2)), int(160 - 110 * hue))
        cells.append(s.box(pos=(x, h / 2, z), size=(0.95, h, 0.95), color=col))
s.camera.mode = "orbit"
s.camera.pos = (18, 16, 22)
s.camera.target = (0, 1, 0)
t = 0.0
frame = 0

async def update(dt):
    global t, frame
    t += dt
    frame += 1
    if frame % 3:
        return
    for k, c in enumerate(cells):
        i, j = divmod(k, N)
        h = 2.2 + 1.8 * math.sin(i * 0.45 + t) * math.cos(j * 0.4 - t * .7) + 1.2 * math.sin((i + j) * 0.22 + t * .5)
        c.scale = (1, max(0.2, h) / 2.2, 1)
        c.y = max(0.2, h) / 2
    s.hud("منظرهٔ ریاضی", "بکش تا بچرخد")

await s.run(update)
