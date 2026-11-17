"""HUD, menus, shop, weapon view-model and text rendering (Persian shaping when libraries/fonts are available)."""
import math

import numpy as np
import pygame

from t8_data import (STR, HELP_ROWS, HELP_TIPS, DIFF_NAMES, DIFF_DESC, DIFF_ORDER, SHOP, SHOP_TEXT, WEAPONS, KIND_NAME)
from t8_models import make_weapon_surfaces
from t8_world import ALLY_SPAWNS

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    _SHAPER = arabic_reshaper.ArabicReshaper(configuration={"delete_harakat": True, "support_ligatures": True})
except Exception:       # pragma: no cover
    _SHAPER = None
    get_display = None

CYAN = (0, 229, 255)
ORANGE = (255, 152, 0)
RED = (255, 23, 68)
GREEN = (0, 230, 118)
YELLOW = (255, 235, 59)
WHITE = (255, 255, 255)
PERSIAN_FONTS = ["vazirmatn", "vazir", "sahel", "iransans", "yekan", "tahoma", "segoeui", "notosansarabic",
                 "notonaskharabic", "dejavusans", "freesans", "geezapro", "arialunicodems", "arial", "times"]
LATIN_FONTS = ["bahnschrift", "segoeui", "arial", "helvetica", "dejavusans", "liberationsans", "freesans"]


def has_arabic(s):
    for ch in s:
        o = ord(ch)
        if 0x0600 <= o <= 0x06FF or 0xFB50 <= o <= 0xFEFF:
            return True
    return False


class Fonts:
    def __init__(self):
        self.latin_path = None
        for n in LATIN_FONTS:
            p = pygame.font.match_font(n, bold=True)
            if p:
                self.latin_path = p
                break
        self.fa_path = None
        if _SHAPER is not None:
            seen = set()
            for n in PERSIAN_FONTS:
                p = pygame.font.match_font(n)
                if not p or p in seen:
                    continue
                seen.add(p)
                try:
                    f = pygame.font.Font(p, 24)
                    missing = pygame.image.tostring(f.render("\uffff", True, (255, 255, 255)), "RGBA")
                    ok = True
                    for ch in "\u067e\u0686\u06af\u0698\u0627\u0628":
                        if pygame.image.tostring(f.render(ch, True, (255, 255, 255)), "RGBA") == missing:
                            ok = False
                            break
                    if ok:
                        self.fa_path = p
                        break
                except Exception:
                    continue
        self.fa_ok = self.fa_path is not None
        self._fonts = {}
        self._text = {}

    def font(self, size, fa):
        k = (size, fa)
        f = self._fonts.get(k)
        if f is None:
            path = self.fa_path if fa else self.latin_path
            f = pygame.font.Font(path, size)
            if not fa and self.latin_path:
                f.set_bold(False)
            self._fonts[k] = f
        return f

    def render(self, text, size, color, outline=False):
        fa = self.fa_ok and has_arabic(text)
        key = (text, size, color, outline, fa)
        s = self._text.get(key)
        if s is not None:
            return s
        f = self.font(size, fa)
        t = text
        if fa:
            try:
                t = get_display(_SHAPER.reshape(text))
            except Exception:
                t = text
        base = f.render(t, True, color)
        if outline:
            o = f.render(t, True, (0, 0, 0))
            w, h = base.get_size()
            surf = pygame.Surface((w + 4, h + 4), pygame.SRCALPHA)
            for dx, dy in ((0, 2), (4, 2), (2, 0), (2, 4), (0, 0), (4, 4), (0, 4), (4, 0)):
                surf.blit(o, (dx, dy))
            surf.blit(base, (2, 2))
            base = surf
        if len(self._text) > 1500:
            self._text.clear()
        self._text[key] = base
        return base


class UI:
    def __init__(self, screen, fonts, views=True):
        self.fonts = fonts
        self.lang = 0
        self.weapon_views = {}
        self.menu_rects = []
        self.shop_rects = []
        self._vig = None
        self.mouse_pos = None            # set by the 3D front-end (canvas coordinates)
        self.resize(screen)
        if views:
            self.build_weapon_views()

    # ------------------------------------------------------------------------------------------------
    def tr(self, key, **fmt):
        v = STR[key][self.lang]
        return v.format(**fmt) if fmt else v

    def resize(self, screen):
        self.screen = screen
        self.W, self.H = screen.get_size()
        self.u = self.H / 720.0
        self._vig = None
        self._scope = None
        self._flash_surf = pygame.Surface((self.W, self.H), pygame.SRCALPHA if (screen.get_flags() & pygame.SRCALPHA) else 0)
        if self.weapon_views:
            self.build_weapon_views()

    def build_weapon_views(self):
        sc = self.W / 960.0
        self.weapon_views = {}
        if not hasattr(self, "_raw_views"):
            self._raw_views = {wid: make_weapon_surfaces(wid) for wid in WEAPONS}
        for wid, d in self._raw_views.items():
            out = {}
            for pose, (surf, mz) in d.items():
                if abs(sc - 1.0) > 1e-3:
                    s2 = pygame.transform.smoothscale(surf, (int(surf.get_width() * sc), int(surf.get_height() * sc)))
                else:
                    s2 = surf
                out[pose] = (s2, (mz[0] * sc, mz[1] * sc))
            self.weapon_views[wid] = out

    # ------------------------------------------------------------------------------------------------ text
    def text(self, s, size, color, pos, anchor="topleft", outline=True, alpha=255):
        size = max(8, int(size * self.u))
        surf = self.fonts.render(s, size, color, outline)
        r = surf.get_rect()
        setattr(r, anchor, (int(pos[0]), int(pos[1])))
        if alpha < 255:
            surf = surf.copy()
            surf.set_alpha(alpha)
        self.screen.blit(surf, r)
        return r

    def panel(self, rect, color=(10, 16, 24), alpha=170, border=None, radius=8):
        s = pygame.Surface((rect[2], rect[3]), pygame.SRCALPHA)
        pygame.draw.rect(s, (*color, alpha), (0, 0, rect[2], rect[3]), border_radius=radius)
        if border:
            pygame.draw.rect(s, border, (0, 0, rect[2], rect[3]), 2, border_radius=radius)
        self.screen.blit(s, (rect[0], rect[1]))

    def bar(self, x, y, w, h, frac, color, bg=(255, 255, 255, 40), border=True):
        frac = max(0.0, min(1.0, frac))
        s = pygame.Surface((w, h), pygame.SRCALPHA)
        s.fill((20, 24, 30, 190))
        self.screen.blit(s, (x, y))
        pygame.draw.rect(self.screen, color, (x, y, int(w * frac), h))
        if border:
            pygame.draw.rect(self.screen, (230, 230, 230), (x, y, w, h), 1)

    # ------------------------------------------------------------------------------------------------ vignettes
    def vignette(self, color, strength):
        if self._vig is None:
            self._vig = {}
        key = color
        v = self._vig.get(key)
        if v is None:
            W, H = self.W // 4, self.H // 4
            yy, xx = np.mgrid[0:H, 0:W]
            d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
            a = np.clip((d - 0.55) / 0.75, 0, 1) ** 1.6
            arr = np.zeros((H, W, 3), np.uint8)
            arr[:, :] = color
            s = pygame.Surface((W, H), pygame.SRCALPHA)
            pygame.surfarray.blit_array(s, arr.swapaxes(0, 1))
            pygame.surfarray.pixels_alpha(s)[:] = (a * 255).astype(np.uint8).swapaxes(0, 1)
            v = pygame.transform.smoothscale(s, (self.W, self.H))
            self._vig[key] = v
        v.set_alpha(int(255 * max(0.0, min(1.0, strength))))
        self.screen.blit(v, (0, 0))

    def mouse(self):
        return self.mouse_pos if self.mouse_pos is not None else pygame.mouse.get_pos()

    def additive_flash(self, color, strength):
        if strength <= 0.01:
            return
        if self.screen.get_flags() & pygame.SRCALPHA:        # overlay canvas (3D front-end): plain alpha fill
            self._flash_surf.fill((*color, int(min(255, 150 * strength))))
            self.screen.blit(self._flash_surf, (0, 0))
            return
        c = tuple(int(min(255, ch * strength)) for ch in color)
        self._flash_surf.fill(c)
        self.screen.blit(self._flash_surf, (0, 0), special_flags=pygame.BLEND_RGB_ADD)

    def scope(self):
        if self._scope is None:
            W, H = self.W, self.H
            s = pygame.Surface((W, H), pygame.SRCALPHA)
            s.fill((0, 0, 0, 255))
            pygame.draw.circle(s, (0, 0, 0, 0), (W // 2, H // 2), int(H * 0.46))
            # soft edge ring
            ring = pygame.Surface((W, H), pygame.SRCALPHA)
            pygame.draw.circle(ring, (0, 0, 0, 120), (W // 2, H // 2), int(H * 0.46), int(H * 0.025))
            s.blit(ring, (0, 0))
            self._scope = s
        self.screen.blit(self._scope, (0, 0))
        cx, cy = self.W // 2, self.H // 2
        r = int(self.H * 0.46)
        red = (255, 30, 30)
        pygame.draw.line(self.screen, red, (cx - r, cy), (cx + r, cy), 1)
        pygame.draw.line(self.screen, red, (cx, cy - r), (cx, cy + r), 1)
        for i in range(1, 9):
            o = int(i * r / 9)
            for sgn in (-1, 1):
                pygame.draw.line(self.screen, red, (cx + sgn * o, cy - 4), (cx + sgn * o, cy + 4), 1)
                pygame.draw.line(self.screen, red, (cx - 4, cy + sgn * o), (cx + 4, cy + sgn * o), 1)
        pygame.draw.circle(self.screen, red, (cx, cy), 3)

    # ------------------------------------------------------------------------------------------------ view-model
    def draw_viewmodel(self, game, t):
        p = game.player
        if not p.alive:
            return
        if p.ads > 0.5 and p.cur == 3:
            return
        u = self.u
        views = self.weapon_views[p.cur]
        hip, hip_mz = views["hip"]
        ads, ads_mz = views["ads"]
        bob_x = math.cos(p.bob_t * 0.5) * 7 * u * (0 if p.speed < 1 else 1) * (1 - p.ads)
        bob_y = abs(math.sin(p.bob_t * 0.5 * 2)) * 6 * u * (0 if p.speed < 1 else 1) * (1 - p.ads)
        sway = math.sin(t * 1.3) * 1.5 * u
        dip = 0.0
        if p.swap_t > 0:
            dip = min(1.0, p.swap_t / 0.3) * 230 * u
        if p.reload_t > 0:
            prog = 1 - p.reload_t / max(0.01, p.reload_total)
            dip = max(dip, math.sin(min(1.0, prog * 1.15) * math.pi) * 250 * u)
        if p.sprinting:
            dip = max(dip, 70 * u)
        kick = p.view_kick
        ox = bob_x + sway
        use_ads = p.ads > 0.5
        dip += math.sin(math.pi * min(1.0, max(0.0, p.ads))) * 38 * u          # small dip while shouldering the gun
        oy = bob_y + dip + kick * 26 * u
        surf, mz = (ads, ads_mz) if use_ads else (hip, hip_mz)
        sc = 1.0 + kick * 0.04
        s2 = surf
        if kick > 0.02:
            s2 = pygame.transform.rotozoom(surf, kick * 1.2, sc)
        r = s2.get_rect(center=(self.W // 2 + ox, self.H // 2 + oy))
        self.screen.blit(s2, r)
        if p.muzzle_t > 0:
            mz = ads_mz if p.ads > 0.5 else hip_mz
            cx, cy = self.W // 2 + ox + (mz[0] - self.W / 2), self.H // 2 + oy + (mz[1] - self.H / 2)
            k = p.muzzle_t / 0.06
            r = int(70 * u * (0.7 + 0.5 * k))
            g = self._glow(r, (255, 190, 80))
            self.screen.blit(g, (int(cx - r), int(cy - r)), special_flags=pygame.BLEND_RGB_ADD)
            pygame.draw.circle(self.screen, (255, 240, 200), (int(cx), int(cy)), max(3, int(10 * u * k)))

    def _glow(self, r, color):
        if not hasattr(self, "_gl"):
            self._gl = {}
        k = (r, color)
        g = self._gl.get(k)
        if g is None:
            yy, xx = np.mgrid[-r:r, -r:r]
            d = np.sqrt((xx + 0.5) ** 2 + (yy + 0.5) ** 2) / r
            a = np.clip(1 - d, 0, 1) ** 2
            arr = (a[:, :, None] * np.array(color, np.float32)).astype(np.uint8)
            g = pygame.Surface((r * 2, r * 2))
            pygame.surfarray.blit_array(g, arr.swapaxes(0, 1))
            self._gl[k] = g
        return g

    # ------------------------------------------------------------------------------------------------ HUD
    def draw_hud(self, game, rend, t):
        p = game.player
        u = self.u
        W, H = self.W, self.H
        cx, cy = W // 2, H // 2
        # world flashes / vignettes
        self.additive_flash(game.flash_col, game.flash * 0.9)
        if game.blood > 0:
            self.vignette((200, 0, 0), game.blood)
        if p.alive and p.hp < 30:
            pulse = 0.35 + 0.25 * math.sin(t * 7)
            self.vignette((150, 0, 0), pulse * (1 - p.hp / 30))
        if p.alive and p.stim_t > 0:
            self.vignette((0, 200, 90), 0.25)
        if p.bt_active:
            self.vignette((40, 120, 255), 0.30)
        if p.invuln > 0:
            self.vignette((0, 229, 255), 0.25)
        if p.ads > 0.5 and p.cur == 3 and p.alive:
            self.scope()
        # crosshair
        if p.alive and not (p.ads > 0.5 and p.cur == 3):
            self.draw_crosshair(game, rend)
        # damage direction
        for dx, dy, tl in game.dmg_dirs:
            ang = math.atan2(dy - p.y, dx - p.x) - p.yaw
            r = 150 * u
            ax, ay = cx + math.sin(ang) * r, cy - math.cos(ang) * r
            a = max(0.0, min(1.0, tl / 1.0))
            nx, ny = math.sin(ang), -math.cos(ang)
            px_, py_ = -ny, nx
            pts = [(ax + nx * 28 * u, ay + ny * 28 * u), (ax + px_ * 18 * u, ay + py_ * 18 * u),
                   (ax - px_ * 18 * u, ay - py_ * 18 * u)]
            s = pygame.Surface((W, H), pygame.SRCALPHA)
            pygame.draw.polygon(s, (255, 30, 30, int(200 * a)), pts)
            self.screen.blit(s, (0, 0))
        # minimap
        self.draw_minimap(game, rend)
        self.draw_body(game)
        self.draw_top(game)
        self.draw_stats(game)
        self.draw_bottom(game)
        self.draw_feed(game)
        self.draw_banners(game)
        self.draw_popups(game)
        # grenade warning arrows
        for g_ in game.grenades:
            if g_.team == 1 and math.hypot(g_.x - p.x, g_.y - p.y) < 13 and p.alive:
                ang = math.atan2(g_.y - p.y, g_.x - p.x) - p.yaw
                ax, ay = cx + math.sin(ang) * 210 * u, cy - math.cos(ang) * 210 * u
                pygame.draw.circle(self.screen, (255, 120, 20), (int(ax), int(ay)), int(14 * u), 3)
                self.text("!", 22, (255, 220, 60), (ax, ay), "center")
        # death / respawn overlay
        if not p.alive and game.phase != "gameover":
            self.text(self.tr("you_died"), 52, (255, 60, 60), (cx, cy - 40 * u), "center")
            self.text(self.tr("respawn_in", n=max(1, math.ceil(p.respawn_t))), 28, WHITE, (cx, cy + 20 * u), "center")
        # intermission hint
        if game.phase == "intermission" and p.alive and game.wave >= 1:
            self.text(self.tr("next_wave", n=max(0, int(game.phase_t) + 1)), 20, YELLOW, (cx, H - 160 * u), "center")
        elif game.phase == "intermission" and game.wave == 0:
            self.text(self.tr("get_ready"), 26, YELLOW, (cx, H - 160 * u), "center")

    def draw_world_markers(self, game, scene):
        """Health bars above soldiers and UAV markers, projected from the real 3D camera."""
        p = game.player
        W, H = self.W, self.H
        u = self.u
        cam_eye = (scene.cx, scene.cy, scene.cz)
        for s in game.soldiers:
            if not s.alive:
                continue
            pr = scene.project(s.x, s.y, s.height + 0.4, W, H)
            if pr is None:
                continue
            sx, sy, d = pr
            uav = (s.team == 1 and p.uav_t > 0)
            if d > (75 if s.team == 1 else 45) and not uav:
                continue
            if not (-40 < sx < W + 40 and -40 < sy < H + 40):
                continue
            vis = game.world.los(cam_eye[0], cam_eye[1], cam_eye[2], s.x, s.y, s.height + 0.2)
            if not vis and not uav:
                continue
            w = int(max(26 * u, min(90 * u, 190 * u / max(d, 2.5))))
            x0, y0 = int(sx - w / 2), int(sy)
            if vis:
                pygame.draw.rect(self.screen, (0, 0, 0, 255), (x0 - 1, y0 - 1, w + 2, int(5 * u) + 2))
                fr = max(0.0, s.hp / s.max_hp)
                colb = (0, 229, 255) if s.team == 0 else (255, 23, 68)
                pygame.draw.rect(self.screen, colb, (x0, y0, max(1, int(w * fr)), max(2, int(5 * u))))
            if uav:
                tri = [(sx - 7 * u, sy - 20 * u), (sx + 7 * u, sy - 20 * u), (sx, sy - 8 * u)]
                pygame.draw.polygon(self.screen, (255, 40, 60), tri)
                pygame.draw.polygon(self.screen, (255, 200, 200), tri, 1)

    def draw_crosshair(self, game, rend):
        p = game.player
        u = self.u
        cx, cy = self.W // 2, self.H // 2
        # spread -> pixels: spread radians * (screen height / vertical fov)
        vfov = 2 * math.atan(math.tan(math.radians(p.fov) / 2) * self.H / self.W)
        gap = max(5 * u, p.spread_now() * self.H / vfov)
        L = 9 * u
        col = (0, 255, 120)
        if p.ads > 0.5:
            pygame.draw.circle(self.screen, (0, 0, 0), (cx, cy), int(3 * u) + 2)
            pygame.draw.circle(self.screen, (255, 40, 70), (cx, cy), max(2, int(3 * u)))
        else:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                a = (cx + dx * gap, cy + dy * gap)
                b = (cx + dx * (gap + L), cy + dy * (gap + L))
                pygame.draw.line(self.screen, (0, 0, 0), a, b, int(5 * u) if u > 0.7 else 4)
                pygame.draw.line(self.screen, col, a, b, max(2, int(3 * u)))
            pygame.draw.circle(self.screen, (255, 30, 60), (cx, cy), max(2, int(2.5 * u)))
        # hit marker
        if game.hit_t > 0:
            zc = {"head": (255, 23, 68), "chest": (255, 171, 0)}.get(game.hit_zone, WHITE)
            k = game.hit_t / 0.12
            g = (10 + 8 * (1 - k)) * u
            for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
                a = (cx + dx * g, cy + dy * g)
                b = (cx + dx * (g + 9 * u), cy + dy * (g + 9 * u))
                pygame.draw.line(self.screen, (0, 0, 0), a, b, int(5 * u) + 1)
                pygame.draw.line(self.screen, zc, a, b, max(2, int(3 * u)))
        if game.hit_popup:
            txt, col, tl = game.hit_popup
            self.text(txt, 20, col, (cx, cy + 46 * u), "center", alpha=int(255 * min(1, tl / 0.3)))

    def draw_minimap(self, game, rend):
        p = game.player
        u = self.u
        S = int(150 * u)
        x0, y0 = int(12 * u), int(12 * u)
        surf = pygame.Surface((S, S), pygame.SRCALPHA)
        pygame.draw.circle(surf, (8, 15, 22, 215), (S // 2, S // 2), S // 2)
        sc = (S / 2) / 56.0
        cs, sn = math.cos(p.yaw), math.sin(p.yaw)

        def tr(wx, wy):
            dx, dy = wx - p.x, wy - p.y
            mx = dx * (-sn) + dy * cs
            my = -(dx * cs + dy * sn)
            return S / 2 + mx * sc, S / 2 + my * sc

        # walls
        for b in game.world.boxes:
            hw, hd = b["w"] / 2, b["d"] / 2
            c, s_ = math.cos(b["rot"]), math.sin(b["rot"])
            pts = []
            for lx, ly in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)):
                wx = b["cx"] + lx * c - ly * s_
                wy = b["cy"] + lx * s_ + ly * c
                pts.append(tr(wx, wy))
            col = (60, 90, 110) if b["h"] > 3 else (40, 60, 70)
            pygame.draw.polygon(surf, col, pts)
        pygame.draw.circle(surf, (0, 229, 255, 60), (S // 2, S // 2), S // 2 - 2, 2)
        for s in game.soldiers:
            if not s.alive:
                continue
            show = s.team == 0 or p.uav_t > 0 or math.hypot(s.x - p.x, s.y - p.y) < 32 or s.flash_t > 0
            if not show:
                continue
            mx, my = tr(s.x, s.y)
            if (mx - S / 2) ** 2 + (my - S / 2) ** 2 < (S / 2 - 4) ** 2:
                col = (0, 229, 255) if s.team == 0 else (255, 30, 60)
                pygame.draw.circle(surf, col, (int(mx), int(my)), max(2, int(3.5 * u)))
        for t in game.turrets:
            mx, my = tr(t.x, t.y)
            pygame.draw.rect(surf, YELLOW, (int(mx) - 3, int(my) - 3, 6, 6))
        for pk in game.pickups:
            mx, my = tr(pk.x, pk.y)
            if (mx - S / 2) ** 2 + (my - S / 2) ** 2 < (S / 2 - 4) ** 2:
                col = (255, 235, 120) if pk.kind == "drop" else (120, 255, 120)
                pygame.draw.rect(surf, col, (int(mx) - 2, int(my) - 2, 5, 5), 1)
        # player arrow
        c = S // 2
        pygame.draw.polygon(surf, GREEN, [(c, c - 8 * u), (c - 6 * u, c + 6 * u), (c + 6 * u, c + 6 * u)])
        # view cone
        fov = math.radians(p.fov) / 2
        pygame.draw.line(surf, (0, 230, 118, 120), (c, c), (c - math.tan(fov) * 40 * u, c - 40 * u), 1)
        pygame.draw.line(surf, (0, 230, 118, 120), (c, c), (c + math.tan(fov) * 40 * u, c - 40 * u), 1)
        self.screen.blit(surf, (x0, y0))
        pygame.draw.circle(self.screen, CYAN, (x0 + S // 2, y0 + S // 2), S // 2, 3)
        if p.uav_t > 0:
            self.text(f"UAV {int(p.uav_t)}", 14, CYAN, (x0 + S // 2, y0 + S + 2 * u), "midtop")

    def draw_body(self, game):
        p = game.player
        u = self.u
        x0, y0 = int(12 * u), int(180 * u)
        self.panel((x0, y0, int(62 * u), int(94 * u)), alpha=150)

        def col(v):
            return GREEN if v > 65 else (YELLOW if v > 30 else RED)
        cx = x0 + int(31 * u)
        head = pygame.Rect(0, 0, int(14 * u), int(14 * u))
        head.center = (cx, y0 + int(14 * u))
        pygame.draw.ellipse(self.screen, col(p.parts["head"]), head)
        pygame.draw.rect(self.screen, col(p.parts["chest"]), (cx - 9 * u, y0 + 24 * u, 18 * u, 26 * u), border_radius=3)
        pygame.draw.rect(self.screen, col(p.parts["arms"]), (cx - 17 * u, y0 + 24 * u, 7 * u, 24 * u), border_radius=3)
        pygame.draw.rect(self.screen, col(p.parts["arms"]), (cx + 10 * u, y0 + 24 * u, 7 * u, 24 * u), border_radius=3)
        pygame.draw.rect(self.screen, col(p.parts["legs"]), (cx - 9 * u, y0 + 52 * u, 8 * u, 28 * u), border_radius=3)
        pygame.draw.rect(self.screen, col(p.parts["legs"]), (cx + 1 * u, y0 + 52 * u, 8 * u, 28 * u), border_radius=3)
        if game.hit_label_t > 0 and game.hit_label:
            z, d, src = game.hit_label
            self.text(f"-{d}  {src}", 14, (255, 82, 82), (x0 + 70 * u, y0 + 8 * u), alpha=int(255 * min(1, game.hit_label_t)))

    def draw_top(self, game):
        u = self.u
        cx = self.W // 2
        p = game.player
        w, h = int(300 * u), int(44 * u)
        self.panel((cx - w // 2, int(10 * u), w, h), alpha=190, border=(255, 165, 0))
        self.text(f"{game.team_kills[0]}", 24, (64, 196, 255), (cx - w // 2 + 40 * u, 10 * u + h // 2), "center")
        self.text(f"{self.tr('wave')} {max(game.wave, 1)}", 22, (255, 202, 40), (cx, 10 * u + h // 2), "center")
        self.text(f"{game.team_kills[1]}", 24, (255, 82, 82), (cx + w // 2 - 40 * u, 10 * u + h // 2), "center")
        pygame.draw.rect(self.screen, (64, 196, 255), (cx - w // 2 + 8 * u, 10 * u + 8 * u, 6 * u, h - 16 * u))
        pygame.draw.rect(self.screen, (255, 82, 82), (cx + w // 2 - 14 * u, 10 * u + 8 * u, 6 * u, h - 16 * u))
        alive_e = sum(1 for s in game.soldiers if s.alive and s.team == 1)
        left = alive_e + len(game.queue)
        self.text(f"{self.tr('enemies_left')} {left}", 16, WHITE, (cx, 62 * u), "midtop")
        boss = next((s for s in game.soldiers if s.alive and s.kind == "boss"), None)
        if boss:
            bw = int(320 * u)
            self.bar(cx - bw // 2, int(84 * u), bw, int(12 * u), boss.hp / boss.max_hp, (230, 40, 40))
            self.text(KIND_NAME["boss"], 14, (255, 140, 100), (cx, 84 * u + 14 * u), "midtop")

    def draw_stats(self, game):
        p = game.player
        u = self.u
        W = self.W
        x = W - int(12 * u)
        y = int(12 * u)
        w = int(230 * u)
        self.panel((x - w, y, w, int(122 * u)), alpha=150)
        self.text(f"{self.tr('points')}  {p.score}", 18, (255, 202, 40), (x - 10 * u, y + 6 * u), "topright")
        self.text(f"{self.tr('kills')}  {p.kills}    {self.tr('streak')}  {p.streak}", 15, (0, 230, 118), (x - 10 * u, y + 30 * u), "topright")
        bx = x - w + int(10 * u)
        bw = w - int(20 * u)
        self.bar(bx, int(y + 56 * u), bw, int(9 * u), p.hp / p.max_hp, (255 - int(180 * p.hp / p.max_hp), int(60 + 170 * p.hp / p.max_hp), 60))
        self.bar(bx, int(y + 70 * u), bw, int(7 * u), p.armor / p.max_armor, (0, 176, 255))
        self.bar(bx, int(y + 82 * u), bw, int(5 * u), p.stamina / 100.0, (200, 200, 210) if not p.exhausted else (255, 120, 60))
        self.bar(bx, int(y + 91 * u), bw, int(6 * u), p.focus / 100.0, (120, 90, 255) if not p.bt_active else (255, 120, 255))
        self.text(f"HP {int(p.hp)}", 12, WHITE, (bx, y + 55 * u - 1), "topleft", outline=True)
        self.text(self.tr("focus"), 11, (190, 170, 255), (bx, y + 99 * u), "topleft")
        for i in range(max(0, p.lives)):
            hx = x - 10 * u - i * 18 * u
            self.heart(hx, y + 108 * u, 6 * u)

    def heart(self, x, y, r):
        pygame.draw.circle(self.screen, (255, 60, 90), (int(x - r * 0.5), int(y)), int(r * 0.6))
        pygame.draw.circle(self.screen, (255, 60, 90), (int(x + r * 0.5), int(y)), int(r * 0.6))
        pygame.draw.polygon(self.screen, (255, 60, 90), [(x - r * 1.05, y + r * 0.1), (x + r * 1.05, y + r * 0.1), (x, y + r * 1.4)])

    def draw_bottom(self, game):
        p = game.player
        u = self.u
        W, H = self.W, self.H
        cx = W // 2
        w = p.w
        st = p.st
        pw, ph = int(300 * u), int(72 * u)
        px_, py_ = cx - pw // 2, H - ph - int(12 * u)
        self.panel((px_, py_, pw, ph), alpha=190, border=ORANGE)
        self.text(f"{p.cur}. {w['name']}", 15, (255, 171, 64), (cx, py_ + 6 * u), "midtop")
        low = st["mag"] <= max(1, st["maxmag"] // 4)
        self.text(f"{st['mag']}", 34, (255, 80, 80) if low else WHITE, (cx - 8 * u, py_ + 22 * u), "topright")
        self.text(f"/ {st['reserve']}", 22, (200, 200, 210), (cx - 2 * u, py_ + 32 * u), "topleft")
        if p.reload_t > 0:
            frac = 1 - p.reload_t / max(0.01, p.reload_total)
            self.bar(px_ + 10 * u, py_ + ph - 10 * u, pw - 20 * u, 5 * u, frac, YELLOW)
            self.text(self.tr("reloading"), 14, YELLOW, (cx, py_ - 22 * u), "midtop")
        elif st["mag"] == 0 and st["reserve"] == 0:
            self.text(self.tr("no_ammo"), 16, (255, 80, 80), (cx, py_ - 22 * u), "midtop")
        elif low and st["reserve"] > 0:
            self.text(self.tr("low_ammo"), 14, (255, 200, 60), (cx, py_ - 22 * u), "midtop")
        # weapon slots
        sx = cx - int(7 * 38 * u / 2)
        for i in range(1, 8):
            r = pygame.Rect(sx + (i - 1) * int(38 * u), py_ - int(2 * u) - int(26 * u) - (22 * u if (p.reload_t > 0 or low) else 0) * 0, int(34 * u), int(22 * u))
            r.y = py_ - int(54 * u)
            wu = p.weapons[i]["unlocked"]
            self.panel(r, color=(255, 152, 0) if i == p.cur else (10, 16, 24), alpha=210 if i == p.cur else 120, radius=4)
            self.text(str(i), 14, (255, 255, 255) if wu else (90, 96, 104), r.center, "center", outline=False)
        # grenades etc.
        gx = W - int(14 * u)
        gy = H - int(14 * u)
        items = [("G", p.grenades, "gren"), ("Q", p.stims, "stim"), ("V", p.airstrikes, "air"), ("T", p.turrets, "tur")]
        for k, (key, n, icon) in enumerate(items):
            r = pygame.Rect(0, 0, int(58 * u), int(58 * u))
            r.bottomright = (gx - k * int(64 * u), gy)
            self.panel(r, alpha=170, border=(255, 171, 64) if n > 0 else (70, 76, 84), radius=10)
            self.icon(icon, r.centerx, r.centery - 3 * u, u, n > 0)
            self.text(key, 12, (190, 190, 200), (r.left + 4 * u, r.top + 2 * u), outline=False)
            self.text(str(n), 16, YELLOW if n > 0 else (110, 116, 124), (r.right - 5 * u, r.bottom - 3 * u), "bottomright")
        # bullet time hint
        if p.focus >= 25 and not p.bt_active and p.alive:
            self.text("[F] " + self.tr("bt_on"), 13, (160, 190, 255), (W - 14 * u, H - 84 * u), "bottomright")

    def icon(self, kind, x, y, u, on):
        col = (230, 230, 235) if on else (100, 106, 114)
        if kind == "gren":
            pygame.draw.circle(self.screen, (80, 110, 70) if on else col, (int(x), int(y + 2 * u)), int(11 * u))
            pygame.draw.rect(self.screen, col, (x - 4 * u, y - 14 * u, 8 * u, 6 * u))
            pygame.draw.circle(self.screen, (255, 40, 70), (int(x + 8 * u), int(y - 10 * u)), int(3 * u), 1)
        elif kind == "stim":
            pygame.draw.rect(self.screen, (0, 230, 118) if on else col, (x - 4 * u, y - 10 * u, 8 * u, 20 * u), border_radius=3)
            pygame.draw.line(self.screen, col, (x, y - 10 * u), (x, y - 16 * u), 2)
            pygame.draw.line(self.screen, col, (x - 6 * u, y - 16 * u), (x + 6 * u, y - 16 * u), 3)
            pygame.draw.line(self.screen, col, (x, y + 10 * u), (x, y + 16 * u), 1)
        elif kind == "air":
            pygame.draw.polygon(self.screen, (255, 120, 60) if on else col, [(x, y - 14 * u), (x + 12 * u, y + 10 * u), (x, y + 4 * u), (x - 12 * u, y + 10 * u)])
        else:
            pygame.draw.rect(self.screen, (0, 160, 230) if on else col, (x - 10 * u, y - 2 * u, 20 * u, 10 * u), border_radius=2)
            pygame.draw.rect(self.screen, col, (x - 4 * u, y - 8 * u, 16 * u, 6 * u))
            pygame.draw.line(self.screen, col, (x + 12 * u, y - 5 * u), (x + 18 * u, y - 5 * u), 3)

    def draw_feed(self, game):
        u = self.u
        x = self.W - int(12 * u)
        y = int(146 * u)
        for f in game.feed[-5:]:
            a = int(255 * min(1.0, f["t"] / 1.0))
            kc = (64, 196, 255) if f["team"] == 0 else (255, 82, 82)
            vc = (255, 82, 82) if f["team"] == 0 else (64, 196, 255)
            if f["victim"] == "YOU":
                vc = (255, 235, 59)
            txt = f"{f['killer']}  [{f['weapon']}]{' *' if f['head'] else ''}  {f['victim']}"
            r = self.text(txt, 14, kc, (x, y), "topright", alpha=a)
            y += int(19 * u)

    def draw_banners(self, game):
        u = self.u
        cx = self.W // 2
        y = int(self.H * 0.22)
        for b in game.banners[-3:]:
            a = int(255 * min(1.0, b["t"] / 0.6, (b["dur"] - b["t"]) / 0.15 + 0.2))
            txt = STR[b["key"]][self.lang]
            big = b["key"] in ("wave", "wave_clear", "get_ready", "boss_in", "you_died")
            self.text(txt, 46 if big else 26, b["color"], (cx, y), "center", alpha=max(0, min(255, a)))
            y += int((52 if big else 30) * u)
            if b["sub"]:
                kind, v = b["sub"]
                if kind == "num":
                    self.text(str(v), 54, WHITE, (cx, y), "center", alpha=max(0, min(255, a)))
                    y += int(52 * u)
                elif kind == "bonus":
                    self.text(f"+{v}", 28, (255, 235, 59), (cx, y), "center", alpha=max(0, min(255, a)))
                    y += int(34 * u)
                elif kind == "wave":
                    self.text(f"{self.tr('wave')} {v}", 28, WHITE, (cx, y), "center", alpha=max(0, min(255, a)))
                    y += int(34 * u)

    def draw_popups(self, game):
        u = self.u
        cx, cy = self.W // 2, self.H // 2
        for i, q in enumerate(reversed(game.popups[-4:])):
            a = int(255 * min(1.0, q["t"] / 0.4))
            self.text(q["text"], 22, q["color"], (cx, cy - (70 + i * 24) * u), "center", alpha=a)

    # ------------------------------------------------------------------------------------------------ menus
    def button(self, label, rect, hot, color=ORANGE, enabled=True):
        u = self.u
        r = pygame.Rect(rect)
        s = pygame.Surface(r.size, pygame.SRCALPHA)
        base = (255, 140, 0, 230) if hot else (14, 22, 34, 210)
        pygame.draw.rect(s, base, (0, 0, r.w, r.h), border_radius=int(10 * u))
        pygame.draw.rect(s, (*color, 255) if hot else (80, 96, 110, 255), (0, 0, r.w, r.h), 2, border_radius=int(10 * u))
        self.screen.blit(s, r.topleft)
        self.text(label, 24, (20, 20, 20) if hot else (235, 240, 245), r.center, "center", outline=not hot)

    def draw_menu(self, items, title=True, sub=None):
        """items: list of (id, label). Returns rects; highlights by mouse or self.sel."""
        u = self.u
        W, H = self.W, self.H
        self.menu_rects = []
        if title:
            self.text(self.tr("title"), 64, (255, 196, 40), (W // 2, int(H * 0.16)), "center")
            self.text(self.tr("subtitle"), 20, (200, 215, 225), (W // 2, int(H * 0.16 + 56 * u)), "center")
        if sub:
            self.text(sub, 24, (255, 200, 60), (W // 2, int(H * 0.2)), "center")
        n = len(items)
        bw, bh, gap = int(430 * u), int(48 * u), int(10 * u)
        y0 = int(H * 0.27) if title else int(H * 0.27)
        mouse = self.mouse()
        for i, (iid, label) in enumerate(items):
            r = pygame.Rect(W // 2 - bw // 2, y0 + i * (bh + gap), bw, bh)
            hot = (i == getattr(self, "sel", 0)) or r.collidepoint(mouse)
            self.button(label, r, hot)
            self.menu_rects.append((r, iid))
        return self.menu_rects

    def draw_help(self):
        u = self.u
        W, H = self.W, self.H
        fa = self.lang == 1
        self.panel((int(W * 0.04), int(H * 0.06), int(W * 0.92), int(H * 0.88)), alpha=232, border=ORANGE, radius=16)
        self.text(self.tr("help_title"), 38, (255, 196, 40), (W // 2, int(H * 0.1)), "center")
        rows = HELP_ROWS
        half = (len(rows) + 1) // 2
        colw = int(W * 0.44)
        for ci in range(2):
            x0 = int(W * 0.06) + ci * (colw + int(W * 0.04))
            y = int(H * 0.17)
            for keys, en, fr in rows[ci * half:(ci + 1) * half]:
                chip = pygame.Rect(x0, y, int(150 * u), int(30 * u))
                s = pygame.Surface(chip.size, pygame.SRCALPHA)
                pygame.draw.rect(s, (30, 44, 60, 255), (0, 0, chip.w, chip.h), border_radius=int(7 * u))
                pygame.draw.rect(s, (255, 152, 0, 255), (0, 0, chip.w, chip.h), 2, border_radius=int(7 * u))
                self.screen.blit(s, chip.topleft)
                self.text(keys, 15, (255, 220, 140), chip.center, "center", outline=False)
                if fa:
                    self.text(fr, 18, (225, 235, 245), (x0 + colw, chip.centery), "midright")
                else:
                    self.text(en, 17, (225, 235, 245), (chip.right + 16 * u, chip.centery), "midleft")
                y += int(41 * u)
        y = int(H * 0.17) + half * int(41 * u) + int(10 * u)
        for ln in HELP_TIPS["fa" if fa else "en"]:
            self.text(ln, 17, (255, 214, 120), (W // 2, y), "midtop")
            y += int(30 * u)
        self.text(self.tr("back") + "  (ESC)", 22, YELLOW, (W // 2, int(H * 0.9)), "center")

    def draw_shop(self, game, sel):
        u = self.u
        W, H = self.W, self.H
        p = game.player
        s = pygame.Surface((W, H), pygame.SRCALPHA)
        s.fill((0, 0, 0, 190))
        self.screen.blit(s, (0, 0))
        bw, bh = int(W * 0.88), int(H * 0.84)
        bx, by = (W - bw) // 2, (H - bh) // 2
        self.panel((bx, by, bw, bh), color=(14, 22, 32), alpha=240, border=ORANGE, radius=16)
        self.text(self.tr("shop"), 34, (255, 171, 64), (bx + 24 * u, by + 14 * u))
        self.text(f"{self.tr('points')}: {p.score}", 28, GREEN, (bx + bw - 24 * u, by + 18 * u), "topright")
        cols = 2
        iw = (bw - 24 * u * 3) // cols
        ih = int(70 * u)
        self.shop_rects = []
        mouse = self.mouse()
        for i, (iid, price, maxn) in enumerate(SHOP):
            col, row = i % cols, i // cols
            r = pygame.Rect(int(bx + 24 * u + col * (iw + 24 * u)), int(by + 72 * u + row * (ih + 10 * u)), int(iw), ih)
            st, _, n = game.shop_status(iid)
            hot = (i == sel) or r.collidepoint(mouse)
            base = (36, 52, 70, 235) if hot else (22, 32, 44, 225)
            ps = pygame.Surface(r.size, pygame.SRCALPHA)
            pygame.draw.rect(ps, base, (0, 0, r.w, r.h), border_radius=int(10 * u))
            bc = (255, 152, 0) if hot else ((70, 84, 98) if st != "ok" else (0, 180, 150))
            pygame.draw.rect(ps, bc, (0, 0, r.w, r.h), 2, border_radius=int(10 * u))
            self.screen.blit(ps, r.topleft)
            name, desc = SHOP_TEXT[iid][self.lang]
            dim = st in ("maxed",)
            fa = self.lang == 1
            if fa:
                self.text(name, 17, (130, 136, 144) if dim else WHITE, (r.right - 12 * u, r.top + 8 * u), "topright")
                self.text(desc, 13, (150, 160, 170), (r.right - 12 * u, r.top + 36 * u), "topright")
                price_pos, anchor = (r.left + 12 * u, r.centery), "midleft"
            else:
                self.text(name, 16, (130, 136, 144) if dim else WHITE, (r.left + 12 * u, r.top + 8 * u))
                self.text(desc, 13, (150, 160, 170), (r.left + 12 * u, r.top + 38 * u))
                price_pos, anchor = (r.right - 12 * u, r.centery), "midright"
            if st == "maxed":
                label, col_ = self.tr("owned") if maxn == 1 else self.tr("maxed"), (120, 130, 140)
            else:
                label = f"{price}" + (f"  x{n}" if n else "")
                col_ = YELLOW if st == "ok" else (255, 90, 90)
            self.text(label, 22, col_, price_pos, anchor)
            self.shop_rects.append((r, iid))
        self.text(self.tr("close_shop"), 22, (255, 120, 120), (W // 2, by + bh - 28 * u), "center")
        rr = pygame.Rect(W // 2 - 160 * u, by + bh - 48 * u, 320 * u, 40 * u)
        self.shop_rects.append((rr, "__close"))

    def draw_gameover(self, game, t):
        u = self.u
        W, H = self.W, self.H
        p = game.player
        s = pygame.Surface((W, H), pygame.SRCALPHA)
        s.fill((20, 0, 0, int(min(200, t * 120))))
        self.screen.blit(s, (0, 0))
        if t < 0.8:
            return
        cx = W // 2
        self.text(self.tr("game_over"), 60, (255, 60, 60), (cx, int(H * 0.18)), "center")
        y = int(H * 0.32)
        rows = [(self.tr("survived"), str(game.wave)),
                (self.tr("total_kills"), str(p.kills)), (self.tr("headshots"), str(p.headshots)),
                (self.tr("streak"), str(p.best_streak)), (self.tr("score"), str(p.score)),
                (self.tr("best"), str(game.save.get("best_wave", 0)))]
        for a, b in rows:
            self.text(a, 26, (200, 210, 220), (cx - 20 * u, y), "topright")
            self.text(b, 30, YELLOW, (cx + 20 * u, y - 2 * u), "topleft")
            y += int(46 * u)
        if game.new_best:
            self.text(self.tr("new_best"), 36, (120, 255, 160), (cx, y + 10 * u), "center")
        if int(t * 2) % 2 == 0:
            self.text(self.tr("press_enter"), 26, WHITE, (cx, int(H * 0.88)), "center")

    def draw_scoreboard(self, game):
        u = self.u
        W, H = self.W, self.H
        p = game.player
        self.panel((int(W * 0.25), int(H * 0.22), int(W * 0.5), int(H * 0.5)), alpha=215, border=CYAN)
        cx = W // 2
        self.text(f"{game.team_kills[0]}  :  {game.team_kills[1]}", 44, WHITE, (cx, int(H * 0.28)), "center")
        y = int(H * 0.36)
        allies = [s for s in game.soldiers if s.team == 0 and s.alive]
        self.text(f"{self.tr('wave')} {game.wave}   |   {self.tr('kills')} {p.kills}   |   {self.tr('score')} {p.score}", 22, YELLOW, (cx, y), "center")
        y += int(36 * u)
        self.text("YOU", 20, GREEN, (cx - 140 * u, y), "topleft")
        self.text(f"HP {int(p.hp)}  AR {int(p.armor)}", 18, WHITE, (cx + 140 * u, y), "topright")
        y += int(26 * u)
        for s in allies:
            self.text(s.name, 18, (64, 196, 255), (cx - 140 * u, y), "topleft")
            self.text(f"HP {int(s.hp)}", 18, WHITE, (cx + 140 * u, y), "topright")
            y += int(24 * u)
