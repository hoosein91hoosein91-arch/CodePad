"""Tiny 3D model rasteriser used to bake sprites at start-up: soldiers (12 view angles x poses), props and the
first-person weapons.  No asset files - everything is built from boxes / prisms / spheres."""
import math
import numpy as np
import pygame

# ----------------------------------------------------------------------------------------------
# geometry helpers
# ----------------------------------------------------------------------------------------------
def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], np.float32)


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], np.float32)


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], np.float32)


def _frame_from_dir(d):
    """Rotation matrix whose local x axis points along d."""
    d = np.asarray(d, np.float32)
    n = np.linalg.norm(d)
    if n < 1e-6:
        return np.eye(3, dtype=np.float32)
    x = d / n
    up = np.array([0, 0, 1], np.float32) if abs(x[2]) < 0.95 else np.array([1, 0, 0], np.float32)
    y = np.cross(up, x)
    y /= np.linalg.norm(y)
    z = np.cross(x, y)
    return np.stack([x, y, z], axis=1).astype(np.float32)


class Mesh:
    def __init__(self):
        self.verts = []
        self.faces = []         # (idx list, color, emissive, prim centre)

    def _add(self, V, faces, color, center, emissive=False):
        base = len(self.verts)
        for v in V:
            self.verts.append(v)
        c = np.asarray(center, np.float32)
        for f in faces:
            self.faces.append(([base + i for i in f], color, emissive, c))

    def box(self, c, size, color, R=None, emissive=False):
        dx, dy, dz = size
        V = []
        for xi in (0, 1):
            for yi in (0, 1):
                for zi in (0, 1):
                    V.append(np.array([(xi - .5) * dx, (yi - .5) * dy, (zi - .5) * dz], np.float32))
        V = np.array(V, np.float32)
        if R is not None:
            V = V @ R.T
        V = V + np.asarray(c, np.float32)
        F = [(0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)]
        self._add(V, F, color, c, emissive)

    def seg(self, p0, p1, thick, color, emissive=False, thick2=None):
        p0 = np.asarray(p0, np.float32)
        p1 = np.asarray(p1, np.float32)
        d = p1 - p0
        L = float(np.linalg.norm(d))
        R = _frame_from_dir(d)
        self.box((p0 + p1) / 2, (L, thick, thick2 or thick), color, R, emissive)

    def prism(self, c, r, length, axis, color, sides=8, R=None, emissive=False, r2=None):
        r2 = r if r2 is None else r2
        ang = np.linspace(0, 2 * math.pi, sides, endpoint=False)
        ring_a = np.stack([np.zeros(sides), np.cos(ang) * r, np.sin(ang) * r], 1)
        ring_b = np.stack([np.zeros(sides), np.cos(ang) * r2, np.sin(ang) * r2], 1)
        ring_a[:, 0] = -length / 2
        ring_b[:, 0] = length / 2
        V = np.concatenate([ring_a, ring_b], 0).astype(np.float32)        # axis along local x
        if axis == "y":
            V = V @ rot_z(math.pi / 2).T
        elif axis == "z":
            V = V @ rot_y(-math.pi / 2).T
        if R is not None:
            V = V @ R.T
        V = V + np.asarray(c, np.float32)
        F = [(i, (i + 1) % sides, sides + (i + 1) % sides, sides + i) for i in range(sides)]
        F.append(tuple(range(sides)))
        F.append(tuple(range(sides, 2 * sides)))
        self._add(V, F, color, c, emissive)

    def sphere(self, c, r, color, rings=4, segs=8, squash=(1, 1, 1), emissive=False):
        V = []
        for i in range(rings + 1):
            lat = -math.pi / 2 + math.pi * i / rings
            for j in range(segs):
                lon = 2 * math.pi * j / segs
                V.append([math.cos(lat) * math.cos(lon) * r * squash[0], math.cos(lat) * math.sin(lon) * r * squash[1],
                          math.sin(lat) * r * squash[2]])
        V = np.array(V, np.float32) + np.asarray(c, np.float32)
        F = []
        for i in range(rings):
            for j in range(segs):
                a = i * segs + j
                b = i * segs + (j + 1) % segs
                F.append((a, b, b + segs, a + segs))
        self._add(V, F, color, c, emissive)

    def transform(self, R, t=(0, 0, 0)):
        if not self.verts:
            return
        V = np.array(self.verts, np.float32) @ R.T + np.asarray(t, np.float32)
        self.verts = list(V)
        self.faces = [(i, c, e, (R @ ctr + np.asarray(t, np.float32)).astype(np.float32)) for i, c, e, ctr in self.faces]


LIGHT_VIEW = np.array([-0.45, 0.75, 0.55], np.float32)     # (right, up, toward-viewer) components
LIGHT_VIEW /= np.linalg.norm(LIGHT_VIEW)


class Prep:
    """Mesh converted to arrays once so that many viewing angles can be rendered cheaply."""

    def __init__(self, mesh):
        self.V = np.array(mesh.verts, np.float32)
        nf = len(mesh.faces)
        maxn = max(len(f[0]) for f in mesh.faces)
        idx = np.zeros((nf, maxn), np.int32)
        cnt = np.zeros(nf, np.int32)
        for i, (ix, col, emis, ctr) in enumerate(mesh.faces):
            idx[i, :len(ix)] = ix
            idx[i, len(ix):] = ix[-1]
            cnt[i] = len(ix)
        P = self.V[idx]
        n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
        ln = np.linalg.norm(n, axis=1)
        self.good = ln > 1e-9
        n = n / np.maximum(ln, 1e-9)[:, None]
        fc = P.mean(1)
        ctr = np.array([f[3] for f in mesh.faces], np.float32)
        flip = ((n * (fc - ctr)).sum(1) < 0)
        n[flip] *= -1
        self.idx, self.cnt, self.n, self.fc = idx, cnt, n, fc
        self.col = np.array([f[1] for f in mesh.faces], np.float32)
        self.emis = np.array([f[2] for f in mesh.faces], bool)


def rasterize(mesh, size, ppu, origin, az=0.0, elev=0.0, ss=2, outline=True, persp=None, view=None, shade_amb=0.42):
    """Render to an SRCALPHA surface.  Orthographic camera at azimuth `az` (radians around the model, z-up) unless
    `persp=(eye(3), focal_px)` + `view=(right, up, fwd)` are given.  `mesh` may be a Mesh or a Prep."""
    pm = mesh if isinstance(mesh, Prep) else Prep(mesh)
    W, H = size
    surf = pygame.Surface((W * ss, H * ss), pygame.SRCALPHA)
    if view is None:
        ca, sa = math.cos(az), math.sin(az)
        ce, se = math.cos(elev), math.sin(elev)
        fwd = np.array([-ca * ce, -sa * ce, -se], np.float32)
        right = np.array([sa, -ca, 0], np.float32)
        up = np.cross(right, fwd)
        up = up * np.sign(up[2] if abs(up[2]) > 1e-6 else 1.0)
    else:
        right, up, fwd = [np.asarray(a, np.float32) for a in view]
    V = pm.V
    if persp is None:
        sx = origin[0] * ss + (V @ right) * ppu * ss
        sy = origin[1] * ss - (V @ up) * ppu * ss
        depth = V @ fwd
        vis = (pm.n @ fwd) < 0
    else:
        eye, focal = persp
        eye = np.asarray(eye, np.float32)
        d = V - eye
        z = np.maximum(d @ fwd, 1e-3)
        sx = origin[0] * ss + (d @ right) / z * focal * ss
        sy = origin[1] * ss - (d @ up) / z * focal * ss
        depth = z
        vis = ((pm.fc - eye) * pm.n).sum(1) < 0
    vis &= pm.good
    sel = np.nonzero(vis)[0]
    if len(sel) == 0:
        return pygame.transform.smoothscale(surf, (W, H)) if ss > 1 else surf
    dp = depth[pm.idx[sel]].mean(1)
    order = sel[np.argsort(-dp)]
    Lw = LIGHT_VIEW[0] * right + LIGHT_VIEW[1] * up - LIGHT_VIEW[2] * fwd
    sh = shade_amb + 0.62 * np.maximum(0.0, pm.n[order] @ Lw)
    sh = np.where(pm.emis[order], 1.0, sh)
    cols = np.clip(pm.col[order] * sh[:, None], 0, 255).astype(np.int32).tolist()
    ix = pm.idx[order]
    pts = np.stack([sx[ix], sy[ix]], -1)
    cnts = pm.cnt[order].tolist()
    emis = pm.emis[order].tolist()
    lw = max(1, ss // 2 + 1)
    draw = pygame.draw.polygon
    ptl = pts.tolist()
    for i in range(len(order)):
        poly = ptl[i][:cnts[i]]
        c = cols[i]
        draw(surf, c, poly)
        if outline and not emis[i]:
            draw(surf, (int(c[0] * 0.45), int(c[1] * 0.45), int(c[2] * 0.45)), poly, lw)
    if ss > 1:
        surf = pygame.transform.smoothscale(surf, (W, H))
    return surf


def surf_to_rgba(surf):
    rgb = pygame.surfarray.array3d(surf).swapaxes(0, 1)
    a = pygame.surfarray.array_alpha(surf).swapaxes(0, 1)
    return np.ascontiguousarray(np.concatenate([rgb, a[:, :, None]], axis=2)).astype(np.uint8)


# ----------------------------------------------------------------------------------------------
# soldiers
# ----------------------------------------------------------------------------------------------
GUN_COL = {"ar": (60, 62, 64), "ak": (109, 59, 30), "sniper": (43, 61, 79), "smg": (38, 50, 56),
           "shotgun": (78, 52, 46), "minigun": (26, 29, 32), "rpg": (59, 77, 43)}

PAL = {
    "ally": dict(uni=(26, 54, 93), vest=(2, 136, 209), helm=(1, 87, 155), visor=(0, 229, 255), skin=(216, 176, 140),
                 glove=(27, 36, 44), trim=(0, 229, 255)),
    "grunt": dict(uni=(56, 29, 29), vest=(198, 40, 40), helm=(107, 0, 0), visor=(255, 23, 68), skin=(216, 176, 140),
                  glove=(27, 27, 30), trim=(255, 90, 60)),
    "rusher": dict(uni=(70, 44, 24), vest=(230, 110, 20), helm=(90, 40, 10), visor=(255, 190, 40), skin=(210, 170, 135),
                   glove=(30, 24, 20), trim=(255, 200, 40)),
    "marksman": dict(uni=(44, 56, 42), vest=(70, 90, 60), helm=(40, 58, 40), visor=(120, 255, 90), skin=(205, 168, 134),
                     glove=(24, 30, 24), trim=(160, 255, 90)),
    "heavy": dict(uni=(34, 34, 40), vest=(120, 40, 46), helm=(52, 52, 60), visor=(255, 60, 40), skin=(200, 160, 128),
                  glove=(20, 20, 24), trim=(255, 70, 40)),
    "grenadier": dict(uni=(62, 66, 38), vest=(104, 112, 60), helm=(74, 80, 44), visor=(255, 230, 60), skin=(212, 172, 138),
                      glove=(30, 32, 20), trim=(255, 230, 60)),
    "boss": dict(uni=(18, 14, 16), vest=(150, 20, 20), helm=(36, 12, 12), visor=(255, 120, 0), skin=(190, 150, 120),
                 glove=(14, 10, 10), trim=(255, 120, 0)),
}
KINDS = {  # kind: (palette, gun, body scale (width), height scale handled by world size)
    "ally_ar": ("ally", "ar"), "ally_sn": ("ally", "sniper"), "ally_smg": ("ally", "smg"),
    "grunt": ("grunt", "ak"), "rusher": ("rusher", "smg"), "marksman": ("marksman", "sniper"),
    "heavy": ("heavy", "minigun"), "grenadier": ("grenadier", "ar"), "boss": ("boss", "rpg"),
}
POSES = ["idle", "walkA", "walkB", "shoot", "crouch"]
FALLS = ["fall1", "fall2"]
N_AZ = 12
SOLDIER_PPU = 72
STAND_SIZE = (88, 160)
FALL_SIZE = (160, 128)
SOLDIER_WORLD = (88 / SOLDIER_PPU, 160 / SOLDIER_PPU)       # world width,height of the standing canvas (metres)
FALL_WORLD = (160 / SOLDIER_PPU, 128 / SOLDIER_PPU)


def _add_gun(m, gun, hand_r, hand_l, pal, flash=False):
    gc = GUN_COL["ak"] if gun == "ak" else GUN_COL.get(gun, (60, 60, 60))
    metal = (36, 40, 44)
    x0 = hand_r[0]
    z = hand_r[2] + 0.04
    if gun in ("ar", "ak"):
        m.box((x0 + 0.12, 0, z), (0.62, 0.09, 0.12), gc)
        m.box((x0 + 0.52, 0, z + 0.02), (0.42, 0.05, 0.05), metal)
        m.box((x0 + 0.08, 0, z - 0.14), (0.07, 0.07, 0.2), metal, R=rot_y(0.25))
        m.box((x0 + 0.0, 0, z + 0.075), (0.38, 0.05, 0.03), metal)
        m.box((x0 - 0.28, 0, z - 0.03), (0.22, 0.07, 0.1), gc)
        muzzle = x0 + 0.74
    elif gun == "sniper":
        m.box((x0 + 0.2, 0, z), (0.9, 0.08, 0.11), gc)
        m.box((x0 + 0.78, 0, z + 0.02), (0.55, 0.04, 0.04), metal)
        m.prism((x0 + 0.1, 0, z + 0.12), 0.045, 0.34, "x", metal, 8)
        m.box((x0 - 0.3, 0, z - 0.04), (0.26, 0.07, 0.12), gc)
        muzzle = x0 + 1.06
    elif gun == "smg":
        m.box((x0 + 0.1, 0, z), (0.42, 0.09, 0.13), gc)
        m.box((x0 + 0.36, 0, z + 0.01), (0.2, 0.045, 0.045), metal)
        m.box((x0 + 0.08, 0, z - 0.17), (0.06, 0.07, 0.24), metal)
        m.box((x0 - 0.12, 0, z - 0.02), (0.14, 0.06, 0.09), gc)
        muzzle = x0 + 0.48
    elif gun == "shotgun":
        m.box((x0 + 0.2, 0, z), (0.7, 0.1, 0.12), gc)
        m.box((x0 + 0.5, 0, z - 0.06), (0.3, 0.08, 0.06), (90, 70, 60))
        m.prism((x0 + 0.66, 0, z + 0.03), 0.032, 0.34, "x", metal, 8)
        muzzle = x0 + 0.84
    elif gun == "minigun":
        m.box((x0 + 0.15, 0, z), (0.5, 0.2, 0.2), gc)
        for k in range(6):
            a = k / 6 * math.tau
            m.prism((x0 + 0.62, math.cos(a) * 0.06, z + math.sin(a) * 0.06), 0.018, 0.55, "x", metal, 6)
        m.prism((x0 + 0.44, 0, z), 0.085, 0.1, "x", (70, 74, 80), 8)
        m.box((x0 - 0.1, 0, z - 0.2), (0.34, 0.26, 0.26), (60, 52, 40))
        muzzle = x0 + 0.92
    else:   # rpg
        m.prism((x0 + 0.1, -0.02, z + 0.12), 0.07, 1.0, "x", gc, 10)
        m.prism((x0 + 0.72, -0.02, z + 0.12), 0.1, 0.18, "x", (46, 62, 36), 10, r2=0.02)
        m.box((x0 + 0.0, 0, z - 0.05), (0.1, 0.06, 0.16), metal)
        muzzle = x0 + 0.9
    if flash:
        m.sphere((muzzle + 0.12, 0, z + 0.02), 0.13, (255, 220, 90), 3, 6, emissive=True)
        m.sphere((muzzle + 0.05, 0, z + 0.02), 0.07, (255, 255, 230), 3, 6, emissive=True)


def soldier_mesh(kind, pose):
    pal_name, gun = KINDS[kind]
    p = PAL[pal_name]
    m = Mesh()
    crouch = 1.0 if pose == "crouch" else 0.0
    walk = {"walkA": 0.5, "walkB": -0.5}.get(pose, 0.0)
    drop = 0.42 * crouch
    uni, vest, helm, visor, skin, glove, trim = (p[k] for k in ("uni", "vest", "helm", "visor", "skin", "glove", "trim"))
    width = 1.25 if kind == "heavy" else (1.12 if kind == "boss" else 1.0)
    # legs
    hipz = 0.84 - drop
    for side in (-1, 1):
        a = walk * side
        ankle = np.array([math.sin(a) * 0.8 + 0.30 * crouch, side * 0.16 * width, max(0.08, hipz - math.cos(a) * 0.8 * (1 - 0.25 * crouch))])
        hip = np.array([0, side * 0.16 * width, hipz])
        m.seg(hip, ankle, 0.25, uni, thick2=0.27)
        m.box((ankle[0] + 0.07, ankle[1], 0.06), (0.36, 0.26, 0.12), (20, 20, 22))
    # torso, vest, backpack
    m.box((0, 0, 1.13 - drop), (0.40, 0.66 * width, 0.74), uni)
    m.box((0.01, 0, 1.17 - drop), (0.46, 0.72 * width, 0.56), vest)
    m.box((0.235, 0, 1.28 - drop), (0.02, 0.4 * width, 0.05), trim, emissive=True)
    m.box((-0.30, 0, 1.2 - drop), (0.24, 0.48 * width, 0.5), helm)
    if kind == "grenadier":
        for k in range(4):
            m.sphere((0.25, -0.24 + k * 0.16, 0.96 - drop), 0.06, (60, 70, 40), 2, 5)
    if kind == "heavy":
        m.box((0.0, 0, 1.55 - drop), (0.46, 0.92, 0.18), helm)              # pauldrons
    if kind == "boss":
        m.box((0.0, 0, 1.58 - drop), (0.5, 1.0, 0.2), (40, 14, 14))
        m.box((0.26, 0, 1.2 - drop), (0.02, 0.2, 0.2), trim, emissive=True)
    # head
    hz = 1.74 - drop
    m.sphere((0.02, 0, hz), 0.22, skin, 4, 8)
    m.sphere((0.0, 0, hz + 0.06), 0.27, helm, 4, 8, squash=(1.0, 1.0, 0.85))
    m.box((0.2, 0, hz - 0.01), (0.1, 0.34, 0.1), visor, emissive=True)
    if kind == "rusher":
        m.box((0.05, 0, hz - 0.17), (0.22, 0.3, 0.07), (230, 110, 20))
    if kind == "marksman":
        m.box((0.0, 0, hz + 0.2), (0.4, 0.46, 0.08), (30, 44, 30))
    # arms holding the gun (right hand is +y)
    hand_r = np.array([0.5, 0.10, 1.3 - drop])
    hand_l = np.array([0.95 if gun not in ("smg",) else 0.7, -0.03, 1.28 - drop])
    if gun == "minigun":
        hand_r = np.array([0.42, 0.12, 1.12 - drop])
        hand_l = np.array([0.8, 0.0, 1.14 - drop])
    sh_r = np.array([0, 0.40 * width, 1.46 - drop])
    sh_l = np.array([0, -0.40 * width, 1.46 - drop])
    for sh, hd, side in ((sh_r, hand_r, 1), (sh_l, hand_l, -1)):
        el = (sh + hd) / 2 + np.array([-0.05, side * 0.12, -0.2])
        m.seg(sh, el, 0.2, uni)
        m.seg(el, hd, 0.17, uni)
        m.box(hd + np.array([0.02, 0, 0]), (0.14, 0.13, 0.13), glove)
    _add_gun(m, gun, hand_r, hand_l, p, flash=(pose == "shoot"))
    if pose in FALLS:
        ang = {"fall1": 0.85, "fall2": 1.5}[pose]
        m.transform(rot_y(ang))
        V = np.array(m.verts, np.float32)
        lift = -float(V[:, 2].min())
        cx = -float((V[:, 0].min() + V[:, 0].max()) / 2)
        m.transform(np.eye(3, dtype=np.float32), (cx, 0, max(0.0, lift)))
    return m


class SpriteBank:
    """Baked billboard frames.  frames[(kind, pose)][az_index] -> (h,w,4) uint8"""

    def __init__(self, progress=None):
        self.frames = {}
        self.props = {}
        total = len(KINDS) * (len(POSES) + len(FALLS))
        done = 0
        for kind in KINDS:
            for pose in POSES + FALLS:
                m = Prep(soldier_mesh(kind, pose))
                size = FALL_SIZE if pose in FALLS else STAND_SIZE
                origin = (size[0] / 2, size[1] - 3)
                arr = []
                for i in range(N_AZ):
                    az = i / N_AZ * math.tau
                    s = rasterize(m, size, SOLDIER_PPU, origin, az=az, elev=0.0, ss=2)
                    arr.append(surf_to_rgba(s))
                self.frames[(kind, pose)] = arr
                done += 1
            if progress:
                progress(done / total * 0.6)
        self._build_props()
        if progress:
            progress(0.7)

    # ------------------------------------------------------------------
    def _prop(self, name, mesh, size, ppu, az=0.0, elev=0.25, ss=3):
        origin = (size[0] / 2, size[1] - 4)
        s = rasterize(mesh, size, ppu, origin, az=az, elev=elev, ss=ss)
        self.props[name] = surf_to_rgba(s)

    def _build_props(self):
        # explosive barrel
        m = Mesh()
        m.prism((0, 0, 0.83), 0.55, 1.65, "z", (211, 47, 47), 14)
        m.prism((0, 0, 0.85), 0.565, 0.26, "z", (255, 235, 59), 14)
        m.prism((0, 0, 1.2), 0.575, 0.06, "z", (150, 30, 30), 14)
        m.prism((0, 0, 0.45), 0.575, 0.06, "z", (150, 30, 30), 14)
        m.box((0.56, 0, 0.85), (0.02, 0.24, 0.2), (30, 30, 30))
        self._prop("barrel", m, (80, 128), 64)
        # sentry turret (12 azimuths of the gun head), also 'shoot'
        for pose in ("idle", "shoot"):
            arr = []
            for i in range(N_AZ):
                az = i / N_AZ * math.tau
                t = Mesh()
                t.prism((0, 0, 0.35), 0.5, 0.7, "z", (38, 42, 46), 10, r2=0.4)
                t.box((0, 0, 0.9), (0.4, 0.34, 0.3), (0, 150, 230))
                t.box((0.5, 0, 0.92), (0.7, 0.1, 0.12), (30, 34, 38))
                t.box((0.08, 0, 1.1), (0.24, 0.2, 0.1), (20, 24, 28))
                t.sphere((0, 0, 1.18), 0.07, (255, 220, 60), 2, 5, emissive=True)
                if pose == "shoot":
                    t.sphere((0.95, 0, 0.92), 0.15, (255, 220, 90), 3, 6, emissive=True)
                s = rasterize(t, (88, 80), 64, (44, 76), az=az, elev=0.25, ss=3)
                arr.append(surf_to_rgba(s))
            self.frames[("turret", pose)] = arr
        # pickups
        m = Mesh()
        m.box((0, 0, 0.2), (0.7, 0.45, 0.36), (59, 83, 50))
        m.box((0, 0, 0.2), (0.72, 0.1, 0.38), (255, 152, 0))
        m.box((0, 0, 0.4), (0.74, 0.47, 0.05), (40, 56, 34))
        self._prop("ammo", m, (64, 40), 64, az=0.6)
        m = Mesh()
        m.box((0, 0, 0.22), (0.62, 0.5, 0.42), (235, 235, 238))
        m.box((0.32, 0, 0.22), (0.03, 0.34, 0.1), (220, 30, 40))
        m.box((0.32, 0, 0.22), (0.03, 0.1, 0.34), (220, 30, 40))
        m.box((0, 0.26, 0.22), (0.5, 0.03, 0.1), (220, 30, 40))
        m.box((0, 0.26, 0.22), (0.1, 0.03, 0.34), (220, 30, 40))
        self._prop("med", m, (64, 44), 64, az=0.5)
        m = Mesh()
        m.box((0, 0, 0.24), (0.55, 0.5, 0.4), (30, 80, 140))
        m.box((0, 0, 0.24), (0.57, 0.3, 0.2), (0, 200, 255))
        m.box((0, 0, 0.46), (0.5, 0.45, 0.06), (20, 50, 90))
        self._prop("armor", m, (64, 44), 64, az=0.55)
        # grenade
        m = Mesh()
        m.sphere((0, 0, 0.13), 0.13, (46, 59, 40), 4, 8)
        m.sphere((0, 0, 0.27), 0.05, (255, 30, 60), 2, 5)
        self._prop("grenade", m, (24, 24), 64, az=0.4)
        # airdrop crate with parachute
        m = Mesh()
        m.box((0, 0, 0.6), (1.1, 1.1, 1.0), (52, 73, 52))
        m.box((0, 0, 0.6), (1.14, 0.16, 1.04), (230, 230, 230))
        m.box((0, 0, 0.6), (0.16, 1.14, 1.04), (230, 230, 230))
        m.box((0, 0, 1.12), (1.2, 1.2, 0.08), (32, 46, 32))
        m.sphere((0, 0, 1.2), 0.14, (255, 60, 40), 3, 6, emissive=True)
        self._prop("drop", m, (112, 96), 64, az=0.6)
        m = Mesh()
        m.sphere((0, 0, 3.6), 1.7, (240, 90, 40), 5, 10, squash=(1, 1, 0.8))
        m.sphere((0, 0, 3.64), 1.55, (240, 240, 240), 5, 10, squash=(1, 1, 0.8))
        m.sphere((0, 0, 3.8), 1.3, (240, 90, 40), 5, 10, squash=(1, 1, 0.8))
        for a in range(0, 360, 90):
            m.seg((math.cos(math.radians(a)) * 1.4, math.sin(math.radians(a)) * 1.4, 3.6), (0, 0, 1.2), 0.03, (200, 200, 200))
        m.box((0, 0, 0.6), (1.1, 1.1, 1.0), (52, 73, 52))
        self._prop("drop_chute", m, (160, 280), 64, az=0.6, elev=0.1)

    # ------------------------------------------------------------------
    def soldier(self, kind, pose, rel_angle):
        """rel_angle = angle (radians) of the camera around the soldier measured from the soldier's forward axis."""
        i = int(round((rel_angle % math.tau) / math.tau * N_AZ)) % N_AZ
        return self.frames[(kind, pose)][i]


# ----------------------------------------------------------------------------------------------
# first-person weapons
# ----------------------------------------------------------------------------------------------
VIEW_W, VIEW_H = 960, 540


def weapon_mesh(wid):
    """Gun + gloved hands for the first-person view.  View space: x forward, y right, z up (metres)."""
    m = Mesh()
    metal = (34, 38, 42)
    dark = (24, 26, 28)
    glove = (27, 36, 44)
    skin = (201, 158, 122)
    body_col = {1: (156, 126, 84), 2: (109, 59, 30), 3: (43, 61, 79), 4: (38, 50, 56), 5: (78, 52, 46), 6: (59, 77, 43),
                7: (26, 29, 32)}[wid]
    accent = (255, 85, 0)
    X = 0.55          # gun start in front of the camera
    if wid in (1, 2):
        m.box((X, 0, 0), (0.62, 0.075, 0.1), body_col)
        m.box((X + 0.02, 0, 0.06), (0.62, 0.08, 0.03), metal)
        m.prism((X + 0.62, 0, 0.012), 0.014, 0.5, "x", metal, 10)
        m.box((X + 0.35, 0, -0.02), (0.3, 0.085, 0.07), (54, 40, 30) if wid == 2 else (60, 64, 68))
        m.box((X + 0.05, 0, -0.14), (0.055, 0.06, 0.22), metal, R=rot_y(0.3))
        m.box((X - 0.38, 0, -0.01), (0.28, 0.06, 0.12), body_col)
        m.box((X + 0.0, 0, -0.01), (0.2, 0.09, 0.025), accent, emissive=False)
        if wid == 1:
            m.box((X + 0.15, 0, 0.1), (0.1, 0.07, 0.05), metal)
        else:
            m.box((X + 0.5, 0, 0.1), (0.03, 0.03, 0.06), metal)
        grip_x, hand_l_x, muz = X - 0.02, X + 0.5, X + 0.9
    elif wid == 3:
        m.box((X + 0.1, 0, 0), (0.9, 0.07, 0.1), body_col)
        m.prism((X + 0.75, 0, 0.012), 0.016, 0.65, "x", metal, 10)
        m.prism((X + 0.15, 0, 0.12), 0.055, 0.42, "x", dark, 12)
        m.prism((X - 0.07, 0, 0.12), 0.07, 0.05, "x", metal, 12)
        m.prism((X + 0.37, 0, 0.12), 0.07, 0.05, "x", metal, 12)
        m.box((X - 0.45, 0, -0.01), (0.3, 0.06, 0.13), body_col)
        m.box((X + 0.05, 0, -0.13), (0.05, 0.06, 0.2), metal, R=rot_y(0.3))
        grip_x, hand_l_x, muz = X - 0.06, X + 0.45, X + 1.1
    elif wid == 4:
        m.box((X, 0, 0), (0.4, 0.085, 0.115), body_col)
        m.box((X + 0.3, 0, 0.01), (0.16, 0.05, 0.05), metal)
        m.box((X + 0.06, 0, -0.17), (0.055, 0.06, 0.26), metal)
        m.box((X - 0.28, 0, 0.0), (0.2, 0.05, 0.1), metal)
        m.box((X, 0, 0.065), (0.34, 0.05, 0.03), accent)
        grip_x, hand_l_x, muz = X - 0.02, X + 0.2, X + 0.46
    elif wid == 5:
        m.box((X + 0.1, 0, 0), (0.78, 0.09, 0.11), body_col)
        m.prism((X + 0.55, 0, 0.055), 0.026, 0.55, "x", metal, 10)
        m.prism((X + 0.55, 0, -0.02), 0.032, 0.55, "x", metal, 10)
        m.box((X + 0.38, 0, -0.06), (0.3, 0.095, 0.065), (96, 70, 60))
        m.box((X - 0.38, 0, -0.01), (0.3, 0.07, 0.13), body_col)
        grip_x, hand_l_x, muz = X - 0.06, X + 0.38, X + 0.85
    elif wid == 6:
        m.prism((X + 0.1, 0, 0.02), 0.07, 1.1, "x", body_col, 12)
        m.prism((X + 0.78, 0, 0.02), 0.105, 0.26, "x", (60, 90, 44), 12, r2=0.025)
        m.prism((X - 0.5, 0, 0.02), 0.09, 0.12, "x", metal, 12, r2=0.11)
        m.box((X + 0.0, 0, -0.1), (0.05, 0.06, 0.18), metal)
        m.box((X + 0.3, 0, 0.1), (0.04, 0.03, 0.05), metal)
        grip_x, hand_l_x, muz = X - 0.02, X + 0.4, X + 1.0
    else:
        m.box((X + 0.05, 0, 0), (0.52, 0.17, 0.17), body_col)
        for k in range(6):
            a = k / 6 * math.tau
            m.prism((X + 0.55, math.cos(a) * 0.045, 0.01 + math.sin(a) * 0.045), 0.013, 0.62, "x", metal, 8)
        m.prism((X + 0.34, 0, 0.01), 0.07, 0.07, "x", (74, 78, 84), 10)
        m.prism((X + 0.8, 0, 0.01), 0.07, 0.04, "x", (74, 78, 84), 10)
        m.box((X - 0.15, 0, 0.12), (0.3, 0.05, 0.05), metal)
        m.box((X - 0.05, 0.02, -0.18), (0.2, 0.17, 0.22), (60, 52, 40))
        grip_x, hand_l_x, muz = X - 0.05, X + 0.38, X + 0.88
    # hands & forearms (right hand on grip, left hand under the fore-end), arms coming from the bottom of the screen
    gz = -0.13 if wid != 7 else -0.12
    rh = np.array([grip_x, 0.0, gz + 0.02])
    lh = np.array([hand_l_x, -0.005, -0.075])
    m.box(rh, (0.11, 0.1, 0.14), glove)
    m.seg(rh + np.array([-0.05, 0.0, -0.03]), rh + np.array([-0.38, 0.12, -0.34]), 0.1, skin)
    m.seg(rh + np.array([-0.38, 0.12, -0.34]), rh + np.array([-0.5, 0.26, -0.6]), 0.13, (30, 44, 54))
    m.box(lh, (0.2, 0.1, 0.1), glove)
    m.seg(lh + np.array([-0.08, 0.0, -0.03]), lh + np.array([-0.42, -0.2, -0.3]), 0.1, skin)
    m.seg(lh + np.array([-0.42, -0.2, -0.3]), lh + np.array([-0.6, -0.34, -0.55]), 0.13, (30, 44, 54))
    return m, muz


def make_weapon_surfaces(wid, size=(VIEW_W, VIEW_H), ss=2):
    """Pre-rendered first-person weapon: returns {'hip': (surface, muzzle_xy), 'ads': (surface, muzzle_xy)}.
    Camera at the origin looking along +x (right = +y, up = +z), 62 degree horizontal FOV like the 3D original."""
    W, H = size
    focal = (W / 2) / math.tan(math.radians(62.0) / 2)
    view = (np.array([0, 1, 0], np.float32), np.array([0, 0, 1], np.float32), np.array([1, 0, 0], np.float32))
    eye = np.zeros(3, np.float32)
    out = {}
    for pose in ("hip", "ads"):
        m, muz = weapon_mesh(wid)
        if pose == "hip":
            R = 0.7 * (rot_z(-0.14) @ rot_y(-0.11))
            t = np.array([0.56, 0.27, -0.25], np.float32)
        else:
            R = 0.72 * rot_y(-0.02)
            t = np.array([0.56, 0.0, -0.16], np.float32)
        m.transform(R, t)
        s = rasterize(m, size, 1.0, (W / 2, H / 2), ss=ss, persp=(eye, focal), view=view, outline=True)
        mp = R @ np.array([muz, 0.0, 0.012], np.float32) + t
        out[pose] = (s, (W / 2 + mp[1] / mp[0] * focal, H / 2 - mp[2] / mp[0] * focal))
    return out
