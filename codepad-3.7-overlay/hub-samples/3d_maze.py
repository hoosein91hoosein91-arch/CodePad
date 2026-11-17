# title: سه‌بعدی ۴: هزارتوی سکه‌ها
# desc: اول‌شخص؛ همهٔ سکه‌های طلایی را در هزارتو جمع کن (مسابقه با زمان)
# cat: 3d
# level: 3
import math, random, time
from codepad3d import Scene

random.seed(11)
MAZE = [
    "###############",
    "#S..#.....#...#",
    "#.#.#.###.#.#.#",
    "#.#...#...#.#.#",
    "#.#####.###.#.#",
    "#.....#.....#.#",
    "#####.#####.#.#",
    "#...#.....#.#.#",
    "#.#.#####.#.#.#",
    "#.#.......#...#",
    "#.#########.###",
    "#...........#.#",
    "###########.#.#",
    "#...........#.#",
    "###############",
]
s = Scene("Coin Maze", sky="#10101e", ground="#2a2a35", fog=0.05)
s.camera.mode = "fps"
coins = []
for r, row in enumerate(MAZE):
    for c, ch in enumerate(row):
        x, z = c * 2.0, r * 2.0
        if ch == "#":
            s.box(pos=(x, 1.5, z), size=(2, 3, 2), color="#3a5a8c" if (r + c) % 2 else "#2e4a78", solid=True)
        else:
            if ch == "S":
                s.camera.pos = (x, 2, z)
                s.camera.yaw = 180          # برگرد رو به راهرو
            elif random.random() < 0.34:
                coins.append(s.cylinder(pos=(x, 1, z), r=0.35, h=0.1, color="#ffd740", rot=(90, 0, 0)))
s.light(pos=(14, 6, 14), intensity=0.8)
total, got, t0 = len(coins), 0, time.perf_counter()

async def update(dt):
    global got
    px, _, pz = s.camera.pos
    for c in coins[:]:
        c.rotate(y=180 * dt)
        if (c.x - px) ** 2 + (c.z - pz) ** 2 < 0.8:
            c.remove(); coins.remove(c); got += 1
    t = time.perf_counter() - t0
    if coins:
        s.hud("سکه‌ها: %d / %d" % (got, total), "زمان: %.0f ثانیه" % t, "WASD / جوی‌استیک · Space پرش")
    else:
        s.hud("🎉 تمام شد!", "همهٔ %d سکه در %.0f ثانیه" % (total, t))

await s.run(update)
