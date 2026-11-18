"""Air Canvas Stable — CodePad 3.6.2 / Android.
Offline MediaPipe inference is provided by CodePad; do not pip-install desktop wheels.
Index only: draw. Pinky only: erase. Thumb + index pinch: move.
Touch a color; toolbar S saves, C clears, +/- changes width, Q exits.
Tracking/gesture logic rewritten 2026-11-02. Original examples stay unchanged.
"""
import os
import sys
import time
import argparse
from datetime import datetime


def fatal(title, en, fa=""):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    text = en + (("\n\n" + fa) if fa else "")
    print("\n[Air Canvas] ERROR: " + title + "\n" + text + "\n", file=sys.stderr)
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, text, "Air Canvas - " + title, 0x10)
        except Exception:
            pass
    sys.exit(1)


INSTALL_CMD = "python -m pip install opencv-python numpy mediapipe"

try:
    import numpy as np
except Exception as e:
    fatal("NumPy is not installed",
          "NumPy could not be imported (%s).\nInstall the requirements with:\n  %s" % (e, INSTALL_CMD),
          "کتابخانه NumPy نصب نیست. دستور نصب:\n  " + INSTALL_CMD)

try:
    import cv2
except Exception as e:
    fatal("OpenCV is not installed",
          "OpenCV could not be imported (%s).\nInstall the requirements with:\n  %s" % (e, INSTALL_CMD),
          "کتابخانه OpenCV نصب نیست. دستور نصب:\n  " + INSTALL_CMD)


WIN = "Air Canvas Stable"

PALETTE = [
    ("Purple", (247, 85, 168)),
    ("Yellow", (21, 204, 250)),
    ("Green",  (94, 197, 34)),
    ("Pink",   (153, 72, 236)),
]

IDLE, DRAW, ERASE, GRAB = 0, 1, 2, 3
MODE_LABEL = {IDLE: "READY", DRAW: "DRAWING", ERASE: "ERASER", GRAB: "GRAB / MOVE"}
MODE_COLOR = {IDLE: (170, 170, 170), DRAW: (120, 255, 160),
              ERASE: (120, 190, 255), GRAB: (90, 230, 255)}

COOLDOWN = 0.35
ERASER_RADIUS = 30
GRAB_RADIUS = 48
MIN_STEP = 1.5
POINT_SPACING = 3.0
JUMP_LIMIT_FRAC = 0.22

PANEL_X0, PANEL_X1 = 12, 104
BTN_CX = (PANEL_X0 + PANEL_X1) // 2
PANEL_TITLE_H = 36
BTN_CELL = 76
PANEL_H = PANEL_TITLE_H + BTN_CELL * len(PALETTE) + 10

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20), (0, 17),
]


def put_text(img, text, org, scale=0.6, color=(255, 255, 255), thick=1, shadow=True):
    x, y = int(org[0]), int(org[1])
    if shadow:
        cv2.putText(img, text, (x + 1, y + 1), cv2.FONT_HERSHEY_SIMPLEX, scale,
                    (0, 0, 0), thick + 2, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, thick, cv2.LINE_AA)


_text_width_cache = {}


def text_width(text, scale=0.6, thick=1):
    measure = getattr(cv2, "getTextSize", None)
    if callable(measure):
        return measure(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thick)[0][0]
    # Measure the pixels drawn by the available renderer, once per text/style.
    key = (str(text), float(scale), int(thick))
    if key not in _text_width_cache:
        pad = max(4, thick * 2)
        height = max(32, int(80 * scale) + pad * 2)
        width = max(16, int(len(str(text)) * 48 * scale) + pad * 2)
        probe = np.zeros((height, width, 3), np.uint8)
        cv2.putText(probe, str(text), (pad, height - pad),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), thick, cv2.LINE_AA)
        columns = np.flatnonzero(np.any(probe != 0, axis=(0, 2)))
        if len(_text_width_cache) >= 256:
            _text_width_cache.pop(next(iter(_text_width_cache)))
        _text_width_cache[key] = int(columns[-1] - pad + 1) if len(columns) else 0
    return _text_width_cache[key]


def draw_polyline(img, pts, closed, color, thickness):
    points = np.round(np.asarray(pts)).astype(np.int32).reshape(-1, 2)
    operation = getattr(cv2, "polylines", None)
    if callable(operation):
        operation(img, [points.reshape(-1, 1, 2)], closed, color, thickness, cv2.LINE_AA)
        return
    for a, b in zip(points[:-1], points[1:]):
        cv2.line(img, tuple(map(int, a)), tuple(map(int, b)), color, thickness, cv2.LINE_AA)
    if closed and len(points) > 1:
        cv2.line(img, tuple(map(int, points[-1])), tuple(map(int, points[0])),
                 color, thickness, cv2.LINE_AA)


def draw_arc(img, center, radius, start, end, color, thickness):
    operation = getattr(cv2, "ellipse", None)
    if callable(operation):
        operation(img, center, (radius, radius), 0, start, end,
                  color, thickness, cv2.LINE_AA)
        return
    count = max(3, int(abs(end - start) * radius * np.pi / 180) + 1)
    angles = np.deg2rad(np.linspace(start, end, count))
    points = np.column_stack((center[0] + radius * np.cos(angles),
                              center[1] + radius * np.sin(angles)))
    draw_polyline(img, points, False, color, thickness)


def setup_window(app):
    create = getattr(cv2, "namedWindow", None)
    if callable(create):
        create(WIN, getattr(cv2, "WINDOW_AUTOSIZE", 1))
    register = getattr(cv2, "setMouseCallback", None)
    if callable(register):
        register(WIN, app.on_mouse)
    else:
        print("[Air Canvas] Select colors with keys 1-4 or hold your index finger over a color.")
    # In CodePad, the actual output window is created by cv2.imshow.


def window_closed():
    getter = getattr(cv2, "getWindowProperty", None)
    visible = getattr(cv2, "WND_PROP_VISIBLE", None)
    if not callable(getter) or visible is None:
        return False
    try:
        return getter(WIN, visible) < 1
    except Exception:
        # Desktop OpenCV may raise after its window has been closed.
        return True


def rounded_rect(img, p1, p2, r, color, thickness=-1):
    x1, y1 = p1
    x2, y2 = p2
    r = max(1, min(r, (x2 - x1) // 2, (y2 - y1) // 2))
    if thickness < 0:
        cv2.rectangle(img, (x1 + r, y1), (x2 - r, y2), color, -1)
        cv2.rectangle(img, (x1, y1 + r), (x2, y2 - r), color, -1)
        for cx, cy in ((x1 + r, y1 + r), (x2 - r, y1 + r), (x1 + r, y2 - r), (x2 - r, y2 - r)):
            cv2.circle(img, (cx, cy), r, color, -1, cv2.LINE_AA)
    else:
        t = thickness
        cv2.line(img, (x1 + r, y1), (x2 - r, y1), color, t, cv2.LINE_AA)
        cv2.line(img, (x1 + r, y2), (x2 - r, y2), color, t, cv2.LINE_AA)
        cv2.line(img, (x1, y1 + r), (x1, y2 - r), color, t, cv2.LINE_AA)
        cv2.line(img, (x2, y1 + r), (x2, y2 - r), color, t, cv2.LINE_AA)
        draw_arc(img, (x1 + r, y1 + r), r, 180, 270, color, t)
        draw_arc(img, (x2 - r, y1 + r), r, 270, 360, color, t)
        draw_arc(img, (x2 - r, y2 - r), r, 0, 90, color, t)
        draw_arc(img, (x1 + r, y2 - r), r, 90, 180, color, t)


def dist(a, b):
    return float(np.hypot(a[0] - b[0], a[1] - b[1]))


class Stroke:
    __slots__ = ("pts", "color", "thick", "lo", "hi")

    def __init__(self, pts, color, thick):
        self.pts = np.asarray(pts, dtype=np.float32).reshape(-1, 2).copy()
        self.color = tuple(int(c) for c in color)
        self.thick = int(thick)
        self.lo = self.pts.min(axis=0)
        self.hi = self.pts.max(axis=0)

    def translate(self, d):
        d = np.asarray(d, dtype=np.float32)
        self.pts += d
        self.lo = self.lo + d
        self.hi = self.hi + d

    def distance_to(self, p):
        d2 = ((self.pts - np.asarray(p, np.float32)) ** 2).sum(axis=1)
        return float(np.sqrt(d2.min()))


def draw_stroke(img, pts, color, thick):
    ip = np.round(np.asarray(pts, dtype=np.float32)).astype(np.int32).reshape(-1, 2)
    r = max(1, thick // 2)
    if len(ip) == 1:
        cv2.circle(img, (int(ip[0][0]), int(ip[0][1])), r, color, -1, cv2.LINE_AA)
        return
    draw_polyline(img, ip, False, color, thick)
    cv2.circle(img, (int(ip[0][0]), int(ip[0][1])), r, color, -1, cv2.LINE_AA)
    cv2.circle(img, (int(ip[-1][0]), int(ip[-1][1])), r, color, -1, cv2.LINE_AA)


class Smoother:
    """One Euro adaptive low-pass: steady when slow, responsive when fast."""
    def __init__(self, alpha=None):
        self.reset()

    def reset(self, p=None):
        self.p = None if p is None else np.asarray(p, np.float32).copy()
        self.raw = None if p is None else self.p.copy()
        self.velocity = np.zeros(2, np.float32)
        self.t = None

    @staticmethod
    def coefficient(cutoff, dt):
        return 1.0 / (1.0 + 1.0 / (2.0 * np.pi * cutoff * dt))

    def __call__(self, p, now=None):
        now = time.monotonic() if now is None else now
        p = np.asarray(p, np.float32)
        if self.p is None or self.t is None or now - self.t > 0.25:
            self.p, self.raw, self.t = p.copy(), p.copy(), now
            self.velocity[:] = 0
            return p.copy()
        dt = max(0.001, min(0.15, now - self.t))
        derivative = (p - self.raw) / dt
        self.velocity += self.coefficient(1.0, dt) * (derivative - self.velocity)
        cutoff = 1.4 + 0.025 * float(np.linalg.norm(self.velocity))
        self.p += self.coefficient(cutoff, dt) * (p - self.p)
        self.raw, self.t = p.copy(), now
        return self.p.copy()


class GestureController:
    """3D joint geometry; no screen-up/down assumptions or frame-count delays."""
    def __init__(self):
        self.extended = [False] * 4
        self.pinching = False

    @staticmethod
    def angle(a, b, c):
        u, v = a - b, c - b
        denom = float(np.linalg.norm(u) * np.linalg.norm(v))
        if denom < 1e-8:
            return 0.0
        return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / denom, -1, 1))))

    def classify(self, pts, pose=None):
        q = np.asarray(pose if pose is not None else pts, np.float32)
        palm = max(float(np.linalg.norm(q[0] - q[9])),
                   float(np.linalg.norm(q[5] - q[17])), 1.0)
        for k, mcp in enumerate((5, 9, 13, 17)):
            pip, dip, tip = mcp+1, mcp+2, mcp+3
            angle = self.angle(q[mcp], q[pip], q[dip])
            tip_angle = self.angle(q[pip], q[dip], q[tip])
            base = max(float(np.linalg.norm(q[pip]-q[mcp])), 1e-6)
            reach = float(np.linalg.norm(q[tip]-q[mcp])) / base
            if angle >= 153 and tip_angle >= 145 and reach >= 1.65:
                self.extended[k] = True
            elif angle < 132 or tip_angle < 125 or reach < 1.35:
                self.extended[k] = False
        ratio = float(np.linalg.norm(q[4]-q[8])) / palm
        self.pinching = (ratio < (0.44 if self.pinching else 0.28)
                         and float(np.linalg.norm(q[8]-q[0])) > palm*1.05)
        targets = {DRAW: pts[8], ERASE: pts[20], IDLE: pts[8],
                   GRAB: (pts[4]+pts[8])/2.0}
        i, m, r, little = self.extended
        if self.pinching:
            mode = GRAB
        elif little and not i and not m and not r:
            mode = ERASE
        elif i and not m and not r and not little:
            mode = DRAW
        else:
            mode = IDLE
        return mode, targets


class AirCanvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.strokes = []
        self.active = None
        self.active_t0 = 0.0
        self.color_idx = 0
        self.thick = 8

        self.mode = IDLE
        self.raw = IDLE
        self.cand, self.cand_n = IDLE, 0
        self.pinching = False
        self.missing = 0
        self.gestures = GestureController()
        self.candidate_since = 0.0
        self.last_update = None
        self.last_target = None
        self.block_until = 0.0

        self.smooth = Smoother(0.6)
        self.grab = None
        self.grab_last = None
        self.erase_last = None

        self.hand = None
        self.pointer = None

        self.dirty = True
        self.static = np.zeros((h, w, 3), np.uint8)
        self.toast_text, self.toast_until = "", 0.0
        self.mouse = (-1, -1)
        self.palette_hover = None
        self.palette_since = 0.0

        self.panel_y0 = max(10, (h - PANEL_H) // 2)
        self.panel_y1 = self.panel_y0 + PANEL_H
        mask = np.zeros((h, w), np.uint8)
        rounded_rect(mask, (PANEL_X0, self.panel_y0), (PANEL_X1, self.panel_y1), 20, 255, -1)
        self.panel_mask = (mask.astype(np.float32) / 255.0 * 0.80)[..., None]
        self.panel_rect = (PANEL_X0, self.panel_y0, PANEL_X1, self.panel_y1)

    @property
    def color(self):
        return PALETTE[self.color_idx][1]

    def show_toast(self, text, seconds=2.0):
        self.toast_text = text
        self.toast_until = time.time() + seconds

    def button_center(self, i):
        return BTN_CX, self.panel_y0 + PANEL_TITLE_H + BTN_CELL * i + BTN_CELL // 2

    def in_panel(self, p, margin=14):
        return (PANEL_X0 - margin <= p[0] <= PANEL_X1 + margin and
                self.panel_y0 - margin <= p[1] <= self.panel_y1 + margin)

    def select_color(self, index, now=None):
        if not 0 <= index < len(PALETTE) or index == self.color_idx:
            return
        self.finish_stroke(time.monotonic() if now is None else now)
        self.color_idx = index
        self.dirty = True
        self.show_toast("Color: " + PALETTE[index][0], 1.2)

    def hover_palette(self, point, now):
        choice = None
        if point is not None:
            for index in range(len(PALETTE)):
                cx, cy = self.button_center(index)
                if dist(point, (cx, cy)) <= 32:
                    choice = index
                    break
        if choice != self.palette_hover:
            self.palette_hover, self.palette_since = choice, now
        elif choice is not None and now - self.palette_since >= 0.45:
            self.select_color(choice, now)

    def resize_canvas(self, width, height):
        self.finish_stroke(time.monotonic())
        factor = np.array((width / self.w, height / self.h), np.float32)
        strokes = [Stroke(stroke.pts * factor, stroke.color, stroke.thick)
                   for stroke in self.strokes]
        color, thick = self.color_idx, self.thick
        self.__init__(width, height)
        self.strokes, self.color_idx, self.thick = strokes, color, thick
        self.dirty = True

    def on_mouse(self, event, x, y, flags, param):
        self.mouse = (x, y)
        if event == getattr(cv2, "EVENT_LBUTTONDOWN", 1):
            for i in range(len(PALETTE)):
                cx, cy = self.button_center(i)
                if abs(x - cx) <= 38 and abs(y - cy) <= 36:
                    self.select_color(i)
                    return

    def clear(self):
        self.strokes = []
        self.active = None
        self.grab = None
        self.grab_last = None
        self.erase_last = None
        self.palette_hover = None
        self.smooth.reset()
        self.dirty = True
        self.show_toast("Canvas cleared")

    def render_clean(self):
        img = np.zeros((self.h, self.w, 3), np.uint8)
        for s in self.strokes:
            draw_stroke(img, s.pts, s.color, s.thick)
        if self.active:
            draw_stroke(img, self.active, self.color, self.thick)
        return img

    def save(self, folder=None):
        folder = folder or os.path.dirname(os.path.abspath(__file__))
        name = datetime.now().strftime("air_canvas_%Y%m%d_%H%M%S.png")
        path = os.path.join(folder, name)
        image = self.render_clean()
        encode = getattr(cv2, "imencode", None)
        write = getattr(cv2, "imwrite", None)
        try:
            if callable(write):
                if not write(path, image):
                    self.show_toast("Save cancelled or failed", 3)
                    return None
            elif callable(encode):
                ok, buf = encode(".png", image)
                if not ok:
                    self.show_toast("Save failed!", 2.5)
                    return None
                buf.tofile(path)
            else:
                self.show_toast("This runtime cannot export PNG images", 3)
                return None
        except Exception as e:
            self.show_toast("Save failed: %s" % e, 3)
            return None
        self.show_toast("Saved: " + name, 3)
        print("[Air Canvas] saved ->", path)
        return path

    def finish_stroke(self, now):
        pts = self.active
        self.active = None
        if not pts:
            return
        if len(pts) < 2 and (now - self.active_t0) < 0.35:
            return
        self.strokes.append(Stroke(pts, self.color, self.thick))
        self.dirty = True

    def step_draw(self, p, now):
        p = np.asarray(p, np.float32)
        if not self.active:
            self.active = [p]
            self.active_t0 = now
            return
        last = np.asarray(self.active[-1], np.float32)
        d = dist(p, last)
        if d > JUMP_LIMIT_FRAC * self.w:
            self.finish_stroke(now)
            self.active = [p]
            self.active_t0 = now
            return
        if d < MIN_STEP:
            return
        n = int(d // POINT_SPACING) + 1
        for k in range(1, n + 1):
            self.active.append(last + (p - last) * (k / n))

    def erase_at(self, c):
        c = np.asarray(c, np.float32)
        r = ERASER_RADIUS
        new_list = []
        changed = False
        for s in self.strokes:
            if (c[0] < s.lo[0] - r or c[0] > s.hi[0] + r or
                    c[1] < s.lo[1] - r or c[1] > s.hi[1] + r):
                new_list.append(s)
                continue
            d2 = ((s.pts - c) ** 2).sum(axis=1)
            hit = d2 <= r * r
            if not hit.any():
                new_list.append(s)
                continue
            changed = True
            idx = np.flatnonzero(~hit)
            if len(idx) == 0:
                continue
            runs = np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1)
            for run in runs:
                if len(run) >= 2:
                    new_list.append(Stroke(s.pts[run], s.color, s.thick))
        if changed:
            self.strokes = new_list
            self.dirty = True

    def step_erase(self, p):
        p = np.asarray(p, np.float32)
        if self.erase_last is None:
            self.erase_at(p)
        else:
            d = dist(p, self.erase_last)
            n = int(d // (ERASER_RADIUS * 0.5)) + 1
            for k in range(1, n + 1):
                self.erase_at(self.erase_last + (p - self.erase_last) * (k / n))
        self.erase_last = p

    def find_stroke(self, p):
        best, best_d = None, 1e9
        for s in self.strokes:
            if (p[0] < s.lo[0] - GRAB_RADIUS or p[0] > s.hi[0] + GRAB_RADIUS or
                    p[1] < s.lo[1] - GRAB_RADIUS or p[1] > s.hi[1] + GRAB_RADIUS):
                continue
            d = s.distance_to(p) - s.thick / 2.0
            if d < best_d:
                best, best_d = s, d
        return best if best_d <= GRAB_RADIUS else None

    def begin_grab(self, p):
        self.grab = self.find_stroke(p)
        self.grab_last = np.asarray(p, np.float32)
        if self.grab is not None:
            self.strokes.remove(self.grab)
            self.strokes.append(self.grab)
        self.dirty = True

    def step_grab(self, p):
        p = np.asarray(p, np.float32)
        if self.grab is not None and self.grab_last is not None:
            self.grab.translate(p - self.grab_last)
            m = 24
            s = self.grab
            sx = sy = 0.0
            if s.hi[0] < m:
                sx = m - s.hi[0]
            elif s.lo[0] > self.w - m:
                sx = (self.w - m) - s.lo[0]
            if s.hi[1] < m:
                sy = m - s.hi[1]
            elif s.lo[1] > self.h - m:
                sy = (self.h - m) - s.lo[1]
            if sx or sy:
                s.translate((sx, sy))
            self.dirty = True
        self.grab_last = p

    def release_grab(self):
        self.grab = None
        self.grab_last = None
        self.dirty = True

    def set_mode(self, new, target, now):
        old = self.mode
        if old == DRAW:
            self.finish_stroke(now)
        elif old == GRAB:
            self.release_grab()
            self.block_until = now + COOLDOWN
        elif old == ERASE:
            self.erase_last = None
            self.block_until = now + COOLDOWN
        self.mode = new
        self.smooth.reset(target)
        if new == GRAB and target is not None:
            self.begin_grab(target)

    def classify(self, pts, pose=None):
        return self.gestures.classify(pts, pose)

    def pause_tracking(self, now):
        # Never join across missing detections, gesture changes or hand switches.
        if self.mode != IDLE:
            self.set_mode(IDLE, None, now)
        self.finish_stroke(now)
        if self.grab is not None:
            self.release_grab()
        self.erase_last = None
        self.smooth.reset()
        self.last_target = None
        self.cand, self.cand_n = IDLE, 0
        self.candidate_since = now

    def update(self, pts, now=None, pose=None):
        now = time.monotonic() if now is None else now
        gap = self.last_update is not None and now-self.last_update > 0.25
        self.last_update = now
        self.hand = pts
        if pts is None or not np.isfinite(pts).all():
            self.hand, self.pointer, self.raw = None, None, IDLE
            self.hover_palette(None, now)
            self.pause_tracking(now)
            self.gestures = GestureController()
            return
        if gap:
            self.pause_tracking(now)
            self.gestures = GestureController()
        raw, targets = self.classify(pts, pose)
        self.hover_palette(pts[8] if raw == DRAW else None, now)
        if (raw == DRAW and (self.in_panel(pts[8]) or now < self.block_until)):
            raw = IDLE
        target = np.asarray(targets[raw], np.float32)
        # Check the unfiltered point before smoothing can hide a teleport.
        palm = max(dist(pts[0], pts[9]), dist(pts[5], pts[17]), 12.0)
        if self.last_target is not None and dist(target, self.last_target) > max(0.16*self.w, palm*1.6):
            self.pause_tracking(now)
        self.last_target = target.copy()
        self.raw, self.pointer = raw, target
        if raw != self.mode and self.mode != IDLE:
            self.set_mode(IDLE, None, now)
            self.smooth.reset()
        if raw != self.cand:
            self.cand, self.cand_n, self.candidate_since = raw, 1, now
        else:
            self.cand_n += 1
        dwell = {IDLE: 0.0, DRAW: 0.045, ERASE: 0.10, GRAB: 0.07}[raw]
        if raw != self.mode and self.cand_n >= 2 and now-self.candidate_since >= dwell:
            self.set_mode(raw, target, now)
        if self.mode == raw:
            p = self.smooth(target, now)
            self.pointer = p
            if raw == DRAW:
                self.step_draw(p, now)
            elif raw == ERASE:
                self.step_erase(p)
            elif raw == GRAB:
                self.step_grab(p)

    def render_static(self):
        img = np.zeros((self.h, self.w, 3), np.uint8)
        for s in self.strokes:
            if s is self.grab:
                glow = tuple(min(255, int(c * 0.5 + 130)) for c in s.color)
                draw_stroke(img, s.pts, glow, s.thick + 10)
            draw_stroke(img, s.pts, s.color, s.thick)
        self.static = img
        self.dirty = False

    def draw_palette(self, img):
        x0, y0, x1, y1 = self.panel_rect
        roi = img[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
        m = self.panel_mask[y0:y1 + 1, x0:x1 + 1]
        bg = np.array((34, 30, 30), np.float32)
        img[y0:y1 + 1, x0:x1 + 1] = (roi * (1 - m) + bg * m).astype(np.uint8)
        rounded_rect(img, (x0, y0), (x1, y1), 20, (90, 85, 85), 1)
        t = "COLORS"
        put_text(img, t, ((x0 + x1) // 2 - text_width(t, 0.45) // 2, y0 + 24),
                 0.45, (200, 200, 200), 1)
        for i, (_, col) in enumerate(PALETTE):
            cx, cy = self.button_center(i)
            hover = abs(self.mouse[0] - cx) <= 38 and abs(self.mouse[1] - cy) <= 36
            sel = (i == self.color_idx)
            if sel:
                cv2.circle(img, (cx, cy), 36, tuple(int(c * 0.45) for c in col), -1, cv2.LINE_AA)
                cv2.circle(img, (cx, cy), 34, (255, 255, 255), 3, cv2.LINE_AA)
            elif hover:
                cv2.circle(img, (cx, cy), 33, (150, 150, 150), 2, cv2.LINE_AA)
            cv2.circle(img, (cx, cy), 27, col, -1, cv2.LINE_AA)
            cv2.circle(img, (cx, cy), 27, tuple(int(c * 0.6) for c in col), 2, cv2.LINE_AA)
            if sel:
                cv2.circle(img, (cx - 8, cy - 9), 5, (255, 255, 255), -1, cv2.LINE_AA)

    def draw_hand(self, img):
        pts = self.hand
        if pts is None:
            return
        ip = np.round(pts).astype(int)
        for a, b in HAND_CONNECTIONS:
            cv2.line(img, tuple(ip[a]), tuple(ip[b]), (215, 215, 215), 2, cv2.LINE_AA)
        for i, p in enumerate(ip):
            tip = i in (4, 8, 12, 16, 20)
            cv2.circle(img, tuple(p), 6 if tip else 4, (255, 255, 255) if tip else (190, 190, 190),
                       -1, cv2.LINE_AA)
            cv2.circle(img, tuple(p), 6 if tip else 4, (60, 60, 60), 1, cv2.LINE_AA)
        cv2.circle(img, tuple(ip[8]), 7, self.color, -1, cv2.LINE_AA)
        cv2.circle(img, tuple(ip[8]), 7, (255, 255, 255), 1, cv2.LINE_AA)

    def draw_pointer(self, img):
        if self.hand is None or self.pointer is None:
            return
        p = (int(self.pointer[0]), int(self.pointer[1]))
        if self.raw == DRAW:
            cv2.circle(img, p, self.thick // 2 + 5, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.circle(img, p, max(2, self.thick // 2), self.color, -1, cv2.LINE_AA)
        elif self.raw == ERASE:
            ov = img.copy()
            cv2.circle(ov, p, ERASER_RADIUS, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.addWeighted(ov, 0.18, img, 0.82, 0, img)
            cv2.circle(img, p, ERASER_RADIUS, (255, 255, 255), 2, cv2.LINE_AA)
        elif self.raw == GRAB:
            a = tuple(np.round(self.hand[4]).astype(int))
            b = tuple(np.round(self.hand[8]).astype(int))
            col = (90, 230, 255)
            cv2.line(img, a, b, col, 2, cv2.LINE_AA)
            has = self.grab is not None if self.mode == GRAB else (self.find_stroke(self.pointer) is not None)
            ring = (120, 255, 140) if has else (110, 110, 255)
            cv2.circle(img, p, 14, ring, 3, cv2.LINE_AA)
            cv2.circle(img, p, GRAB_RADIUS, ring, 1, cv2.LINE_AA)
        else:
            cv2.circle(img, p, 12, (200, 200, 200), 1, cv2.LINE_AA)

    def draw_hud(self, img, fps):
        label = MODE_LABEL[self.raw if self.hand is not None else IDLE]
        if self.hand is None:
            label, col = "SHOW YOUR HAND", (140, 140, 140)
        else:
            col = MODE_COLOR[self.raw]
        tw = text_width(label, 0.7, 2)
        cx = self.w // 2
        rounded_rect(img, (cx - tw // 2 - 22, 14), (cx + tw // 2 + 22, 52), 18, (30, 28, 28), -1)
        rounded_rect(img, (cx - tw // 2 - 22, 14), (cx + tw // 2 + 22, 52), 18, col, 1)
        put_text(img, label, (cx - tw // 2, 40), 0.7, col, 2, shadow=False)

        info = "FPS %d   Brush %d" % (fps, self.thick)
        put_text(img, info, (self.w - text_width(info, 0.5) - 14, 28), 0.5, (150, 150, 150))

        help_t = "Index: draw   Pinch: move   Pinky: erase   |   1-4 colors   C clear   S save   +/- size   Q quit"
        scale = 0.5 if self.w >= 1000 else 0.4
        put_text(img, help_t, (self.w // 2 - text_width(help_t, scale) // 2, self.h - 14),
                 scale, (135, 135, 135))

        if time.time() < self.toast_until:
            tw = text_width(self.toast_text, 0.65, 2)
            y = self.h - 60
            rounded_rect(img, (cx - tw // 2 - 18, y - 28), (cx + tw // 2 + 18, y + 12), 16, (40, 36, 36), -1)
            put_text(img, self.toast_text, (cx - tw // 2, y), 0.65, (255, 255, 255), 2, shadow=False)

    def compose(self, fps=0):
        if self.dirty:
            self.render_static()
        img = self.static.copy()
        if self.active:
            draw_stroke(img, self.active, self.color, self.thick)
        self.draw_palette(img)
        self.draw_hand(img)
        self.draw_pointer(img)
        self.draw_hud(img, fps)
        return img


class HandTracker:
    """Use CodePad's bundled Tasks model; desktop can use MediaPipe Hands.

    Follow the same palm rather than selecting result[0] every frame. Returning
    None is intentional when the locked hand disappears; never draw stale points.
    """
    def __init__(self, num_hands=1):
        try:
            import mediapipe as mp
        except ImportError:
            fatal("MediaPipe unavailable", "Run in CodePad 3.6.2 or install MediaPipe on desktop.",
                  "این فایل را داخل کدپد اجرا کن.")
        self.mp, self.legacy, self.landmarker = mp, None, None
        self.pose = None
        self.center, self.scale, self.last_seen = None, 0.0, 0.0
        self.last_ts = -1
        if hasattr(mp, "solutions") and hasattr(mp.solutions, "hands"):
            self.legacy = mp.solutions.hands.Hands(
                static_image_mode=False, max_num_hands=num_hands, model_complexity=1,
                min_detection_confidence=0.55, min_tracking_confidence=0.50)
        else:
            from mediapipe.tasks.python import vision, BaseOptions
            model = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand_landmarker.task")
            if not os.path.isfile(model):
                fatal("Hand model missing", "Place hand_landmarker.task beside this script.",
                      "مدل داخل کدپد همراه برنامه است؛ این پیام مربوط به اجرای خارج از کدپد است.")
            self.landmarker = vision.HandLandmarker.create_from_options(
                vision.HandLandmarkerOptions(
                    base_options=BaseOptions(model_asset_path=model),
                    running_mode=vision.RunningMode.VIDEO, num_hands=num_hands,
                    min_hand_detection_confidence=.55, min_hand_presence_confidence=.50,
                    min_tracking_confidence=.50))

    def choose(self, candidates, now):
        if not candidates:
            self.pose = None
            return None
        centers = [q[[0,5,9,13,17],:2].mean(axis=0) for q in candidates]
        sizes = [max(dist(q[0], q[9]), dist(q[5], q[17]), 1.0) for q in candidates]
        if self.center is None or now-self.last_seen > .4:
            index = int(np.argmax(sizes))
        else:
            eligible = [i for i in range(len(candidates))
                        if .45 < sizes[i]/self.scale < 2.2
                        and dist(centers[i], self.center) < max(50.0, self.scale*1.6)]
            if not eligible:
                self.pose = None
                return None
            index = min(eligible, key=lambda i:dist(centers[i],self.center))
        self.center, self.scale, self.last_seen = centers[index], sizes[index], now
        self.pose = candidates[index]
        return self.pose[:,:2].copy()

    def process(self, bgr, w, h):
        # CodePad already ran inference on this exact frame in its camera worker.
        # Passing its metadata avoids a redundant full-frame RGB copy.
        rgb = bgr if hasattr(bgr, "landmarks") else cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        if self.legacy is not None:
            res = self.legacy.process(rgb)
            landmarks = [hand.landmark for hand in (res.multi_hand_landmarks or [])]
        else:
            ts = max(self.last_ts+1, int(time.monotonic()*1000))
            self.last_ts = ts
            image = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
            landmarks = self.landmarker.detect_for_video(image, ts).hand_landmarks
        candidates = [np.array([[p.x*w, p.y*h, p.z*w] for p in hand],np.float32)
                      for hand in landmarks]
        candidates = [q for q in candidates if q.shape == (21,3) and np.isfinite(q).all()]
        return self.choose(candidates, time.monotonic())

    def close(self):
        for tracker in (self.legacy, self.landmarker):
            if tracker is not None:
                tracker.close()


def try_open(index, width, height):
    # Use the default camera backend; CodePad does not expose CAP_ANY.
    try:
        cap = cv2.VideoCapture(index)
    except NotImplementedError:
        return None, None
    if not cap.isOpened():
        cap.release()
        return None, None

    cap.set(3, width)
    cap.set(4, height)

    for _ in range(20):
        ok, frame = cap.read()
        if ok and frame is not None:
            return cap, frame
        time.sleep(0.05)

    cap.release()
    return None, None


def open_camera(index, width, height):
    cap, frame = try_open(index, width, height)
    if cap is not None:
        return cap, frame
    for alt in range(0, 4):
        if alt == index:
            continue
        cap, frame = try_open(alt, width, height)
        if cap is not None:
            print("[Air Canvas] camera %d not available, using camera %d" % (index, alt))
            return cap, frame
    fatal("Camera could not be opened",
          "No working webcam was found.\n"
          "- Make sure a webcam is connected and not used by another program (Zoom, Teams, browser ...).\n"
          "- Android: allow camera access for CodePad in app permissions.\n"
          "- Browser: allow camera access for this site.\n"
          "- Windows: allow desktop apps to access the camera.\n"
          "- Try another camera index:  python air_canvas.py --camera 1",
          "دوربین باز نشد. مطمئن شوید وب‌کم وصل است، برنامه‌ی دیگری از آن استفاده نمی‌کند "
          "و مجوز دوربین کدپد در تنظیمات اندروید یا مجوز سایت در مرورگر فعال است. "
          "می‌توانید دوربین دیگری را امتحان کنید:  python air_canvas.py --camera 1")


def main():
    ap = argparse.ArgumentParser(description="Air Canvas - draw in the air with your hand")
    ap.add_argument("--hands", type=int, choices=(1, 2), default=1,
                    help="one hand is faster; use 2 to track among two visible hands")
    ap.add_argument("--camera", type=int, default=0, help="camera index (default 0)")
    ap.add_argument("--width", type=int, default=640, help="requested capture width")
    ap.add_argument("--height", type=int, default=480, help="requested capture height")
    args = ap.parse_args()

    cap = None
    tracker = None
    try:
        cap, first = open_camera(args.camera, args.width, args.height)
        tracker = HandTracker(args.hands)

        h, w = first.shape[:2]
        app = AirCanvas(w, h)
        setup_window(app)
        print("[Air Canvas] running at %dx%d  -  press Q or Esc to quit" % (w, h))

        fps, t_prev, bad_reads = 0.0, time.monotonic(), 0
        frame = first
        while True:
            if frame is None:
                ok, frame = cap.read()
                if not ok or frame is None:
                    bad_reads += 1
                    frame = None
                    if bad_reads > 60:
                        fatal("Camera stopped working",
                              "The camera stopped delivering frames. Reconnect it and start again.",
                              "دوربین دیگر تصویر نمی‌دهد. آن را دوباره وصل کنید و برنامه را اجرا کنید.")
                    time.sleep(0.02)
                    continue
            bad_reads = 0
            if frame.shape[0] != h or frame.shape[1] != w:
                h, w = frame.shape[:2]
                app.resize_canvas(w, h)
            frame = cv2.flip(frame, 1)

            pts = tracker.process(frame, w, h)
            now = time.monotonic()
            app.update(pts, now, tracker.pose)

            dt = now - t_prev
            t_prev = now
            if dt > 0:
                fps = 0.9 * fps + 0.1 * (1.0 / dt) if fps else 1.0 / dt

            cv2.imshow(WIN, app.compose(int(round(fps))))
            frame = None

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                break
            elif ord("1") <= key <= ord("4"):
                app.select_color(key - ord("1"))
            elif key in (ord("c"), ord("C")):
                app.clear()
            elif key in (ord("s"), ord("S")):
                app.save()
            elif key in (ord("+"), ord("=")):
                app.thick = min(40, app.thick + 2)
            elif key in (ord("-"), ord("_")):
                app.thick = max(2, app.thick - 2)

            if window_closed():
                break
    except KeyboardInterrupt:
        pass
    finally:
        if tracker is not None:
            tracker.close()
        if cap is not None:
            cap.release()
        close = getattr(cv2, "destroyAllWindows", None)
        if callable(close):
            close()


if __name__ == "__main__":
    main()