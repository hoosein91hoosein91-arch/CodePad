// تولید خودکار از hubsamples؛ نمونه‌های آفلاین هاب CodePad
export const HUB_SAMPLES = [
 {
  "id": "3d_hello",
  "file": "3d_hello.py",
  "ext": "py",
  "cat": "3d",
  "title": "سه‌بعدی ۱: شکل‌های چرخان",
  "desc": "اولین صحنهٔ Python 3D؛ مکعب، کره، حلقه و متن. با انگشت/ماوس بچرخان",
  "level": 1,
  "code": "# title: سه‌بعدی ۱: شکل‌های چرخان\n# desc: اولین صحنهٔ Python 3D؛ مکعب، کره، حلقه و متن. با انگشت/ماوس بچرخان\n# cat: 3d\n# level: 1\nimport math\nfrom codepad3d import Scene\n\ns = Scene(\"Hello 3D\", sky=\"#0b1220\", ground=\"#18222f\", grid=True, fog=0.01)\ncube = s.box(pos=(0, 1, -4), size=1.4, color=\"#ff4081\")\nball = s.sphere(pos=(3, 1, -4), r=0.7, color=\"#00e5ff\")\nring = s.torus(pos=(-3, 1.2, -4), r=0.8, tube=0.25, color=\"#ffd740\")\ns.text(\"Python 3D\", pos=(0, 3.2, -4), size=0.6, color=\"#7dffb8\")\ns.camera.mode = \"orbit\"          # با انگشت بکش تا بچرخد\ns.camera.pos = (0, 4, 4)\ns.camera.target = (0, 1, -4)\nt = 0.0\n\nasync def update(dt):\n    global t\n    t += dt\n    cube.rotate(y=60 * dt, x=30 * dt)\n    ball.y = 1 + abs(math.sin(t * 2)) * 1.5\n    ring.rotate(z=120 * dt)\n    s.hud(\"زمان: %.1f\" % t)\n\nawait s.run(update)\n"
 },
 {
  "id": "3d_maze",
  "file": "3d_maze.py",
  "ext": "py",
  "cat": "3d",
  "title": "سه‌بعدی ۴: هزارتوی سکه‌ها",
  "desc": "اول‌شخص؛ همهٔ سکه‌های طلایی را در هزارتو جمع کن (مسابقه با زمان)",
  "level": 3,
  "code": "# title: سه‌بعدی ۴: هزارتوی سکه‌ها\n# desc: اول‌شخص؛ همهٔ سکه‌های طلایی را در هزارتو جمع کن (مسابقه با زمان)\n# cat: 3d\n# level: 3\nimport math, random, time\nfrom codepad3d import Scene\n\nrandom.seed(11)\nMAZE = [\n    \"###############\",\n    \"#S..#.....#...#\",\n    \"#.#.#.###.#.#.#\",\n    \"#.#...#...#.#.#\",\n    \"#.#####.###.#.#\",\n    \"#.....#.....#.#\",\n    \"#####.#####.#.#\",\n    \"#...#.....#.#.#\",\n    \"#.#.#####.#.#.#\",\n    \"#.#.......#...#\",\n    \"#.#########.###\",\n    \"#...........#.#\",\n    \"###########.#.#\",\n    \"#...........#.#\",\n    \"###############\",\n]\ns = Scene(\"Coin Maze\", sky=\"#10101e\", ground=\"#2a2a35\", fog=0.05)\ns.camera.mode = \"fps\"\ncoins = []\nfor r, row in enumerate(MAZE):\n    for c, ch in enumerate(row):\n        x, z = c * 2.0, r * 2.0\n        if ch == \"#\":\n            s.box(pos=(x, 1.5, z), size=(2, 3, 2), color=\"#3a5a8c\" if (r + c) % 2 else \"#2e4a78\", solid=True)\n        else:\n            if ch == \"S\":\n                s.camera.pos = (x, 2, z)\n                s.camera.yaw = 180          # برگرد رو به راهرو\n            elif random.random() < 0.34:\n                coins.append(s.cylinder(pos=(x, 1, z), r=0.35, h=0.1, color=\"#ffd740\", rot=(90, 0, 0)))\ns.light(pos=(14, 6, 14), intensity=0.8)\ntotal, got, t0 = len(coins), 0, time.perf_counter()\n\nasync def update(dt):\n    global got\n    px, _, pz = s.camera.pos\n    for c in coins[:]:\n        c.rotate(y=180 * dt)\n        if (c.x - px) ** 2 + (c.z - pz) ** 2 < 0.8:\n            c.remove(); coins.remove(c); got += 1\n    t = time.perf_counter() - t0\n    if coins:\n        s.hud(\"سکه‌ها: %d / %d\" % (got, total), \"زمان: %.0f ثانیه\" % t, \"WASD / جوی‌استیک · Space پرش\")\n    else:\n        s.hud(\"🎉 تمام شد!\", \"همهٔ %d سکه در %.0f ثانیه\" % (total, t))\n\nawait s.run(update)\n"
 },
 {
  "id": "3d_physics",
  "file": "3d_physics.py",
  "ext": "py",
  "cat": "3d",
  "title": "سه‌بعدی ۵: توپ‌های فیزیکی",
  "desc": "گرانش، برخورد با زمین و دیوار؛ با کلیک توپ جدید بنداز",
  "level": 3,
  "code": "# title: سه‌بعدی ۵: توپ‌های فیزیکی\n# desc: گرانش، برخورد با زمین و دیوار؛ با کلیک توپ جدید بنداز\n# cat: 3d\n# level: 3\nimport random\nfrom codepad3d import Scene\n\nrandom.seed(5)\ns = Scene(\"Physics Balls\", sky=\"#101830\", ground=\"#2b3548\", grid=True)\ns.camera.mode = \"orbit\"\ns.camera.pos = (0, 9, 14)\ns.camera.target = (0, 2, 0)\nS = 7.0\nfor dx, dz in ((S, 0), (-S, 0), (0, S), (0, -S)):\n    s.box(pos=(dx, 1, dz), size=(0.3, 2, 14.3) if dx else (14.3, 2, 0.3), color=\"#445577\", opacity=0.55)\n\nclass Ball:\n    def __init__(self, x, y, z):\n        r = random.uniform(.25, .6)\n        self.r, self.v = r, [random.uniform(-3, 3), 0.0, random.uniform(-3, 3)]\n        self.e = s.sphere(r=r, pos=(x, y, z), color=random.choice([\"#ff4081\", \"#00e5ff\", \"#ffd740\", \"#7dffb8\", \"#b388ff\"]))\n\nballs = [Ball(random.uniform(-4, 4), random.uniform(3, 8), random.uniform(-4, 4)) for _ in range(14)]\n\n@s.on(\"click\")\ndef drop(info):\n    if len(balls) < 60:\n        px, py, pz = info[\"point\"]\n        balls.append(Ball(px, py + 4, pz))\n\nasync def update(dt):\n    for b in balls:\n        b.v[1] -= 18 * dt\n        x, y, z = b.e.pos\n        x += b.v[0] * dt; y += b.v[1] * dt; z += b.v[2] * dt\n        if y < b.r:\n            y, b.v[1] = b.r, -b.v[1] * 0.8\n            b.v[0] *= 0.99; b.v[2] *= 0.99\n        for i, lim in ((0, x), (2, z)):\n            if abs(lim) > S - b.r - 0.15:\n                b.v[i] = -b.v[i] * 0.9\n        x = max(-S + b.r + .15, min(S - b.r - .15, x)); z = max(-S + b.r + .15, min(S - b.r - .15, z))\n        b.e.pos = (x, y, z)\n    s.hud(\"توپ‌ها: %d\" % len(balls), \"روی زمین بزن تا توپ بیفتد\")\n\nawait s.run(update)\n"
 },
 {
  "id": "3d_shooter",
  "file": "3d_shooter.py",
  "ext": "py",
  "cat": "3d",
  "title": "سه‌بعدی ۶: تمرین تیراندازی",
  "desc": "هدف‌های متحرک را با کلیک/تپ بزن؛ امتیاز و زمان ۴۵ ثانیه",
  "level": 3,
  "code": "# title: سه‌بعدی ۶: تمرین تیراندازی\n# desc: هدف‌های متحرک را با کلیک/تپ بزن؛ امتیاز و زمان ۴۵ ثانیه\n# cat: 3d\n# level: 3\nimport math, random, time\nfrom codepad3d import Scene\n\nrandom.seed(3)\ns = Scene(\"Target Practice\", sky=\"#1a2440\", ground=\"#24324a\", fog=0.015)\ns.camera.mode = \"fps\"\ns.camera.pos = (0, 2, 6)\nfor x in (-8, 8):\n    s.box(pos=(x, 2, -6), size=(0.5, 4, 14), color=\"#34415f\", solid=True)\ns.box(pos=(0, 2, -14), size=(17, 4, 0.5), color=\"#34415f\", solid=True)\ntargets = []\n\ndef spawn():\n    t = s.cylinder(r=0.6, h=0.2, pos=(random.uniform(-6, 6), random.uniform(1, 3.5), random.uniform(-12, -2)), color=\"#ff5252\", rot=(90, 0, 0))\n    targets.append([t, random.uniform(-1.5, 1.5), random.uniform(0, 6.28)])\n\nfor _ in range(5):\n    spawn()\nscore, t0, over = 0, time.perf_counter(), False\n\n@s.on(\"click\")\ndef shoot(info):\n    global score\n    e = info[\"entity\"]\n    for tg in targets[:]:\n        if tg[0] is e:\n            tg[0].remove(); targets.remove(tg); score += 10; spawn()\n\nasync def update(dt):\n    global over\n    left = 45 - (time.perf_counter() - t0)\n    for tg in targets:\n        tg[2] += dt\n        tg[0].x += math.sin(tg[2]) * tg[1] * dt\n    if left <= 0:\n        over = True\n        s.hud(\"زمان تمام شد!\", \"امتیاز نهایی: %d\" % score)\n    else:\n        s.hud(\"امتیاز: %d\" % score, \"زمان: %d\" % left, \"نشانه بگیر و کلیک/تپ کن\")\n\nawait s.run(update)\n"
 },
 {
  "id": "3d_solar",
  "file": "3d_solar.py",
  "ext": "py",
  "cat": "3d",
  "title": "سه‌بعدی ۲: منظومهٔ شمسی",
  "desc": "سیاره‌ها با مدار و ماه؛ نمونهٔ ریاضی حرکت دایره‌ای",
  "level": 2,
  "code": "# title: سه‌بعدی ۲: منظومهٔ شمسی\n# desc: سیاره‌ها با مدار و ماه؛ نمونهٔ ریاضی حرکت دایره‌ای\n# cat: 3d\n# level: 2\nimport math\nfrom codepad3d import Scene\n\ns = Scene(\"Solar System\", sky=\"#02030a\", ground=None, fog=0.0)\ns.light(pos=(0, 0, 0), intensity=3, color=\"#fff2c0\")\nsun = s.sphere(r=1.8, color=\"#ffcc33\")\nplanets = []\nfor name, dist, size, color, speed in [(\"Mercury\", 3.5, .25, \"#b5b5b5\", 2.4), (\"Venus\", 5, .4, \"#e8c98a\", 1.7), (\"Earth\", 7, .45, \"#3b8cff\", 1.2),\n                                       (\"Mars\", 9, .35, \"#d9553b\", 0.9), (\"Jupiter\", 12.5, 1.0, \"#d8b58a\", 0.5), (\"Saturn\", 16, .85, \"#e9d9a0\", 0.35)]:\n    body = s.sphere(r=size, color=color)\n    label = s.text(name, size=.35, color=\"#ffffff\")\n    planets.append((body, label, dist, speed))\nmoon = s.sphere(r=.14, color=\"#dddddd\")\ns.camera.mode = \"orbit\"\ns.camera.pos = (0, 18, 26)\ns.camera.target = (0, 0, 0)\nt = 0.0\n\nasync def update(dt):\n    global t\n    t += dt\n    sun.rotate(y=10 * dt)\n    for body, label, dist, speed in planets:\n        a = t * speed * 0.5\n        body.pos = (math.cos(a) * dist, 0, math.sin(a) * dist)\n        label.pos = (body.x, 1.6, body.z)\n    earth = planets[2][0]\n    moon.pos = (earth.x + math.cos(t * 4) * 1.0, 0, earth.z + math.sin(t * 4) * 1.0)\n    s.hud(\"منظومهٔ شمسی\", \"بکش: چرخش · دو انگشت/چرخ: زوم\")\n\nawait s.run(update)\n"
 },
 {
  "id": "3d_terrain",
  "file": "3d_terrain.py",
  "ext": "py",
  "cat": "3d",
  "title": "سه‌بعدی ۷: منظره با ریاضی",
  "desc": "ارتفاع‌های موجی تبدیل به ستون‌های رنگی؛ دوربین مداری",
  "level": 2,
  "code": "# title: سه‌بعدی ۷: منظره با ریاضی\n# desc: ارتفاع‌های موجی تبدیل به ستون‌های رنگی؛ دوربین مداری\n# cat: 3d\n# level: 2\nimport math\nfrom codepad3d import Scene\n\ns = Scene(\"Terrain\", sky=\"#0b1c2c\", ground=None, fog=0.012)\ns.light(pos=(10, 20, 10), intensity=1.2)\nN = 18\ncells = []\nfor i in range(N):\n    for j in range(N):\n        x, z = (i - N / 2) * 1.0, (j - N / 2) * 1.0\n        h = 2.2 + 1.8 * math.sin(i * 0.45) * math.cos(j * 0.4) + 1.2 * math.sin((i + j) * 0.22)\n        hue = max(0.0, min(1.0, (h - 0.2) / 5.0))\n        col = \"#%02x%02x%02x\" % (int(40 + 200 * hue), int(110 + 90 * (1 - abs(hue - .5) * 2)), int(160 - 110 * hue))\n        cells.append(s.box(pos=(x, h / 2, z), size=(0.95, h, 0.95), color=col))\ns.camera.mode = \"orbit\"\ns.camera.pos = (18, 16, 22)\ns.camera.target = (0, 1, 0)\nt = 0.0\nframe = 0\n\nasync def update(dt):\n    global t, frame\n    t += dt\n    frame += 1\n    if frame % 3:\n        return\n    for k, c in enumerate(cells):\n        i, j = divmod(k, N)\n        h = 2.2 + 1.8 * math.sin(i * 0.45 + t) * math.cos(j * 0.4 - t * .7) + 1.2 * math.sin((i + j) * 0.22 + t * .5)\n        c.scale = (1, max(0.2, h) / 2.2, 1)\n        c.y = max(0.2, h) / 2\n    s.hud(\"منظرهٔ ریاضی\", \"بکش تا بچرخد\")\n\nawait s.run(update)\n"
 },
 {
  "id": "3d_voxel",
  "file": "3d_voxel.py",
  "ext": "py",
  "cat": "3d",
  "title": "سه‌بعدی ۳: ماینکرافت کوچک",
  "desc": "راه برو (WASD / جوی‌استیک)، با کلیک/تپ بلوک بشکن یا بساز. کلید E: حالت ساخت/شکستن",
  "level": 3,
  "code": "# title: سه‌بعدی ۳: ماینکرافت کوچک\n# desc: راه برو (WASD / جوی‌استیک)، با کلیک/تپ بلوک بشکن یا بساز. کلید E: حالت ساخت/شکستن\n# cat: 3d\n# level: 3\nimport math, random\nfrom codepad3d import Scene\n\nrandom.seed(7)\ns = Scene(\"Python Voxel World\", sky=\"#8ec8ff\", ground=\"#4c9a2a\", fog=0.012)\ns.camera.mode = \"fps\"\ns.camera.pos = (0, 9, 8)\n\nGRASS, DIRT, STONE, WOOD, LEAF, SAND = \"#59b02d\", \"#8b5a2b\", \"#8a8a8a\", \"#6b4423\", \"#2f7d32\", \"#e8d9a0\"\nblocks = {}\n\ndef put(x, y, z, color):\n    if (x, y, z) not in blocks:\n        blocks[(x, y, z)] = s.box(pos=(x, y + 0.5, z), size=1, color=color, solid=True)\n\nfor x in range(-10, 11):\n    for z in range(-10, 11):\n        h = 1 + int(2.2 * (1 + math.sin(x * 0.45) * math.cos(z * 0.4)) / 2) + (1 if abs(x) < 4 and abs(z) < 4 else 0)\n        for y in range(h):\n            put(x, y, z, GRASS if y == h - 1 else (DIRT if y > h - 3 else STONE))\nfor y in range(1, 4):\n    put(3, y + 2, -3, WOOD)\nfor dx in (-1, 0, 1):\n    for dz in (-1, 0, 1):\n        put(3 + dx, 6, -3 + dz, LEAF)\nput(3, 7, -3, LEAF)\n\nmode = \"break\"\ndef refresh():\n    s.hud(\"Python Voxel World\", \"حالت: %s (کلید E)   بلوک‌ها: %d\" % (mode, len(blocks)), \"WASD حرکت · Space پرش · کلیک/تپ = %s\" % mode)\nrefresh()\n\n@s.on(\"key\")\ndef on_key(k, down):\n    global mode\n    if k == \"e\" and down:\n        mode = \"place\" if mode == \"break\" else \"break\"\n        refresh()\n\n@s.on(\"click\")\ndef on_click(info):\n    e = info[\"entity\"]\n    if e is None:\n        return\n    gx, gy, gz = (round(v) for v in (e.x, e.y - 0.5, e.z))\n    if mode == \"break\":\n        if (gx, gy, gz) in blocks and len(blocks) > 5:\n            blocks.pop((gx, gy, gz)).remove()\n    else:\n        n = info[\"normal\"]\n        put(gx + round(n[0]), gy + round(n[1]), gz + round(n[2]), random.choice([WOOD, SAND, STONE]))\n    refresh()\n\nawait s.run()\n"
 },
 {
  "id": "basics_classes",
  "file": "basics_classes.py",
  "ext": "py",
  "cat": "basics",
  "title": "کلاس‌ها: حساب بانکی",
  "desc": "شی‌گرایی، استثنا و __repr__",
  "level": 2,
  "code": "# title: کلاس‌ها: حساب بانکی\n# desc: شی‌گرایی، استثنا و __repr__\n# cat: basics\n# level: 2\nclass InsufficientFunds(Exception):\n    pass\n\nclass Account:\n    def __init__(self, owner, balance=0):\n        self.owner, self.balance, self.history = owner, balance, []\n\n    def deposit(self, amount):\n        self.balance += amount\n        self.history.append((\"deposit\", amount))\n\n    def withdraw(self, amount):\n        if amount > self.balance:\n            raise InsufficientFunds(f\"موجودی {self.balance} کافی نیست\")\n        self.balance -= amount\n        self.history.append((\"withdraw\", amount))\n\n    def __repr__(self):\n        return f\"<Account {self.owner}: {self.balance}>\"\n\nacc = Account(\"علی\", 100)\nacc.deposit(50)\ntry:\n    acc.withdraw(500)\nexcept InsufficientFunds as e:\n    print(\"خطا:\", e)\nacc.withdraw(30)\nprint(acc, acc.history)\n"
 },
 {
  "id": "basics_fizzbuzz",
  "file": "basics_fizzbuzz.py",
  "ext": "py",
  "cat": "basics",
  "title": "فیزباز و حلقه‌ها",
  "desc": "شرط‌ها، باقی‌مانده و لیست‌های فشرده",
  "level": 1,
  "code": "# title: فیزباز و حلقه‌ها\n# desc: شرط‌ها، باقی‌مانده و لیست‌های فشرده\n# cat: basics\n# level: 1\nfor n in range(1, 31):\n    print(\"FizzBuzz\" if n % 15 == 0 else \"Fizz\" if n % 3 == 0 else \"Buzz\" if n % 5 == 0 else n)\nsquares = [n * n for n in range(1, 11) if n % 2 == 0]\nprint(\"مربع‌های زوج:\", squares)\nprint(\"مجموع:\", sum(squares))\n"
 },
 {
  "id": "basics_hello",
  "file": "basics_hello.py",
  "ext": "py",
  "cat": "basics",
  "title": "سلام دنیا + ورودی",
  "desc": "اولین برنامه: ورودی گرفتن، متن فرمت‌شده و حلقهٔ ساده",
  "level": 1,
  "code": "# title: سلام دنیا + ورودی\n# desc: اولین برنامه: ورودی گرفتن، متن فرمت‌شده و حلقهٔ ساده\n# cat: basics\n# level: 1\nname = input(\"اسمت چیه؟ \") or \"دوست من\"\nprint(f\"سلام {name}! 👋\")\nfor i in range(1, 6):\n    print(\"⭐\" * i)\nage = int(input(\"چند سالته؟ \") or 18)\nprint(f\"سال بعد {age + 1} ساله می‌شی.\")\n"
 },
 {
  "id": "basics_primes",
  "file": "basics_primes.py",
  "ext": "py",
  "cat": "basics",
  "title": "اعداد اول و غربال",
  "desc": "غربال اراتوستن، فاکتورگیری و عدد کامل",
  "level": 2,
  "code": "# title: اعداد اول و غربال\n# desc: غربال اراتوستن، فاکتورگیری و عدد کامل\n# cat: basics\n# level: 2\ndef sieve(n):\n    flags = [True] * (n + 1)\n    flags[0:2] = [False, False]\n    for i in range(2, int(n ** 0.5) + 1):\n        if flags[i]:\n            flags[i * i::i] = [False] * len(flags[i * i::i])\n    return [i for i, ok in enumerate(flags) if ok]\n\ndef factors(n):\n    out, d = [], 2\n    while d * d <= n:\n        while n % d == 0:\n            out.append(d); n //= d\n        d += 1\n    return out + ([n] if n > 1 else [])\n\np = sieve(100000)\nprint(\"تعداد اول‌ها تا ۱۰۰۰۰۰:\", len(p), \"| آخرین:\", p[-1])\nprint(\"فاکتورهای 360360:\", factors(360360))\nprint(\"اعداد کامل زیر 10000:\", [n for n in range(2, 10000) if sum(d for d in range(1, n) if n % d == 0) == n])\n"
 },
 {
  "id": "basics_recursion",
  "file": "basics_recursion.py",
  "ext": "py",
  "cat": "basics",
  "title": "برج هانوی و بازگشت",
  "desc": "توابع بازگشتی: هانوی، فیبوناچی با کش و جایگشت",
  "level": 2,
  "code": "# title: برج هانوی و بازگشت\n# desc: توابع بازگشتی: هانوی، فیبوناچی با کش و جایگشت\n# cat: basics\n# level: 2\nfrom functools import lru_cache\nfrom itertools import permutations\n\ndef hanoi(n, a=\"A\", b=\"B\", c=\"C\"):\n    if n == 0:\n        return 0\n    return hanoi(n - 1, a, c, b) + 1 + hanoi(n - 1, c, b, a)\n\n@lru_cache(maxsize=None)\ndef fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint(\"حرکت‌های هانوی با ۱۰ دیسک:\", hanoi(10))\nprint(\"فیبوناچی ۹۰:\", fib(90))\nprint(\"جایگشت‌های abc:\", [\"\".join(p) for p in permutations(\"abc\")])\n"
 },
 {
  "id": "basics_sorting",
  "file": "basics_sorting.py",
  "ext": "py",
  "cat": "basics",
  "title": "الگوریتم‌های مرتب‌سازی",
  "desc": "حبابی، ادغام و سریع؛ مقایسهٔ زمان اجرا",
  "level": 3,
  "code": "# title: الگوریتم‌های مرتب‌سازی\n# desc: حبابی، ادغام و سریع؛ مقایسهٔ زمان اجرا\n# cat: basics\n# level: 3\nimport random, time\n\ndef bubble(a):\n    a = a[:]\n    for i in range(len(a)):\n        for j in range(len(a) - 1 - i):\n            if a[j] > a[j + 1]:\n                a[j], a[j + 1] = a[j + 1], a[j]\n    return a\n\ndef merge_sort(a):\n    if len(a) < 2:\n        return a\n    m = len(a) // 2\n    l, r = merge_sort(a[:m]), merge_sort(a[m:])\n    out = []\n    while l and r:\n        out.append(l.pop(0) if l[0] <= r[0] else r.pop(0))\n    return out + l + r\n\ndef quick(a):\n    if len(a) < 2:\n        return a\n    p = a[len(a) // 2]\n    return quick([x for x in a if x < p]) + [x for x in a if x == p] + quick([x for x in a if x > p])\n\ndata = [random.randint(0, 9999) for _ in range(1500)]\nfor f in (bubble, merge_sort, quick, sorted):\n    t = time.perf_counter()\n    assert f(data) == sorted(data)\n    print(f\"{f.__name__:<11} {(time.perf_counter() - t) * 1000:8.1f} ms\")\n"
 },
 {
  "id": "data_chart",
  "file": "data_chart.py",
  "ext": "py",
  "cat": "data",
  "title": "نمودار با Pillow",
  "desc": "رسم نمودار خطی و میله‌ای بدون matplotlib",
  "level": 3,
  "code": "# title: نمودار با Pillow\n# desc: رسم نمودار خطی و میله‌ای بدون matplotlib\n# cat: data\n# level: 3\nimport math\nfrom PIL import Image, ImageDraw\nimport codepad\n\nW, H = 640, 360\nimg = Image.new(\"RGB\", (W, H), (8, 16, 14))\nd = ImageDraw.Draw(img)\nfor i in range(0, W, 64):\n    d.line([(i, 0), (i, H)], fill=(20, 40, 34))\nfor i in range(0, H, 45):\n    d.line([(0, i), (W, i)], fill=(20, 40, 34))\npts = [(x, H / 2 - math.sin(x / 40) * 90 * (1 - x / W * 0.4)) for x in range(W)]\nd.line(pts, fill=(53, 255, 160), width=3)\npts2 = [(x, H / 2 - math.cos(x / 55) * 60) for x in range(W)]\nd.line(pts2, fill=(0, 208, 255), width=2)\nfor i, v in enumerate([40, 90, 65, 120, 80, 150, 110]):\n    x = 40 + i * 85\n    d.rectangle([x, H - v, x + 50, H - 8], fill=(255, 207, 90))\ncodepad.display(img, \"Chart\")\n"
 },
 {
  "id": "data_life",
  "file": "data_life.py",
  "ext": "py",
  "cat": "data",
  "title": "بازی زندگی (Conway)",
  "desc": "خودکارهای سلولی؛ خروجی تصویری بعد از ۱۲۰ نسل",
  "level": 3,
  "code": "# title: بازی زندگی (Conway)\n# desc: خودکارهای سلولی؛ خروجی تصویری بعد از ۱۲۰ نسل\n# cat: data\n# level: 3\nimport numpy as np\nfrom PIL import Image\nimport codepad\n\nrng = np.random.default_rng(3)\ng = (rng.random((90, 160)) < 0.28).astype(np.uint8)\ndef step(g):\n    n = sum(np.roll(np.roll(g, i, 0), j, 1) for i in (-1, 0, 1) for j in (-1, 0, 1) if (i, j) != (0, 0))\n    return ((n == 3) | ((g == 1) & (n == 2))).astype(np.uint8)\nfor gen in range(120):\n    g = step(g)\nimg = Image.fromarray((g * 255).astype(\"uint8\")).resize((640, 360), Image.NEAREST).convert(\"RGB\")\ncodepad.display(img, \"Game of Life - generation 120\")\nprint(\"سلول‌های زنده:\", int(g.sum()))\n"
 },
 {
  "id": "data_mandelbrot",
  "file": "data_mandelbrot.py",
  "ext": "py",
  "cat": "data",
  "title": "مجموعهٔ ماندلبرو (تصویر)",
  "desc": "تصویر فراکتال با numpy و Pillow؛ در پنل تصویر نمایش داده می‌شود",
  "level": 3,
  "code": "# title: مجموعهٔ ماندلبرو (تصویر)\n# desc: تصویر فراکتال با numpy و Pillow؛ در پنل تصویر نمایش داده می‌شود\n# cat: data\n# level: 3\nimport numpy as np\nfrom PIL import Image\nimport codepad\n\nW, H, N = 640, 400, 60\nx = np.linspace(-2.2, 1.0, W)[None, :]\ny = np.linspace(-1.2, 1.2, H)[:, None]\nc = x + 1j * y\nz = np.zeros_like(c)\ncount = np.zeros(c.shape, dtype=np.float32)\nfor i in range(N):\n    z = z * z + c\n    alive = np.abs(z) < 2\n    count[alive] += 1\n    z[~alive] = 2\nt = count / N\nrgb = np.stack([255 * t ** 0.5, 255 * t ** 1.5, 120 + 135 * np.sin(t * 6)], axis=-1)\nimg = Image.fromarray(np.clip(rgb, 0, 255).astype(\"uint8\"))\ncodepad.display(img, \"Mandelbrot\")\nprint(\"تصویر ساخته شد:\", img.size)\n"
 },
 {
  "id": "data_numpy",
  "file": "data_numpy.py",
  "ext": "py",
  "cat": "data",
  "title": "numpy: ماتریس و آمار",
  "desc": "ضرب ماتریس، حل دستگاه، و آمار تصادفی",
  "level": 3,
  "code": "# title: numpy: ماتریس و آمار\n# desc: ضرب ماتریس، حل دستگاه، و آمار تصادفی\n# cat: data\n# level: 3\nimport numpy as np\nA = np.array([[2.0, 1, -1], [-3, -1, 2], [-2, 1, 2]])\nb = np.array([8.0, -11, -3])\nx = np.linalg.solve(A, b)\nprint(\"جواب دستگاه:\", x.round(3), \"| درستی:\", np.allclose(A @ x, b))\nprint(\"دترمینان:\", round(np.linalg.det(A), 3))\nrng = np.random.default_rng(1)\ns = rng.normal(100, 15, 10000)\nprint(f\"میانگین {s.mean():.2f}  انحراف {s.std():.2f}  صدک ۹۰: {np.percentile(s, 90):.1f}\")\nprint(\"هیستوگرام:\", np.histogram(s, bins=8)[0])\n"
 },
 {
  "id": "data_plasma",
  "file": "data_plasma.py",
  "ext": "py",
  "cat": "data",
  "title": "پلاسمای رنگی (numpy)",
  "desc": "ریاضی ساده → هنر؛ تصویر موج‌های سینوسی",
  "level": 2,
  "code": "# title: پلاسمای رنگی (numpy)\n# desc: ریاضی ساده → هنر؛ تصویر موج‌های سینوسی\n# cat: data\n# level: 2\nimport numpy as np\nfrom PIL import Image\nimport codepad\n\nW, H = 640, 360\nx, y = np.meshgrid(np.linspace(0, 6, W), np.linspace(0, 3.4, H))\nv = np.sin(x * 2) + np.sin(y * 3 + x) + np.sin(np.hypot(x - 3, y - 1.7) * 4) + np.sin((x + y) * 2.5)\nv = (v + 4) / 8\nimg = np.stack([255 * np.sin(v * 6.28) ** 2, 255 * np.sin(v * 6.28 + 2) ** 2, 255 * np.sin(v * 6.28 + 4) ** 2], axis=-1)\ncodepad.display(Image.fromarray(img.astype(\"uint8\")), \"Plasma\")\n"
 },
 {
  "id": "games_guess",
  "file": "games_guess.py",
  "ext": "py",
  "cat": "games",
  "title": "حدس عدد",
  "desc": "بازی کنسولی با راهنمایی بالا/پایین و امتیاز",
  "level": 1,
  "code": "# title: حدس عدد\n# desc: بازی کنسولی با راهنمایی بالا/پایین و امتیاز\n# cat: games\n# level: 1\nimport random\nsecret = random.randint(1, 100)\ntries = 0\nprint(\"یک عدد بین ۱ تا ۱۰۰ حدس بزن! (۷ فرصت داری)\")\nwhile tries < 7:\n    try:\n        g = int(input(f\"حدس {tries + 1}: \"))\n    except ValueError:\n        print(\"عدد وارد کن.\"); continue\n    tries += 1\n    if g == secret:\n        print(f\"🎉 درست بود! امتیاز: {(8 - tries) * 100}\")\n        break\n    print(\"بالاتر ⬆️\" if g < secret else \"پایین‌تر ⬇️\")\nelse:\n    print(\"باختی؛ عدد\", secret, \"بود.\")\n"
 },
 {
  "id": "games_hangman",
  "file": "games_hangman.py",
  "ext": "py",
  "cat": "games",
  "title": "مرد حلق‌آویز",
  "desc": "کلمه‌های برنامه‌نویسی را حدس بزن",
  "level": 2,
  "code": "# title: مرد حلق‌آویز\n# desc: کلمه‌های برنامه‌نویسی را حدس بزن\n# cat: games\n# level: 2\nimport random\nwords = [\"python\", \"variable\", \"function\", \"network\", \"kernel\", \"compiler\", \"terminal\", \"algorithm\", \"binary\", \"pointer\"]\nword, found, wrong = random.choice(words), set(), set()\nwhile len(wrong) < 6 and set(word) - found:\n    print(\"\\n\" + \" \".join(c if c in found else \"_\" for c in word), \"| اشتباه:\", \" \".join(sorted(wrong)) or \"-\")\n    g = input(\"حرف: \").lower()[:1]\n    if not g.isalpha():\n        continue\n    (found if g in word else wrong).add(g)\nprint(\"\\n🎉 برنده شدی!\" if not set(word) - found else \"\\n💀 باختی؛ کلمه:\", word)\n"
 },
 {
  "id": "games_rps",
  "file": "games_rps.py",
  "ext": "py",
  "cat": "games",
  "title": "سنگ کاغذ قیچی",
  "desc": "بازی با کامپیوتر؛ پایان با اولین ۳ برد",
  "level": 1,
  "code": "# title: سنگ کاغذ قیچی\n# desc: بازی با کامپیوتر؛ پایان با اولین ۳ برد\n# cat: games\n# level: 1\nimport random\nbeats = {\"سنگ\": \"قیچی\", \"کاغذ\": \"سنگ\", \"قیچی\": \"کاغذ\"}\nscore = [0, 0]\nwhile max(score) < 3:\n    me = input(\"سنگ / کاغذ / قیچی؟ \").strip()\n    if me not in beats:\n        print(\"یکی از سه گزینه را بنویس.\"); continue\n    cpu = random.choice(list(beats))\n    if me == cpu:\n        r = \"مساوی\"\n    elif beats[me] == cpu:\n        r = \"بردی!\"; score[0] += 1\n    else:\n        r = \"باختی\"; score[1] += 1\n    print(f\"تو: {me} | کامپیوتر: {cpu} → {r}   [{score[0]}-{score[1]}]\")\nprint(\"برنده:\", \"تو 🏆\" if score[0] > score[1] else \"کامپیوتر 🤖\")\n"
 },
 {
  "id": "games_tictactoe",
  "file": "games_tictactoe.py",
  "ext": "py",
  "cat": "games",
  "title": "دوز (دو نفره)",
  "desc": "خانه‌ها را ۱ تا ۹ بزن؛ تشخیص برد و مساوی",
  "level": 2,
  "code": "# title: دوز (دو نفره)\n# desc: خانه‌ها را ۱ تا ۹ بزن؛ تشخیص برد و مساوی\n# cat: games\n# level: 2\nboard = [\" \"] * 9\nwins = [(0,1,2),(3,4,5),(6,7,8),(0,3,6),(1,4,7),(2,5,8),(0,4,8),(2,4,6)]\ndef show():\n    for r in range(3):\n        print(\" | \".join(board[r*3:r*3+3]))\n        if r < 2: print(\"--+---+--\")\nplayer = \"X\"\nfor turn in range(9):\n    show()\n    while True:\n        s = input(f\"\\nنوبت {player} (۱-۹): \")\n        if s.isdigit() and 1 <= int(s) <= 9 and board[int(s)-1] == \" \":\n            board[int(s)-1] = player; break\n        print(\"خانهٔ نامعتبر.\")\n    if any(all(board[i] == player for i in w) for w in wins):\n        show(); print(f\"\\n🏆 {player} برد!\"); break\n    player = \"O\" if player == \"X\" else \"X\"\nelse:\n    show(); print(\"\\nمساوی!\")\n"
 },
 {
  "id": "html_chart_dashboard",
  "file": "html_chart_dashboard.html",
  "ext": "html",
  "cat": "jslib",
  "title": "JS نمودار: Chart.js آفلاین",
  "desc": "داشبورد با نمودار خطی و دونات که زنده تغییر می‌کند",
  "level": 2,
  "code": "<!-- title: JS نمودار: Chart.js آفلاین\ndesc: داشبورد با نمودار خطی و دونات که زنده تغییر می‌کند\ncat: jslib\nlevel: 2 -->\n<!doctype html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>body{margin:0;background:#070d0b;color:#d9ffe9;font-family:system-ui;padding:14px}.g{display:grid;grid-template-columns:2fr 1fr;gap:12px}@media(max-width:700px){.g{grid-template-columns:1fr}}.c{background:#0c1814;border:1px solid #17382b;border-radius:12px;padding:10px}</style></head><body>\n<h3>Live dashboard</h3><div class=\"g\"><div class=\"c\"><canvas id=\"a\"></canvas></div><div class=\"c\"><canvas id=\"b\"></canvas></div></div>\n<script src=\"lib:chart\"></script>\n<script>\nconst labels = Array.from({ length: 20 }, (_, i) => i), data = labels.map(() => 50 + Math.random() * 30);\nconst line = new Chart(document.getElementById('a'), { type: 'line', data: { labels, datasets: [{ label: 'CPU %', data, borderColor: '#35ffa0', backgroundColor: 'rgba(53,255,160,.15)', fill: true, tension: .35 }] }, options: { animation: false, scales: { y: { min: 0, max: 100 } } } });\nnew Chart(document.getElementById('b'), { type: 'doughnut', data: { labels: ['Python', 'JS', 'HTML'], datasets: [{ data: [55, 30, 15], backgroundColor: ['#35ffa0', '#00d0ff', '#ffcf5a'] }] } });\nsetInterval(() => { data.push(Math.max(5, Math.min(98, data[data.length - 1] + (Math.random() - .5) * 18))); data.shift(); line.update(); }, 500);\n</script></body></html>\n"
 },
 {
  "id": "html_matter_physics",
  "file": "html_matter_physics.html",
  "ext": "html",
  "cat": "jslib",
  "title": "JS فیزیک: matter.js آفلاین",
  "desc": "اجسام فیزیکی دو‌بعدی؛ با تپ جعبه و توپ اضافه کن",
  "level": 2,
  "code": "<!-- title: JS فیزیک: matter.js آفلاین\ndesc: اجسام فیزیکی دو‌بعدی؛ با تپ جعبه و توپ اضافه کن\ncat: jslib\nlevel: 2 -->\n<!doctype html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>html,body{margin:0;background:#070c10;overflow:hidden}canvas{display:block}</style></head><body>\n<script src=\"lib:matter\"></script>\n<script>\nconst { Engine, Render, Runner, Bodies, Composite, Mouse, MouseConstraint, Events } = Matter;\nconst eng = Engine.create(), W = innerWidth, H = innerHeight;\nconst render = Render.create({ element: document.body, engine: eng, options: { width: W, height: H, wireframes: false, background: '#070c10' } });\nComposite.add(eng.world, [Bodies.rectangle(W / 2, H + 25, W, 50, { isStatic: true }), Bodies.rectangle(-25, H / 2, 50, H, { isStatic: true }), Bodies.rectangle(W + 25, H / 2, 50, H, { isStatic: true })]);\nconst colors = ['#35ffa0', '#00d0ff', '#ffcf5a', '#ff5c8a', '#b388ff'];\nfunction add(x, y) { const c = colors[Math.floor(Math.random() * colors.length)]; Composite.add(eng.world, Math.random() < 0.5 ? Bodies.circle(x, y, 14 + Math.random() * 20, { restitution: 0.7, render: { fillStyle: c } }) : Bodies.rectangle(x, y, 30 + Math.random() * 40, 30 + Math.random() * 40, { restitution: 0.4, render: { fillStyle: c } })); }\nfor (let i = 0; i < 25; i++) add(Math.random() * W, Math.random() * H / 2);\nconst mouse = Mouse.create(render.canvas); Composite.add(eng.world, MouseConstraint.create(eng, { mouse, constraint: { render: { visible: false } } }));\nrender.canvas.addEventListener('dblclick', e => add(e.clientX, e.clientY)); render.canvas.addEventListener('touchstart', e => add(e.touches[0].clientX, e.touches[0].clientY), { passive: true });\nRender.run(render); Runner.run(Runner.create(), eng);\n</script></body></html>\n"
 },
 {
  "id": "html_p5_sketch",
  "file": "html_p5_sketch.html",
  "ext": "html",
  "cat": "jslib",
  "title": "JS گرافیک: p5.js آفلاین",
  "desc": "ذرات رنگی که دنبال انگشت/ماوس می‌آیند (با lib:p5)",
  "level": 1,
  "code": "<!-- title: JS گرافیک: p5.js آفلاین\ndesc: ذرات رنگی که دنبال انگشت/ماوس می‌آیند (با lib:p5)\ncat: jslib\nlevel: 1 -->\n<!doctype html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>html,body{margin:0;background:#050a0c;overflow:hidden}</style></head><body>\n<script src=\"lib:p5\"></script>\n<script>\nlet ps = [];\nfunction setup() { createCanvas(windowWidth, windowHeight); colorMode(HSB, 360, 100, 100, 1); noStroke(); }\nfunction windowResized() { resizeCanvas(windowWidth, windowHeight); }\nfunction draw() {\n  background(200, 40, 4, 0.25);\n  if (mouseIsPressed || frameCount % 3 === 0) for (let i = 0; i < 4; i++) ps.push({ x: mouseX || width / 2, y: mouseY || height / 2, vx: random(-3, 3), vy: random(-3, 3), life: 1, h: (frameCount * 2 + i * 20) % 360 });\n  ps = ps.filter(p => p.life > 0);\n  for (const p of ps) { fill(p.h, 80, 100, p.life); circle(p.x, p.y, 6 + 14 * p.life); p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.012; }\n  fill(0, 0, 100, 0.8); textSize(14); text('p5.js · particles: ' + ps.length, 12, 22);\n}\n</script></body></html>\n"
 },
 {
  "id": "html_three_cube",
  "file": "html_three_cube.html",
  "ext": "html",
  "cat": "jslib",
  "title": "JS سه‌بعدی: three.js آفلاین",
  "desc": "با <script src=\"lib:three\"> بدون اینترنت؛ مکعب‌های نورانی با کنترل لمسی",
  "level": 2,
  "code": "<!-- title: JS سه‌بعدی: three.js آفلاین\ndesc: با <script src=\"lib:three\"> بدون اینترنت؛ مکعب‌های نورانی با کنترل لمسی\ncat: jslib\nlevel: 2 -->\n<!doctype html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>html,body{margin:0;height:100%;background:#04070d;overflow:hidden}#t{position:fixed;left:12px;top:10px;color:#8cffc0;font:14px system-ui}</style></head>\n<body><div id=\"t\">three.js · بکش تا بچرخد · دو انگشت: زوم</div>\n<script src=\"lib:three\"></script>\n<script>\nconst scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x04070d, 0.035);\nconst cam = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 200); cam.position.set(0, 3, 9);\nconst r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);\nscene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.8));\nconst light = new THREE.PointLight(0x35ffa0, 60, 40); light.position.set(0, 4, 2); scene.add(light);\nconst cubes = [];\nfor (let i = 0; i < 40; i++) {\n  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 40, 0.8, 0.55), roughness: 0.4, metalness: 0.3 }));\n  m.position.set((Math.random() - 0.5) * 18, Math.random() * 5, (Math.random() - 0.5) * 18 - 4); scene.add(m); cubes.push(m);\n}\nconst floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0a1a16 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);\nconst ctl = new THREE.OrbitControls(cam, r.domElement); ctl.target.set(0, 1.5, -3); ctl.enableDamping = true;\naddEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight); });\n(function loop(t) { requestAnimationFrame(loop); cubes.forEach((c, i) => { c.rotation.x += 0.01 + i * 0.0002; c.rotation.y += 0.015; c.position.y += Math.sin(t / 700 + i) * 0.004; }); light.position.x = Math.sin(t / 900) * 8; ctl.update(); r.render(scene, cam); })(0);\n</script></body></html>\n"
 },
 {
  "id": "sec_encode",
  "file": "sec_encode.py",
  "ext": "py",
  "cat": "security",
  "title": "کدگذار: Base64 / Hex / ROT13 / سزار",
  "desc": "تبدیل‌های رایج در CTF و تحلیل بدافزار",
  "level": 2,
  "code": "# title: کدگذار: Base64 / Hex / ROT13 / سزار\n# desc: تبدیل‌های رایج در CTF و تحلیل بدافزار\n# cat: security\n# level: 2\nimport base64, binascii, codecs, string\nmsg = input(\"متن: \") or \"CodePad Cyber Lab\"\nprint(\"Base64 :\", base64.b64encode(msg.encode()).decode())\nprint(\"Base32 :\", base64.b32encode(msg.encode()).decode())\nprint(\"Hex    :\", binascii.hexlify(msg.encode()).decode())\nprint(\"ROT13  :\", codecs.encode(msg, \"rot13\"))\nprint(\"Binary :\", \" \".join(f\"{b:08b}\" for b in msg.encode()[:6]), \"…\")\n\ndef caesar(s, k):\n    a = string.ascii_lowercase\n    return s.lower().translate(str.maketrans(a, a[k:] + a[:k]))\nsecret = caesar(\"meet me at the harbor\", 7)\nprint(\"\\nسزار ۷:\", secret)\nprint(\"شکستن با ۲۵ کلید:\")\nfor k in range(26):\n    cand = caesar(secret, -k)\n    if \"meet\" in cand:\n        print(f\"  کلید {k}: {cand}\")\n"
 },
 {
  "id": "sec_hashlab",
  "file": "sec_hashlab.py",
  "ext": "py",
  "cat": "security",
  "title": "آزمایشگاه هش",
  "desc": "MD5/SHA، HMAC، و تشخیص نوع هش از روی طول",
  "level": 2,
  "code": "# title: آزمایشگاه هش\n# desc: MD5/SHA، HMAC، و تشخیص نوع هش از روی طول\n# cat: security\n# level: 2\nimport hashlib, hmac\ntext = input(\"متن: \") or \"CodePad\"\nfor algo in (\"md5\", \"sha1\", \"sha256\", \"sha512\", \"blake2b\"):\n    print(f\"{algo:<8}\", hashlib.new(algo, text.encode()).hexdigest()[:64])\nprint(\"HMAC-SHA256:\", hmac.new(b\"secret-key\", text.encode(), hashlib.sha256).hexdigest())\n\ndef identify(h):\n    kinds = {32: \"MD5 / NTLM\", 40: \"SHA-1\", 56: \"SHA-224\", 64: \"SHA-256\", 96: \"SHA-384\", 128: \"SHA-512\"}\n    return kinds.get(len(h), \"نامشخص\") if all(c in \"0123456789abcdefABCDEF\" for c in h) else \"هگز نیست\"\nprint(\"\\nتشخیص:\", identify(hashlib.sha256(b\"x\").hexdigest()), \"|\", identify(\"5d41402abc4b2a76b9719d911017c592\"))\n"
 },
 {
  "id": "sec_jwt",
  "file": "sec_jwt.py",
  "ext": "py",
  "cat": "security",
  "title": "رمزگشایی JWT (آفلاین)",
  "desc": "خواندن Header/Payload و بررسی انقضا و الگوریتم ضعیف",
  "level": 3,
  "code": "# title: رمزگشایی JWT (آفلاین)\n# desc: خواندن Header/Payload و بررسی انقضا و الگوریتم ضعیف\n# cat: security\n# level: 3\nimport base64, json, time\n\ndef b64(s):\n    return json.loads(base64.urlsafe_b64decode(s + \"=\" * (-len(s) % 4)))\n\ntoken = input(\"JWT (خالی = نمونه): \").strip() or (\n    \"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0IiwibmFtZSI6IkFsaSIsImV4cCI6MTcwMDAwMDAwMCwicm9sZSI6ImFkbWluIn0.\")\nh, p, *_ = token.split(\".\")\nhead, body = b64(h), b64(p)\nprint(\"Header :\", head)\nprint(\"Payload:\", body)\nif head.get(\"alg\", \"\").lower() == \"none\":\n    print(\"⚠️ الگوریتم none: امضا بررسی نمی‌شود (آسیب‌پذیر)\")\nif \"exp\" in body:\n    print(\"منقضی شده؟\", \"بله\" if body[\"exp\"] < time.time() else \"خیر\")\nprint(\"نکته: این ابزار فقط رمزگشایی می‌کند و امضا را اعتبارسنجی نمی‌کند.\")\n"
 },
 {
  "id": "sec_loganalyzer",
  "file": "sec_loganalyzer.py",
  "ext": "py",
  "cat": "security",
  "title": "تحلیل لاگ ورود (تشخیص حملهٔ brute-force)",
  "desc": "با regex و Counter، آی‌پی‌های مشکوک را از لاگ نمونه پیدا کن",
  "level": 3,
  "code": "# title: تحلیل لاگ ورود (تشخیص حملهٔ brute-force)\n# desc: با regex و Counter، آی‌پی‌های مشکوک را از لاگ نمونه پیدا کن\n# cat: security\n# level: 3\nimport re\nfrom collections import Counter\n\nlog = \"\"\"\\\nNov 17 10:01:02 srv sshd[411]: Failed password for root from 203.0.113.9 port 51022 ssh2\nNov 17 10:01:04 srv sshd[411]: Failed password for root from 203.0.113.9 port 51024 ssh2\nNov 17 10:01:05 srv sshd[411]: Failed password for admin from 203.0.113.9 port 51026 ssh2\nNov 17 10:02:10 srv sshd[418]: Accepted password for ali from 192.168.1.20 port 40022 ssh2\nNov 17 10:03:44 srv sshd[420]: Failed password for invalid user test from 198.51.100.7 port 38888 ssh2\nNov 17 10:03:47 srv sshd[420]: Failed password for root from 203.0.113.9 port 51030 ssh2\nNov 17 10:03:49 srv sshd[420]: Failed password for root from 203.0.113.9 port 51032 ssh2\n\"\"\"\nfails = Counter(re.findall(r\"Failed password for (?:invalid user )?\\S+ from (\\d+\\.\\d+\\.\\d+\\.\\d+)\", log))\nusers = Counter(re.findall(r\"Failed password for (?:invalid user )?(\\S+) from\", log))\nprint(\"تلاش‌های ناموفق به ازای IP:\", dict(fails))\nprint(\"نام‌کاربری‌های هدف:\", dict(users))\nfor ip, n in fails.items():\n    if n >= 4:\n        print(f\"🚨 {ip}: {n} تلاش ناموفق → مسدود کن یا fail2ban بگذار\")\n"
 },
 {
  "id": "sec_password",
  "file": "sec_password.py",
  "ext": "py",
  "cat": "security",
  "title": "قدرت رمز عبور + ساخت رمز",
  "desc": "آنتروپی، الگوهای ضعیف و تولید رمز امن با secrets",
  "level": 2,
  "code": "# title: قدرت رمز عبور + ساخت رمز\n# desc: آنتروپی، الگوهای ضعیف و تولید رمز امن با secrets\n# cat: security\n# level: 2\nimport math, re, secrets, string\n\nCOMMON = {\"123456\", \"password\", \"qwerty\", \"admin\", \"letmein\", \"111111\", \"iloveyou\", \"123456789\"}\ndef strength(pw):\n    pool = (26 if re.search(\"[a-z]\", pw) else 0) + (26 if re.search(\"[A-Z]\", pw) else 0) + (10 if re.search(r\"\\d\", pw) else 0) + (32 if re.search(r\"\\W\", pw) else 0)\n    bits = len(pw) * math.log2(pool) if pool else 0\n    notes = []\n    if pw.lower() in COMMON: notes.append(\"جزو رمزهای لو رفته\")\n    if re.search(r\"(.)\\1\\1\", pw): notes.append(\"تکرار پشت‌سرهم\")\n    if len(pw) < 12: notes.append(\"کوتاه‌تر از ۱۲ کاراکتر\")\n    return round(bits), notes\n\nfor pw in [\"123456\", \"Tr0ub4dor&3\", \"correct horse battery staple\", secrets.token_urlsafe(14)]:\n    print(f\"{pw:<34} آنتروپی≈{strength(pw)[0]:>3} بیت  {', '.join(strength(pw)[1]) or 'خوب'}\")\nalphabet = string.ascii_letters + string.digits + \"!@#$%^&*-_\"\nprint(\"\\nرمز پیشنهادی:\", \"\".join(secrets.choice(alphabet) for _ in range(18)))\n"
 },
 {
  "id": "sec_subnet",
  "file": "sec_subnet.py",
  "ext": "py",
  "cat": "security",
  "title": "ماشین‌حساب شبکه و ساب‌نت",
  "desc": "CIDR، محدودهٔ میزبان‌ها و تقسیم شبکه با ipaddress",
  "level": 2,
  "code": "# title: ماشین‌حساب شبکه و ساب‌نت\n# desc: CIDR، محدودهٔ میزبان‌ها و تقسیم شبکه با ipaddress\n# cat: security\n# level: 2\nimport ipaddress\nnet = ipaddress.ip_network(input(\"شبکه (مثلاً 192.168.1.0/24): \") or \"192.168.1.0/24\", strict=False)\nprint(\"نوع:\", \"خصوصی\" if net.is_private else \"عمومی\")\nprint(\"ماسک:\", net.netmask, \"| بُرودکست:\", net.broadcast_address)\nprint(\"تعداد میزبان:\", net.num_addresses - 2, \"| اولی:\", net[1], \"| آخری:\", net[-2])\nif net.prefixlen <= 28:\n    print(\"تقسیم به ۴ زیرشبکه:\")\n    for s in net.subnets(prefixlen_diff=2):\n        print(\"  \", s)\nprint(\"آیا 192.168.1.77 داخل شبکه است؟\", ipaddress.ip_address(\"192.168.1.77\") in net)\n"
 },
 {
  "id": "tool_calc",
  "file": "tool_calc.py",
  "ext": "py",
  "cat": "tools",
  "title": "ماشین‌حساب امن (بدون eval)",
  "desc": "پارس عبارت با ast؛ تمرین امنیتی در برابر تزریق کد",
  "level": 3,
  "code": "# title: ماشین‌حساب امن (بدون eval)\n# desc: پارس عبارت با ast؛ تمرین امنیتی در برابر تزریق کد\n# cat: tools\n# level: 3\nimport ast, math, operator as op\n\nOPS = {ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv, ast.Pow: op.pow, ast.Mod: op.mod, ast.USub: op.neg}\nFUNCS = {\"sqrt\": math.sqrt, \"sin\": math.sin, \"cos\": math.cos, \"log\": math.log, \"abs\": abs}\ndef ev(n):\n    if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)): return n.value\n    if isinstance(n, ast.BinOp) and type(n.op) in OPS: return OPS[type(n.op)](ev(n.left), ev(n.right))\n    if isinstance(n, ast.UnaryOp) and type(n.op) in OPS: return OPS[type(n.op)](ev(n.operand))\n    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in FUNCS: return FUNCS[n.func.id](*map(ev, n.args))\n    raise ValueError(\"عبارت مجاز نیست\")\nwhile True:\n    s = input(\"عبارت (خالی = خروج): \")\n    if not s: break\n    try:\n        print(\"=\", ev(ast.parse(s, mode=\"eval\").body))\n    except Exception as e:\n        print(\"خطا:\", e)\n"
 },
 {
  "id": "tool_wordstats",
  "file": "tool_wordstats.py",
  "ext": "py",
  "cat": "tools",
  "title": "آمار متن",
  "desc": "شمارش کلمه‌ها و پرتکرارترین‌ها، مناسب فارسی و انگلیسی",
  "level": 2,
  "code": "# title: آمار متن\n# desc: شمارش کلمه‌ها و پرتکرارترین‌ها، مناسب فارسی و انگلیسی\n# cat: tools\n# level: 2\nimport re\nfrom collections import Counter\ntext = input(\"متن را بنویس یا paste کن: \") or \"کد نویسی لذت بخش است و کد خوب ساده است. Code is fun, code is art!\"\nwords = re.findall(r\"[\\w؀-ۿ]+\", text.lower())\nc = Counter(words)\nprint(\"کلمه‌ها:\", len(words), \"| یکتا:\", len(c), \"| حرف‌ها:\", len(text))\nprint(\"پرتکرارها:\", c.most_common(5))\nprint(\"طولانی‌ترین کلمه:\", max(words, key=len) if words else \"-\")\n"
 }
];
