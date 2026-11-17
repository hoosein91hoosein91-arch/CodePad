"""Procedural textures, sky panorama and the packed texture atlas (numpy + pygame, no asset files)."""
import math
import numpy as np
import pygame

FOG_COLOR = np.array([26, 36, 56], np.float32)


def _arr(surf):
    """pygame Surface -> (H, W, 3) uint8 array."""
    a = pygame.surfarray.array3d(surf)
    return np.ascontiguousarray(a.swapaxes(0, 1))


def _grain(arr, rng, amp=6.0):
    h, w, _ = arr.shape
    n = rng.standard_normal((h, w, 1)).astype(np.float32) * amp
    return np.clip(arr.astype(np.float32) + n, 0, 255).astype(np.uint8)


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ----------------------------------------------------------------------------------------------
# Wall textures. All textures are anchored at the floor (row H-1 == z 0).  PPU = pixels per world unit.
# ----------------------------------------------------------------------------------------------
def tex_wall(rng):
    ppu = 40
    W, H = 6 * ppu, 12 * ppu                       # 6 x 12 world units
    s = pygame.Surface((W, H))
    for y in range(H):
        k = y / H
        s.fill(_lerp((46, 58, 70), (30, 38, 48), k), (0, y, W, 1))
    pal = [(60, 74, 66), (72, 82, 92), (74, 62, 56), (48, 66, 82), (84, 76, 62), (52, 68, 84)]
    brick_h, brick_w = 20, 60
    plinth = int(1.3 * ppu)
    for r in range(0, (H - plinth) // brick_h + 1):
        y = H - plinth - (r + 1) * brick_h
        off = (r % 2) * (brick_w // 2)
        for c in range(-1, W // brick_w + 2):
            x = c * brick_w - off
            col = pal[(r * 3 + c * 7 + 5) % len(pal)]
            v = rng.integers(-8, 9)
            col = tuple(int(np.clip(q + v, 0, 255)) for q in col)
            pygame.draw.rect(s, col, (x + 2, y + 2, brick_w - 4, brick_h - 4))
            pygame.draw.line(s, tuple(min(255, q + 22) for q in col), (x + 2, y + 2), (x + brick_w - 3, y + 2))
            pygame.draw.line(s, tuple(max(0, q - 20) for q in col), (x + 2, y + brick_h - 3), (x + brick_w - 3, y + brick_h - 3))
    # concrete plinth
    pygame.draw.rect(s, (58, 62, 68), (0, H - plinth, W, plinth))
    for x in range(0, W, 30):
        pygame.draw.line(s, (40, 44, 50), (x, H - plinth), (x, H), 2)
    # hazard stripe (orange / black)
    y0, y1 = H - int(1.9 * ppu), H - int(1.3 * ppu)
    pygame.draw.rect(s, (255, 119, 0), (0, y0, W, y1 - y0))
    for x in range(-60, W + 60, 40):
        pygame.draw.polygon(s, (20, 24, 28), [(x, y0), (x + 20, y0), (x + 40 - 0, y1), (x + 20, y1)])
    pygame.draw.line(s, (255, 190, 90), (0, y0), (W, y0), 2)
    # steel bands with rivets
    for zb in (6.0, 11.4):
        yb = H - int(zb * ppu)
        pygame.draw.rect(s, (88, 100, 112), (0, yb - 8, W, 16))
        pygame.draw.line(s, (130, 146, 160), (0, yb - 8), (W, yb - 8), 2)
        pygame.draw.line(s, (30, 36, 42), (0, yb + 7), (W, yb + 7), 2)
        for x in range(10, W, 24):
            pygame.draw.circle(s, (46, 54, 62), (x, yb), 2)
    # neon trim near the top
    pygame.draw.rect(s, (0, 190, 220), (0, 6, W, 3))
    a = _grain(_arr(s), rng, 5)
    return a, 6.0, 12.0


def tex_container(rng, base, stripe, name):
    ppu = 40
    W, H = 4 * ppu, int(5.2 * ppu)
    s = pygame.Surface((W, H))
    s.fill(base)
    for x in range(0, W, 10):
        pygame.draw.rect(s, tuple(max(0, c - 34) for c in base), (x, 0, 3, H))
        pygame.draw.rect(s, tuple(min(255, c + 26) for c in base), (x + 4, 0, 2, H))
    ys0, ys1 = H - int(2.8 * ppu), H - int(2.2 * ppu)
    pygame.draw.rect(s, stripe, (0, ys0, W, ys1 - ys0))
    pygame.draw.rect(s, tuple(min(255, c + 60) for c in stripe), (0, ys0, W, 2))
    pygame.draw.rect(s, (14, 14, 18), (0, 0, W, 10))
    pygame.draw.rect(s, (14, 14, 18), (0, H - 12, W, 12))
    pygame.draw.rect(s, (14, 14, 18), (0, 0, 8, H))
    pygame.draw.rect(s, (14, 14, 18), (W - 8, 0, 8, H))
    f = pygame.font.Font(None, 30)
    t = f.render(name, True, (235, 235, 235))
    s.blit(t, (W // 2 - t.get_width() // 2, ys0 - 40))
    for y in (24, H - 30):
        for x in (18, W - 18):
            pygame.draw.circle(s, (70, 70, 78), (x, y), 3)
    a = _arr(s).astype(np.float32)
    # rust streaks
    streak = rng.random((1, W, 1)) ** 4
    ramp = np.linspace(0.0, 1.0, H, dtype=np.float32).reshape(H, 1, 1) ** 2
    a = a * (1 - 0.35 * streak * ramp) + np.array([30, 14, 0], np.float32) * streak * ramp * 0.4
    a = _grain(np.clip(a, 0, 255).astype(np.uint8), rng, 5)
    return a, 4.0, 5.2


def tex_crate(rng, w_units=2.6, h_units=2.5):
    ppu = 40
    W, H = int(w_units * ppu), int(h_units * ppu)
    s = pygame.Surface((W, H))
    s.fill((59, 73, 50))
    pygame.draw.rect(s, (78, 95, 66), (10, 10, W - 20, H - 20))
    pygame.draw.rect(s, (36, 46, 32), (0, 0, W, H), 9)
    pygame.draw.line(s, (36, 46, 32), (10, 10), (W - 10, H - 10), 7)
    pygame.draw.line(s, (36, 46, 32), (W - 10, 10), (10, H - 10), 7)
    pygame.draw.line(s, (110, 128, 96), (12, 14), (W - 14, 14), 2)
    plate = pygame.Rect(W // 2 - 30, H // 2 - 13, 60, 26)
    pygame.draw.rect(s, (255, 152, 0), plate)
    pygame.draw.rect(s, (20, 20, 20), plate, 2)
    f = pygame.font.Font(None, 22)
    t = f.render("AMMO", True, (17, 17, 17))
    s.blit(t, (plate.centerx - t.get_width() // 2, plate.centery - t.get_height() // 2))
    a = _grain(_arr(s), rng, 6)
    return a, w_units, h_units


def tex_barrier(rng):
    ppu = 40
    W, H = 3 * ppu, int(1.2 * ppu)
    s = pygame.Surface((W, H))
    s.fill((112, 116, 120))
    for y in range(H):
        k = y / H
        s.fill(_lerp((136, 140, 144), (86, 90, 96), k), (0, y, W, 1))
    top = int(0.42 * ppu)
    pygame.draw.rect(s, (255, 214, 0), (0, 6, W, top))
    for x in range(-40, W + 40, 28):
        pygame.draw.polygon(s, (24, 24, 26), [(x, 6), (x + 14, 6), (x + 14 + 12, 6 + top), (x + 12, 6 + top)])
    pygame.draw.rect(s, (60, 64, 70), (0, H - 6, W, 6))
    a = _grain(_arr(s), rng, 7)
    return a, 3.0, 1.2


def tex_top(rng):
    ppu = 40
    W = H = 4 * ppu
    s = pygame.Surface((W, H))
    s.fill((70, 76, 84))
    for i in range(0, W, 40):
        pygame.draw.line(s, (50, 56, 62), (i, 0), (i, H), 2)
        pygame.draw.line(s, (50, 56, 62), (0, i), (W, i), 2)
        pygame.draw.line(s, (96, 104, 112), (i + 2, 0), (i + 2, H), 1)
    for x in range(20, W, 40):
        for y in range(20, H, 40):
            pygame.draw.circle(s, (38, 42, 48), (x, y), 2)
    a = _grain(_arr(s), rng, 6)
    return a, 4.0, 4.0


def tex_floor(rng):
    """256x256 tile = 6.4 x 6.4 world units (40 px / unit)."""
    S = 256
    s = pygame.Surface((S, S))
    s.fill((30, 35, 40))
    for y in range(0, S, 32):
        for x in range(0, S, 32):
            shade = 26 + int(rng.integers(0, 22))
            blue = shade + int(rng.integers(0, 14))
            pygame.draw.rect(s, (shade, shade + 4, blue), (x + 1, y + 1, 30, 30))
            pygame.draw.line(s, (shade + 12, shade + 16, blue + 18), (x + 1, y + 1), (x + 30, y + 1))
    a = _arr(s).astype(np.float32)
    # lane markings (cyan horizontal, orange vertical)
    a[124:132, :, :] = a[124:132, :, :] * 0.5 + np.array([0, 229, 255], np.float32) * 0.5 * 0.55
    a[:, 124:132, :] = a[:, 124:132, :] * 0.5 + np.array([255, 152, 0], np.float32) * 0.5 * 0.55
    # scuffs
    for _ in range(40):
        x, y = rng.integers(0, S, 2)
        l = int(rng.integers(8, 40))
        a[y:y + 2, x:x + l, :] *= 0.8
    return _grain(np.clip(a, 0, 255).astype(np.uint8), rng, 4), 6.4, 6.4


# ----------------------------------------------------------------------------------------------
class Atlas:
    """All wall textures packed in one (N,3) uint8 array so the renderer can gather with one fancy-index."""

    def __init__(self, seed=7):
        rng = np.random.default_rng(seed)
        defs = [
            ("wall", tex_wall(rng)),
            ("blue", tex_container(rng, (21, 67, 96), (0, 229, 255), "CARGO-B")),
            ("red", tex_container(rng, (100, 30, 22), (255, 152, 0), "CARGO-R")),
            ("crate", tex_crate(rng)),
            ("bigcrate", tex_crate(rng, 5.5, 4.4)),
            ("barrier", tex_barrier(rng)),
            ("top", tex_top(rng)),
        ]
        self.names = {}
        chunks, off, tw, th, uw, vh = [], [], [], [], [], []
        pos = 0
        for i, (nm, (arr, uwu, vhu)) in enumerate(defs):
            self.names[nm] = i
            h, w, _ = arr.shape
            chunks.append(arr.reshape(-1, 3))
            off.append(pos)
            tw.append(w)
            th.append(h)
            uw.append(uwu)
            vh.append(vhu)
            pos += h * w
        self.data = np.concatenate(chunks, axis=0)
        self.off = np.array(off, np.int64)
        self.tw = np.array(tw, np.int64)
        self.th = np.array(th, np.int64)
        self.uw = np.array(uw, np.float32)
        self.vh = np.array(vh, np.float32)
        self.floor, _, _ = tex_floor(rng)          # (256,256,3)
        self.preview = {nm: defs[i][1][0] for nm, i in self.names.items()}


# ----------------------------------------------------------------------------------------------
def make_sky(seed=11, SW=1024, SH=256):
    """Panorama: columns = azimuth (0..2pi), rows: 0 = zenith, SH-1 = horizon."""
    rng = np.random.default_rng(seed)
    zen = np.array([4, 7, 18], np.float32)
    mid = np.array([12, 24, 50], np.float32)
    hor = FOG_COLOR.copy()
    v = np.linspace(0, 1, SH, dtype=np.float32).reshape(SH, 1, 1)
    v2 = np.clip((v - 0.55) / 0.45, 0, 1) ** 1.3
    base = np.where(v < 0.55, zen + (mid - zen) * (v / 0.55), mid + (hor - mid) * v2)
    sky = np.repeat(base, SW, axis=1).astype(np.float32)
    # sunset glow near one azimuth
    az = np.linspace(0, 2 * math.pi, SW, dtype=np.float32).reshape(1, SW, 1)
    glow_az = 0.85
    da = np.abs(((az - glow_az + math.pi) % (2 * math.pi)) - math.pi)
    glow = np.exp(-(da / 0.55) ** 2) * np.exp(-((1 - v) / 0.16) ** 1.4 * 1.0)
    sky += glow * np.array([110, 46, 22], np.float32)
    # soft clouds
    n = rng.random((16, 64)).astype(np.float32)
    n = np.kron(n, np.ones((SH // 16, SW // 64), np.float32))
    k = np.ones(25, np.float32) / 25
    n = np.apply_along_axis(lambda r: np.convolve(r, k, mode="same"), 1, n)
    n = np.apply_along_axis(lambda r: np.convolve(r, k, mode="same"), 0, n)
    cl = np.clip((n - 0.5) * 2.0, 0, 1)[:, :, None] * (0.25 + 0.75 * v) * 0.45
    sky += cl * np.array([40, 30, 60], np.float32) * (0.4 + glow * 2)
    sky = np.clip(sky, 0, 255)
    # stars (mostly upper sky)
    for _ in range(2600):
        x = int(rng.integers(0, SW))
        y = int(abs(rng.normal(0, 0.45)) * SH * 0.9) % int(SH * 0.82)
        b = float(rng.uniform(40, 255)) ** 1.0
        sky[y, x, :] = np.minimum(255, sky[y, x, :] + np.array([b, b, min(255, b * 1.1)]))
    # moon
    mx, my, mr = int(SW * 0.62), int(SH * 0.22), 9
    yy, xx = np.ogrid[:SH, :SW]
    d2 = (xx - mx) ** 2 + (yy - my) ** 2
    sky[d2 < (mr + 8) ** 2] += (np.clip(1 - np.sqrt(d2[d2 < (mr + 8) ** 2]) / (mr + 8), 0, 1)[:, None] ** 2) * np.array([30, 40, 60])
    sky[d2 < mr ** 2] = np.array([225, 232, 245])
    return np.clip(sky, 0, 255).astype(np.uint8)
