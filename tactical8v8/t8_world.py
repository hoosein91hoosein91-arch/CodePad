"""Arena geometry, collisions, ray casting, navigation flow-fields and the baked light map."""
import math
import random
from collections import deque
import numpy as np

HALF = 54.0                       # arena half size
LIGHTS = [                        # (x, y, z, (r,g,b), intensity, radius)
    (-30, -28, 6.2, (255, 85, 0), 1.7, 46),
    (30, -28, 6.2, (0, 229, 255), 1.7, 46),
    (-30, 28, 6.2, (0, 255, 136), 1.7, 46),
    (30, 28, 6.2, (255, 0, 85), 1.7, 46),
    (0, 0, 6.2, (255, 170, 0), 1.7, 46),
]

LANES = {   # waypoints enemies walk north->south (index 0..2); allies walk 2..0
    "left": [(-38, -22), (-38, 0), (-38, 24)],
    "right": [(38, -22), (38, 0), (38, 24)],
    "center": [(-12, -14), (12, 0), (0, 16)],
}
ALLY_SPAWNS = [(-14, 42), (-7, 40), (7, 40), (14, 42), (-24, 36), (24, 36), (0, 38), (-30, 41), (30, 41)]
ENEMY_SPAWNS = [(-26, -40), (-16, -42), (-8, -38), (-2, -42), (4, -40), (10, -38), (18, -42), (26, -40),
                (-34, -37), (34, -37)]
PLAYER_SPAWNS = [(0, 42), (-26, 38), (26, 38), (-36, 22), (36, 22)]
BARREL_POS = [(-7, -14), (7, 14), (-24, -8), (24, 8), (-12, 4), (12, -4), (-35, -18), (35, 18),
              (-3, 30), (3, -30), (-44, 6), (44, -6)]
SNIPER_SPOTS = [(-47, -30), (47, -30), (0, -46), (-47, 30), (47, 30), (-20, -34), (20, -34)]


def build_boxes():
    B = []

    def add(cx, cy, w, d, h, tex, rot=0.0):
        B.append(dict(cx=cx, cy=cy, w=w, d=d, h=h, rot=rot, tex=tex))

    pi = math.pi
    for p in [(0, -54, 108, 2), (0, 54, 108, 2), (-54, 0, 2, 108), (54, 0, 2, 108)]:
        add(p[0], p[1], p[2], p[3], 12, "wall")
    add(-43, -43, 24, 3, 11, "wall", -pi / 4)
    add(43, -43, 24, 3, 11, "wall", pi / 4)
    add(-43, 43, 24, 3, 11, "wall", pi / 4)
    add(43, 43, 24, 3, 11, "wall", -pi / 4)
    # centre courtyard
    add(0, 0, 5.5, 5.5, 4.4, "bigcrate", -pi / 4)
    add(-11, -8, 9, 2.2, 6, "wall")
    add(11, 8, 9, 2.2, 6, "wall")
    add(0, -22, 10, 2.2, 6, "wall")
    add(0, 22, 10, 2.2, 6, "wall")
    # left cargo lane
    add(-30, -16, 5.5, 14, 5.2, "blue")
    add(-30, 16, 5.5, 14, 5.2, "red")
    add(-20, 0, 10, 4.8, 5.2, "blue")
    # right bunker lane
    add(30, -16, 5.5, 14, 5.2, "red")
    add(30, 16, 5.5, 14, 5.2, "blue")
    add(20, 0, 10, 4.8, 5.2, "red")
    for p in [(-8, 12), (8, -12), (-16, -24), (16, 24), (-38, 0), (38, 0), (-14, 32), (14, -32)]:
        add(p[0], p[1], 2.6, 2.6, 2.5, "crate")
    # --- new: low concrete barriers (cover you can duck behind, vault over or stand on) ---
    for p in [(-6, 16, 3.2, 0.9), (6, -16, 3.2, 0.9), (-17, -12, 0.9, 3.2), (17, 12, 0.9, 3.2),
              (-44, -12, 0.9, 3.2), (-44, 12, 0.9, 3.2), (44, -12, 0.9, 3.2), (44, 12, 0.9, 3.2),
              (-21, 29, 3.2, 0.9), (21, 29, 3.2, 0.9), (-21, -29, 3.2, 0.9), (21, -29, 3.2, 0.9),
              (-6, 6, 0.9, 3.2), (6, -6, 0.9, 3.2), (-30, 34, 3.2, 0.9), (30, -34, 3.2, 0.9)]:
        add(p[0], p[1], p[2], p[3], 1.15, "barrier")
    # taller half-walls (1.5) for crouch fights
    for p in [(-26, -4, 3.0, 1.0), (26, 4, 3.0, 1.0)]:
        add(p[0], p[1], p[2], p[3], 1.5, "crate", 0.0)
    return B


class World:
    def __init__(self, atlas):
        self.atlas = atlas
        self.boxes = build_boxes()
        n = len(self.boxes)
        self.n = n
        f32 = np.float32
        self.cx = np.array([b["cx"] for b in self.boxes], f32)
        self.cy = np.array([b["cy"] for b in self.boxes], f32)
        self.hw = np.array([b["w"] / 2 for b in self.boxes], f32)
        self.hd = np.array([b["d"] / 2 for b in self.boxes], f32)
        self.h = np.array([b["h"] for b in self.boxes], f32)
        self.cs = np.array([math.cos(b["rot"]) for b in self.boxes], f32)
        self.sn = np.array([math.sin(b["rot"]) for b in self.boxes], f32)
        self.tid = np.array([atlas.names[b["tex"]] for b in self.boxes], np.int64)
        self.bradius = np.sqrt(self.hw ** 2 + self.hd ** 2).astype(f32)
        self.top_tid = atlas.names["top"]
        # python-side tuples for collision loops
        self.cbox = []
        for i, b in enumerate(self.boxes):
            hw, hd = b["w"] / 2, b["d"] / 2
            self.cbox.append((b["cx"], b["cy"], hw, hd, math.cos(b["rot"]), math.sin(b["rot"]), b["h"],
                              (hw * hw + hd * hd), i))
        self.lightmap = self._bake_lightmap()
        self._build_nav()
        self.static_fields = {}
        for lane, pts in LANES.items():
            for i, p in enumerate(pts):
                self.static_fields[(lane, i)] = self.flow_field([self.cell_of(*p)])
        for i, p in enumerate(SNIPER_SPOTS):
            self.static_fields[("snipe", i)] = self.flow_field([self.cell_of(*p)])

    # ------------------------------------------------------------------ collisions
    def push_out(self, x, y, r, feet_z=0.0):
        lim = 52.4 - r
        if x < -lim: x = -lim
        elif x > lim: x = lim
        if y < -lim: y = -lim
        elif y > lim: y = lim
        for cx, cy, hw, hd, cs, sn, h, br2, _ in self.cbox:
            if feet_z >= h - 0.1:
                continue
            rx = x - cx
            ry = y - cy
            if rx * rx + ry * ry > br2 + (r + 0.2) * (r + 0.2) + 2 * math.sqrt(br2) * (r + 0.2):
                continue
            lx = rx * cs + ry * sn
            ly = -rx * sn + ry * cs
            qx = hw if lx > hw else (-hw if lx < -hw else lx)
            qy = hd if ly > hd else (-hd if ly < -hd else ly)
            dx = lx - qx
            dy = ly - qy
            d2 = dx * dx + dy * dy
            if d2 < r * r:
                if d2 > 1e-8:
                    d = math.sqrt(d2)
                    ov = r - d
                    px = dx / d * ov
                    py = dy / d * ov
                else:   # centre inside the box: push through the nearest face
                    pl = lx + hw
                    pr = hw - lx
                    pt = ly + hd
                    pb = hd - ly
                    m = min(pl, pr, pt, pb)
                    if m == pl: px, py = -(pl + r), 0.0
                    elif m == pr: px, py = pr + r, 0.0
                    elif m == pt: px, py = 0.0, -(pt + r)
                    else: px, py = 0.0, pb + r
                x += px * cs - py * sn
                y += px * sn + py * cs
        return x, y

    def ground_at(self, x, y, r, feet_z):
        """Height of the surface you can stand on at (x,y) given your current feet height."""
        g = 0.0
        for cx, cy, hw, hd, cs, sn, h, br2, _ in self.cbox:
            if h > feet_z + 0.12 or h <= g:
                continue
            rx = x - cx
            ry = y - cy
            lx = rx * cs + ry * sn
            ly = -rx * sn + ry * cs
            if abs(lx) <= hw + r * 0.6 and abs(ly) <= hd + r * 0.6:
                g = h
        return g

    def point_in_box(self, x, y, z, pad=0.0):
        for cx, cy, hw, hd, cs, sn, h, br2, _ in self.cbox:
            if z > h + pad:
                continue
            rx = x - cx
            ry = y - cy
            lx = rx * cs + ry * sn
            ly = -rx * sn + ry * cs
            if abs(lx) <= hw + pad and abs(ly) <= hd + pad:
                return True
        return False

    # ------------------------------------------------------------------ ray casting (3D, boxes + ground)
    def raycast(self, ox, oy, oz, dx, dy, dz, maxd=200.0):
        """Direction need not be normalised only if maxd is in the same units. Returns (t, box_index|-1)."""
        o_x = ox - self.cx
        o_y = oy - self.cy
        lox = self.cs * o_x + self.sn * o_y
        loy = -self.sn * o_x + self.cs * o_y
        ldx = self.cs * dx + self.sn * dy
        ldy = -self.sn * dx + self.cs * dy
        with np.errstate(divide="ignore", invalid="ignore"):
            ix = 1.0 / np.where(np.abs(ldx) < 1e-9, 1e-9, ldx)
            iy = 1.0 / np.where(np.abs(ldy) < 1e-9, 1e-9, ldy)
            t1 = (-self.hw - lox) * ix
            t2 = (self.hw - lox) * ix
            t3 = (-self.hd - loy) * iy
            t4 = (self.hd - loy) * iy
            tn = np.maximum(np.minimum(t1, t2), np.minimum(t3, t4))
            tf = np.minimum(np.maximum(t1, t2), np.maximum(t3, t4))
            if abs(dz) < 1e-9:
                tz0 = np.where((oz >= 0) & (oz <= self.h), -1e9, 1e9)
                tz1 = np.where((oz >= 0) & (oz <= self.h), 1e9, -1e9)
            else:
                ta = (0 - oz) / dz
                tb = (self.h - oz) / dz
                tz0 = np.minimum(ta, tb)
                tz1 = np.maximum(ta, tb)
        t_in = np.maximum(np.maximum(tn, tz0), 0.0)
        t_out = np.minimum(np.minimum(tf, tz1), maxd)
        hit = t_in < t_out
        best_t = maxd
        best_i = -1
        if hit.any():
            tt = np.where(hit, t_in, np.inf)
            i = int(np.argmin(tt))
            best_t = float(tt[i])
            best_i = i
        if dz < -1e-9:
            tg = -oz / dz
            if 0 < tg < best_t:
                best_t = tg
                best_i = -2          # ground
        return best_t, best_i

    def los(self, x0, y0, z0, x1, y1, z1):
        dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
        d = math.sqrt(dx * dx + dy * dy + dz * dz)
        if d < 1e-6:
            return True
        t, i = self.raycast(x0, y0, z0, dx / d, dy / d, dz / d, d - 0.05)
        return i == -1 or t >= d - 0.06

    # ------------------------------------------------------------------ navigation
    CELL = 2.0
    N = 54

    def cell_of(self, x, y):
        i = int((x + HALF) / self.CELL)
        j = int((y + HALF) / self.CELL)
        return min(max(j, 0), self.N - 1) * self.N + min(max(i, 0), self.N - 1)

    def cell_center(self, c):
        j, i = divmod(c, self.N)
        return -HALF + (i + 0.5) * self.CELL, -HALF + (j + 0.5) * self.CELL

    def _build_nav(self):
        N = self.N
        free = [True] * (N * N)
        inflate = 1.05
        for c in range(N * N):
            x, y = self.cell_center(c)
            if abs(x) > 51.2 or abs(y) > 51.2:
                free[c] = False
                continue
            for cx, cy, hw, hd, cs, sn, h, br2, _ in self.cbox:
                rx, ry = x - cx, y - cy
                lx = rx * cs + ry * sn
                ly = -rx * sn + ry * cs
                if abs(lx) < hw + inflate and abs(ly) < hd + inflate:
                    free[c] = False
                    break
        self.free = free
        self.nbrs = [[] for _ in range(N * N)]
        for c in range(N * N):
            if not free[c]:
                continue
            j, i = divmod(c, N)
            for dj, di in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
                nj, ni = j + dj, i + di
                if not (0 <= nj < N and 0 <= ni < N):
                    continue
                nc = nj * N + ni
                if not free[nc]:
                    continue
                if dj != 0 and di != 0 and not (free[(j + dj) * N + i] and free[j * N + i + di]):
                    continue
                self.nbrs[c].append(nc)

    def nearest_free(self, c):
        if self.free[c]:
            return c
        j0, i0 = divmod(c, self.N)
        for rad in range(1, 6):
            for dj in range(-rad, rad + 1):
                for di in range(-rad, rad + 1):
                    j, i = j0 + dj, i0 + di
                    if 0 <= j < self.N and 0 <= i < self.N and self.free[j * self.N + i]:
                        return j * self.N + i
        return c

    def flow_field(self, sources):
        INF = 9999
        dist = [INF] * (self.N * self.N)
        dq = deque()
        for s in sources:
            s = self.nearest_free(s)
            if dist[s] != 0:
                dist[s] = 0
                dq.append(s)
        nbrs = self.nbrs
        while dq:
            c = dq.popleft()
            nd = dist[c] + 1
            for n in nbrs[c]:
                if dist[n] > nd:
                    dist[n] = nd
                    dq.append(n)
        return dist

    def step_dir(self, dist, x, y, look=2):
        """Direction (unit vector) to follow a flow field from (x,y); None when already at the goal / unreachable."""
        c = self.nearest_free(self.cell_of(x, y))
        d0 = dist[c]
        if d0 >= 9999 or d0 == 0:
            return None
        cur = c
        for _ in range(look):
            best, bd = cur, dist[cur]
            for n in self.nbrs[cur]:
                if dist[n] < bd:
                    best, bd = n, dist[n]
            if best == cur:
                break
            cur = best
            if bd == 0:
                break
        tx, ty = self.cell_center(cur)
        dx, dy = tx - x, ty - y
        l = math.hypot(dx, dy)
        if l < 1e-6:
            return None
        return dx / l, dy / l

    def random_free_point(self, x0, y0, x1, y1, tries=30):
        for _ in range(tries):
            x = random.uniform(x0, x1)
            y = random.uniform(y0, y1)
            if self.free[self.cell_of(x, y)] and not self.point_in_box(x, y, 0.5, 0.6):
                return x, y
        return (x0 + x1) / 2, (y0 + y1) / 2

    # ------------------------------------------------------------------ baked floor lighting (+ contact shadows)
    LM_N = 224
    LM_RES = 0.5

    def _bake_lightmap(self):
        N = self.LM_N
        xs = (np.arange(N, dtype=np.float32) + 0.5) * self.LM_RES - 56.0
        X, Y = np.meshgrid(xs, xs)                      # X varies along columns, Y along rows
        lm = np.zeros((N, N, 3), np.float32)
        for lx, ly, lz, col, inten, rad in LIGHTS:
            d = np.sqrt((X - lx) ** 2 + (Y - ly) ** 2 + lz * lz)
            att = np.clip(1.0 - d / rad, 0.0, 1.0) ** 1.4
            e = inten * att * (lz / d)
            lm += e[:, :, None] * (np.array(col, np.float32) / 255.0)[None, None, :]
        ao = np.ones((N, N), np.float32)
        for cx, cy, hw, hd, cs, sn, h, br2, _ in self.cbox:
            if h < 1.0:
                continue
            rx, ry = X - cx, Y - cy
            lx = rx * cs + ry * sn
            ly = -rx * sn + ry * cs
            qx = np.clip(lx, -hw, hw)
            qy = np.clip(ly, -hd, hd)
            sd = np.sqrt((lx - qx) ** 2 + (ly - qy) ** 2)
            ao *= 1.0 - 0.5 * np.exp(-sd * 1.15) * min(1.0, h / 3.0)
        self.ao = ao
        return lm * ao[:, :, None]

    def light_at(self, x, y):
        """Scalar-position light lookup -> (r,g,b) floats."""
        i = min(max(int((x + 56.0) / self.LM_RES), 0), self.LM_N - 1)
        j = min(max(int((y + 56.0) / self.LM_RES), 0), self.LM_N - 1)
        return self.lightmap[j, i]
