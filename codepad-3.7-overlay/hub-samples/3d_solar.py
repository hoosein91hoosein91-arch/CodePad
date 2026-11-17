# title: سه‌بعدی ۲: منظومهٔ شمسی
# desc: سیاره‌ها با مدار و ماه؛ نمونهٔ ریاضی حرکت دایره‌ای
# cat: 3d
# level: 2
import math
from codepad3d import Scene

s = Scene("Solar System", sky="#02030a", ground=None, fog=0.0)
s.light(pos=(0, 0, 0), intensity=3, color="#fff2c0")
sun = s.sphere(r=1.8, color="#ffcc33")
planets = []
for name, dist, size, color, speed in [("Mercury", 3.5, .25, "#b5b5b5", 2.4), ("Venus", 5, .4, "#e8c98a", 1.7), ("Earth", 7, .45, "#3b8cff", 1.2),
                                       ("Mars", 9, .35, "#d9553b", 0.9), ("Jupiter", 12.5, 1.0, "#d8b58a", 0.5), ("Saturn", 16, .85, "#e9d9a0", 0.35)]:
    body = s.sphere(r=size, color=color)
    label = s.text(name, size=.35, color="#ffffff")
    planets.append((body, label, dist, speed))
moon = s.sphere(r=.14, color="#dddddd")
s.camera.mode = "orbit"
s.camera.pos = (0, 18, 26)
s.camera.target = (0, 0, 0)
t = 0.0

async def update(dt):
    global t
    t += dt
    sun.rotate(y=10 * dt)
    for body, label, dist, speed in planets:
        a = t * speed * 0.5
        body.pos = (math.cos(a) * dist, 0, math.sin(a) * dist)
        label.pos = (body.x, 1.6, body.z)
    earth = planets[2][0]
    moon.pos = (earth.x + math.cos(t * 4) * 1.0, 0, earth.z + math.sin(t * 4) * 1.0)
    s.hud("منظومهٔ شمسی", "بکش: چرخش · دو انگشت/چرخ: زوم")

await s.run(update)
