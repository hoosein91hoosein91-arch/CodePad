"""Core game simulation: player, combat, damage, explosions, killstreaks, shop and the wave director."""
import json
import math
import random
from pathlib import Path

from t8_data import (WEAPONS, ZONE_MULT, DIFFS, ENEMY, SHOP, wave_composition, max_alive)
from t8_entities import Soldier, Turret, Barrel, Pickup, Grenade, Rocket, CALLSIGNS, ang_diff
from t8_world import (ALLY_SPAWNS, ENEMY_SPAWNS, PLAYER_SPAWNS, BARREL_POS)

SAVE_PATH = Path(__file__).with_name("t8_save.json")


def load_save():
    try:
        return json.loads(SAVE_PATH.read_text())
    except Exception:
        return {"best_wave": 0, "best_score": 0, "kills": 0}


def write_save(d):
    try:
        SAVE_PATH.write_text(json.dumps(d))
    except Exception:
        pass


class Inputs:
    fwd = right = 0.0
    mdx = mdy = 0.0
    fire = ads = sprint = crouch = False


class PlayerTarget:
    """Lets the AI treat the player like any other hostile."""
    kind = None
    radius = 0.5

    def __init__(self, p):
        self.p = p

    @property
    def x(self):
        return self.p.x

    @property
    def y(self):
        return self.p.y

    @property
    def alive(self):
        return self.p.alive

    @property
    def tz(self):
        return self.p.feet + (0.85 if self.p.crouch > 0.5 else 1.3)

    @property
    def height(self):
        return self.p.feet + (1.4 if self.p.crouch > 0.5 else 1.9)


class Player:
    def __init__(self, g, diff_key):
        self.g = g
        d = DIFFS[diff_key]
        self.x, self.y = PLAYER_SPAWNS[0]
        self.feet, self.z, self.vz = 0.0, 1.8, 0.0
        self.yaw, self.pitch = -math.pi / 2, 0.0
        self.vx = self.vy = 0.0
        self.hp = self.max_hp = 100.0
        self.armor, self.max_armor = 60.0, 100.0
        self.parts = dict(head=100.0, chest=100.0, arms=100.0, legs=100.0)
        self.alive = True
        self.weapons = {k: dict(mag=w["mag"], reserve=w["reserve"], unlocked=w["unlocked"], maxmag=w["mag"])
                        for k, w in WEAPONS.items()}
        self.cur = 1
        self.reload_t = 0.0
        self.reload_total = 1.0
        self.swap_t = 0.0
        self.fire_cd = 0.0
        self.fire_edge = False
        self.bloom = 0.0
        self.kick = 0.0
        self.spin = 0.0
        self.ads = 0.0
        self.crouch = 0.0
        self.crouching = False
        self.slide_t = 0.0
        self.slide_cd = 0.0
        self.slide_dir = (0.0, 0.0)
        self.stamina = 100.0
        self.sprinting = False
        self.exhausted = False
        self.sprint_idle = 0.0
        self.on_ground = True
        self.grenades, self.stims, self.airstrikes, self.turrets = 3, 2, 1, 1
        self.gren_cd = 0.0
        self.dmg_mult = 1.0
        self.reload_mult = 1.0
        self.focus = 40.0
        self.bt_active = False
        self.score = 400
        self.kills = 0
        self.headshots = 0
        self.streak = 0
        self.best_streak = 0
        self.lives = d["lives"]
        self.leg_slow = 0.0
        self.arm_pen = 0.0
        self.stim_t = 0.0
        self.last_hit = -99.0
        self.invuln = 0.0
        self.bob = 0.0
        self.bob_t = 0.0
        self.speed = 0.0
        self.uav_t = 0.0
        self.respawn_t = 0.0
        self.upgrades = {}
        self.fov = 75.0
        self.muzzle_t = 0.0
        self.view_kick = 0.0          # viewmodel kickback 0..1
        self.assist = False
        self.sens = 0.0022
        self.base_fov = 75.0
        self.step_acc = 0.0
        self.last_move_t = 0.0
        self.sway_t = 0.0
        self.death_pitch = 0.0
        self.total_dmg_taken = 0.0
        self.last_kill_t = -99.0
        self.multi = 0

    @property
    def w(self):
        return WEAPONS[self.cur]

    @property
    def st(self):
        return self.weapons[self.cur]

    # ---------------------------------------------------------------- helpers
    def evade_factor(self):
        if self.slide_t > 0:
            return 0.5
        f = 1.0
        if self.sprinting:
            f = 0.62
        elif self.speed > 3.0:
            f = 0.86
        if self.crouch > 0.5:
            f *= 0.74
        if not self.on_ground:
            f *= 0.8
        return f

    def spread_now(self):
        w = self.w
        base = w["hip"] + (w["spread"] - w["hip"]) * self.ads
        mv = 1.0 + min(1.2, self.speed / 9.0) * (0.9 - 0.55 * self.ads)
        c = 1.0 - 0.28 * self.crouch
        air = 1.0 if self.on_ground else 2.2
        pen = 1.5 if self.arm_pen > 0 else 1.0
        return base * mv * c * air * pen + self.bloom

    def cos_dir(self, yaw=None, pitch=None):
        yaw = self.yaw if yaw is None else yaw
        pitch = self.pitch if pitch is None else pitch
        cp = math.cos(pitch)
        return cp * math.cos(yaw), cp * math.sin(yaw), math.sin(pitch)

    # ---------------------------------------------------------------- weapons
    def switch_weapon(self, k):
        if not self.alive or k == self.cur or k not in self.weapons or not self.weapons[k]["unlocked"]:
            return
        self.cur = k
        self.reload_t = 0.0
        self.swap_t = 0.38 * self.reload_mult
        self.spin = 0.0
        self.g.audio.play("reload", 0.25)

    def cycle_weapon(self, step):
        keys = [k for k in sorted(self.weapons) if self.weapons[k]["unlocked"]]
        i = keys.index(self.cur)
        self.switch_weapon(keys[(i + step) % len(keys)])

    def start_reload(self):
        st, w = self.st, self.w
        if self.reload_t > 0 or st["mag"] >= st["maxmag"] or st["reserve"] <= 0 or self.swap_t > 0:
            return
        self.reload_total = w["reload"] * self.reload_mult
        self.reload_t = self.reload_total
        self.g.audio.play("reload_long" if self.cur in (3, 5, 6, 7) else "reload", 0.7)

    def try_fire(self):
        g = self.g
        w, st = self.w, self.st
        if not self.alive or self.reload_t > 0 or self.swap_t > 0 or self.fire_cd > 0:
            return
        if st["mag"] <= 0:
            if st["reserve"] > 0:
                self.start_reload()
            else:
                self.fire_cd = 0.3
                g.audio.play("empty", 0.6)
                g.banner("no_ammo", (255, 200, 60), 0.8)
            return
        if w.get("minigun") and self.spin < 0.38:
            return
        rate = w["rate"]
        if w.get("minigun"):
            rate = 0.14 + (0.048 - 0.14) * min(1.0, self.spin)
        self.fire_cd = rate
        st["mag"] -= 1
        g.audio.play(w["snd"], 0.9)
        self.muzzle_t = 0.06
        g.flash = max(g.flash, 0.07)
        g.flash_col = (255, 200, 120)
        self.view_kick = min(1.0, self.view_kick + (0.5 if self.cur in (3, 5, 6) else 0.22))
        arm = 1.55 if self.arm_pen > 0 else 1.0
        kick = w["recoil"] * (0.4 if self.ads > 0.5 else 0.72) * arm
        self.pitch += kick
        self.kick += kick
        self.yaw += random.uniform(-0.5, 0.5) * w["recoil"] * 0.45 * arm
        self.bloom = min(0.05, self.bloom + w["bloom"])
        g.eject_shell()
        # fire origin / direction
        ox, oy, oz = self.x, self.y, self.z
        if w.get("rocket"):
            dx, dy, dz = self.cos_dir()
            g.spawn_rocket(0, True, ox + dx * 0.8, oy + dy * 0.8, oz - 0.15 + dz * 0.8, dx, dy, dz, 46.0)
            g.shake = max(g.shake, 0.35)
            if st["mag"] <= 0 and st["reserve"] > 0:
                self.start_reload()
            return
        spread = self.spread_now()
        for p in range(w["pellets"]):
            sp = spread if w["pellets"] == 1 else (w["spread"] + (w["hip"] - w["spread"]) * (1 - self.ads))
            yaw = self.yaw + random.uniform(-sp, sp)
            pit = self.pitch + random.uniform(-sp, sp)
            dx, dy, dz = self.cos_dir(yaw, pit)
            g.player_shot(ox, oy, oz, dx, dy, dz, w["dmg"] * self.dmg_mult, first=(p == 0))
        if st["mag"] <= 0 and st["reserve"] > 0:
            self.start_reload()

    def finish_reload(self):
        st = self.st
        need = st["maxmag"] - st["mag"]
        take = min(need, st["reserve"])
        st["mag"] += take
        st["reserve"] -= take

    # ---------------------------------------------------------------- update
    def update(self, dt, wdt, inp):
        g = self.g
        w = self.w
        pdt = dt * min(1.0, g.ts * 2.6)
        self.leg_slow = max(0.0, self.leg_slow - wdt)
        self.arm_pen = max(0.0, self.arm_pen - wdt)
        self.stim_t = max(0.0, self.stim_t - pdt)
        self.invuln = max(0.0, self.invuln - dt)
        self.uav_t = max(0.0, self.uav_t - dt)
        self.fire_cd = max(0.0, self.fire_cd - pdt)
        self.swap_t = max(0.0, self.swap_t - pdt)
        self.gren_cd = max(0.0, self.gren_cd - pdt)
        self.slide_cd = max(0.0, self.slide_cd - pdt)
        self.muzzle_t = max(0.0, self.muzzle_t - dt)
        self.view_kick = max(0.0, self.view_kick - dt * 6.0)
        self.bloom *= math.exp(-7.0 * pdt)
        if not self.alive:
            self.respawn_t -= dt
            self.death_pitch += (-0.55 - self.death_pitch) * min(1.0, 3 * dt)
            self.z += (0.35 - self.z) * min(1.0, 4 * dt)
            return
        # bullet time
        if self.bt_active:
            self.focus -= 15.0 * dt
            if self.focus <= 0:
                self.focus = 0
                self.set_bullet_time(False)
        else:
            self.focus = min(100.0, self.focus + 1.2 * dt)
        # look
        fov_ratio = self.fov / 75.0
        sens = self.sens * (0.55 + 0.45 * fov_ratio) if self.ads > 0.1 else self.sens
        self.yaw += inp.mdx * sens
        self.pitch -= inp.mdy * sens
        # recoil recovery
        if self.kick > 0:
            rec = min(self.kick, (self.kick * 3.2 + 0.006) * pdt)
            self.pitch -= rec * 0.6
            self.kick -= rec
        self.pitch = max(-1.25, min(1.25, self.pitch))
        # weapon timers
        if self.reload_t > 0:
            self.reload_t -= pdt
            if self.reload_t <= 0:
                self.reload_t = 0.0
                self.finish_reload()
        # crouch & slide
        want_crouch = inp.crouch and self.slide_t <= 0
        self.crouching = want_crouch or self.slide_t > 0
        self.crouch += ((1.0 if self.crouching else 0.0) - self.crouch) * min(1.0, 11 * pdt)
        # movement
        cy, sy = math.cos(self.yaw), math.sin(self.yaw)
        mvx = cy * inp.fwd - sy * inp.right
        mvy = sy * inp.fwd + cy * inp.right
        ml = math.hypot(mvx, mvy)
        if ml > 1:
            mvx, mvy = mvx / ml, mvy / ml
        want_sprint = inp.sprint and inp.fwd > 0.3 and self.ads < 0.3 and not self.crouching and self.reload_t <= 0
        if self.exhausted and self.stamina > 28:
            self.exhausted = False
        if want_sprint and self.stamina > 0 and not self.exhausted:
            self.sprinting = True
            self.stamina -= 24.0 * pdt
            self.sprint_idle = 0.0
            if self.stamina <= 0:
                self.stamina = 0.0
                self.exhausted = True
        else:
            self.sprinting = False
            self.sprint_idle += pdt
            if self.sprint_idle > 0.5:
                self.stamina = min(100.0, self.stamina + 17.0 * pdt)
        base = 8.2
        if self.ads > 0.5:
            base = 4.6
        elif self.sprinting:
            base = 11.8
        if self.crouch > 0.5:
            base = 4.5
        if self.stim_t > 0:
            base *= 1.3
        if self.leg_slow > 0:
            base *= 0.55
        tvx, tvy = mvx * base, mvy * base
        if self.slide_t > 0:
            self.slide_t -= pdt
            f = max(0.0, self.slide_t / 0.62)
            tvx, tvy = self.slide_dir[0] * (6.0 + 10.5 * f), self.slide_dir[1] * (6.0 + 10.5 * f)
            acc = 30.0
        else:
            acc = 15.0 if self.on_ground else 4.5
        k = min(1.0, acc * pdt)
        self.vx += (tvx - self.vx) * k
        self.vy += (tvy - self.vy) * k
        nx = self.x + self.vx * pdt
        ny = self.y + self.vy * pdt
        nx, ny = g.world.push_out(nx, ny, 0.55, self.feet)
        self.speed = math.hypot(nx - self.x, ny - self.y) / max(pdt, 1e-5)
        self.x, self.y = nx, ny
        # vertical
        ground = g.world.ground_at(self.x, self.y, 0.55, self.feet)
        self.vz -= 24.0 * pdt
        self.feet += self.vz * pdt
        if self.feet <= ground and self.vz <= 0:
            if not self.on_ground and self.vz < -7:
                g.audio.play("land", 0.6)
                g.shake = max(g.shake, 0.08)
            self.feet = ground
            self.vz = 0.0
            self.on_ground = True
        elif self.feet > ground + 0.05:
            self.on_ground = False
        eye = 1.8 + (1.05 - 1.8) * self.crouch
        moving = self.on_ground and self.speed > 1.0
        if moving:
            self.bob_t += pdt * (13 if self.sprinting else 9) * (0.5 if self.crouch > 0.5 else 1.0)
            self.step_acc += self.speed * pdt
            if self.step_acc > (3.1 if self.sprinting else 2.3) and self.crouch < 0.5:
                self.step_acc = 0
                g.audio.play("step", 0.35)
        bobamp = (0.045 if self.sprinting else 0.026) * (1 - self.ads * 0.8)
        self.bob = math.sin(self.bob_t) * bobamp * (1.0 if moving else 0.0)
        self.z = self.feet + eye + abs(self.bob) * 0.8
        # ADS / FOV
        can_ads = inp.ads and self.reload_t <= 0 and self.swap_t <= 0 and not self.sprinting
        self.ads += ((1.0 if can_ads else 0.0) - self.ads) * min(1.0, 16 * pdt)
        tgt = self.base_fov
        if self.slide_t > 0:
            tgt += 11
        elif self.sprinting:
            tgt += 6
        tgt = tgt + (w["ads_fov"] * (self.base_fov / 75.0) - tgt) * self.ads
        self.fov += (tgt - self.fov) * min(1.0, 12 * dt)
        # firing
        if w.get("minigun"):
            if inp.fire and self.reload_t <= 0 and self.swap_t <= 0 and self.st["mag"] > 0:
                self.spin = min(1.0, self.spin + pdt / 0.65)
            else:
                self.spin = max(0.0, self.spin - pdt / 0.9)
        if inp.fire and (w["auto"] or self.fire_edge):
            self.try_fire()
        elif self.fire_edge:
            self.try_fire()
        self.fire_edge = False
        if self.assist and not inp.fire and self.alive:
            d = self.cos_dir()
            tt, obj, zone, _ = g.trace(self.x, self.y, self.z, d[0], d[1], d[2], 120, 1)
            if obj is not None and getattr(obj, "kind", None):
                self.try_fire()
        # regen
        if self.hp < self.max_hp and g.time - self.last_hit > g.diff["regen_delay"]:
            self.hp = min(self.max_hp, self.hp + g.diff["regen"] * dt)
            for k_ in self.parts:
                self.parts[k_] = min(100.0, self.parts[k_] + 8 * dt)

    def set_bullet_time(self, on):
        if on == self.bt_active:
            return
        if on and self.focus < 25:
            self.g.banner("bt_need", (255, 120, 80), 1.0)
            self.g.audio.play("deny", 0.6)
            return
        self.bt_active = on
        self.g.audio.play("bt_in" if on else "bt_out", 0.8)
        if on:
            self.g.banner("bt_on", (120, 220, 255), 1.4)


class Game:
    def __init__(self, world, audio, diff_key="regular"):
        self.world = world
        self.audio = audio
        self.diff_key = diff_key
        self.diff = DIFFS[diff_key]
        self.time = 0.0
        self.ts = 1.0
        self.wave = 0
        self.phase = "intermission"
        self.phase_t = 6.0
        self.first = True
        self.queue = []
        self.spawn_t = 0.0
        self.soldiers = []
        self.turrets = []
        self.barrels = []
        self.pickups = []
        self.grenades = []
        self.rockets = []
        self.particles = []
        self.tracers = []
        self.fx = []
        self.strikes = []
        self.drops = []
        self.pending = []
        self.banners = []
        self.feed = []
        self.popups = []
        self.dmg_dirs = []
        self.shake = 0.0
        self.flash = 0.0
        self.flash_col = (255, 190, 90)
        self.blood = 0.0
        self.hit_t = 0.0
        self.hit_zone = "chest"
        self.hit_popup = None
        self.team_kills = [0, 0]
        self.player = Player(self, diff_key)
        self.player_target = PlayerTarget(self.player)
        self.field_player = world.flow_field([world.cell_of(self.player.x, self.player.y)])
        self.field_hostile = {0: [9999] * (world.N * world.N), 1: [9999] * (world.N * world.N)}
        self.field_t = 0.0
        self.field_i = 0
        self.save = load_save()
        self.new_best = False
        self.hotspots = []
        self.reinf_kills = 0
        self.ally_timer = 22.0
        self.stall_t = 0.0
        self.names_used = 0
        self.over_t = 0.0
        self.last_hurt_snd = 0.0
        self.brass = []
        self.wave_cleared_bonus = 0
        self.stats_wave_kills = 0
        self.warned = set()
        self._enemies = []
        self._friends = []
        self.spawn_barrels()
        self.spawn_allies()
        self.banner("get_ready", (255, 190, 60), 3.0, sub=("wave", 1))

    # ============================================================== helpers / queries
    def hostiles_of(self, team):
        return self._enemies if team == 0 else self._friends

    def rocket_targets(self, team):
        out = []
        if team == 1:
            out += [s for s in self.soldiers if s.alive and s.team == 0]
            if self.player.alive:
                out.append(self.player_target)
            out += [t for t in self.turrets if t.alive]
        else:
            out += [s for s in self.soldiers if s.alive and s.team == 1]
        out += [b for b in self.barrels if b.alive]
        return out

    def banner(self, key, color=(255, 255, 255), dur=2.0, sub=None, fmt=None):
        self.banners.append(dict(key=key, color=color, t=dur, dur=dur, sub=sub, fmt=fmt))
        if len(self.banners) > 4:
            self.banners.pop(0)

    def popup(self, text, color):
        self.popups.append(dict(text=text, color=color, t=1.0))
        if len(self.popups) > 6:
            self.popups.pop(0)

    def add_tracer(self, x0, y0, z0, x1, y1, z1, color, life=0.08):
        self.tracers.append([x0, y0, z0, x1, y1, z1, color, life, life])

    def particle(self, x, y, z, vx, vy, vz, life, size, color, grav=14.0, kind="spark"):
        if len(self.particles) > 420:
            return
        self.particles.append([x, y, z, vx, vy, vz, life, life, size, color, grav, kind])

    def sparks(self, x, y, z, color, n=8, speed=6.0):
        for _ in range(n):
            a = random.uniform(0, math.tau)
            s = random.uniform(0.3, 1.0) * speed
            self.particle(x, y, z, math.cos(a) * s, math.sin(a) * s, random.uniform(1, 5), random.uniform(0.2, 0.45), 0.9,
                          color)

    def puff(self, x, y, z):
        self.particle(x, y, z, random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), 0.4, 0.5, 3.0, (150, 150, 150), 0.0, "smoke")
        self.particle(x, y, z, 0, 0, 0, 0.12, 1.6, (255, 190, 80), 0.0, "fire")

    def eject_shell(self):
        p = self.player
        rx, ry = -math.sin(p.yaw), math.cos(p.yaw)
        self.particle(p.x + rx * 0.2 + math.cos(p.yaw) * 0.4, p.y + ry * 0.2 + math.sin(p.yaw) * 0.4, p.z - 0.25,
                      rx * random.uniform(2, 3.5), ry * random.uniform(2, 3.5), random.uniform(2, 3.5), 1.1, 0.7,
                      (230, 190, 60), 16.0, "shell")

    # ============================================================== spawning
    def spawn_barrels(self):
        self.barrels = [Barrel(x, y) for x, y in BARREL_POS]

    def _free_spot(self, pool, jitter=3.0, avoid=None, min_d=0.0):
        for _ in range(25):
            sx, sy = random.choice(pool)
            sx += random.uniform(-jitter, jitter)
            sy += random.uniform(-jitter, jitter)
            if self.world.point_in_box(sx, sy, 0.5, 0.8):
                continue
            if avoid and math.hypot(sx - avoid[0], sy - avoid[1]) < min_d:
                continue
            ok = True
            for s in self.soldiers:
                if s.alive and math.hypot(s.x - sx, s.y - sy) < 1.3:
                    ok = False
                    break
            if ok:
                return sx, sy
        return random.choice(pool)

    def spawn_allies(self):
        kinds = ["ally_ar", "ally_ar", "ally_sn", "ally_smg", "ally_ar", "ally_smg", "ally_ar"]
        alive = [s for s in self.soldiers if s.alive and s.team == 0]
        have = len(alive)
        names = [s.name for s in alive]
        for i in range(7 - have):
            kind = kinds[(have + i) % len(kinds)]
            x, y = self._free_spot(ALLY_SPAWNS, 2.0)
            nm = next((n for n in CALLSIGNS[:8] if n not in names), CALLSIGNS[i % 8])
            names.append(nm)
            self.soldiers.append(Soldier(self, 0, kind, x, y, nm))

    def spawn_enemy(self, kind):
        p = self.player
        x, y = self._free_spot(ENEMY_SPAWNS, 3.0, (p.x, p.y), 30.0)
        names = [s.name for s in self.soldiers if s.team == 1 and s.alive]
        nm = f"HOSTILE-{random.randint(10, 99)}"
        s = Soldier(self, 1, kind, x, y, nm)
        if kind in ("grunt", "grenadier") and s.role == "flank":
            s.lane = self.pick_flank_lane()
        self.soldiers.append(s)
        return s

    def pick_flank_lane(self):
        if not self.hotspots:
            return random.choice(["left", "right", "center"])
        hx = self.hotspots[-1][0]
        if abs(hx) < 15:
            return random.choice(["left", "right"])
        return "right" if hx < 0 else "left"

    # ============================================================== combat: hitscan
    def trace(self, ox, oy, oz, dx, dy, dz, maxd, team_target):
        """Returns (t, obj, zone, wall_index).  team_target: which soldier team can be hit."""
        w = self.world
        tw, bi = w.raycast(ox, oy, oz, dx, dy, dz, maxd)
        best_t, best, zone = tw, None, None
        h2 = dx * dx + dy * dy
        if h2 > 1e-9:
            for s in self.soldiers:
                if not s.alive or s.team != team_target:
                    continue
                r = 0.46 * s.scale
                rx, ry = s.x - ox, s.y - oy
                b = rx * dx + ry * dy
                tc = b / h2
                d2 = rx * rx + ry * ry - b * b / h2
                if d2 > r * r:
                    continue
                half = math.sqrt((r * r - d2) / h2)
                t0 = tc - half
                if t0 < 0:
                    t0 = tc + half
                if t0 < 0 or t0 >= best_t:
                    continue
                z = oz + dz * t0
                hgt = s.height
                if z < 0 or z > hgt:
                    continue
                best_t, best = t0, s
                rel = z / (s.scale * (1 - 0.25 * s.crouch))
                hx, hy = ox + dx * t0, oy + dy * t0
                lat = (hx - s.x) * (-math.sin(s.facing)) + (hy - s.y) * math.cos(s.facing)
                if rel >= 1.5:
                    zone = "head"
                elif rel < 0.8:
                    zone = "legs"
                elif abs(lat) > 0.3 * s.scale:
                    zone = "arms"
                else:
                    zone = "chest"
            for b_ in self.barrels:
                if not b_.alive:
                    continue
                rx, ry = b_.x - ox, b_.y - oy
                b = rx * dx + ry * dy
                tc = b / h2
                d2 = rx * rx + ry * ry - b * b / h2
                r = 0.6
                if d2 > r * r:
                    continue
                half = math.sqrt((r * r - d2) / h2)
                t0 = tc - half
                if t0 < 0 or t0 >= best_t:
                    continue
                z = oz + dz * t0
                if 0 <= z <= 1.65:
                    best_t, best, zone = t0, b_, "barrel"
        return best_t, best, zone, bi

    def player_shot(self, ox, oy, oz, dx, dy, dz, dmg, first=True):
        p = self.player
        t, obj, zone, bi = self.trace(ox, oy, oz, dx, dy, dz, 170.0, 1)
        # tracer from the muzzle
        rx, ry = -math.sin(p.yaw), math.cos(p.yaw)
        mx = ox + math.cos(p.yaw) * 0.7 + rx * 0.22
        my = oy + math.sin(p.yaw) * 0.7 + ry * 0.22
        mz = oz - 0.22
        ex, ey, ez = ox + dx * t, oy + dy * t, oz + dz * t
        if first or p.cur != 5:
            col = (0, 229, 255) if p.cur == 7 else (255, 221, 85)
            self.add_tracer(mx, my, mz, ex, ey, ez, col, 0.07)
        if obj is None:
            if t < 169:
                self.sparks(ex - dx * 0.1, ey - dy * 0.1, max(0.05, ez), (255, 204, 68), 4, 4.0)
            return
        if zone == "barrel":
            obj.hp -= dmg
            self.sparks(ex, ey, ez, (255, 100, 30), 6)
            self.hit_confirm("chest")
            if obj.hp <= 0 and obj.alive:
                self.blow_barrel(obj, True)
            return
        self.sparks(ex, ey, ez, (255, 0, 0) if zone == "head" else (255, 170, 0), 7)
        self.damage_soldier(obj, dmg, zone, True, attacker=None, dist=t)

    def hit_confirm(self, zone):
        self.hit_t = 0.12
        self.hit_zone = zone
        self.audio.play("headshot" if zone == "head" else "hit", 0.8)

    # ============================================================== damage
    def damage_soldier(self, s, dmg, zone, by_player, attacker=None, dist=0.0, turret=False, explosion=False):
        if not s.alive:
            return
        mult = ZONE_MULT.get(zone, 1.0)
        if s.armor_mult < 1.0 and zone != "head":
            mult *= s.armor_mult
        final = dmg * mult
        s.hp -= final
        s.hit_flash = 0.1
        if zone == "arms":
            s.arm_pen = 5.0
        elif zone == "legs":
            s.leg_slow = 5.0
        if by_player or turret:
            if by_player:
                self.hit_confirm(zone)
                names = {"head": "HEADSHOT", "chest": "CHEST", "arms": "ARM", "legs": "LEG"}
                col = {"head": (255, 30, 60), "chest": (255, 171, 64), "arms": (64, 196, 255), "legs": (0, 230, 118)}[zone]
                self.hit_popup = (f"{names.get(zone, '')} -{int(final)}", col, 0.6)
            s.strafe *= -1
            if s.kind not in ("heavy", "boss") and random.random() < 0.48:
                s.crouch_t = 1.5
        if s.team == 1 and s.kind == "boss" and not s.summoned and s.hp < s.max_hp * 0.5:
            s.summoned = True
            self.banner("boss_in", (255, 90, 50), 2.5)
            for _ in range(3):
                self.queue.insert(0, "grunt")
            self.spawn_t = 0.0
        if s.hp <= 0:
            self.kill_soldier(s, zone, by_player, attacker, turret, explosion, dist)

    def kill_soldier(self, s, zone, by_player, attacker, turret=False, explosion=False, dist=0.0):
        p = self.player
        s.alive = False
        s.death_t = 0.0
        s.laser = False
        self.sparks(s.x, s.y, 1.2, (255, 0, 60) if s.team == 1 else (0, 160, 255), 12)
        killer = "YOU" if by_player else ("SENTRY" if turret else (attacker.name if attacker else "BLAST"))
        wname = (p.w["name"].split()[0] if by_player and not explosion else ("SENTRY" if turret else
                 (attacker.w["name"].split()[0] if attacker else "BOOM")))
        self.feed.append(dict(t=5.0, killer=killer, weapon=wname, victim=s.name or s.kind.upper(), head=(zone == "head"),
                              team=0 if (by_player or turret or (attacker and attacker.team == 0)) else 1))
        if len(self.feed) > 5:
            self.feed.pop(0)
        if s.team == 1:
            self.team_kills[0] += 1
            self.stats_wave_kills += 1
            if by_player or turret:
                base = ENEMY[s.kind]["score"]
                if by_player:
                    p.kills += 1
                    p.streak += 1
                    p.best_streak = max(p.best_streak, p.streak)
                    bonus = int(base * 0.6) if zone == "head" else 0
                    if zone == "head":
                        p.headshots += 1
                    p.score += base + bonus
                    p.focus = min(100.0, p.focus + (16 if zone == "head" else 9))
                    self.audio.play("kill", 0.7)
                    txt = f"+{base + bonus}"
                    if zone == "head":
                        txt = "HEADSHOT  " + txt
                    self.popup(txt, (255, 40, 70) if zone == "head" else (255, 235, 59))
                    if self.time - p.last_kill_t < 3.5:
                        p.multi += 1
                    else:
                        p.multi = 1
                    p.last_kill_t = self.time
                    if p.multi >= 2:
                        mk = {2: "DOUBLE KILL", 3: "TRIPLE KILL", 4: "QUAD KILL"}.get(p.multi, "RAMPAGE x%d" % p.multi)
                        mb = 50 * (p.multi - 1)
                        p.score += mb
                        self.popup(f"{mk}  +{mb}", (255, 150, 40))
                    if dist > 45 and not explosion:
                        p.score += 75
                        self.popup("LONGSHOT  +75", (120, 220, 255))
                    self.hotspots.append((p.x, p.y))
                    self.hotspots = self.hotspots[-8:]
                    self.reinf_kills += 1
                    if self.reinf_kills >= 6:
                        self.reinf_kills = 0
                        self.reinforce_ally()
                    self.check_streak()
                else:
                    p.score += base // 2
            if random.random() < (0.35 if s.kind in ("heavy", "grenadier", "marksman") else 0.22) or s.kind == "boss":
                kind = random.choice(["ammo", "ammo", "med", "armor"])
                self.pickups.append(Pickup(s.x, s.y, kind))
            if s.kind == "boss":
                p.score += 500
                self.explode(s.x, s.y, 1.0, 14.0, 120, -1, False)
                self.pickups.append(Pickup(s.x + 2, s.y, "med"))
                self.pickups.append(Pickup(s.x - 2, s.y, "ammo"))
                self.pickups.append(Pickup(s.x, s.y + 2, "armor"))
                self.popup("WARLORD DOWN  +500", (255, 160, 40))
        else:
            self.team_kills[1] += 1

    def check_streak(self):
        p = self.player
        n = p.streak
        if n == 3:
            p.uav_t = 25.0
            self.banner("ks3", (80, 220, 255), 2.2)
            self.banner("uav_on", (80, 220, 255), 2.2)
            self.audio.play("uav", 0.8)
        elif n == 5:
            p.airstrikes += 1
            self.banner("ks5", (255, 170, 40), 2.2)
            self.audio.play("clear", 0.6)
        elif n == 8:
            p.turrets += 1
            p.armor = p.max_armor
            self.banner("ks8", (120, 255, 160), 2.2)
            self.audio.play("clear", 0.6)
        elif n == 12:
            p.focus = 100.0
            self.banner("ks12", (255, 90, 200), 2.2)
            self.audio.play("clear", 0.6)

    def reinforce_ally(self):
        if sum(1 for s in self.soldiers if s.alive and s.team == 0) < 7:
            self.spawn_allies_one()
            self.banner("reinforce", (80, 200, 255), 1.6)

    def spawn_allies_one(self):
        kinds = ["ally_ar", "ally_smg", "ally_sn", "ally_ar"]
        x, y = self._free_spot(ALLY_SPAWNS, 2.0)
        names = [s.name for s in self.soldiers if s.alive and s.team == 0]
        from t8_entities import CALLSIGNS as CS
        nm = next((n for n in CS if n not in names), "RECON")
        s = Soldier(self, 0, random.choice(kinds), x, y, nm)
        s.wp = 2
        self.soldiers.append(s)

    def damage_turret(self, t, dmg):
        t.hp -= dmg
        if t.hp <= 0 and t.alive:
            t.alive = False
            self.sparks(t.x, t.y, 0.8, (255, 160, 40), 16)
            self.audio.play("explosion", 0.4, pos=(t.x, t.y))

    def damage_player(self, amount, sx, sy, src="", big=False, zone=None, explosion=False):
        p = self.player
        if not p.alive or p.invuln > 0:
            return
        if zone is None:
            r = random.random()
            hp_ = 0.25 if big else 0.14
            if r < hp_:
                zone = "head"
            elif r < hp_ + 0.44:
                zone = "chest"
            elif r < hp_ + 0.66:
                zone = "arms"
            else:
                zone = "legs"
        mult = {"head": 1.75, "chest": 1.0, "arms": 0.75, "legs": 0.65}[zone]
        if explosion:
            mult = 1.0
        final = amount * mult
        if zone == "head" and not explosion:
            p.pitch += 0.05
        elif zone == "arms":
            p.arm_pen = 3.5
        elif zone == "legs":
            p.leg_slow = 3.5
        p.parts[zone] = max(0.0, p.parts[zone] - final * 1.4)
        if (zone == "chest" or explosion) and p.armor > 0:
            absorbed = min(p.armor, math.ceil(final * 0.65))
            p.armor -= absorbed
            final -= absorbed
        final = max(0.0, final)
        p.hp -= final
        p.last_hit = self.time
        p.total_dmg_taken += final
        self.hit_label = (zone, int(final), src)
        self.hit_label_t = 1.0
        self.blood = 0.95 if zone == "head" else 0.7
        self.shake = max(self.shake, 0.12 + min(0.25, final / 140))
        self.dmg_dirs.append([sx, sy, 1.4])
        if len(self.dmg_dirs) > 8:
            self.dmg_dirs.pop(0)
        if self.time - self.last_hurt_snd > 0.2:
            self.last_hurt_snd = self.time
            self.audio.play("hurt", 0.7)
        if p.hp <= 0:
            self.player_die(src)

    hit_label = None
    hit_label_t = 0.0

    def near_miss(self, ex, ey, ez):
        p = self.player
        d = math.hypot(ex - p.x, ey - p.y)
        if d < 3.0 and random.random() < 0.7:
            self.audio.play("whiz", 0.5, pos=(ex, ey))
            self.shake = max(self.shake, 0.05)

    def warn_sniper(self, s):
        self.banner("laser", (255, 40, 40), 1.1)
        self.audio.play("uav", 0.7)

    def player_die(self, src):
        p = self.player
        p.alive = False
        p.hp = 0
        p.lives -= 1
        p.streak = 0
        p.bt_active = False
        p.respawn_t = 3.0
        p.vx = p.vy = 0
        self.blood = 1.0
        self.audio.play("hurt", 1.0)
        self.team_kills[1] += 1
        self.feed.append(dict(t=5.0, killer=src.split()[0] if src else "???", weapon="", victim="YOU", head=False, team=1))
        if p.lives <= 0:
            self.game_over()

    def respawn_player(self):
        p = self.player
        best, bd = PLAYER_SPAWNS[0], -1
        for sx, sy in PLAYER_SPAWNS:
            d = min([math.hypot(s.x - sx, s.y - sy) for s in self.soldiers if s.alive and s.team == 1] or [99])
            if d > bd:
                best, bd = (sx, sy), d
        p.x, p.y = best
        p.feet, p.vz = 0.0, 0.0
        p.hp = p.max_hp
        p.armor = max(p.armor, 50.0)
        p.parts = dict(head=100.0, chest=100.0, arms=100.0, legs=100.0)
        p.alive = True
        p.invuln = 2.5
        p.leg_slow = p.arm_pen = 0.0
        p.death_pitch = 0.0
        p.pitch = 0.0
        p.yaw = -math.pi / 2 if best[1] > 0 else math.pi / 2
        p.reload_t = 0.0
        self.blood = 0.0
        self.flash = 1.0
        self.flash_col = (0, 229, 255)
        for w in p.weapons.values():
            if w["unlocked"]:
                w["reserve"] = max(w["reserve"], w["maxmag"] * 2)
        p.grenades = max(p.grenades, 2)

    def game_over(self):
        self.phase = "gameover"
        self.over_t = 0.0
        p = self.player
        sv = self.save
        self.new_best = False
        if self.wave > sv.get("best_wave", 0):
            sv["best_wave"] = self.wave
            self.new_best = True
        if p.score > sv.get("best_score", 0):
            sv["best_score"] = p.score
        sv["kills"] = sv.get("kills", 0) + p.kills
        write_save(sv)
        self.audio.play("gameover", 0.9)

    # ============================================================== explosions
    def explode(self, x, y, z, radius, dmg, team, by_player):
        self.audio.play("explosion", 1.0, pos=(x, y), maxdist=120)
        self.fx.append(dict(x=x, y=y, z=max(z, 0.5), t=0.0, dur=0.55, r=radius * 0.55))
        for _ in range(26):
            a = random.uniform(0, math.tau)
            s = random.uniform(2, 12)
            self.particle(x, y, z, math.cos(a) * s, math.sin(a) * s, random.uniform(2, 9), random.uniform(0.3, 0.8), 1.4,
                          random.choice([(255, 140, 20), (255, 220, 60), (255, 80, 20)]), 10.0, "fire")
        for _ in range(14):
            a = random.uniform(0, math.tau)
            s = random.uniform(1, 5)
            self.particle(x, y, z + 0.5, math.cos(a) * s, math.sin(a) * s, random.uniform(1, 4), random.uniform(1.0, 2.0), 3.6,
                          (70, 70, 74), -1.0, "smoke")
        for _ in range(12):
            a = random.uniform(0, math.tau)
            s = random.uniform(4, 14)
            self.particle(x, y, z, math.cos(a) * s, math.sin(a) * s, random.uniform(4, 11), random.uniform(0.6, 1.3), 0.9,
                          (255, 200, 90), 18.0, "spark")
        p = self.player
        d = math.hypot(p.x - x, p.y - y)
        self.shake = max(self.shake, min(0.9, 7.0 / (d + 4)))
        self.flash = max(self.flash, min(0.8, 9.0 / (d * d * 0.2 + 6)))
        self.flash_col = (255, 190, 90)
        R = radius + 0.5
        for s in self.soldiers:
            if not s.alive or s.team == team:
                continue
            dd = math.hypot(s.x - x, s.y - y)
            if dd < R:
                f = 1 - dd / R
                if not self.world.los(x, y, max(z, 0.8), s.x, s.y, 1.0):
                    f *= 0.4
                self.damage_soldier(s, dmg * f / 1.25, "chest", by_player and team == 0, explosion=True,
                                    attacker=None)
                s.strafe *= -1
        for t in self.turrets:
            if t.alive and math.hypot(t.x - x, t.y - y) < R and team != 0:
                self.damage_turret(t, dmg * (1 - math.hypot(t.x - x, t.y - y) / R))
        if p.alive and d < R and team != -2:
            f = 1 - d / R
            if not self.world.los(x, y, max(z, 0.8), p.x, p.y, p.z - 0.4):
                f *= 0.4
            scale = 1.0 if team in (1, -1) else 0.45
            if team == -1:
                scale = 0.6
            self.damage_player(dmg * f * scale, x, y, "EXPLOSION", zone="chest", explosion=True)
        for b in self.barrels:
            if b.alive and math.hypot(b.x - x, b.y - y) < R:
                b.hp -= dmg * 0.5 * (1 - math.hypot(b.x - x, b.y - y) / R) + 12
                if b.hp <= 0:
                    self.blow_barrel(b, False)
        self.grenade_chain(x, y, R)

    def grenade_chain(self, x, y, R):
        for g_ in self.grenades:
            if g_.alive and math.hypot(g_.x - x, g_.y - y) < R * 0.6:
                g_.fuse = min(g_.fuse, 0.15)

    def blow_barrel(self, b, by_player):
        if not b.alive:
            return
        b.alive = False
        self.pending.append([0.1, b.x, b.y, 0.8, 9.0, 175.0, -1, by_player])

    # ============================================================== projectiles / abilities
    def spawn_rocket(self, team, by_player, x, y, z, dx, dy, dz, speed, source=None):
        self.rockets.append(Rocket(team, by_player, x, y, z, dx, dy, dz, speed, source))

    def throw_player_grenade(self):
        p = self.player
        if not p.alive or p.grenades <= 0 or p.gren_cd > 0:
            return
        p.grenades -= 1
        p.gren_cd = 0.9
        dx, dy, dz = p.cos_dir()
        v = 21.0
        self.grenades.append(Grenade(0, True, p.x + dx * 0.5, p.y + dy * 0.5, p.z - 0.25, dx * v, dy * v, dz * v + 4.5, 1.9))
        self.audio.play("bounce", 0.8)

    def throw_enemy_grenade(self, s, tx, ty):
        dx, dy = tx - s.x, ty - s.y
        D = math.hypot(dx, dy) or 1.0
        th = 0.62
        v = math.sqrt(20.0 * D / math.sin(2 * th))
        v = min(v, 26.0)
        vh, vz = v * math.cos(th), v * math.sin(th)
        self.grenades.append(Grenade(s.team, False, s.x, s.y, 1.5, dx / D * vh, dy / D * vh, vz, 2.3))

    def call_airstrike(self):
        p = self.player
        if not p.alive:
            return
        if p.airstrikes <= 0:
            self.banner("no_airstrike", (255, 120, 80), 1.2)
            self.audio.play("deny", 0.6)
            return
        dx, dy, dz = p.cos_dir()
        t, bi = self.world.raycast(p.x, p.y, p.z, dx, dy, dz, 90.0)
        tx, ty = p.x + dx * t, p.y + dy * t
        d = math.hypot(tx - p.x, ty - p.y)
        if d < 14:
            tx, ty = p.x + math.cos(p.yaw) * 22.0, p.y + math.sin(p.yaw) * 22.0
        hx, hy = math.cos(p.yaw), math.sin(p.yaw)
        p.airstrikes -= 1
        self.strikes.append(dict(x=tx, y=ty, dx=hx, dy=hy, t=2.4, i=0, bt=0.0, n=7))
        self.banner("airstrike_in", (255, 235, 59), 1.8)
        self.audio.play("siren", 0.6)

    def deploy_turret(self):
        p = self.player
        if not p.alive or p.turrets <= 0:
            return
        p.turrets -= 1
        tx = p.x + math.cos(p.yaw) * 2.4
        ty = p.y + math.sin(p.yaw) * 2.4
        tx, ty = self.world.push_out(tx, ty, 0.65, 0.0)
        self.turrets.append(Turret(self, tx, ty, p.yaw))
        self.audio.play("deploy", 0.8)
        self.banner("turret_on", (0, 229, 255), 1.4)

    def use_stim(self):
        p = self.player
        if not p.alive or p.stims <= 0:
            return
        p.stims -= 1
        p.hp = p.max_hp
        p.parts = dict(head=100.0, chest=100.0, arms=100.0, legs=100.0)
        p.leg_slow = p.arm_pen = 0.0
        p.stim_t = 5.0
        self.audio.play("stim", 0.9)
        self.banner("stim_on", (0, 230, 118), 1.4)
        self.flash = max(self.flash, 0.3)
        self.flash_col = (0, 255, 120)

    # ============================================================== shop
    def shop_status(self, item):
        p = self.player
        iid, price, maxn = next(s for s in SHOP if s[0] == item)
        n = p.upgrades.get(item, 0)
        if maxn and n >= maxn:
            return "maxed", price, n
        if p.score < price:
            return "need", price, n
        return "ok", price, n

    def buy(self, item):
        p = self.player
        st, price, n = self.shop_status(item)
        if st != "ok":
            self.audio.play("deny", 0.7)
            return False
        p.score -= price
        p.upgrades[item] = n + 1
        unlock = {"smg": 4, "shotgun": 5, "rpg": 6, "minigun": 7}
        if item in unlock:
            p.weapons[unlock[item]]["unlocked"] = True
            p.switch_weapon(unlock[item])
        elif item == "turret":
            p.turrets += 1
        elif item == "supply":
            for w in p.weapons.values():
                w["reserve"] += w["maxmag"] * 3
            p.hp = p.max_hp
            p.armor = p.max_armor
            p.stims += 2
            p.parts = dict(head=100.0, chest=100.0, arms=100.0, legs=100.0)
        elif item == "grenade":
            p.grenades += 2
            p.airstrikes += 1
        elif item == "upgrade":
            p.dmg_mult += 0.25
        elif item == "plates":
            p.max_armor += 25
            p.armor = p.max_armor
        elif item == "hands":
            p.reload_mult *= 0.75
        elif item == "mags":
            for k, w in p.weapons.items():
                w["maxmag"] = int(WEAPONS[k]["mag"] * (1 + 0.3 * p.upgrades["mags"]))
        elif item == "focus":
            p.focus = min(100.0, p.focus + 50)
        self.audio.play("buy", 0.8)
        return True

    # ============================================================== pickups / drops
    def collect(self, pk):
        p = self.player
        pk.alive = False
        self.audio.play("pickup", 0.8)
        if pk.kind == "ammo":
            for w in p.weapons.values():
                if w["unlocked"]:
                    w["reserve"] += max(2, int(w["maxmag"] * 0.8))
            p.grenades = min(p.grenades + 1, 6)
            self.banner("got_ammo", (200, 255, 120), 1.0)
        elif pk.kind == "med":
            p.hp = min(p.max_hp, p.hp + 45)
            self.banner("got_med", (255, 255, 255), 1.0)
        elif pk.kind == "armor":
            p.armor = min(p.max_armor, p.armor + 40)
            self.banner("got_armor", (80, 200, 255), 1.0)
        elif pk.kind == "drop":
            for w in p.weapons.values():
                if w["unlocked"]:
                    w["reserve"] += w["maxmag"] * 3
            p.hp = p.max_hp
            p.armor = p.max_armor
            p.stims += 1
            p.grenades += 2
            p.airstrikes += 1
            p.focus = min(100.0, p.focus + 40)
            self.banner("airdrop_got", (255, 235, 120), 2.0)

    def spawn_airdrop(self):
        for _ in range(20):
            x = random.uniform(-26, 26)
            y = random.uniform(-26, 26)
            if not self.world.point_in_box(x, y, 0.5, 1.2) and self.world.free[self.world.cell_of(x, y)]:
                self.drops.append(dict(x=x, y=y, z=40.0))
                self.banner("airdrop", (255, 235, 120), 2.5)
                self.audio.play("airstrike", 0.35)
                return

    # ============================================================== field maintenance (AI navigation)
    def update_fields(self, dt):
        self.field_t -= dt
        if self.field_t > 0:
            return
        self.field_t = 0.14
        w = self.world
        i = self.field_i % 3
        self.field_i += 1
        if i == 0:
            self.field_player = w.flow_field([w.cell_of(self.player.x, self.player.y)])
        elif i == 1:
            src = [w.cell_of(s.x, s.y) for s in self._enemies]
            if src:
                self.field_hostile[0] = w.flow_field(src)
        else:
            src = [w.cell_of(s.x, s.y) for s in self._friends]
            if src:
                self.field_hostile[1] = w.flow_field(src)

    # ============================================================== wave director
    def start_wave(self):
        self.wave += 1
        self.phase = "wave"
        self.queue = wave_composition(self.wave)
        self.spawn_t = 0.0
        self.stats_wave_kills = 0
        self.soldiers = [s for s in self.soldiers if s.alive]
        self.spawn_allies()
        for s in self.soldiers:
            if s.team == 0:
                s.hp = s.max_hp
        self.spawn_barrels()
        self.banner("wave", (255, 190, 60), 2.6, sub=("num", self.wave))
        if self.wave % 5 == 0:
            self.banner("boss_in", (255, 70, 40), 2.6)
        self.audio.play("horn", 0.8)
        # opening 8v8 batch
        n0 = min(len(self.queue), 8 if self.wave == 1 else max_alive(self.wave))
        for _ in range(n0):
            self.spawn_enemy(self.queue.pop(0))
        for s in self.soldiers:
            if s.team == 0:
                s.role = "hold" if s.kind == "ally_sn" else "lane"
                s.lane = random.choice(["left", "right", "center"])
                s.wp = 2

    def wave_cleared(self):
        p = self.player
        self.phase = "intermission"
        self.phase_t = 22.0
        bonus = 200 + 50 * self.wave
        p.score += bonus
        self.banner("wave_clear", (120, 255, 160), 3.0, sub=("bonus", bonus))
        self.audio.play("clear", 0.9)
        p.hp = min(p.max_hp, p.hp + 40)
        p.armor = min(p.max_armor, p.armor + 30)
        for k, w in p.weapons.items():
            if w["unlocked"]:
                w["reserve"] += int(w["maxmag"] * 1.5)
        p.grenades = min(6, p.grenades + 1)
        p.focus = min(100.0, p.focus + 25)
        for s in self.soldiers:
            if s.alive and s.team == 0:
                s.hp = s.max_hp
        if self.wave % 2 == 0 or self.wave == 1:
            self.spawn_airdrop()
        sv = self.save
        if self.wave > sv.get("best_wave", 0):
            sv["best_wave"] = self.wave
            write_save(sv)

    def update_waves(self, dt):
        p = self.player
        if self.phase == "intermission":
            self.phase_t -= dt
            if self.phase_t <= 0:
                self.start_wave()
            return
        if self.phase != "wave":
            return
        alive_e = sum(1 for s in self.soldiers if s.alive and s.team == 1)
        cap = max_alive(self.wave)
        # reinforcements for the squad during long fights
        self.ally_timer -= dt
        if self.ally_timer <= 0:
            self.ally_timer = 22.0
            if sum(1 for s in self.soldiers if s.alive and s.team == 0) < 7:
                self.spawn_allies_one()
                self.banner("reinforce", (80, 200, 255), 1.6)
        # stalled wave: the last few hostiles go hunting, then get marked on the radar
        if not self.queue and 0 < alive_e <= 3:
            self.stall_t += dt
            if self.stall_t > 16:
                for s in self._enemies:
                    if s.role in ("hold", "flank", "lane"):
                        s.role = "push"
                        s.use_field_t = 0.0
            if self.stall_t > 28:
                self.player.uav_t = max(self.player.uav_t, 3.0)
        else:
            self.stall_t = 0.0
        if self.queue:
            self.spawn_t -= dt
            if alive_e < cap and self.spawn_t <= 0:
                self.spawn_t = random.uniform(0.9, 1.8)
                self.spawn_enemy(self.queue.pop(0))
        elif alive_e == 0:
            self.wave_cleared()

    def skip_intermission(self):
        if self.phase == "intermission" and self.player.alive:
            self.phase_t = 0.0

    # ============================================================== main update
    def update(self, dt, inp):
        p = self.player
        self.over_t += dt if self.phase == "gameover" else 0
        target_ts = 0.33 if p.bt_active else 1.0
        self.ts += (target_ts - self.ts) * min(1.0, 7 * dt)
        wdt = dt * self.ts
        self.time += wdt
        self._enemies = [s for s in self.soldiers if s.alive and s.team == 1]
        self._friends = [s for s in self.soldiers if s.alive and s.team == 0] + [t for t in self.turrets if t.alive]
        if p.alive:
            self._friends.append(self.player_target)
        if self.phase == "gameover":
            inp = Inputs()
        p.update(dt, wdt, inp)
        if not p.alive and self.phase != "gameover" and p.respawn_t <= 0:
            self.respawn_player()
        self.update_fields(wdt)
        for s in self.soldiers:
            s.update(wdt)
        self.soldiers = [s for s in self.soldiers if s.alive or s.death_t < 7.0]
        for t in self.turrets:
            t.update(wdt)
        self.turrets = [t for t in self.turrets if t.alive]
        for g_ in self.grenades:
            g_.update(self, wdt)
            if g_.alive and not g_.warned and g_.team == 1 and p.alive and math.hypot(g_.x - p.x, g_.y - p.y) < 15:
                g_.warned = True
                self.banner("grenade_warn", (255, 120, 40), 1.0)
        self.grenades = [g_ for g_ in self.grenades if g_.alive]
        for r in self.rockets:
            r.update(self, wdt)
        self.rockets = [r for r in self.rockets if r.alive]
        # pending explosions (barrel chains)
        for e in self.pending:
            e[0] -= wdt
        due = [e for e in self.pending if e[0] <= 0]
        self.pending = [e for e in self.pending if e[0] > 0]
        for e in due:
            self.explode(e[1], e[2], e[3], e[4], e[5], e[6], e[7])
        # airstrikes
        for st in self.strikes:
            if st["t"] > 0:
                st["t"] -= wdt
                if st["t"] <= 0:
                    self.audio.play("airstrike", 0.9)
            else:
                st["bt"] -= wdt
                if st["bt"] <= 0 and st["i"] < st["n"]:
                    st["bt"] = 0.16
                    k = st["i"] - (st["n"] - 1) / 2
                    bx = st["x"] + st["dx"] * k * 4.2
                    by = st["y"] + st["dy"] * k * 4.2
                    self.explode(bx, by, 0.5, 8.0, 205.0, 0, True)
                    st["i"] += 1
        self.strikes = [s for s in self.strikes if s["i"] < s["n"]]
        # air drops fall
        for d in self.drops:
            d["z"] -= 6.5 * wdt
            if d["z"] <= 0 and not d.get("landed"):
                d["landed"] = True
                d["z"] = 0
                self.pickups.append(Pickup(d["x"], d["y"], "drop", life=60.0))
        self.drops = [d for d in self.drops if not d.get("landed")]
        # pickups
        for pk in self.pickups:
            pk.life -= wdt
            pk.t += dt
            if pk.life <= 0:
                pk.alive = False
            elif p.alive and math.hypot(pk.x - p.x, pk.y - p.y) < 1.7:
                self.collect(pk)
        self.pickups = [pk for pk in self.pickups if pk.alive]
        # particles / tracers / fx
        for pt in self.particles:
            pt[6] -= wdt
            pt[0] += pt[3] * wdt
            pt[1] += pt[4] * wdt
            pt[2] += pt[5] * wdt
            pt[5] -= pt[10] * wdt
            if pt[11] == "smoke":
                pt[8] += 2.0 * wdt
            if pt[2] < 0.03:
                pt[2] = 0.03
                pt[5] = -pt[5] * 0.3
                pt[3] *= 0.6
                pt[4] *= 0.6
        self.particles = [pt for pt in self.particles if pt[6] > 0]
        for t in self.tracers:
            t[7] -= dt
        self.tracers = [t for t in self.tracers if t[7] > 0]
        for f in self.fx:
            f["t"] += wdt
        self.fx = [f for f in self.fx if f["t"] < f["dur"]]
        # screen effects
        self.shake = max(0.0, self.shake - dt * 1.8)
        self.flash = max(0.0, self.flash - dt * 2.2)
        self.blood = max(0.0, self.blood - dt * (1.6 if p.alive else 0.3))
        self.hit_t = max(0.0, self.hit_t - dt)
        self.hit_label_t = max(0.0, self.hit_label_t - dt)
        for b in self.banners:
            b["t"] -= dt
        self.banners = [b for b in self.banners if b["t"] > 0]
        for f in self.feed:
            f["t"] -= dt
        self.feed = [f for f in self.feed if f["t"] > 0]
        for q in self.popups:
            q["t"] -= dt
        self.popups = [q for q in self.popups if q["t"] > 0]
        for d in self.dmg_dirs:
            d[2] -= dt
        self.dmg_dirs = [d for d in self.dmg_dirs if d[2] > 0]
        if self.hit_popup:
            self.hit_popup = (self.hit_popup[0], self.hit_popup[1], self.hit_popup[2] - dt)
            if self.hit_popup[2] <= 0:
                self.hit_popup = None
        self.audio.listener(p.x, p.y, p.yaw)
        if p.hp < 28 and p.alive and int(self.time * 1.6) != int((self.time - wdt) * 1.6):
            self.audio.play("heart", 0.8)
        if self.phase != "gameover":
            self.update_waves(wdt)
