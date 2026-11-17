# title: سه‌بعدی ۳: ماینکرافت کوچک
# desc: راه برو (WASD / جوی‌استیک)، با کلیک/تپ بلوک بشکن یا بساز. کلید E: حالت ساخت/شکستن
# cat: 3d
# level: 3
import math, random
from codepad3d import Scene

random.seed(7)
s = Scene("Python Voxel World", sky="#8ec8ff", ground="#4c9a2a", fog=0.012)
s.camera.mode = "fps"
s.camera.pos = (0, 9, 8)

GRASS, DIRT, STONE, WOOD, LEAF, SAND = "#59b02d", "#8b5a2b", "#8a8a8a", "#6b4423", "#2f7d32", "#e8d9a0"
blocks = {}

def put(x, y, z, color):
    if (x, y, z) not in blocks:
        blocks[(x, y, z)] = s.box(pos=(x, y + 0.5, z), size=1, color=color, solid=True)

for x in range(-10, 11):
    for z in range(-10, 11):
        h = 1 + int(2.2 * (1 + math.sin(x * 0.45) * math.cos(z * 0.4)) / 2) + (1 if abs(x) < 4 and abs(z) < 4 else 0)
        for y in range(h):
            put(x, y, z, GRASS if y == h - 1 else (DIRT if y > h - 3 else STONE))
for y in range(1, 4):
    put(3, y + 2, -3, WOOD)
for dx in (-1, 0, 1):
    for dz in (-1, 0, 1):
        put(3 + dx, 6, -3 + dz, LEAF)
put(3, 7, -3, LEAF)

mode = "break"
def refresh():
    s.hud("Python Voxel World", "حالت: %s (کلید E)   بلوک‌ها: %d" % (mode, len(blocks)), "WASD حرکت · Space پرش · کلیک/تپ = %s" % mode)
refresh()

@s.on("key")
def on_key(k, down):
    global mode
    if k == "e" and down:
        mode = "place" if mode == "break" else "break"
        refresh()

@s.on("click")
def on_click(info):
    e = info["entity"]
    if e is None:
        return
    gx, gy, gz = (round(v) for v in (e.x, e.y - 0.5, e.z))
    if mode == "break":
        if (gx, gy, gz) in blocks and len(blocks) > 5:
            blocks.pop((gx, gy, gz)).remove()
    else:
        n = info["normal"]
        put(gx + round(n[0]), gy + round(n[1]), gz + round(n[2]), random.choice([WOOD, SAND, STONE]))
    refresh()

await s.run()
