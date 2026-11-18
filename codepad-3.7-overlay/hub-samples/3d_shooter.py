# title: سه‌بعدی ۶: تمرین تیراندازی
# desc: هدف‌های متحرک را با کلیک/تپ بزن؛ امتیاز و زمان ۴۵ ثانیه
# cat: 3d
# level: 3
import math, random, time
from codepad3d import Scene

random.seed(3)
s = Scene("Target Practice", sky="#1a2440", ground="#24324a", fog=0.015)
s.camera.mode = "fps"
s.camera.pos = (0, 2, 6)
for x in (-8, 8):
    s.box(pos=(x, 2, -6), size=(0.5, 4, 14), color="#34415f", solid=True)
s.box(pos=(0, 2, -14), size=(17, 4, 0.5), color="#34415f", solid=True)
targets = []

def spawn():
    t = s.cylinder(r=0.6, h=0.2, pos=(random.uniform(-6, 6), random.uniform(1, 3.5), random.uniform(-12, -2)), color="#ff5252", rot=(90, 0, 0))
    targets.append([t, random.uniform(-1.5, 1.5), random.uniform(0, 6.28)])

for _ in range(5):
    spawn()
score, t0, over = 0, time.perf_counter(), False

@s.on("click")
def shoot(info):
    global score
    e = info["entity"]
    for tg in targets[:]:
        if tg[0] is e:
            tg[0].remove(); targets.remove(tg); score += 10; spawn()

async def update(dt):
    global over
    left = 45 - (time.perf_counter() - t0)
    for tg in targets:
        tg[2] += dt
        tg[0].x += math.sin(tg[2]) * tg[1] * dt
    if left <= 0:
        over = True
        s.hud("زمان تمام شد!", "امتیاز نهایی: %d" % score)
    else:
        s.hud("امتیاز: %d" % score, "زمان: %d" % left, "نشانه بگیر و کلیک/تپ کن")

await s.run(update)
