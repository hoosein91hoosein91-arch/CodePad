"""Turns the game state into a picture: camera, sprites, particles, tracers, glows, lasers and markers."""
import math
import random

import numpy as np
import pygame

from t8_models import SOLDIER_WORLD, FALL_WORLD, N_AZ
from t8_render import Camera
from t8_world import LIGHTS

BEACON_GLOW = [(255, 110, 20), (0, 200, 255), (0, 255, 150), (255, 30, 100), (255, 190, 30)]
_soft = {}


def soft_disc(r, color, alpha):
    key = (r, color, alpha)
    s = _soft.get(key)
    if s is None:
        d = r * 2 + 2
        s = pygame.Surface((d, d), pygame.SRCALPHA)
        yy, xx = np.mgrid[0:d, 0:d]
        dist = np.sqrt((xx - r) ** 2 + (yy - r) ** 2) / max(r, 1)
        a = np.clip(1.0 - dist, 0, 1) ** 0.6 * alpha
        arr = np.zeros((d, d, 4), np.uint8)
        arr[:, :, 0], arr[:, :, 1], arr[:, :, 2] = color
        arr[:, :, 3] = a.astype(np.uint8)
        pygame.surfarray.blit_array(s, arr[:, :, :3].swapaxes(0, 1))
        pygame.surfarray.pixels_alpha(s)[:] = arr[:, :, 3].swapaxes(0, 1)
        _soft[key] = s
        if len(_soft) > 400:
            _soft.clear()
    return s


class SceneState:
    def __init__(self):
        self.cam = Camera()
        self.t = 0.0


def setup_camera(game, scene, dt):
    p = game.player
    cam = scene.cam
    cam.x, cam.y = p.x, p.y
    cam.z = p.z
    sh = game.shake
    cam.yaw = p.yaw + random.uniform(-1, 1) * sh * 0.025
    pit = p.pitch + (p.death_pitch if not p.alive else 0.0) + random.uniform(-1, 1) * sh * 0.02
    # scope sway
    if p.ads > 0.5 and p.cur == 3:
        scene.t += dt
        k = 0.0016 * (0.4 if p.crouch > 0.5 else 1.0)
        cam.yaw += math.sin(scene.t * 1.3) * k
        pit += math.cos(scene.t * 1.7) * k
    cam.pitch = max(-1.3, min(1.3, pit))
    cam.fov = p.fov


def draw_scene(game, scene, rend, bank):
    p = game.player
    cam = scene.cam
    rend.render(cam)
    fx_, fy_ = rend.fx, rend.fy
    px, py = cam.x, cam.y
    items = []     # (depth, kind, obj)
    for s in game.soldiers:
        d = (s.x - px) * fx_ + (s.y - py) * fy_
        if 0.4 < d < 110:
            items.append((d, "soldier", s))
    for t in game.turrets:
        d = (t.x - px) * fx_ + (t.y - py) * fy_
        if 0.4 < d < 110:
            items.append((d, "turret", t))
    for b in game.barrels:
        if b.alive:
            d = (b.x - px) * fx_ + (b.y - py) * fy_
            if 0.4 < d < 110:
                items.append((d, "barrel", b))
    for pk in game.pickups:
        d = (pk.x - px) * fx_ + (pk.y - py) * fy_
        if 0.4 < d < 110:
            items.append((d, "pickup", pk))
    for g_ in game.grenades:
        d = (g_.x - px) * fx_ + (g_.y - py) * fy_
        if 0.3 < d < 110:
            items.append((d, "grenade", g_))
    for dr in game.drops:
        d = (dr["x"] - px) * fx_ + (dr["y"] - py) * fy_
        if 0.3 < d < 140:
            items.append((d, "drop", dr))
    items.sort(key=lambda t: -t[0])
    for d, kind, o in items:
        if kind == "soldier":
            _draw_soldier(rend, bank, o, px, py)
        elif kind == "turret":
            ang = math.atan2(py - o.y, px - o.x) - o.facing
            i = int(round((ang % math.tau) / math.tau * N_AZ)) % N_AZ
            img = bank.frames[("turret", "shoot" if o.flash_t > 0 else "idle")][i]
            rend.draw_billboard(img, o.x, o.y, 0.0, 1.25, 1.375, flash=0.0)
        elif kind == "barrel":
            rend.draw_billboard(bank.props["barrel"], o.x, o.y, 0.0, 2.0, 1.25)
        elif kind == "pickup":
            name = {"ammo": "ammo", "med": "med", "armor": "armor", "drop": "drop"}[o.kind]
            img = bank.props[name]
            h, w = img.shape[:2]
            z0 = 0.35 + 0.1 * math.sin(o.t * 3.0) if o.kind != "drop" else 0.0
            sc = 1.0 if o.kind != "drop" else 1.0
            rend.draw_billboard(img, o.x, o.y, z0, h / 64.0 * sc, w / 64.0 * sc, emissive=False)
        elif kind == "grenade":
            rend.draw_billboard(bank.props["grenade"], o.x, o.y, o.z - 0.15, 0.375, 0.375)
        elif kind == "drop":
            img = bank.props["drop_chute"]
            h, w = img.shape[:2]
            rend.draw_billboard(img, o["x"], o["y"], o["z"], h / 64.0, w / 64.0)
    surf = rend.to_surface()
    _draw_effects(game, rend, surf, p, cam)
    return surf


def _draw_soldier(rend, bank, s, px, py):
    kind = s.kind
    rel = math.atan2(py - s.y, px - s.x) - s.facing
    sc = s.scale
    if not s.alive:
        if s.death_t > 6.0:
            return
        pose = "fall1" if s.death_t < 0.3 else "fall2"
        img = bank.soldier(kind, pose, rel)
        rend.draw_billboard(img, s.x, s.y, 0.0, FALL_WORLD[1] * sc, FALL_WORLD[0] * sc, tint=(0.85, 0.85, 0.85))
        return
    if s.crouch > 0.5:
        pose = "crouch"
    elif s.flash_t > 0:
        pose = "shoot"
    elif s.moving:
        pose = "walkA" if int(s.walk) % 2 == 0 else "walkB"
    else:
        pose = "idle"
    img = bank.soldier(kind, pose, rel)
    hf = s.hit_flash * 5.0
    rend.draw_billboard(img, s.x, s.y, 0.0, SOLDIER_WORLD[1] * sc, SOLDIER_WORLD[0] * sc, flash=min(0.7, hf))


def _line3(rend, surf, a, b, color, width=1):
    """Draw a 3D segment with near-plane clipping."""
    cam = rend.cam
    da = (a[0] - cam.x) * rend.fx + (a[1] - cam.y) * rend.fy
    db = (b[0] - cam.x) * rend.fx + (b[1] - cam.y) * rend.fy
    near = 0.25
    if da < near and db < near:
        return
    if da < near:
        t = (near - da) / (db - da)
        a = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
    elif db < near:
        t = (near - db) / (da - db)
        b = (b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t, b[2] + (a[2] - b[2]) * t)
    pa = rend.project(*a)
    pb = rend.project(*b)
    if pa is None or pb is None:
        return
    try:
        pygame.draw.line(surf, color, (pa[0], pa[1]), (pb[0], pb[1]), width)
    except Exception:
        pass


def _visible_fast(rend, sx, sy, depth):
    if not (0 <= sx < rend.W and 0 <= sy < rend.H):
        return False
    c = int(sx)
    lt = rend.lt_list[c]
    lc = rend.lc_list[c]
    for k in range(len(lt)):
        if lt[k] < depth and lc[k] <= sy:
            return False
    return True


def _draw_effects(game, rend, surf, p, cam):
    rend.lt_list = rend.layer_t.tolist()
    rend.lc_list = rend.layer_cov.tolist()
    # beacons (neon lamps)
    for (lx, ly, lz, col, inten, rad), gc in zip(LIGHTS, BEACON_GLOW):
        rend.add_glow(surf, lx, ly, lz + 0.2, 1.8, gc, 0.85)
    # tracers
    for t in game.tracers:
        f = max(0.0, t[7] / t[8])
        c = tuple(int(v * (0.4 + 0.6 * f)) for v in t[6])
        _line3(rend, surf, (t[0], t[1], t[2]), (t[3], t[4], t[5]), c, 1)
    # snipers aiming (laser lines)
    for s in game.soldiers:
        if s.alive and s.laser and s.aim_t > 0 and s.tgt_vis and s.target is not None:
            col = (255, 20, 20) if s.team == 1 else (60, 160, 255)
            t = s.target
            _line3(rend, surf, (s.x + math.cos(s.facing) * 0.8, s.y + math.sin(s.facing) * 0.8, 1.25), (t.x, t.y, t.tz), col, 1)
    # explosions
    for f in game.fx:
        k = f["t"] / f["dur"]
        r = f["r"] * (0.5 + 1.8 * k)
        inten = (1 - k) ** 1.3
        rend.add_glow(surf, f["x"], f["y"], f["z"] + 0.6 * k * 2, r, (255, 150, 50), 1.1 * inten, check_occlusion=False)
        rend.add_glow(surf, f["x"], f["y"], f["z"] + 0.3, r * 0.5, (255, 240, 180), 1.3 * inten, check_occlusion=False)
    # airstrike markers
    for st in game.strikes:
        if st["t"] > 0:
            pulse = 0.5 + 0.5 * math.sin(game.time * 14)
            col = (255, int(40 + 60 * pulse), 40)
            for rad in (2.2, 4.5):
                pts = []
                for i in range(20):
                    a = i / 20 * math.tau
                    pr = rend.project(st["x"] + math.cos(a) * rad, st["y"] + math.sin(a) * rad, 0.06)
                    if pr is None:
                        pts = None
                        break
                    pts.append((pr[0], pr[1]))
                if pts:
                    pygame.draw.lines(surf, col, True, pts, 1)
            _line3(rend, surf, (st["x"], st["y"], 0.0), (st["x"], st["y"], 40.0), (255, 60, 40), 1)
            # bomb line
            for i in range(st["n"]):
                k = i - (st["n"] - 1) / 2
                bx, by = st["x"] + st["dx"] * k * 4.2, st["y"] + st["dy"] * k * 4.2
                pr = rend.project(bx, by, 0.1)
                if pr:
                    pygame.draw.circle(surf, (255, 90, 40), (int(pr[0]), int(pr[1])), max(1, int(8.0 * rend.f / pr[2] / 6)), 1)
    # rockets
    for r in game.rockets:
        rend.add_glow(surf, r.x, r.y, r.z, 0.9, (255, 160, 60), 1.0, check_occlusion=False)
        rend.add_glow(surf, r.x, r.y, r.z, 0.35, (255, 255, 200), 1.0, check_occlusion=False)
    # pickup glow
    for pk in game.pickups:
        col = {"ammo": (255, 190, 60), "med": (80, 255, 120), "armor": (60, 200, 255), "drop": (255, 230, 120)}[pk.kind]
        rend.add_glow(surf, pk.x, pk.y, 0.5, 1.2 if pk.kind != "drop" else 2.0, col, 0.5 + 0.2 * math.sin(pk.t * 4))
    # muzzle flashes of enemies / turrets
    for s in game.soldiers:
        if s.alive and s.flash_t > 0:
            rend.add_glow(surf, s.x + math.cos(s.facing) * 0.9, s.y + math.sin(s.facing) * 0.9, 1.25 * s.scale, 0.7,
                          (255, 220, 120) if s.team == 1 else (140, 210, 255), 1.0)
    for t in game.turrets:
        if t.flash_t > 0:
            rend.add_glow(surf, t.x + math.cos(t.facing) * 1.0, t.y + math.sin(t.facing) * 1.0, 0.95, 0.7, (120, 255, 255), 1.0)
    # particles
    smoke_budget = 45
    for pt in game.particles:
        x, y, z, vx, vy, vz, life, maxl, size, col, grav, kind = pt
        pr = rend.project(x, y, z)
        if pr is None:
            continue
        sx, sy, d = pr
        if not _visible_fast(rend, sx, sy, d):
            continue
        k = max(0.0, life / maxl)
        rad = max(1, int(size * 0.05 * rend.f / d))
        if kind == "smoke":
            if smoke_budget <= 0:
                continue
            smoke_budget -= 1
            rr = min(40, max(2, int(size * 0.35 * rend.f / d)))
            s = soft_disc(rr, (60, 60, 66), int(110 * k))
            surf.blit(s, (int(sx) - rr, int(sy) - rr))
        elif kind == "fire":
            rr = min(30, max(2, int(size * 0.3 * rend.f / d)))
            g = rend.glow(rr * 2, (int(col[0] * k), int(col[1] * k), int(col[2] * k)))
            surf.blit(g, (int(sx - g.get_width() / 2), int(sy - g.get_height() / 2)), special_flags=pygame.BLEND_RGB_ADD)
        else:
            c = (int(col[0] * (0.3 + 0.7 * k)), int(col[1] * (0.3 + 0.7 * k)), int(col[2] * (0.3 + 0.7 * k)))
            if rad <= 1:
                surf.set_at((int(sx), int(sy)), c)
            else:
                pygame.draw.rect(surf, c, (int(sx) - rad // 2, int(sy) - rad // 2, rad, rad))
    # soldier health bars + UAV markers
    for s in game.soldiers:
        if not s.alive:
            continue
        pr = rend.project(s.x, s.y, s.height + 0.35)
        if pr is None:
            continue
        sx, sy, d = pr
        uav = (s.team == 1 and p.uav_t > 0)
        if d > (70 if s.team == 1 else 45) and not uav:
            continue
        vis = _visible_fast(rend, sx, sy, d)
        if not vis and not uav:
            continue
        w = max(10, min(36, int(26 * 7 / max(d, 4))))
        w = max(10, min(32, int(70 / max(d, 2.5) * 3)))
        x0, y0 = int(sx - w / 2), int(sy)
        if vis:
            pygame.draw.rect(surf, (0, 0, 0), (x0 - 1, y0 - 1, w + 2, 4))
            fr = max(0.0, s.hp / s.max_hp)
            colb = (0, 229, 255) if s.team == 0 else (255, 23, 68)
            pygame.draw.rect(surf, colb, (x0, y0, max(1, int(w * fr)), 2))
        if uav:
            pygame.draw.polygon(surf, (255, 40, 60), [(sx - 4, sy - 12), (sx + 4, sy - 12), (sx, sy - 5)])
            pygame.draw.polygon(surf, (255, 200, 200), [(sx - 4, sy - 12), (sx + 4, sy - 12), (sx, sy - 5)], 1)
    # sniper laser dot on player's side etc. is covered by the HUD warning
