"""Scene manager: keeps the Panda3D scene graph in sync with the game simulation (soldiers, props, effects, camera,
first-person weapon).  Simulation coordinates are (x east, y south, z up); Panda's are (x east, y north, z up)."""
import math
import random

import numpy as np
from panda3d.core import (NodePath, Vec3, Vec4, AmbientLight, DirectionalLight, Camera, PerspectiveLens, CardMaker,
                          TransparencyAttrib, ColorBlendAttrib, Texture, AntialiasAttrib)

from p3_geom import (geom_from_arrays, make_texture, make_format)
from p3_world import build_arena, build_sky, to_p, AMBIENT, SUN_RGB
from p3_models import (build_soldier, SoldierView, build_barrel, build_turret, build_pickup, build_grenade, build_rocket,
                       build_parachute, build_weapon)
from t8_data import ENEMY
from t8_models import KINDS
from t8_textures import FOG_COLOR
from t8_world import LIGHTS

BEACON_GLOW = [(255, 110, 20), (0, 200, 255), (0, 255, 150), (255, 30, 100), (255, 190, 30)]


def heading(theta):
    """sim yaw (radians; forward = (cos,sin) with y south) -> Panda heading in degrees"""
    return math.degrees(-theta - math.pi / 2)


# ------------------------------------------------------------------------------------------------- FX textures
def _radial(n, power=2.0, color=(255, 255, 255)):
    yy, xx = np.mgrid[0:n, 0:n]
    d = np.sqrt((xx + 0.5 - n / 2) ** 2 + (yy + 0.5 - n / 2) ** 2) / (n / 2)
    a = np.clip(1 - d, 0, 1) ** power
    arr = np.zeros((n, n, 4), np.uint8)
    arr[:, :, 0], arr[:, :, 1], arr[:, :, 2] = color
    arr[:, :, 3] = (a * 255).astype(np.uint8)
    return arr


def _ring(n=128):
    yy, xx = np.mgrid[0:n, 0:n]
    d = np.sqrt((xx + 0.5 - n / 2) ** 2 + (yy + 0.5 - n / 2) ** 2) / (n / 2)
    a = np.clip(1 - np.abs(d - 0.86) / 0.07, 0, 1) + np.clip(1 - np.abs(d - 0.45) / 0.04, 0, 1) * 0.7
    arr = np.zeros((n, n, 4), np.uint8)
    arr[:, :, 0], arr[:, :, 1], arr[:, :, 2] = 255, 70, 40
    arr[:, :, 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    return arr


def _streak(n=16):
    u = np.linspace(0, 1, n)
    a = np.clip(1 - np.abs(2 * u - 1), 0, 1) ** 0.7
    arr = np.zeros((n, n, 4), np.uint8)
    arr[:, :, :3] = 255
    arr[:, :, 3] = (a[None, :] * 255).astype(np.uint8)
    return arr


def _smoke(n=64):
    rng = np.random.default_rng(3)
    base = _radial(n, 1.2, (255, 255, 255))
    noise = rng.random((n // 8, n // 8))
    noise = np.kron(noise, np.ones((8, 8)))
    base[:, :, 3] = (base[:, :, 3] * (0.55 + 0.45 * noise)).astype(np.uint8)
    return base


class QuadBatch:
    """A dynamic mesh of up to `cap` quads re-uploaded every frame (billboards, ribbons or ground decals)."""

    def __init__(self, parent, name, cap, tex, additive=True, fog=False, depth_offset=0, bin_=("fixed", 20)):
        self.cap = cap
        fmt, dtype = make_format(False, True, True)
        idx = np.zeros(cap * 6, np.uint32)
        base = np.arange(cap, dtype=np.uint32) * 4
        idx[0::6], idx[1::6], idx[2::6], idx[3::6], idx[4::6], idx[5::6] = base, base + 1, base + 2, base, base + 2, base + 3
        pos = np.zeros((cap * 4, 3), np.float32)
        uv = np.tile(np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.float32), (cap, 1))
        col = np.zeros((cap * 4, 4), np.uint8)
        gn, self.geom, self.vdata, self.buf, self.dtype = geom_from_arrays(name, pos, idx, color=col, uv=uv, dynamic=True)
        from panda3d.core import OmniBoundingVolume
        gn.setBounds(OmniBoundingVolume())
        gn.setFinal(True)
        self.np = parent.attachNewNode(gn)
        self.np.setTexture(tex)
        self.np.setLightOff()
        self.np.setShaderOff()
        self.np.setTwoSided(True)
        self.np.setDepthWrite(False)
        if not fog:
            self.np.setFogOff()
        self.np.setTransparency(TransparencyAttrib.MAlpha)
        if additive:
            self.np.setAttrib(ColorBlendAttrib.make(ColorBlendAttrib.MAdd, ColorBlendAttrib.OIncomingAlpha, ColorBlendAttrib.OOne))
        if depth_offset:
            self.np.setDepthOffset(depth_offset)
        self.np.setBin(*bin_)
        self.n = 0

    def _flush(self, n, corners, colors):
        buf = self.buf
        buf["p"][:n * 4] = corners.reshape(-1, 3)
        buf["c"][:n * 4] = np.repeat(colors, 4, axis=0)
        if n < self.cap:
            buf["p"][n * 4:] = 0
            buf["c"][n * 4:] = 0
        self.vdata.modifyArray(0).modifyHandle().copyDataFrom(buf.tobytes())

    def billboards(self, centers, sizes, colors, right, up):
        n = min(len(centers), self.cap)
        if n == 0:
            self._flush(0, np.zeros((0, 4, 3), np.float32), np.zeros((0, 4), np.uint8))
            return
        c = np.asarray(centers[:n], np.float32)
        s = np.asarray(sizes[:n], np.float32)[:, None]
        r = right[None, :] * s
        u = up[None, :] * s
        corners = np.stack([c - r - u, c + r - u, c + r + u, c - r + u], 1)
        self._flush(n, corners, np.asarray(colors[:n], np.uint8))

    def ribbons(self, a, b, widths, colors, cam_pos):
        n = min(len(a), self.cap)
        if n == 0:
            self._flush(0, np.zeros((0, 4, 3), np.float32), np.zeros((0, 4), np.uint8))
            return
        a = np.asarray(a[:n], np.float32)
        b = np.asarray(b[:n], np.float32)
        d = b - a
        mid = (a + b) / 2
        v = cam_pos[None, :] - mid
        side = np.cross(d, v)
        ln = np.linalg.norm(side, axis=1, keepdims=True)
        side = side / np.maximum(ln, 1e-6) * (np.asarray(widths[:n], np.float32)[:, None] / 2)
        corners = np.stack([a - side, a + side, b + side, b - side], 1)
        self._flush(n, corners, np.asarray(colors[:n], np.uint8))

    def ground(self, centers, sizes, colors):
        n = min(len(centers), self.cap)
        if n == 0:
            self._flush(0, np.zeros((0, 4, 3), np.float32), np.zeros((0, 4), np.uint8))
            return
        c = np.asarray(centers[:n], np.float32)
        s = np.asarray(sizes[:n], np.float32)
        z = np.zeros(n, np.float32)
        ex = np.stack([s, z, z], 1)
        ey = np.stack([z, s, z], 1)
        corners = np.stack([c - ex - ey, c + ex - ey, c + ex + ey, c - ex + ey], 1)
        self._flush(n, corners, np.asarray(colors[:n], np.uint8))


class Scene3D:
    def __init__(self, base, world, atlas):
        self.base = base
        self.world = world
        self.render = base.render
        self.root = base.render.attachNewNode("world_root")
        base.setBackgroundColor(*(FOG_COLOR / 255.0))
        base.camLens.setNearFar(0.08, 320.0)
        base.render.setAntialias(AntialiasAttrib.MAuto)
        # world
        self.nodes = build_arena(world, atlas, self.root)
        self.sky = build_sky(base.camera)
        self.sky.setCompass()
        # lights for characters / props
        self.amb = AmbientLight("amb")
        self.amb.setColor(Vec4(0.50, 0.56, 0.70, 1))
        self.sun = DirectionalLight("sun")
        self.sun.setColor(Vec4(0.95, 0.80, 0.62, 1))
        self.sun_np = self.root.attachNewNode(self.sun)
        self.sun_np.setHpr(35, -50, 0)
        self.amb_np = self.root.attachNewNode(self.amb)
        self.ents = self.root.attachNewNode("entities")
        self.ents.setLight(self.amb_np)
        self.ents.setLight(self.sun_np)
        self.ents.setShaderOff()
        # templates
        self.templates = {k: build_soldier(k) for k in KINDS}
        self.t_barrel = build_barrel()
        self.t_turret = build_turret()
        self.t_pick = {k: build_pickup(k) for k in ("ammo", "med", "armor", "drop")}
        self.t_gren = build_grenade()
        self.t_rocket = build_rocket()
        self.t_chute = build_parachute()
        # dynamic entity views
        self.v_sold, self.v_turret, self.v_barrel, self.v_pick, self.v_gren, self.v_rock, self.v_drop = {}, {}, {}, {}, {}, {}, {}
        # effects
        fxroot = self.root.attachNewNode("fx")
        t_glow = make_texture(_radial(64, 2.0), "glow", repeat=False, mip=False, aniso=1, flip=False)
        t_soft = make_texture(_radial(64, 1.0), "soft", repeat=False, mip=False, aniso=1, flip=False)
        t_smoke = make_texture(_smoke(), "smoke", repeat=False, mip=False, aniso=1, flip=False)
        t_streak = make_texture(_streak(), "streak", repeat=False, mip=False, aniso=1, flip=False)
        t_ring = make_texture(_ring(), "ring", repeat=False, mip=True, aniso=1, flip=False)
        t_shadow = make_texture(_radial(64, 1.3, (0, 0, 0)), "shadow", repeat=False, mip=False, aniso=1, flip=False)
        self.b_glow = QuadBatch(fxroot, "glow", 900, t_glow, additive=True, bin_=("fixed", 30))
        self.b_smoke = QuadBatch(fxroot, "smoke", 160, t_smoke, additive=False, fog=True, bin_=("fixed", 25))
        self.b_streak = QuadBatch(fxroot, "streak", 200, t_streak, additive=True, bin_=("fixed", 31))
        self.b_ring = QuadBatch(fxroot, "ring", 40, t_ring, additive=True, depth_offset=2, bin_=("fixed", 26))
        self.b_shadow = QuadBatch(fxroot, "shadow", 80, t_shadow, additive=False, fog=True, depth_offset=1, bin_=("fixed", 10))
        # first person weapon in its own depth-cleared display region
        self._build_viewmodel()
        # camera state (sim coords)
        self.cx = self.cy = 0.0
        self.cz = 1.8
        self.cyaw = -math.pi / 2
        self.cpitch = 0.0
        self.cfov = 75.0
        self.t = 0.0
        self.cam_pos = np.zeros(3, np.float32)
        self.right = np.array([1, 0, 0], np.float32)
        self.up = np.array([0, 0, 1], np.float32)

    # ------------------------------------------------------------------------------------------------ first person
    def _build_viewmodel(self):
        base = self.base
        self.vm_root = NodePath("vm_root")
        self.vm_cam_node = Camera("vmcam")
        lens = PerspectiveLens()
        lens.setFov(62)
        lens.setNearFar(0.03, 40.0)
        self.vm_cam_node.setLens(lens)
        self.vm_lens = lens
        self.vm_cam = self.vm_root.attachNewNode(self.vm_cam_node)
        dr = base.win.makeDisplayRegion()
        dr.setSort(10)
        dr.setClearDepthActive(True)
        dr.setCamera(self.vm_cam)
        self.vm_dr = dr
        amb = AmbientLight("vmamb")
        amb.setColor(Vec4(0.55, 0.60, 0.72, 1))
        sun = DirectionalLight("vmsun")
        sun.setColor(Vec4(1.0, 0.88, 0.72, 1))
        self.vm_root.setLight(self.vm_root.attachNewNode(amb))
        sn = self.vm_root.attachNewNode(sun)
        sn.setHpr(-25, -40, 0)
        self.vm_root.setLight(sn)
        self.vm_root.setShaderOff()
        self.vm_holder = self.vm_root.attachNewNode("vm_holder")
        self.vm_guns = {}
        self.vm_muz = {}
        for wid in range(1, 8):
            holder, muz = build_weapon(wid)
            holder.reparentTo(self.vm_holder)
            holder.hide()
            self.vm_guns[wid] = holder
            self.vm_muz[wid] = muz
        # muzzle flash card
        cm = CardMaker("flash")
        cm.setFrame(-0.5, 0.5, -0.5, 0.5)
        tex = make_texture(_radial(64, 1.2, (255, 215, 130)), "vmflash", repeat=False, mip=False, aniso=1, flip=False)
        self.vm_flash = self.vm_holder.attachNewNode(cm.generate())
        self.vm_flash.setTexture(tex)
        self.vm_flash.setTransparency(TransparencyAttrib.MAlpha)
        self.vm_flash.setAttrib(ColorBlendAttrib.make(ColorBlendAttrib.MAdd, ColorBlendAttrib.OIncomingAlpha, ColorBlendAttrib.OOne))
        self.vm_flash.setLightOff()
        self.vm_flash.setDepthWrite(False)
        self.vm_flash.setBillboardPointEye()
        self.vm_flash.hide()
        self.cur_vm = 0

    def update_viewmodel(self, game, t):
        p = game.player
        show = p.alive and not (p.ads > 0.5 and p.cur == 3)
        if self.cur_vm != p.cur:
            if self.cur_vm in self.vm_guns:
                self.vm_guns[self.cur_vm].hide()
            self.cur_vm = p.cur
        g = self.vm_guns[p.cur]
        if not show:
            g.hide()
            self.vm_flash.hide()
            return
        g.show()
        self.vm_lens.setAspectRatio(self.base.getAspectRatio())
        a = max(0.0, min(1.0, p.ads))
        hip_p, ads_p = np.array([0.21, 0.80, -0.22]), np.array([0.0, 0.86, -0.16])
        hip_r, ads_r = np.array([8.6, 6.9, 0.0]), np.array([0.0, 1.0, 0.0])
        pos = hip_p + (ads_p - hip_p) * a
        hpr = hip_r + (ads_r - hip_r) * a
        moving = p.speed > 1.0
        bob = (1 - a) * (1.0 if moving else 0.0)
        pos[0] += math.cos(p.bob_t * 0.5) * 0.014 * bob + math.sin(t * 1.3) * 0.002
        pos[2] += abs(math.sin(p.bob_t)) * 0.012 * bob
        dip = 0.0
        roll = 0.0
        if p.swap_t > 0:
            dip = min(1.0, p.swap_t / 0.3) * 0.45
            roll = dip * 30
        if p.reload_t > 0:
            prog = 1 - p.reload_t / max(0.01, p.reload_total)
            s = math.sin(min(1.0, prog * 1.15) * math.pi)
            dip = max(dip, s * 0.5)
            roll = max(roll, s * 35)
        if p.sprinting:
            dip = max(dip, 0.12)
            hpr[0] += 10
            roll = max(roll, 10)
        dip += math.sin(math.pi * a) * 0.05
        kick = p.view_kick
        pos[1] -= kick * 0.07
        pos[2] += kick * 0.01 - dip
        hpr[1] += kick * 5.0 - dip * 22
        self.vm_holder.setPos(*pos)
        self.vm_holder.setHpr(hpr[0], hpr[1], roll)
        g.setScale(0.72)
        if p.muzzle_t > 0:
            mz = self.vm_muz[p.cur]
            self.vm_flash.setPos(mz[0] * 0.72, mz[1] * 0.72 + 0.02, mz[2] * 0.72)
            self.vm_flash.setScale(random.uniform(0.28, 0.42))
            self.vm_flash.show()
        else:
            self.vm_flash.hide()

    # ------------------------------------------------------------------------------------------------ camera
    def set_camera(self, x, y, z, yaw, pitch, fov):
        self.cx, self.cy, self.cz, self.cyaw, self.cpitch, self.cfov = x, y, z, yaw, pitch, fov
        cam = self.base.camera
        cam.setPos(x, -y, z)
        cam.setHpr(heading(yaw), math.degrees(pitch), 0)
        self.base.camLens.setFov(fov)
        self.cam_pos = np.array([x, -y, z], np.float32)
        r = self.render.getRelativeVector(cam, Vec3(1, 0, 0))
        u = self.render.getRelativeVector(cam, Vec3(0, 0, 1))
        self.right = np.array([r.x, r.y, r.z], np.float32)
        self.up = np.array([u.x, u.y, u.z], np.float32)

    def project(self, wx, wy, wz, W, H):
        """sim world point -> (screen x, screen y, depth) in a W x H canvas, or None if behind the camera."""
        cy_, sy_ = math.cos(self.cyaw), math.sin(self.cyaw)
        cp, sp = math.cos(self.cpitch), math.sin(self.cpitch)
        dx, dy, dz = wx - self.cx, wy - self.cy, wz - self.cz
        fx, fy, fz = cy_ * cp, sy_ * cp, sp
        depth = dx * fx + dy * fy + dz * fz
        if depth < 0.15:
            return None
        rx, ry = -sy_, cy_
        ux, uy, uz = -cy_ * sp, -sy_ * sp, cp
        th = math.tan(math.radians(self.cfov) / 2)
        xn = (dx * rx + dy * ry) / depth / th
        yn = (dx * ux + dy * uy + dz * uz) / depth / (th * H / W)
        return W / 2 + xn * W / 2, H / 2 - yn * H / 2, depth

    # ------------------------------------------------------------------------------------------------ entity sync
    def _tint(self, x, y, boost=1.0):
        li = self.world.light_at(x, y)
        r = min(1.9, 0.8 + float(li[0]) * 1.3) * boost
        g = min(1.9, 0.8 + float(li[1]) * 1.3) * boost
        b = min(1.9, 0.8 + float(li[2]) * 1.3) * boost
        return r, g, b

    def _sync(self, store, items, key, create, update):
        alive_keys = set()
        for it in items:
            k = key(it)
            alive_keys.add(k)
            v = store.get(k)
            if v is None:
                v = store[k] = create(it)
            update(v, it)
        for k in [k for k in store if k not in alive_keys]:
            v = store.pop(k)
            (v.root if hasattr(v, "root") else v).removeNode()

    def _make_soldier(self, s):
        v = SoldierView(self.templates[s.kind], s.scale)
        v.root.reparentTo(self.ents)
        return v

    def _upd_soldier(self, v, s):
        v.root.setPos(s.x, -s.y, 0.0)
        v.root.setH(heading(s.facing))
        if s.alive:
            c = s.crouch
            v.upper.setZ(-0.42 * c)
            if s.moving:
                a = math.sin(s.walk * 1.7) * 36
            else:
                a = 0.0
            v.legL.setP(a + 42 * c)
            v.legR.setP(-a + 42 * c)
            v.upper.setP(-4 * c)
            v.root.setP(0)
            v.root.setZ(0)
            boost = 1.0 + min(1.6, s.hit_flash * 8)
            v.root.setColorScale(*self._tint(s.x, s.y, boost), 1)
        else:
            f = min(1.0, s.death_t / 0.55)
            f = 1 - (1 - f) ** 2
            v.root.setP(88 * f)
            v.root.setZ(0.22 * f * s.scale)
            v.legL.setP(15 * f)
            v.legR.setP(-10 * f)
            t = self._tint(s.x, s.y)
            v.root.setColorScale(t[0] * 0.8, t[1] * 0.8, t[2] * 0.8, 1)

    def _make(self, tmpl, scale=1.0):
        def f(_):
            n = tmpl.copyTo(self.ents)
            n.setScale(scale)
            return n
        return f

    def update_entities(self, game, dt):
        t = self.t
        self._sync(self.v_sold, game.soldiers, id, self._make_soldier, self._upd_soldier)
        # --- turrets
        def upd_turret(n, tu):
            n.setPos(tu.x, -tu.y, 0)
            n.find("head").setH(heading(tu.facing))
            n.setColorScale(*self._tint(tu.x, tu.y), 1)
        self._sync(self.v_turret, [x for x in game.turrets if x.alive], id, self._make(self.t_turret), upd_turret)

        def upd_barrel(n, b):
            n.setPos(b.x, -b.y, 0)
            n.setColorScale(*self._tint(b.x, b.y), 1)
        self._sync(self.v_barrel, [b for b in game.barrels if b.alive], id, self._make(self.t_barrel), upd_barrel)

        def make_pick(pk):
            n = self.t_pick[pk.kind].copyTo(self.ents)
            return n

        def upd_pick(n, pk):
            z = 0.35 + 0.1 * math.sin(pk.t * 3.0) if pk.kind != "drop" else 0.0
            n.setPos(pk.x, -pk.y, z)
            n.setH(pk.t * 70 % 360 if pk.kind != "drop" else 0)
            n.setColorScale(*self._tint(pk.x, pk.y), 1)
        self._sync(self.v_pick, game.pickups, id, make_pick, upd_pick)

        def upd_gren(n, g_):
            n.setPos(g_.x, -g_.y, g_.z)
        self._sync(self.v_gren, game.grenades, id, self._make(self.t_gren), upd_gren)

        def upd_rock(n, r):
            n.setPos(r.x, -r.y, r.z)
            n.lookAt(r.x + r.dx, -(r.y + r.dy), r.z + r.dz)
            n.setH(n.getH() + 0)
        # rocket model's forward is +X in Panda? (built with x_model forward -> Panda Y) so lookAt works as is
        self._sync(self.v_rock, game.rockets, id, self._make(self.t_rocket), upd_rock)

        # --- air drops (crate + chute)
        def make_drop(d):
            n = NodePath("drop")
            self.t_pick["drop"].copyTo(n)
            self.t_chute.copyTo(n)
            n.reparentTo(self.ents)
            return n

        def upd_drop(n, d):
            n.setPos(d["x"], -d["y"], max(0.0, d["z"]))
            n.setH((t * 20) % 360)
        self._sync(self.v_drop, game.drops, id, make_drop, upd_drop)

    # ------------------------------------------------------------------------------------------------ effects
    def update_fx(self, game):
        cam = self.cam_pos
        right, up = self.right, self.up
        g_c, g_s, g_col = [], [], []
        sm_c, sm_s, sm_col = [], [], []
        st_a, st_b, st_w, st_col = [], [], [], []
        sh_c, sh_s, sh_col = [], [], []

        def glow(x, y, z, size, color, inten=1.0):
            g_c.append((x, -y, z))
            g_s.append(size)
            g_col.append((min(255, int(color[0] * inten)), min(255, int(color[1] * inten)), min(255, int(color[2] * inten)), 255))

        def ribbon(a, b, w, color, alpha=255):
            st_a.append((a[0], -a[1], a[2]))
            st_b.append((b[0], -b[1], b[2]))
            st_w.append(w)
            st_col.append((color[0], color[1], color[2], alpha))

        for (lx, ly, lz, col, inten, rad), gc in zip(LIGHTS, BEACON_GLOW):
            glow(lx, ly, lz + 0.2, 1.6, gc, 0.9)
        for s in game.soldiers:
            if not s.alive:
                continue
            if s.flash_t > 0:
                ox, oy = math.cos(s.facing), math.sin(s.facing)
                glow(s.x + ox * 0.95, s.y + oy * 0.95, 1.25 * s.scale, 0.55,
                     (255, 220, 120) if s.team == 1 else (140, 210, 255))
            sh_c.append((s.x, -s.y, 0.03))
            sh_s.append(0.75 * s.scale)
            sh_col.append((255, 255, 255, 140))
            if s.laser and s.aim_t > 0 and s.tgt_vis and s.target is not None:
                tg = s.target
                col = (255, 20, 20) if s.team == 1 else (60, 160, 255)
                ribbon((s.x + math.cos(s.facing) * 0.8, s.y + math.sin(s.facing) * 0.8, 1.25), (tg.x, tg.y, tg.tz), 0.03, col, 230)
        for tu in game.turrets:
            if tu.alive:
                sh_c.append((tu.x, -tu.y, 0.03)); sh_s.append(0.9); sh_col.append((255, 255, 255, 140))
                if tu.flash_t > 0:
                    glow(tu.x + math.cos(tu.facing) * 1.0, tu.y + math.sin(tu.facing) * 1.0, 0.95, 0.5, (120, 255, 255))
        for b in game.barrels:
            if b.alive:
                sh_c.append((b.x, -b.y, 0.03)); sh_s.append(0.85); sh_col.append((255, 255, 255, 130))
        for pk in game.pickups:
            col = {"ammo": (255, 190, 60), "med": (80, 255, 120), "armor": (60, 200, 255), "drop": (255, 230, 120)}[pk.kind]
            glow(pk.x, pk.y, 0.5, 1.2 if pk.kind != "drop" else 2.0, col, 0.5 + 0.2 * math.sin(pk.t * 4))
            sh_c.append((pk.x, -pk.y, 0.03)); sh_s.append(0.6 if pk.kind != "drop" else 1.0); sh_col.append((255, 255, 255, 110))
        for r in game.rockets:
            glow(r.x - r.dx * 0.4, r.y - r.dy * 0.4, r.z - r.dz * 0.4, 0.7, (255, 160, 60))
        for f in game.fx:
            k = f["t"] / f["dur"]
            rr = f["r"] * (0.5 + 1.8 * k)
            inten = (1 - k) ** 1.3
            glow(f["x"], f["y"], f["z"] + 0.6 * k * 2, rr, (255, 150, 50), 1.1 * inten)
            glow(f["x"], f["y"], f["z"] + 0.3, rr * 0.5, (255, 240, 180), 1.3 * inten)
        for tr in game.tracers:
            fr = max(0.0, tr[7] / tr[8])
            ribbon((tr[0], tr[1], tr[2]), (tr[3], tr[4], tr[5]), 0.06, tr[6], int(255 * (0.35 + 0.65 * fr)))
        # airstrike markers
        rings_c, rings_s = [], []
        for st in game.strikes:
            if st["t"] > 0:
                pulse = 0.5 + 0.5 * math.sin(game.time * 14)
                rings_c.append((st["x"], -st["y"], 0.06)); rings_s.append(4.6 + pulse * 0.4)
                for i in range(st["n"]):
                    k = i - (st["n"] - 1) / 2
                    rings_c.append((st["x"] + st["dx"] * k * 4.2, -(st["y"] + st["dy"] * k * 4.2), 0.06)); rings_s.append(1.4)
                ribbon((st["x"], st["y"], 0.0), (st["x"], st["y"], 40.0), 0.25, (255, 70, 40), 200)
        # particles
        for pt in game.particles:
            x, y, z, vx, vy, vz, life, maxl, size, col, grav, kind = pt
            k = max(0.0, life / maxl)
            if kind == "smoke":
                sm_c.append((x, -y, z)); sm_s.append(size * 0.35)
                sm_col.append((70, 70, 76, int(150 * k)))
            elif kind == "fire":
                glow(x, y, z, size * 0.3, col, k)
            elif kind == "shell":
                glow(x, y, z, 0.03, col, 1.0)
            else:
                glow(x, y, z, size * 0.05 + 0.02, col, 0.4 + 0.6 * k)
        self.b_glow.billboards(g_c, g_s, g_col, right, up)
        self.b_smoke.billboards(sm_c, sm_s, sm_col, right, up)
        self.b_streak.ribbons(st_a, st_b, st_w, st_col, cam)
        self.b_shadow.ground(sh_c, sh_s, sh_col)
        rcol = [(255, 255, 255, 230)] * len(rings_c)
        self.b_ring.ground(rings_c, rings_s, rcol)

    def clear_entities(self):
        for store in (self.v_sold, self.v_turret, self.v_barrel, self.v_pick, self.v_gren, self.v_rock, self.v_drop):
            for v in store.values():
                (v.root if hasattr(v, "root") else v).removeNode()
            store.clear()
        z = np.zeros((0, 3), np.float32)
        for b in (self.b_glow, self.b_smoke, self.b_streak, self.b_ring, self.b_shadow):
            b._flush(0, np.zeros((0, 4, 3), np.float32), np.zeros((0, 4), np.uint8))

    # ------------------------------------------------------------------------------------------------ per frame
    def frame(self, game, dt, t):
        self.t = t
        self.update_entities(game, dt)
        self.update_fx(game)
        self.update_viewmodel(game, t)

    def hide_viewmodel(self):
        for g in self.vm_guns.values():
            g.hide()
        self.vm_flash.hide()
