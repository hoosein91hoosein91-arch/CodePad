# title: سه‌بعدی ۱: شکل‌های چرخان
# desc: اولین صحنهٔ Python 3D؛ مکعب، کره، حلقه و متن. با انگشت/ماوس بچرخان
# cat: 3d
# level: 1
import math
from codepad3d import Scene

s = Scene("Hello 3D", sky="#0b1220", ground="#18222f", grid=True, fog=0.01)
cube = s.box(pos=(0, 1, -4), size=1.4, color="#ff4081")
ball = s.sphere(pos=(3, 1, -4), r=0.7, color="#00e5ff")
ring = s.torus(pos=(-3, 1.2, -4), r=0.8, tube=0.25, color="#ffd740")
s.text("Python 3D", pos=(0, 3.2, -4), size=0.6, color="#7dffb8")
s.camera.mode = "orbit"          # با انگشت بکش تا بچرخد
s.camera.pos = (0, 4, 4)
s.camera.target = (0, 1, -4)
t = 0.0

async def update(dt):
    global t
    t += dt
    cube.rotate(y=60 * dt, x=30 * dt)
    ball.y = 1 + abs(math.sin(t * 2)) * 1.5
    ring.rotate(z=120 * dt)
    s.hud("زمان: %.1f" % t)

await s.run(update)
