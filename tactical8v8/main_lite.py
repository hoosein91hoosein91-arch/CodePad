#!/usr/bin/env python3
"""TACTICAL 8v8 : ULTRA  -  a 3D first-person squad shooter written in pure Python (pygame + numpy).

Run:   pip install pygame numpy arabic-reshaper python-bidi
       python main.py
(arabic-reshaper / python-bidi are optional: they enable the Persian interface.)
"""
import argparse
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import numpy as np
    import pygame
except ImportError:
    print("Missing libraries.  Install them with:\n    pip install pygame numpy arabic-reshaper python-bidi\n"
          "کتابخانه‌ها نصب نیستند. با این دستور نصب کن:\n    pip install pygame numpy arabic-reshaper python-bidi")
    raise SystemExit(1)

QUALITY = [("LOW", 180), ("MEDIUM", 225), ("HIGH", 270), ("ULTRA", 360)]


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bot", action="store_true", help="auto-play (testing)")
    ap.add_argument("--frames", type=int, default=0, help="quit after N frames (testing)")
    ap.add_argument("--shot", default="", help="save screenshots into this folder (testing)")
    ap.add_argument("--shot-every", type=int, default=120)
    ap.add_argument("--diff", default="regular")
    ap.add_argument("--quality", type=int, default=2)
    ap.add_argument("--size", default="1280x720")
    ap.add_argument("--lang", default="auto")
    ap.add_argument("--skip-menu", action="store_true")
    ap.add_argument("--wave", type=int, default=0, help="start at wave N (testing)")
    return ap.parse_args()


def loading(screen, fonts_ui, frac, msg):
    W, H = screen.get_size()
    screen.fill((6, 10, 16))
    f = pygame.font.Font(None, int(H * 0.07))
    t = f.render("TACTICAL 8v8 : ULTRA", True, (255, 196, 40))
    screen.blit(t, t.get_rect(center=(W // 2, H // 2 - 40)))
    f2 = pygame.font.Font(None, int(H * 0.035))
    m = f2.render(msg, True, (170, 190, 205))
    screen.blit(m, m.get_rect(center=(W // 2, H // 2 + 10)))
    bw = int(W * 0.4)
    pygame.draw.rect(screen, (40, 50, 62), (W // 2 - bw // 2, H // 2 + 46, bw, 10))
    pygame.draw.rect(screen, (255, 152, 0), (W // 2 - bw // 2, H // 2 + 46, int(bw * frac), 10))
    pygame.display.flip()
    pygame.event.pump()


def main():
    args = parse_args()
    if args.shot or args.bot:
        pass
    pygame.mixer.pre_init(22050, -16, 1, 512)
    pygame.init()
    pygame.display.set_caption("TACTICAL 8v8 : ULTRA")
    w, h = [int(v) for v in args.size.lower().split("x")]
    flags = pygame.RESIZABLE
    screen = pygame.display.set_mode((w, h), flags)
    windowed_size = (w, h)
    loading(screen, None, 0.02, "textures...")

    from t8_textures import Atlas
    from t8_world import World
    from t8_render import Renderer
    from t8_models import SpriteBank
    from t8_audio import Audio
    from t8_ui import UI, Fonts
    from t8_game import Game, Inputs
    from t8_scene import SceneState, setup_camera, draw_scene
    from t8_render import Camera
    from t8_data import DIFF_ORDER

    atlas = Atlas()
    loading(screen, None, 0.12, "arena & navigation...")
    world = World(atlas)
    loading(screen, None, 0.22, "soldiers & weapons (baking sprites)...")
    bank = SpriteBank(progress=lambda f: loading(screen, None, 0.22 + f * 0.5, "soldiers & weapons (baking sprites)..."))
    loading(screen, None, 0.75, "sound effects...")
    audio = Audio()
    loading(screen, None, 0.85, "interface...")
    fonts = Fonts()
    ui = UI(screen, fonts)
    q_idx = max(0, min(3, args.quality))
    aspect = w / h

    def make_renderer():
        Hq = QUALITY[q_idx][1]
        Wq = int(Hq * screen.get_width() / screen.get_height()) // 2 * 2
        return Wq, Hq

    Wq, Hq = make_renderer()
    rend = Renderer(world, atlas, Wq, Hq)
    scene = SceneState()
    menu_cam = Camera()
    loading(screen, None, 1.0, "ready")

    # language
    if args.lang == "fa" and fonts.fa_ok:
        ui.lang = 1
    elif args.lang == "auto" and fonts.fa_ok:
        ui.lang = 1
    else:
        ui.lang = 0

    clock = pygame.time.Clock()
    state = "menu"
    sel = 0
    ui.sel = 0
    diff_i = DIFF_ORDER.index(args.diff) if args.diff in DIFF_ORDER else 1
    game = None
    inp = Inputs()
    fire_held = False
    ads_held = False
    mouse_dx = mouse_dy = 0.0
    fullscreen = False
    t_total = 0.0
    frame_no = 0
    shot_dir = args.shot
    if shot_dir:
        os.makedirs(shot_dir, exist_ok=True)
    frame_hold = None
    shop_sel = 0
    slow_t = 0.0
    fps_acc = []
    assist = False
    sens = 1.0
    bg_t = 0.0
    audio.start_ambient()

    def grab(on):
        try:
            pygame.event.set_grab(on)
            pygame.mouse.set_visible(not on)
        except Exception:
            pass

    def new_game():
        nonlocal game, state
        game = Game(world, audio, DIFF_ORDER[diff_i])
        game.player.assist = assist
        game.player.sens = 0.0022 * sens
        if args.wave > 1:
            game.wave = args.wave - 1
        state = "playing"
        grab(True)

    def apply_quality():
        nonlocal Wq, Hq
        Wq, Hq = make_renderer()
        rend.resize(Wq, Hq)

    def resized():
        nonlocal screen
        screen = pygame.display.get_surface()
        ui.resize(screen)
        apply_quality()

    def toggle_fullscreen():
        nonlocal screen, fullscreen, windowed_size
        fullscreen = not fullscreen
        if fullscreen:
            windowed_size = screen.get_size()
            screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        else:
            screen = pygame.display.set_mode(windowed_size, pygame.RESIZABLE)
        ui.resize(screen)
        apply_quality()

    def menu_items():
        dn = ui.tr("difficulty") + ":  " + __import__("t8_data").DIFF_NAMES[DIFF_ORDER[diff_i]][ui.lang]
        items = [("start", ui.tr("start")), ("diff", dn), ("help", ui.tr("controls")),
                 ("assist", f"{ui.tr('assist')}:  {ui.tr('on') if assist else ui.tr('off')}"),
                 ("quality", f"{ui.tr('quality')}:  {QUALITY[q_idx][0]}"),
                 ("lang", ui.tr("language") if fonts.fa_ok else "LANGUAGE:  ENGLISH  (pip install arabic-reshaper python-bidi)"),
                 ("full", ui.tr("fullscreen")), ("quit", ui.tr("quit"))]
        return items

    def pause_items():
        return [("resume", ui.tr("resume")), ("help", ui.tr("controls")), ("restart", ui.tr("restart")),
                ("menu", ui.tr("mainmenu")), ("quit", ui.tr("quit"))]

    def activate(iid):
        nonlocal state, diff_i, q_idx, assist, sel
        if iid == "start" or iid == "restart":
            new_game()
        elif iid == "diff":
            diff_i = (diff_i + 1) % 4
        elif iid == "help":
            state = "help_pause" if state == "paused" else "help"
        elif iid == "assist":
            assist = not assist
            if game:
                game.player.assist = assist
        elif iid == "quality":
            q_idx = (q_idx + 1) % 4
            apply_quality()
        elif iid == "lang":
            if fonts.fa_ok:
                ui.lang = 1 - ui.lang
        elif iid == "full":
            toggle_fullscreen()
        elif iid == "resume":
            state = "playing"
            grab(True)
        elif iid == "menu":
            state = "menu"
            grab(False)
            sel = 0
        elif iid == "quit":
            return True
        return False

    def bot(game, inp, t):
        p = game.player
        inp.fwd = 1.0 if (int(t * 0.7) % 5) != 4 else 0.0
        inp.right = math.sin(t * 0.9)
        inp.sprint = False
        inp.crouch = (int(t * 0.5) % 7 == 3)
        tgt = None
        bd = 1e9
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
            if int(t * 4) % 40 == 0 and random.random() < 0.3:
                p.fire_edge = True
            if random.random() < 0.004:
                game.throw_player_grenade()
            if random.random() < 0.0012:
                game.call_airstrike()
            if random.random() < 0.002:
                game.use_stim()
            if random.random() < 0.0015:
                game.deploy_turret()
            if random.random() < 0.002 and p.on_ground:
                p.vz = 9.0
                p.on_ground = False
            if random.random() < 0.003:
                p.set_bullet_time(not p.bt_active)
            if p.st["mag"] == 0:
                p.start_reload()
            if random.random() < 0.004:
                p.cycle_weapon(1)
        if game.phase == "intermission" and random.random() < 0.02:
            for iid, price, mx in __import__("t8_data").SHOP:
                if game.buy(iid):
                    break

    if args.skip_menu or args.bot:
        new_game()

    running = True
    while running:
        dt = clock.tick(120 if shot_dir else 60) / 1000.0
        dt = min(dt, 0.05)
        t_total += dt
        frame_no += 1
        mouse_dx = mouse_dy = 0.0
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                running = False
            elif ev.type == pygame.VIDEORESIZE:
                resized()
            elif ev.type == pygame.MOUSEMOTION:
                if state == "playing":
                    mouse_dx += ev.rel[0]
                    mouse_dy += ev.rel[1]
            elif ev.type == pygame.KEYDOWN:
                k = ev.key
                if k == pygame.K_F11:
                    toggle_fullscreen()
                    continue
                if k == pygame.K_m:
                    audio.toggle_mute()
                if state in ("menu", "paused"):
                    items = menu_items() if state == "menu" else pause_items()
                    if k in (pygame.K_UP, pygame.K_w):
                        sel = (sel - 1) % len(items)
                        audio.play("ui", 0.5)
                    elif k in (pygame.K_DOWN, pygame.K_s):
                        sel = (sel + 1) % len(items)
                        audio.play("ui", 0.5)
                    elif k in (pygame.K_LEFT, pygame.K_RIGHT) and items[sel][0] in ("diff", "quality", "lang", "assist"):
                        iid = items[sel][0]
                        if iid == "diff":
                            diff_i = (diff_i + (1 if k == pygame.K_RIGHT else -1)) % 4
                        else:
                            activate(iid)
                        audio.play("ui", 0.5)
                    elif k in (pygame.K_RETURN, pygame.K_KP_ENTER, pygame.K_SPACE):
                        audio.play("buy", 0.4)
                        if activate(items[sel][0]):
                            running = False
                    elif k == pygame.K_ESCAPE and state == "paused":
                        activate("resume")
                    ui.sel = sel
                elif state in ("help", "help_pause"):
                    if k in (pygame.K_ESCAPE, pygame.K_RETURN, pygame.K_SPACE, pygame.K_BACKSPACE):
                        state = "menu" if state == "help" else "paused"
                elif state == "shop":
                    from t8_data import SHOP
                    if k in (pygame.K_ESCAPE, pygame.K_b):
                        state = "playing"
                        grab(True)
                    elif k == pygame.K_UP:
                        shop_sel = (shop_sel - 2) % len(SHOP)
                    elif k == pygame.K_DOWN:
                        shop_sel = (shop_sel + 2) % len(SHOP)
                    elif k == pygame.K_LEFT:
                        shop_sel = (shop_sel - 1) % len(SHOP)
                    elif k == pygame.K_RIGHT:
                        shop_sel = (shop_sel + 1) % len(SHOP)
                    elif k in (pygame.K_RETURN, pygame.K_SPACE):
                        game.buy(SHOP[shop_sel][0])
                elif state == "gameover":
                    if k in (pygame.K_RETURN, pygame.K_KP_ENTER, pygame.K_ESCAPE) and game.over_t > 0.8:
                        state = "menu"
                        grab(False)
                        sel = 0
                elif state == "playing" and game is not None:
                    p = game.player
                    if k in (pygame.K_ESCAPE, pygame.K_p):
                        state = "paused"
                        sel = 0
                        ui.sel = 0
                        grab(False)
                        frame_hold = screen.copy()
                    elif k == pygame.K_r:
                        p.start_reload()
                    elif pygame.K_1 <= k <= pygame.K_7:
                        p.switch_weapon(k - pygame.K_0)
                    elif k == pygame.K_g:
                        game.throw_player_grenade()
                    elif k == pygame.K_q:
                        game.use_stim()
                    elif k == pygame.K_t:
                        game.deploy_turret()
                    elif k == pygame.K_v:
                        game.call_airstrike()
                    elif k == pygame.K_f:
                        p.set_bullet_time(not p.bt_active)
                    elif k == pygame.K_x:
                        assist = not assist
                        p.assist = assist
                    elif k == pygame.K_b:
                        state = "shop"
                        shop_sel = 0
                        grab(False)
                        frame_hold = screen.copy()
                    elif k in (pygame.K_RETURN, pygame.K_KP_ENTER):
                        game.skip_intermission()
                    elif k == pygame.K_SPACE and p.alive and p.on_ground:
                        p.vz = 9.0
                        p.on_ground = False
                    elif k in (pygame.K_LCTRL, pygame.K_c) and p.alive:
                        moving = math.hypot(p.vx, p.vy) > 6.5
                        if p.sprinting and moving and p.slide_cd <= 0 and p.on_ground:
                            sp = math.hypot(p.vx, p.vy)
                            p.slide_dir = (p.vx / sp, p.vy / sp)
                            p.slide_t = 0.62
                            p.slide_cd = 1.4
                    elif k == pygame.K_LEFTBRACKET:
                        q_idx = max(0, q_idx - 1)
                        apply_quality()
                    elif k == pygame.K_RIGHTBRACKET:
                        q_idx = min(3, q_idx + 1)
                        apply_quality()
            elif ev.type == pygame.MOUSEBUTTONDOWN:
                if state in ("menu", "paused"):
                    if ev.button == 1:
                        for r, iid in ui.menu_rects:
                            if r.collidepoint(ev.pos):
                                audio.play("buy", 0.4)
                                if activate(iid):
                                    running = False
                                break
                elif state == "shop":
                    if ev.button == 1:
                        for r, iid in ui.shop_rects:
                            if r.collidepoint(ev.pos):
                                if iid == "__close":
                                    state = "playing"
                                    grab(True)
                                else:
                                    game.buy(iid)
                                break
                elif state in ("help", "help_pause") and ev.button == 1:
                    state = "menu" if state == "help" else "paused"
                elif state == "playing":
                    if ev.button == 1:
                        fire_held = True
                        game.player.fire_edge = True
                    elif ev.button == 3:
                        ads_held = True
                    elif ev.button == 4:
                        game.player.cycle_weapon(-1)
                    elif ev.button == 5:
                        game.player.cycle_weapon(1)
                elif state == "gameover" and ev.button == 1 and game.over_t > 0.8:
                    state = "menu"
                    grab(False)
            elif ev.type == pygame.MOUSEBUTTONUP:
                if ev.button == 1:
                    fire_held = False
                elif ev.button == 3:
                    ads_held = False
            elif ev.type == pygame.MOUSEWHEEL and state == "playing":
                game.player.cycle_weapon(-1 if ev.y > 0 else 1)
            elif ev.type == pygame.WINDOWFOCUSLOST and state == "playing":
                state = "paused"
                sel = 0
                grab(False)
                frame_hold = screen.copy()

        # ------------------------------------------------------------------ simulate + draw
        if state == "playing" or state == "gameover":
            keys = pygame.key.get_pressed()
            inp.fwd = (1.0 if keys[pygame.K_w] or keys[pygame.K_UP] else 0.0) - (1.0 if keys[pygame.K_s] or keys[pygame.K_DOWN] else 0.0)
            inp.right = (1.0 if keys[pygame.K_d] or keys[pygame.K_RIGHT] else 0.0) - (1.0 if keys[pygame.K_a] or keys[pygame.K_LEFT] else 0.0)
            inp.sprint = keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]
            inp.crouch = keys[pygame.K_LCTRL] or keys[pygame.K_c]
            inp.fire = fire_held
            inp.ads = ads_held
            inp.mdx, inp.mdy = mouse_dx, mouse_dy
            if args.bot:
                bot(game, inp, t_total)
            game.update(dt, inp)
            if game.phase == "gameover" and state == "playing":
                state = "gameover"
                grab(False)
            setup_camera(game, scene, dt)
            small = draw_scene(game, scene, rend, bank)
            pygame.transform.scale(small.convert(screen), screen.get_size(), screen)
            if state == "playing" or game.over_t < 0.1:
                ui.draw_viewmodel(game, t_total)
            ui.draw_hud(game, rend, t_total)
            tab = pygame.key.get_pressed()[pygame.K_TAB]
            if tab and state == "playing":
                ui.draw_scoreboard(game)
            if state == "gameover":
                ui.draw_gameover(game, game.over_t)
        elif state in ("menu", "help"):
            bg_t += dt
            a = bg_t * 0.13
            menu_cam.x, menu_cam.y, menu_cam.z = 49 * math.cos(a), 49 * math.sin(a), 3.6 + math.sin(a * 2) * 1.2
            menu_cam.yaw = math.atan2(-menu_cam.y, -menu_cam.x) + math.sin(a * 1.7) * 0.6
            menu_cam.pitch = -0.06
            menu_cam.fov = 70
            rend.render(menu_cam)
            small = rend.to_surface()
            pygame.transform.scale(small.convert(screen), screen.get_size(), screen)
            dark = pygame.Surface(screen.get_size(), pygame.SRCALPHA)
            dark.fill((4, 8, 14, 150))
            screen.blit(dark, (0, 0))
            if state == "menu":
                ui.sel = sel
                ui.draw_menu(menu_items())
                rec = game.save if game else __import__("t8_game").load_save()
                ui.text(f"{ui.tr('best')}: {rec.get('best_wave', 0)}", 20, (200, 215, 225), (screen.get_width() // 2, screen.get_height() - 40 * ui.u), "center")
                dd = __import__("t8_data").DIFF_DESC[DIFF_ORDER[diff_i]][ui.lang]
                ui.text(dd, 18, (160, 190, 210), (screen.get_width() // 2, screen.get_height() - 70 * ui.u), "center")
            else:
                ui.draw_help()
        elif state in ("paused", "help_pause", "shop"):
            if frame_hold is not None and frame_hold.get_size() == screen.get_size():
                screen.blit(frame_hold, (0, 0))
            dark = pygame.Surface(screen.get_size(), pygame.SRCALPHA)
            dark.fill((0, 0, 0, 140))
            screen.blit(dark, (0, 0))
            if state == "paused":
                ui.sel = sel
                ui.text(ui.tr("paused"), 54, (255, 196, 40), (screen.get_width() // 2, int(screen.get_height() * 0.16)), "center")
                ui.draw_menu(pause_items(), title=False)
            elif state == "help_pause":
                ui.draw_help()
            else:
                ui.draw_shop(game, shop_sel)
        pygame.display.flip()

        # auto quality (only if the machine struggles)
        fps_acc.append(dt)
        if len(fps_acc) > 150:
            avg = sum(fps_acc) / len(fps_acc)
            fps_acc.clear()
            if avg > 1 / 26 and q_idx > 0 and state == "playing" and not shot_dir:
                q_idx -= 1
                apply_quality()
        if shot_dir and frame_no % args.shot_every == 0:
            pygame.image.save(screen, os.path.join(shot_dir, f"frame_{frame_no:05d}.png"))
        if args.frames and frame_no >= args.frames:
            running = False
    if shot_dir:
        pygame.image.save(screen, os.path.join(shot_dir, "final.png"))
        if game:
            print("wave", game.wave, "phase", game.phase, "kills", game.player.kills, "hp", int(game.player.hp),
                  "score", game.player.score, "team", game.team_kills, "lives", game.player.lives)
    pygame.quit()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pygame.quit()
