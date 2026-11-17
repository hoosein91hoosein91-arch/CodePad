"""Battlefield entities: squad AI soldiers, sentry turrets, barrels, pickups, grenades, rockets, particles."""
import math
import random

from t8_data import ENEMY, AIW, DIFFS
from t8_world import LANES, SNIPER_SPOTS

TAU = math.tau


def ang_diff(a, b):
    d = (a - b + math.pi) % TAU - math.pi
    return d


def turn_toward(cur, target, rate, dt):
    d = ang_diff(target, cur)
    step = rate * dt
    if abs(d) <= step:
        return target
    return cur + (step if d > 0 else -step)


CALLSIGNS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET", "KILO", "LIMA",
             "MIKE", "NOVEMBER", "OSCAR", "PAPA"]


class Soldier:
    def __init__(self, g, team, kind, x, y, name="", role=None):
        d = ENEMY[kind]
        self.g = g
        self.team = team                # 0 = allies (blue), 1 = enemies (red)
        self.kind = kind
        self.name = name
        self.x, self.y = x, y
        self.scale = d["scale"]
        self.armor_mult = d["armor"]
        diff = g.diff
        w = g.wave
        hp = d["hp"] * ((diff["ehp"] * (1 + 0.05 * (w - 1))) if team == 1 else (1.35 + 0.05 * (w - 1)))
        self.max_hp = self.hp = hp
        self.base_speed = random.uniform(*d["spd"]) * (diff["espd"] if team == 1 else 1.0)
        self.acc = d["acc"] * ((diff["eacc"] * min(1.4, 1 + 0.02 * (w - 1))) if team == 1 else 1.0)
        self.alive = True
        self.death_t = 0.0
        self.facing = math.pi / 2 if team == 1 else -math.pi / 2
        self.prim = AIW[d["prim"]]
        self.sec = AIW[d["sec"]]
        self.w = self.prim
        self.crouch = 0.0
        self.crouch_t = 0.0
        self.leg_slow = 0.0
        self.arm_pen = 0.0
        self.target = None
        self.tgt_vis = False
        self.last_seen = None
        self.last_seen_t = -99.0
        self.think_t = random.random() * 0.3
        self.lane = random.choice(["left", "right", "center"])
        self.wp = 0 if team == 1 else 2
        self.role = role or self._pick_role()
        self.spot = None
        self.strafe = random.choice((-1, 1))
        self.strafe_t = random.uniform(0.6, 1.8)
        self.cool = random.uniform(0.4, 1.4)
        self.burst_left = 0
        self.gap_t = 0.0
        self.walk = random.random() * 6.0
        self.moving = False
        self.flash_t = 0.0
        self.hit_flash = 0.0
        self.aim_t = 0.0
        self.react_t = 0.0
        self.stuck = 0.0
        self.use_field_t = 0.0
        self.gren_cd = random.uniform(2.0, 5.0)
        self.px, self.py = x, y
        self.stuck_check = 0.6
        self.summoned = False
        self.radius = 0.5 * self.scale
        self.lane_pref_flip = False
        self.laser = False
        self.hold_t = 0.0
        self.last_fire_snd = 0.0

    # --- target interface (used by other soldiers / turrets) ------------------------------------------------------
    @property
    def tz(self):
        return 1.2 * self.scale * (1 - 0.25 * self.crouch)

    @property
    def height(self):
        return 2.0 * self.scale * (1 - 0.25 * self.crouch)

    def _pick_role(self):
        k = self.kind
        if self.team == 0:
            return "hold" if k == "ally_sn" else "lane"
        if k in ("rusher", "heavy", "boss"):
            return "push"
        if k == "marksman":
            return "hold"
        return "flank" if random.random() < 0.55 else "push"

    # ------------------------------------------------------------------------------------------------------------
    def update(self, dt):
        g = self.g
        if not self.alive:
            self.death_t += dt
            return
        self.flash_t = max(0.0, self.flash_t - dt)
        self.hit_flash = max(0.0, self.hit_flash - dt)
        self.leg_slow = max(0.0, self.leg_slow - dt)
        self.arm_pen = max(0.0, self.arm_pen - dt)
        self.crouch_t = max(0.0, self.crouch_t - dt)
        self.use_field_t = max(0.0, self.use_field_t - dt)
        self.gren_cd -= dt
        self.cool -= dt
        self.strafe_t -= dt
        want_c = 1.0 if (self.crouch_t > 0 or (self.role == "hold" and self.hold_t > 0.5)) else 0.0
        self.crouch += (want_c - self.crouch) * min(1.0, 9 * dt)
        self.think_t -= dt
        if self.think_t <= 0:
            self.think_t = 0.18 + random.random() * 0.12
            self.think()
        self.move(dt)
        self.shoot(dt)

    # ------------------------------------------------------------------------------------------------------------
    def think(self):
        g = self.g
        hostiles = g.hostiles_of(self.team)
        if not hostiles:
            self.tgt_vis = False
            return
        sx, sy = self.x, self.y
        cands = sorted(hostiles, key=lambda h: (h.x - sx) ** 2 + (h.y - sy) ** 2)[:5]
        best = None
        eye = self.tz + 0.2 * self.scale
        checks = 0
        for c in cands:
            d2 = (c.x - sx) ** 2 + (c.y - sy) ** 2
            if d2 > 88 * 88:
                break
            if checks >= 3:
                break
            checks += 1
            if g.world.los(sx, sy, eye, c.x, c.y, c.tz):
                best = c
                break
        if best is not None:
            if best is not self.target or not self.tgt_vis:
                lo, hi = g.diff["react"] if self.team == 1 else (0.3, 0.7)
                self.react_t = random.uniform(lo, hi)
            self.target = best
            self.tgt_vis = True
            self.last_seen = (best.x, best.y)
            self.last_seen_t = g.time
        else:
            self.tgt_vis = False
            if self.target is not None and not self.target.alive:
                self.target = None
        # smart weapon swap
        if self.tgt_vis:
            d = math.hypot(self.target.x - sx, self.target.y - sy)
            want = self.sec if (d < 15 or (self.target is g.player_target and g.player.cur == 3 and d < 26)) else self.prim
            if self.kind in ("heavy", "boss") and self.kind == "heavy":
                want = self.prim
            if self.kind == "boss":
                want = self.prim if d > 22 else self.sec
            if want is not self.w and self.burst_left == 0 and self.aim_t <= 0:
                self.w = want

    # ------------------------------------------------------------------------------------------------------------
    def _field_dir(self):
        g = self.g
        if self.role == "push" and self.team == 1:
            return g.world.step_dir(g.field_player, self.x, self.y)
        if self.role == "hold":
            if self.spot is None:
                self.spot = random.randrange(len(SNIPER_SPOTS)) if self.team == 1 else random.randrange(len(SNIPER_SPOTS))
            f = g.world.static_fields.get(("snipe", self.spot))
            if f is not None:
                d = g.world.step_dir(f, self.x, self.y)
                if d is not None:
                    return d
                self.hold_t += 0.0
                return None
        if self.role in ("lane", "flank"):
            pts = LANES[self.lane]
            idx = self.wp
            if self.team == 0:
                idx = self.wp
            target = pts[idx]
            if math.hypot(target[0] - self.x, target[1] - self.y) < 4.5:
                if self.team == 1:
                    if self.wp < 2:
                        self.wp += 1
                    else:
                        self.role = "push"
                else:
                    if self.wp > 0:
                        self.wp -= 1
                    else:
                        self.role = "hunt"
                idx = self.wp
                target = pts[idx]
            f = g.world.static_fields[(self.lane, idx)]
            return g.world.step_dir(f, self.x, self.y)
        # hunt / push for allies: nearest hostile field
        return g.world.step_dir(g.field_hostile[self.team], self.x, self.y)

    def move(self, dt):
        g = self.g
        spd = self.base_speed * (0.45 if self.leg_slow > 0 else 1.0) * (0.6 if self.crouch > 0.5 else 1.0)
        mx = my = 0.0
        face = None
        t = self.target if self.tgt_vis else None
        if t is not None:
            dx, dy = t.x - self.x, t.y - self.y
            dist = math.hypot(dx, dy) or 1e-6
            fx, fy = dx / dist, dy / dist
            face = math.atan2(dy, dx)
            px_, py_ = -fy, fx
            if self.strafe_t <= 0:
                self.strafe *= -1 if random.random() < 0.7 else 1
                self.strafe_t = random.uniform(0.7, 2.2)
            k = self.kind
            rng = self.w["range"]
            ideal_hi = {"rusher": 7, "heavy": 24, "boss": 26, "marksman": 60, "ally_sn": 55}.get(k, rng * 0.5)
            ideal_lo = {"rusher": 0, "heavy": 8, "boss": 10, "marksman": 22, "ally_sn": 20}.get(k, 9)
            hurt = self.hp < self.max_hp * 0.35 and k not in ("heavy", "boss", "rusher")
            if self.role == "hold":
                self.hold_t += dt
                # snipers stand their ground; they only step back when someone gets close
                if dist < ideal_lo:
                    mx, my = -fx * 0.8 + px_ * self.strafe * 0.4, -fy * 0.8 + py_ * self.strafe * 0.4
                self.laser = True
            elif hurt and dist < 30:
                mx, my = -fx * 0.5 + px_ * self.strafe * 0.9, -fy * 0.5 + py_ * self.strafe * 0.9
                if self.use_field_t <= 0 and random.random() < 0.02:
                    self.crouch_t = 1.2
            elif dist > ideal_hi:
                d = None
                if self.use_field_t > 0:
                    d = g.world.step_dir(g.field_hostile[self.team] if self.team == 0 or self.role != "push" else g.field_player,
                                         self.x, self.y)
                if d is None:
                    d = (fx, fy)
                mx, my = d[0] + px_ * self.strafe * 0.35, d[1] + py_ * self.strafe * 0.35
            elif dist < ideal_lo:
                mx, my = -fx * 0.7 + px_ * self.strafe * 0.7, -fy * 0.7 + py_ * self.strafe * 0.7
            else:
                mx, my = px_ * self.strafe * 0.85 + fx * 0.1, py_ * self.strafe * 0.85 + fy * 0.1
                if self.kind in ("heavy", "boss"):
                    mx, my = mx * 0.6, my * 0.6
        else:
            self.laser = False
            seen_recent = (g.time - self.last_seen_t) < 5.0 and self.last_seen is not None
            d = None
            if seen_recent and self.role != "hold":
                lx, ly = self.last_seen
                if math.hypot(lx - self.x, ly - self.y) > 3.0:
                    d = g.world.step_dir(g.field_hostile[self.team], self.x, self.y)
            if d is None:
                d = self._field_dir()
            if d is not None:
                mx, my = d
                face = math.atan2(my, mx)
                self.hold_t = 0.0
            else:
                self.hold_t += dt
                if self.role == "hold" and self.team == 1 and self.hold_t > 14.0:
                    self.role = "push"      # snipers that found nobody go hunting
        # integrate
        l = math.hypot(mx, my)
        self.moving = l > 0.05
        if self.moving:
            if l > 1:
                mx, my = mx / l, my / l
            nx = self.x + mx * spd * dt
            ny = self.y + my * spd * dt
            nx, ny = g.world.push_out(nx, ny, self.radius, 0.0)
            self.x, self.y = nx, ny
            self.walk += dt * (6.5 if self.leg_slow > 0 else 11.0) * (spd / 5.5)
        # separate from friends and the player
        for o in g.soldiers:
            if o is self or not o.alive:
                continue
            ddx, ddy = self.x - o.x, self.y - o.y
            d2 = ddx * ddx + ddy * ddy
            if d2 < 1.0 and d2 > 1e-6:
                dd = math.sqrt(d2)
                push = (1.0 - dd) * 0.5
                self.x += ddx / dd * push
                self.y += ddy / dd * push
        if self.team == 1:
            p = g.player
            ddx, ddy = self.x - p.x, self.y - p.y
            d2 = ddx * ddx + ddy * ddy
            if 1e-6 < d2 < 1.1:
                dd = math.sqrt(d2)
                self.x += ddx / dd * (1.05 - dd) * 0.6
                self.y += ddy / dd * (1.05 - dd) * 0.6
        # stuck detection -> use the flow field for a while
        self.stuck_check -= dt
        if self.stuck_check <= 0:
            self.stuck_check = 0.7
            moved = math.hypot(self.x - self.px, self.y - self.py)
            if self.moving and moved < spd * 0.7 * 0.35:
                self.use_field_t = 1.6
                self.strafe *= -1
            self.px, self.py = self.x, self.y
        if face is not None:
            self.facing = turn_toward(self.facing, face, 7.0, dt)

    # ------------------------------------------------------------------------------------------------------------
    def shoot(self, dt):
        g = self.g
        t = self.target
        if t is None or not self.tgt_vis:
            self.burst_left = 0
            self.aim_t = 0.0
            self.laser = False if self.aim_t <= 0 else self.laser
            return
        w = self.w
        dist = math.hypot(t.x - self.x, t.y - self.y)
        # grenades
        if self.kind in ("grenadier", "boss") and self.gren_cd <= 0 and 9 < dist < 36 and self.react_t <= 0:
            self.gren_cd = random.uniform(4.5, 7.5) if self.kind == "grenadier" else random.uniform(7, 10)
            g.throw_enemy_grenade(self, t.x, t.y)
        if dist > w["range"]:
            self.burst_left = 0
            self.aim_t = 0
            return
        self.react_t -= dt
        err = abs(ang_diff(math.atan2(t.y - self.y, t.x - self.x), self.facing))
        if w is AIW["SNIPER"]:
            if self.aim_t <= 0 and self.cool <= 0 and self.react_t <= 0 and err < 0.15:
                self.aim_t = random.uniform(0.9, 1.3) if self.team == 1 else random.uniform(0.4, 0.7)
                if self.team == 1 and t is g.player_target:
                    g.warn_sniper(self)
            if self.aim_t > 0:
                self.aim_t -= dt
                self.laser = True
                if self.aim_t <= 0:
                    self.fire_one(t, dist)
                    self.cool = w["interval"] * random.uniform(0.85, 1.25)
                    self.laser = False
            return
        if self.burst_left == 0:
            if self.cool <= 0 and self.react_t <= 0 and err < 0.25:
                self.burst_left = w["burst"]
                self.gap_t = 0.0
        if self.burst_left > 0:
            self.gap_t -= dt
            if self.gap_t <= 0:
                self.burst_left -= 1
                self.gap_t = w["gap"]
                self.fire_one(t, dist)
                if self.burst_left == 0:
                    self.cool = w["interval"] * random.uniform(0.8, 1.35) * (1.25 if self.arm_pen > 0 else 1.0)
                    if random.random() < 0.3:
                        self.strafe *= -1

    def fire_one(self, t, dist):
        g = self.g
        w = self.w
        h = 1.3 * self.scale * (1 - 0.25 * self.crouch)
        mx = self.x + math.cos(self.facing) * 0.7
        my = self.y + math.sin(self.facing) * 0.7
        self.flash_t = 0.07
        if w is AIW["RPG"]:
            dx, dy, dz = t.x - mx, t.y - my, (t.tz - h)
            L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
            g.spawn_rocket(self.team, False, mx, my, h, dx / L, dy / L, dz / L, 24.0, source=self)
            g.audio.play("rpg", 0.9, pos=(self.x, self.y))
            return
        # hit probability
        p = self.acc
        p *= max(0.22, 1.15 - dist / w["range"] * 0.85)
        if self.arm_pen > 0:
            p *= 0.45
        if self.moving:
            p *= 0.86
        if t is g.player_target:
            p *= g.player.evade_factor()
        elif getattr(t, "kind", None):
            p *= 0.8 if self.team == 0 else 1.0
        pel = w["pellets"]
        hits = 0
        for _ in range(pel):
            if random.random() < p * (0.75 if pel > 1 else 1.0):
                hits += 1
        end_x, end_y, end_z = t.x, t.y, t.tz
        if hits == 0:
            off = random.uniform(0.6, 2.4) * random.choice((-1, 1))
            fx, fy = (t.x - self.x) / (dist or 1), (t.y - self.y) / (dist or 1)
            end_x += -fy * off
            end_y += fx * off
            end_z += random.uniform(-0.5, 0.5)
        col = (90, 200, 255) if self.team == 0 else (255, 90, 40)
        g.add_tracer(mx, my, h, end_x + random.uniform(-0.1, 0.1), end_y + random.uniform(-0.1, 0.1), end_z, col, 0.09)
        vol = 0.55 if self.team == 1 else 0.4
        g.audio.play(w["snd"], vol, pos=(self.x, self.y))
        if hits == 0:
            if t is g.player_target:
                g.near_miss(end_x, end_y, end_z)
            return
        if t is g.player_target:
            dmg = w["dmg"] * g.diff["edmg"] * (hits if pel > 1 else 1)
            if w is AIW["SNIPER"]:
                dmg *= 1.0
            g.damage_player(dmg, self.x, self.y, w["name"], big=(w is AIW["SNIPER"]))
        elif getattr(t, "kind", None) is not None:
            zone = random.choice(("chest", "chest", "arms", "legs", "head"))
            dmg = w["dmg"] * (hits if pel > 1 else 1) * (1.25 if self.team == 0 else 0.8)
            g.damage_soldier(t, dmg, zone, False, attacker=self)
        else:
            g.damage_turret(t, w["dmg"] * hits * 0.8)


class Turret:
    def __init__(self, g, x, y, facing):
        self.g = g
        self.x, self.y = x, y
        self.facing = facing
        self.hp = 170.0
        self.max_hp = 170.0
        self.life = 38.0
        self.alive = True
        self.cool = 0.4
        self.flash_t = 0.0
        self.think_t = 0.0
        self.target = None
        self.tz = 0.9
        self.height = 1.2
        self.radius = 0.6
        self.kind = None

    def update(self, dt):
        g = self.g
        self.life -= dt
        self.flash_t = max(0.0, self.flash_t - dt)
        self.cool -= dt
        if self.life <= 0 or self.hp <= 0:
            self.alive = False
            return
        self.think_t -= dt
        if self.think_t <= 0:
            self.think_t = 0.15
            best, bd = None, 34.0 ** 2
            for s in g.soldiers:
                if s.alive and s.team == 1:
                    d2 = (s.x - self.x) ** 2 + (s.y - self.y) ** 2
                    if d2 < bd and g.world.los(self.x, self.y, 1.0, s.x, s.y, s.tz):
                        best, bd = s, d2
            self.target = best
        t = self.target
        if t is not None and t.alive:
            ang = math.atan2(t.y - self.y, t.x - self.x)
            self.facing = turn_toward(self.facing, ang, 9.0, dt)
            if self.cool <= 0 and abs(ang_diff(ang, self.facing)) < 0.12:
                self.cool = 0.2
                self.flash_t = 0.06
                g.add_tracer(self.x + math.cos(self.facing) * 0.8, self.y + math.sin(self.facing) * 0.8, 0.95, t.x, t.y, t.tz,
                             (80, 255, 255), 0.07)
                g.audio.play("smg", 0.35, pos=(self.x, self.y))
                if random.random() < 0.85:
                    zone = random.choice(("chest", "chest", "chest", "arms", "legs", "head"))
                    g.damage_soldier(t, 19 * g.player.dmg_mult, zone, True, attacker=None, turret=True)
        else:
            self.facing += dt * 0.6


class Barrel:
    def __init__(self, x, y):
        self.x, self.y = x, y
        self.hp = 40.0
        self.alive = True
        self.tz = 0.8
        self.radius = 0.6
        self.height = 1.65


class Pickup:
    def __init__(self, x, y, kind, life=28.0):
        self.x, self.y = x, y
        self.kind = kind          # ammo | med | armor | drop
        self.life = life
        self.t = random.random() * 6.0
        self.alive = True


class Grenade:
    def __init__(self, team, by_player, x, y, z, vx, vy, vz, fuse):
        self.team, self.by_player = team, by_player
        self.x, self.y, self.z = x, y, z
        self.vx, self.vy, self.vz = vx, vy, vz
        self.fuse = fuse
        self.alive = True
        self.warned = False

    def update(self, g, dt):
        self.fuse -= dt
        self.vz -= 20.0 * dt
        nx = self.x + self.vx * dt
        ny = self.y + self.vy * dt
        px, py = g.world.push_out(nx, ny, 0.2, self.z - 0.1)
        if abs(px - nx) > 1e-5 or abs(py - ny) > 1e-5:
            nxn, nyn = px - nx, py - ny
            l = math.hypot(nxn, nyn) or 1.0
            nxn, nyn = nxn / l, nyn / l
            dot = self.vx * nxn + self.vy * nyn
            self.vx -= 1.6 * dot * nxn
            self.vy -= 1.6 * dot * nyn
            self.vx *= 0.6
            self.vy *= 0.6
            g.audio.play("bounce", 0.5, pos=(self.x, self.y))
        self.x, self.y = px, py
        self.z += self.vz * dt
        if self.z < 0.15:
            self.z = 0.15
            if abs(self.vz) > 2.5:
                g.audio.play("bounce", 0.45, pos=(self.x, self.y))
            self.vz = -self.vz * 0.4
            self.vx *= 0.72
            self.vy *= 0.72
        if self.fuse <= 0:
            self.alive = False
            g.explode(self.x, self.y, 0.4, 8.5, 185.0, self.team, self.by_player)


class Rocket:
    def __init__(self, team, by_player, x, y, z, dx, dy, dz, speed, source=None):
        self.team, self.by_player = team, by_player
        self.x, self.y, self.z = x, y, z
        self.dx, self.dy, self.dz = dx, dy, dz
        self.speed = speed
        self.life = 3.0
        self.alive = True
        self.source = source

    def update(self, g, dt):
        self.life -= dt
        step = self.speed * dt
        w = g.world
        t, idx = w.raycast(self.x, self.y, self.z, self.dx, self.dy, self.dz, step + 0.3)
        hit = idx != -1 and t <= step + 0.25
        nx = self.x + self.dx * step
        ny = self.y + self.dy * step
        nz = self.z + self.dz * step
        if not hit:
            # soldiers / barrels / player
            for o in g.rocket_targets(self.team):
                d2 = (o.x - nx) ** 2 + (o.y - ny) ** 2
                if d2 < (o.radius + 0.45) ** 2 and -0.2 < nz < o.height + 0.2:
                    hit = True
                    break
        if hit and idx != -1:
            nx = self.x + self.dx * t
            ny = self.y + self.dy * t
            nz = self.z + self.dz * t
        self.x, self.y, self.z = nx, ny, nz
        g.puff(nx - self.dx * 0.6, ny - self.dy * 0.6, nz - self.dz * 0.6)
        if abs(nx) > 53 or abs(ny) > 53 or nz < 0.1:
            hit = True
        if hit or self.life <= 0:
            self.alive = False
            g.explode(nx - self.dx * 0.2, ny - self.dy * 0.2, max(0.4, nz), 10.0, 225.0, self.team, self.by_player)
