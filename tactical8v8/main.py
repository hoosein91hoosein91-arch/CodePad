#!/usr/bin/env python3
"""TACTICAL 8v8 : ULTRA  -  a fully 3D first-person squad shooter in Python (Panda3D engine + pygame HUD/audio).

    pip install panda3d pygame numpy arabic-reshaper python-bidi
    python main.py

(arabic-reshaper / python-bidi are optional: they enable the Persian interface.)
A software-rendered 2.5D version for very old machines is available as  main_lite.py.
"""
import argparse
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import numpy as np
    import pygame
    import panda3d  # noqa: F401
except ImportError:
    print("Missing libraries.  Install them with:\n    pip install panda3d pygame numpy arabic-reshaper python-bidi\n"
          "کتابخانه‌ها نصب نیستند. با این دستور نصب کن:\n    pip install panda3d pygame numpy arabic-reshaper python-bidi")
    raise SystemExit(1)

QUALITY = ["LOW", "MEDIUM", "HIGH"]


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bot", action="store_true", help="auto-play (testing)")
    ap.add_argument("--frames", type=int, default=0, help="quit after N frames (testing)")
    ap.add_argument("--shot", default="", help="save screenshots into this folder (testing)")
    ap.add_argument("--shot-every", type=int, default=120)
    ap.add_argument("--fixed-dt", type=float, default=0.0, help="advance the simulation by a fixed step (testing)")
    ap.add_argument("--diff", default="regular")
    ap.add_argument("--quality", type=int, default=2)
    ap.add_argument("--size", default="1280x720")
    ap.add_argument("--lang", default="auto")
    ap.add_argument("--skip-menu", action="store_true")
    ap.add_argument("--wave", type=int, default=0, help="start at wave N (testing)")
    ap.add_argument("--fps", action="store_true", help="show frame-rate meter")
    ap.add_argument("--no-vsync", action="store_true")
    return ap.parse_args()


ARGS = parse_args()
W0, H0 = [int(v) for v in ARGS.size.lower().split("x")]

from panda3d.core import (loadPrcFileData, WindowProperties, Texture, CardMaker, TransparencyAttrib, KeyboardButton,
                          MouseButton, ModifierButtons, AntialiasAttrib, Filename)

loadPrcFileData("", """
window-title TACTICAL 8v8 : ULTRA
win-size %d %d
sync-video %d
framebuffer-multisample 1
multisamples 4
audio-library-name null
textures-power-2 none
notify-level warning
default-directnotify-level warning
show-frame-rate-meter %d
""" % (W0, H0, 0 if ARGS.no_vsync else 1, 1 if ARGS.fps else 0))

from direct.showbase.ShowBase import ShowBase


def key_down(app, ch):
    return app.mouseWatcherNode.isButtonDown(KeyboardButton.asciiKey(ch))


class TacticalApp(ShowBase):
    def __init__(self):
        ShowBase.__init__(self)
        self.disableMouse()
        pygame.font.init()
        self.render.setShaderOff()
        # --- heavy resources with a tiny loading screen
        from t8_textures import Atlas
        from t8_world import World
        from t8_audio import Audio
        from t8_ui import UI, Fonts
        from t8_game import Game, Inputs
        from p3_scene import Scene3D
        self.Game, self.Inputs = Game, Inputs
        self.atlas = Atlas()
        self.world = World(self.atlas)
        self.audio = Audio()
        self.fonts = Fonts()
        self.scene = Scene3D(self, self.world, self.atlas)
        # --- HUD canvas (pygame surface uploaded as a full-screen overlay texture)
        self.hud_tex = Texture("hud")
        self.hud_card = None
        self.hud = None
        self.ui = None
        self._make_hud()
        self.ui.lang = 1 if (ARGS.lang in ("fa", "auto") and self.fonts.fa_ok) else 0
        # --- state
        self.state = "menu"
        self.sel = 0
        self.diff_i = ["recruit", "regular", "hardened", "veteran"].index(ARGS.diff) if ARGS.diff in (
            "recruit", "regular", "hardened", "veteran") else 1
        self.q_idx = max(0, min(2, ARGS.quality))
        self.apply_quality()
        self.game = None
        self.inp = Inputs()
        self.fire_held = False
        self.ads_held = False
        self.assist = False
        self.shop_sel = 0
        self.t_total = 0.0
        self.frame_no = 0
        self.tab_down = False
        self.menu_t = 0.0
        self.focus_ok = True
        self.skip_mouse = 3
        self.fullscreen = False
        self.windowed_size = (W0, H0)
        self.shot_dir = ARGS.shot
        if self.shot_dir:
            os.makedirs(self.shot_dir, exist_ok=True)
        self.audio.start_ambient()
        self._bind_input()
        self.taskMgr.add(self.tick, "tick")
        self.accept("aspectRatioChanged", self._make_hud)
        self.accept("window-event", self._on_window_event)
        if ARGS.skip_menu or ARGS.bot:
            self.new_game()

    # ------------------------------------------------------------------------------------------------ HUD overlay
    def _make_hud(self, *a):
        ar = self.getAspectRatio()
        ch = 720
        cw = max(320, int(round(ch * ar)))
        if self.hud is not None and self.hud.get_size() == (cw, ch):
            return
        self.hud = pygame.Surface((cw, ch), pygame.SRCALPHA)
        if self.ui is None:
            from t8_ui import UI
            self.ui = UI(self.hud, self.fonts, views=False)
        else:
            self.ui.resize(self.hud)
        self.hud_tex.setup2dTexture(cw, ch, Texture.T_unsigned_byte, Texture.F_rgba8)
        self.hud_tex.setMagfilter(Texture.FT_linear)
        self.hud_tex.setMinfilter(Texture.FT_linear)
        self.hud_tex.setWrapU(Texture.WM_clamp)
        self.hud_tex.setWrapV(Texture.WM_clamp)
        if self.hud_card is None:
            cm = CardMaker("hud")
            cm.setFrame(-1, 1, -1, 1)
            self.hud_card = self.render2d.attachNewNode(cm.generate())
            self.hud_card.setTexture(self.hud_tex)
            self.hud_card.setTransparency(TransparencyAttrib.MAlpha)
            self.hud_card.setDepthTest(False)
            self.hud_card.setDepthWrite(False)
            self.hud_card.setBin("fixed", 100)

    def _upload_hud(self):
        # Panda keeps RGBA textures as BGRA in RAM, so hand it BGRA directly (no slow conversion)
        self.hud_tex.setRamImage(pygame.image.tostring(self.hud, "BGRA", True))

    def _on_window_event(self, win):
        self.focus_ok = win.getProperties().getForeground() if win is not None else True
        ShowBase.windowEvent(self, win)

    # ------------------------------------------------------------------------------------------------ settings
    def apply_quality(self):
        self.render.setAntialias(AntialiasAttrib.MNone if self.q_idx == 0 else AntialiasAttrib.MAuto)
        if hasattr(self, "scene"):
            if self.q_idx == 0:
                self.scene.b_shadow.np.hide()
            else:
                self.scene.b_shadow.np.show()

    def grab(self, on):
        props = WindowProperties()
        props.setCursorHidden(on)
        props.setMouseMode(WindowProperties.M_confined if on else WindowProperties.M_absolute)
        self.win.requestProperties(props)
        self.skip_mouse = 3

    def toggle_fullscreen(self):
        props = WindowProperties()
        if not self.fullscreen:
            self.windowed_size = (self.win.getXSize(), self.win.getYSize())
            props.setFullscreen(True)
            props.setSize(self.pipe.getDisplayWidth(), self.pipe.getDisplayHeight())
        else:
            props.setFullscreen(False)
            props.setSize(*self.windowed_size)
        self.fullscreen = not self.fullscreen
        self.win.requestProperties(props)

    # ------------------------------------------------------------------------------------------------ game flow
    def new_game(self):
        self.scene.clear_entities()
        from t8_data import DIFF_ORDER
        self.game = self.Game(self.world, self.audio, DIFF_ORDER[self.diff_i])
        self.game.player.assist = self.assist
        if ARGS.wave > 1:
            self.game.wave = ARGS.wave - 1
        self.state = "playing"
        self.grab(True)

    def menu_items(self):
        from t8_data import DIFF_NAMES, DIFF_ORDER
        ui = self.ui
        dn = ui.tr("difficulty") + ":  " + DIFF_NAMES[DIFF_ORDER[self.diff_i]][ui.lang]
        return [("start", ui.tr("start")), ("diff", dn), ("help", ui.tr("controls")),
                ("assist", f"{ui.tr('assist')}:  {ui.tr('on') if self.assist else ui.tr('off')}"),
                ("quality", f"{ui.tr('quality')}:  {QUALITY[self.q_idx]}"),
                ("lang", ui.tr("language") if self.fonts.fa_ok else "LANGUAGE:  ENGLISH  (pip install arabic-reshaper python-bidi)"),
                ("full", ui.tr("fullscreen")), ("quit", ui.tr("quit"))]

    def pause_items(self):
        ui = self.ui
        return [("resume", ui.tr("resume")), ("help", ui.tr("controls")), ("restart", ui.tr("restart")),
                ("menu", ui.tr("mainmenu")), ("quit", ui.tr("quit"))]

    def activate(self, iid):
        ui = self.ui
        if iid in ("start", "restart"):
            self.new_game()
        elif iid == "diff":
            self.diff_i = (self.diff_i + 1) % 4
        elif iid == "help":
            self.state = "help_pause" if self.state == "paused" else "help"
        elif iid == "assist":
            self.assist = not self.assist
            if self.game:
                self.game.player.assist = self.assist
        elif iid == "quality":
            self.q_idx = (self.q_idx + 1) % 3
            self.apply_quality()
        elif iid == "lang":
            if self.fonts.fa_ok:
                ui.lang = 1 - ui.lang
        elif iid == "full":
            self.toggle_fullscreen()
        elif iid == "resume":
            self.state = "playing"
            self.grab(True)
        elif iid == "menu":
            self.state = "menu"
            self.scene.clear_entities()
            self.scene.hide_viewmodel()
            self.grab(False)
            self.sel = 0
        elif iid == "quit":
            self.userExit()

    # ------------------------------------------------------------------------------------------------ input
    KEYS = ["a", "b", "c", "f", "g", "m", "p", "q", "r", "t", "v", "w", "s", "d", "x", "1", "2", "3", "4", "5", "6", "7",
            "escape", "enter", "space", "arrow_up", "arrow_down", "arrow_left", "arrow_right", "f11", "[", "]",
            "backspace", "lcontrol", "tab", "f3", "e"]

    def _bind_input(self):
        self.buttonThrowers[0].node().setModifierButtons(ModifierButtons())
        for k in self.KEYS:
            self.accept(k, self.on_key, [k])
        self.accept("tab", lambda: setattr(self, "tab_down", True))
        self.accept("tab-up", lambda: setattr(self, "tab_down", False))
        self.accept("mouse1", self.on_mouse, [1, True])
        self.accept("mouse1-up", self.on_mouse, [1, False])
        self.accept("mouse3", self.on_mouse, [3, True])
        self.accept("mouse3-up", self.on_mouse, [3, False])
        self.accept("wheel_up", self.on_wheel, [-1])
        self.accept("wheel_down", self.on_wheel, [1])

    def on_wheel(self, d):
        if self.state == "playing" and self.game:
            self.game.player.cycle_weapon(d)

    def canvas_mouse(self):
        if not self.mouseWatcherNode.hasMouse():
            return (-1, -1)
        m = self.mouseWatcherNode.getMouse()
        return ((m.getX() + 1) / 2 * self.hud.get_width(), (1 - m.getY()) / 2 * self.hud.get_height())

    def on_mouse(self, btn, down):
        st = self.state
        if st in ("menu", "paused") and btn == 1 and down:
            pos = self.canvas_mouse()
            for r, iid in self.ui.menu_rects:
                if r.collidepoint(pos):
                    self.audio.play("buy", 0.4)
                    self.activate(iid)
                    break
        elif st == "shop" and btn == 1 and down:
            pos = self.canvas_mouse()
            for r, iid in self.ui.shop_rects:
                if r.collidepoint(pos):
                    if iid == "__close":
                        self.state = "playing"
                        self.grab(True)
                    else:
                        self.game.buy(iid)
                    break
        elif st in ("help", "help_pause") and btn == 1 and down:
            self.state = "menu" if st == "help" else "paused"
        elif st == "gameover" and btn == 1 and down and self.game.over_t > 0.8:
            self.state = "menu"
            self.scene.clear_entities()
            self.grab(False)
        elif st == "playing":
            if btn == 1:
                self.fire_held = down
                if down:
                    self.game.player.fire_edge = True
            elif btn == 3:
                self.ads_held = down

    def on_key(self, k):
        st = self.state
        game = self.game
        if k == "f11":
            self.toggle_fullscreen()
            return
        if k == "f3":
            self.setFrameRateMeter(not self.frameRateMeter)
            return
        if k == "m":
            self.audio.toggle_mute()
        if st in ("menu", "paused"):
            items = self.menu_items() if st == "menu" else self.pause_items()
            if k in ("arrow_up", "w"):
                self.sel = (self.sel - 1) % len(items)
                self.audio.play("ui", 0.5)
            elif k in ("arrow_down", "s"):
                self.sel = (self.sel + 1) % len(items)
                self.audio.play("ui", 0.5)
            elif k in ("arrow_left", "arrow_right") and items[self.sel][0] in ("diff", "quality", "lang", "assist"):
                iid = items[self.sel][0]
                if iid == "diff":
                    self.diff_i = (self.diff_i + (1 if k == "arrow_right" else -1)) % 4
                else:
                    self.activate(iid)
                self.audio.play("ui", 0.5)
            elif k in ("enter", "space"):
                self.audio.play("buy", 0.4)
                self.activate(items[self.sel][0])
            elif k == "escape" and st == "paused":
                self.activate("resume")
        elif st in ("help", "help_pause"):
            if k in ("escape", "enter", "space", "backspace"):
                self.state = "menu" if st == "help" else "paused"
        elif st == "shop":
            from t8_data import SHOP
            n = len(SHOP)
            if k in ("escape", "b"):
                self.state = "playing"
                self.grab(True)
            elif k == "arrow_up":
                self.shop_sel = (self.shop_sel - 2) % n
            elif k == "arrow_down":
                self.shop_sel = (self.shop_sel + 2) % n
            elif k == "arrow_left":
                self.shop_sel = (self.shop_sel - 1) % n
            elif k == "arrow_right":
                self.shop_sel = (self.shop_sel + 1) % n
            elif k in ("enter", "space"):
                game.buy(SHOP[self.shop_sel][0])
        elif st == "gameover":
            if k in ("enter", "escape") and game.over_t > 0.8:
                self.state = "menu"
                self.scene.clear_entities()
                self.grab(False)
                self.sel = 0
        elif st == "playing" and game is not None:
            p = game.player
            if k in ("escape", "p"):
                self.state = "paused"
                self.sel = 0
                self.grab(False)
            elif k == "r":
                p.start_reload()
            elif k in "1234567":
                p.switch_weapon(int(k))
            elif k == "g":
                game.throw_player_grenade()
            elif k == "q":
                game.use_stim()
            elif k == "t":
                game.deploy_turret()
            elif k == "v":
                game.call_airstrike()
            elif k == "f":
                p.set_bullet_time(not p.bt_active)
            elif k == "x":
                self.assist = not self.assist
                p.assist = self.assist
            elif k == "b":
                self.state = "shop"
                self.shop_sel = 0
                self.grab(False)
            elif k == "enter":
                game.skip_intermission()
            elif k == "space" and p.alive and p.on_ground:
                p.vz = 9.0
                p.on_ground = False
            elif k in ("lcontrol", "c") and p.alive:
                sp = math.hypot(p.vx, p.vy)
                if p.sprinting and sp > 6.5 and p.slide_cd <= 0 and p.on_ground:
                    p.slide_dir = (p.vx / sp, p.vy / sp)
                    p.slide_t = 0.62
                    p.slide_cd = 1.4
            elif k == "[":
                self.q_idx = max(0, self.q_idx - 1)
                self.apply_quality()
            elif k == "]":
                self.q_idx = min(2, self.q_idx + 1)
                self.apply_quality()

    # ------------------------------------------------------------------------------------------------ bot (testing)
    def bot(self, t):
        game, inp = self.game, self.inp
        p = game.player
        inp.fwd = 1.0 if (int(t * 0.7) % 5) != 4 else 0.0
        inp.right = math.sin(t * 0.9)
        inp.sprint = False
        inp.crouch = (int(t * 0.5) % 7 == 3)
        tgt, bd = None, 1e9
        for s in game.soldiers:
            if s.alive and s.team == 1:
                d = math.hypot(s.x - p.x, s.y - p.y)
                if d < bd and game.world.los(p.x, p.y, p.z, s.x, s.y, s.tz):
                    bd, tgt = d, s
        inp.fire = False
        inp.mdx = inp.mdy = 0.0
        if tgt is not None and p.alive:
            ang = math.atan2(tgt.y - p.y, tgt.x - p.x)
            dyaw = (ang - p.yaw + math.pi) % math.tau - math.pi
            p.yaw += dyaw * 0.35
            dz = tgt.tz + 0.3 - p.z
            p.pitch += (math.atan2(dz, bd) - p.pitch) * 0.4
            inp.fire = abs(dyaw) < 0.2
            inp.ads = bd > 25
        else:
            p.yaw += 0.012
            inp.ads = False
        if p.alive:
            r = random.random
            if r() < 0.004:
                game.throw_player_grenade()
            if r() < 0.0012:
                game.call_airstrike()
            if r() < 0.002:
                game.use_stim()
            if r() < 0.0015:
                game.deploy_turret()
            if r() < 0.002 and p.on_ground:
                p.vz = 9.0
                p.on_ground = False
            if r() < 0.003:
                p.set_bullet_time(not p.bt_active)
            if p.st["mag"] == 0:
                p.start_reload()
            if r() < 0.004:
                p.cycle_weapon(1)
        if game.phase == "intermission" and random.random() < 0.02:
            from t8_data import SHOP
            for iid, price, mx in SHOP:
                if game.buy(iid):
                    break

    # ------------------------------------------------------------------------------------------------ main loop
    def read_inputs(self, dt):
        inp = self.inp
        down = lambda c: key_down(self, c)
        mw = self.mouseWatcherNode
        inp.fwd = (1.0 if (down("w") or mw.isButtonDown(KeyboardButton.up())) else 0.0) - \
                  (1.0 if (down("s") or mw.isButtonDown(KeyboardButton.down())) else 0.0)
        inp.right = (1.0 if (down("d") or mw.isButtonDown(KeyboardButton.right())) else 0.0) - \
                    (1.0 if (down("a") or mw.isButtonDown(KeyboardButton.left())) else 0.0)
        inp.sprint = mw.isButtonDown(KeyboardButton.lshift()) or mw.isButtonDown(KeyboardButton.rshift())
        inp.crouch = mw.isButtonDown(KeyboardButton.lcontrol()) or down("c")
        inp.fire = self.fire_held
        inp.ads = self.ads_held
        # mouse look: recentre the pointer every frame and use the delta
        inp.mdx = inp.mdy = 0.0
        if self.state == "playing" and self.focus_ok:
            cx, cy = self.win.getXSize() // 2, self.win.getYSize() // 2
            md = self.win.getPointer(0)
            if self.skip_mouse > 0:
                self.skip_mouse -= 1
            else:
                inp.mdx = md.getX() - cx
                inp.mdy = md.getY() - cy
            self.win.movePointer(0, cx, cy)

    def setup_camera(self, game, dt):
        p = game.player
        sh = game.shake
        yaw = p.yaw + random.uniform(-1, 1) * sh * 0.025
        pit = p.pitch + (p.death_pitch if not p.alive else 0.0) + random.uniform(-1, 1) * sh * 0.02
        if p.ads > 0.5 and p.cur == 3:
            k = 0.0016 * (0.4 if p.crouch > 0.5 else 1.0)
            yaw += math.sin(self.t_total * 1.3) * k
            pit += math.cos(self.t_total * 1.7) * k
        self.scene.set_camera(p.x, p.y, p.z, yaw, max(-1.3, min(1.3, pit)), p.fov)

    def tick(self, task):
        dt = min(globalClock.getDt(), 0.05)  # noqa: F821  (provided by ShowBase)
        if ARGS.fixed_dt:
            dt = ARGS.fixed_dt
        self.t_total += dt
        self.frame_no += 1
        if (self.state == "playing" and not self.focus_ok and not (ARGS.bot or ARGS.shot or ARGS.frames)
                and self.frame_no > 30):
            self.state = "paused"          # alt-tab -> pause
            self.sel = 0
            self.grab(False)
        st = self.state
        ui = self.ui
        self.hud.fill((0, 0, 0, 0))
        ui.mouse_pos = self.canvas_mouse()
        game = self.game
        if st in ("playing", "gameover") and game is not None:
            self.read_inputs(dt)
            if ARGS.bot:
                self.bot(self.t_total)
            game.update(dt, self.inp)
            if game.phase == "gameover" and st == "playing":
                self.state = st = "gameover"
                self.grab(False)
            self.setup_camera(game, dt)
            self.scene.frame(game, dt, self.t_total)
            if st == "gameover":
                self.scene.hide_viewmodel()
                ui.draw_gameover(game, game.over_t)
            else:
                ui.draw_hud(game, None, self.t_total)
                ui.draw_world_markers(game, self.scene)
                if self.tab_down:
                    ui.draw_scoreboard(game)
        elif st in ("menu", "help"):
            self.menu_t += dt
            a = self.menu_t * 0.13
            x, y = 49 * math.cos(a), 49 * math.sin(a)
            self.scene.set_camera(x, y, 3.6 + math.sin(a * 2) * 1.2, math.atan2(-y, -x) + math.sin(a * 1.7) * 0.6, -0.06, 70)
            self.scene.hide_viewmodel()
            self.hud.fill((4, 8, 14, 150))
            if st == "menu":
                ui.sel = self.sel
                ui.draw_menu(self.menu_items())
                from t8_game import load_save
                from t8_data import DIFF_DESC, DIFF_ORDER
                rec = game.save if game else load_save()
                ui.text(f"{ui.tr('best')}: {rec.get('best_wave', 0)}", 20, (200, 215, 225),
                        (self.hud.get_width() // 2, self.hud.get_height() - 18 * ui.u), "center")
                ui.text(DIFF_DESC[DIFF_ORDER[self.diff_i]][ui.lang], 18, (160, 190, 210),
                        (self.hud.get_width() // 2, self.hud.get_height() - 44 * ui.u), "center")
            else:
                ui.draw_help()
        elif st in ("paused", "help_pause", "shop"):
            # the world stays frozen behind the menu
            if game is not None:
                p = game.player
                self.scene.frame(game, 0.0, self.t_total)
            self.hud.fill((0, 0, 0, 140))
            if st == "paused":
                ui.sel = self.sel
                ui.text(ui.tr("paused"), 54, (255, 196, 40), (self.hud.get_width() // 2, int(self.hud.get_height() * 0.16)), "center")
                ui.draw_menu(self.pause_items(), title=False)
            elif st == "help_pause":
                ui.draw_help()
            else:
                ui.draw_shop(game, self.shop_sel)
        self._upload_hud()
        if self.shot_dir and self.frame_no % ARGS.shot_every == 0:
            self.win.saveScreenshot(Filename(os.path.join(self.shot_dir, "frame_%05d.png" % self.frame_no)))
        if ARGS.frames and self.frame_no >= ARGS.frames:
            if self.shot_dir:
                self.win.saveScreenshot(Filename(os.path.join(self.shot_dir, "final.png")))
                if game:
                    print("wave", game.wave, "phase", game.phase, "kills", game.player.kills, "hp", int(game.player.hp),
                          "score", game.player.score, "team", game.team_kills, "lives", game.player.lives)
            self.userExit()
        return task.cont


def main():
    app = TacticalApp()
    app.run()


if __name__ == "__main__":
    main()
