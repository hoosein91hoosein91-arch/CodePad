# title: سه‌بعدی ۵: توپ‌های فیزیکی
# desc: گرانش، برخورد با زمین و دیوار؛ با کلیک توپ جدید بنداز
# cat: 3d
# level: 3
import random
from codepad3d import Scene

random.seed(5)
s = Scene("Physics Balls", sky="#101830", ground="#2b3548", grid=True)
s.camera.mode = "orbit"
s.camera.pos = (0, 9, 14)
s.camera.target = (0, 2, 0)
S = 7.0
for dx, dz in ((S, 0), (-S, 0), (0, S), (0, -S)):
    s.box(pos=(dx, 1, dz), size=(0.3, 2, 14.3) if dx else (14.3, 2, 0.3), color="#445577", opacity=0.55)

class Ball:
    def __init__(self, x, y, z):
        r = random.uniform(.25, .6)
        self.r, self.v = r, [random.uniform(-3, 3), 0.0, random.uniform(-3, 3)]
        self.e = s.sphere(r=r, pos=(x, y, z), color=random.choice(["#ff4081", "#00e5ff", "#ffd740", "#7dffb8", "#b388ff"]))

balls = [Ball(random.uniform(-4, 4), random.uniform(3, 8), random.uniform(-4, 4)) for _ in range(14)]

@s.on("click")
def drop(info):
    if len(balls) < 60:
        px, py, pz = info["point"]
        balls.append(Ball(px, py + 4, pz))

async def update(dt):
    for b in balls:
        b.v[1] -= 18 * dt
        x, y, z = b.e.pos
        x += b.v[0] * dt; y += b.v[1] * dt; z += b.v[2] * dt
        if y < b.r:
            y, b.v[1] = b.r, -b.v[1] * 0.8
            b.v[0] *= 0.99; b.v[2] *= 0.99
        for i, lim in ((0, x), (2, z)):
            if abs(lim) > S - b.r - 0.15:
                b.v[i] = -b.v[i] * 0.9
        x = max(-S + b.r + .15, min(S - b.r - .15, x)); z = max(-S + b.r + .15, min(S - b.r - .15, z))
        b.e.pos = (x, y, z)
    s.hud("توپ‌ها: %d" % len(balls), "روی زمین بزن تا توپ بیفتد")

await s.run(update)
