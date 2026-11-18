"""Air Canvas 3.6.3 — optimized for CodePad / Android.
No package or model download in CodePad. Keep this as one Python file.
Index: draw; pinky: erase; thumb/index pinch: move a stroke.
Touch colors, Undo / Redo. Keys: 1-4 C S +/- Z Y H Q.
Desktop MediaPipe fallback is retained; its model may download once.
"""
import os
import sys
import time
import argparse
import urllib.request
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


INSTALL_CMD = "pip install opencv-python numpy mediapipe"

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


WIN = "Air Canvas 3.6.3"

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

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20), (0, 17),
]

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
             "hand_landmarker/float16/1/hand_landmarker.task")


def put_text(img, text, org, scale=0.6, color=(255, 255, 255), thick=1, shadow=True):
    x, y = int(org[0]), int(org[1])
    if shadow:
        cv2.putText(img, text, (x + 1, y + 1), cv2.FONT_HERSHEY_SIMPLEX, scale,
                    (0, 0, 0), thick + 2, cv2.LINE_AA)
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, thick, cv2.LINE_AA)


_text_width_cache = {}


def text_width(text, scale=0.6, thick=1):
    measure = getattr(cv2, "getTextSize", None)
    key = (str(text), float(scale), int(thick))
    if callable(measure):
        if key not in _text_width_cache:
            if len(_text_width_cache) >= 256:
                _text_width_cache.pop(next(iter(_text_width_cache)))
            _text_width_cache[key] = measure(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thick)[0][0]
        return _text_width_cache[key]
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
        p = np.asarray(p, np.float32)
        if len(self.pts) == 1:
            return dist(self.pts[0], p)
        a, v = self.pts[:-1], self.pts[1:] - self.pts[:-1]
        t = np.clip(((p - a) * v).sum(axis=1) / np.maximum((v * v).sum(axis=1), 1e-8), 0, 1)
        return float(np.sqrt(((a + v * t[:, None] - p) ** 2).sum(axis=1).min()))


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

    def classify(self, pts, geometry=None):
        q = np.asarray(geometry if geometry is not None else pts, np.float32)
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
    """Vector strokes with incremental raster caching and copy-on-write history."""
    HISTORY_LIMIT = 20

    def __init__(self, w, h):
        self.w, self.h = int(w), int(h)
        self.strokes, self.active = [], None
        self.active_t0 = 0.0
        self.color_idx, self.thick = 0, 8
        self.mode = self.raw = self.cand = IDLE
        self.cand_n, self.candidate_since = 0, 0.0
        self.gestures, self.smooth = GestureController(), Smoother()
        self.last_update = self.last_target = None
        self.block_until = 0.0
        self.grab = self.grab_last = self.erase_last = None
        self._grab_detached = False
        self.hand = self.pointer = None
        self.show_skeleton = True
        self.static = np.zeros((h, w, 3), np.uint8)
        self.dirty = False
        self.undo_stack, self.redo_stack = [], []
        self._before, self._changed = None, False
        self.toast_text, self.toast_until = "", 0.0
        self.mouse = (-1, -1)
        self.palette_hover, self.palette_since = None, 0.0
        self.cell = max(24, min(76, (h - 146) // len(PALETTE)))
        self.panel_h = PANEL_TITLE_H + self.cell * len(PALETTE) + 10
        self.panel_y0 = max(12, (h - self.panel_h) // 2)
        self.panel_y1 = self.panel_y0 + self.panel_h
        self.panel_rect = (PANEL_X0, self.panel_y0, PANEL_X1, self.panel_y1)
        self._palette_key = self._palette_cache = None
        self.raster_rebuilds = 0

    @property
    def color(self):
        return PALETTE[self.color_idx][1]

    def show_toast(self, text, seconds=2.0):
        self.toast_text, self.toast_until = str(text), time.monotonic() + seconds

    def _begin_action(self):
        if self._before is None:
            self._before, self._changed = tuple(self.strokes), False

    def _mark_changed(self):
        self._begin_action()
        if not self._changed:
            self.redo_stack.clear()
        self._changed = True

    def _remember(self, state):
        self.undo_stack.append(tuple(state))
        if len(self.undo_stack) > self.HISTORY_LIMIT:
            del self.undo_stack[0]
        # Bound old history, retaining at least the latest undo operation.
        while len(self.undo_stack) > 1:
            unique = {id(s): s for scene in self.undo_stack for s in scene}
            if sum(len(s.pts) for s in unique.values()) <= 200000:
                break
            del self.undo_stack[0]

    def _end_action(self):
        if self._before is not None and self._changed:
            self._remember(self._before)
        self._before, self._changed = None, False

    def button_center(self, i):
        return BTN_CX, self.panel_y0 + PANEL_TITLE_H + self.cell * i + self.cell // 2

    def control_rects(self):
        y = self.h - 73
        return [("UNDO", self.w - 160, y, self.w - 88, y + 28),
                ("REDO", self.w - 82, y, self.w - 10, y + 28)]

    def in_panel(self, p, margin=10):
        return (PANEL_X0-margin <= p[0] <= PANEL_X1+margin and
                self.panel_y0-margin <= p[1] <= self.panel_y1+margin)

    def in_controls(self, p):
        return any(x0-6 <= p[0] <= x1+6 and y0-6 <= p[1] <= y1+6
                   for _, x0, y0, x1, y1 in self.control_rects())

    def select_color(self, index, now=None):
        if 0 <= index < len(PALETTE) and index != self.color_idx:
            self.pause_tracking(time.monotonic() if now is None else now)
            self.color_idx = index
            self.show_toast("Color: " + PALETTE[index][0], 1.2)

    def change_brush(self, delta):
        self.pause_tracking(time.monotonic())
        self.thick = max(2, min(40, self.thick + delta))

    def hover_palette(self, point, now):
        choice = None
        radius = max(10, min(32, self.cell * .45))
        if point is not None:
            choice = next((i for i in range(len(PALETTE))
                           if dist(point, self.button_center(i)) <= radius), None)
        if choice != self.palette_hover:
            self.palette_hover, self.palette_since = choice, now
        elif choice is not None and now - self.palette_since >= .45:
            self.select_color(choice, now)

    def on_mouse(self, event, x, y, flags, param):
        self.mouse = (x, y)
        if event != getattr(cv2, "EVENT_LBUTTONDOWN", 1):
            return
        for name, x0, y0, x1, y1 in self.control_rects():
            if x0 <= x <= x1 and y0 <= y <= y1:
                (self.undo if name == "UNDO" else self.redo)()
                return
        for i in range(len(PALETTE)):
            if dist((x, y), self.button_center(i)) <= max(12, self.cell * .48):
                self.select_color(i)
                return

    def undo(self):
        now = time.monotonic()
        self.pause_tracking(now)
        if not self.undo_stack:
            self.show_toast("Nothing to undo", 1)
            return
        self.redo_stack.append(tuple(self.strokes))
        self.strokes = list(self.undo_stack.pop())
        self.dirty = True
        self.block_until = now + .18
        self.show_toast("Undo", 1)

    def redo(self):
        now = time.monotonic()
        self.pause_tracking(now)
        if not self.redo_stack:
            self.show_toast("Nothing to redo", 1)
            return
        self._remember(self.strokes)
        self.strokes = list(self.redo_stack.pop())
        self.dirty = True
        self.block_until = now + .18
        self.show_toast("Redo", 1)

    def clear(self):
        now = time.monotonic()
        self.pause_tracking(now)
        if self.strokes:
            self._remember(self.strokes)
            self.redo_stack.clear()
        self.strokes = []
        self.static.fill(0)
        self.dirty = False
        self.block_until = now + .18
        self.show_toast("Canvas cleared")

    def resize_canvas(self, width, height):
        self.pause_tracking(time.monotonic())
        factors = np.array((width/self.w, height/self.h), np.float32)
        scenes = [self.strokes, *self.undo_stack, *self.redo_stack]
        converted = {id(s): Stroke(s.pts*factors, s.color, s.thick)
                     for scene in scenes for s in scene}
        convert = lambda scene: [converted[id(s)] for s in scene]
        current = convert(self.strokes)
        undo, redo = [tuple(convert(s)) for s in self.undo_stack], [tuple(convert(s)) for s in self.redo_stack]
        color, thick, skeleton = self.color_idx, self.thick, self.show_skeleton
        self.__init__(width, height)
        self.strokes, self.undo_stack, self.redo_stack = current, undo, redo
        self.color_idx, self.thick, self.show_skeleton = color, thick, skeleton
        self.dirty = True

    def render_clean(self):
        image = np.zeros((self.h, self.w, 3), np.uint8)
        for s in self.strokes:
            draw_stroke(image, s.pts, s.color, s.thick)
        if self.active:
            draw_stroke(image, self.active, self.color, self.thick)
        return image

    def save(self, folder=None):
        name = datetime.now().strftime("air_canvas_%Y%m%d_%H%M%S_%f.png")
        path = os.path.join(folder or os.path.dirname(os.path.abspath(__file__)), name)
        try:
            # CodePad's imwrite is connected to the Android/ browser save picker.
            # Use its save result to handle a cancelled picker explicitly.
            image = self.render_clean()
            if getattr(cv2, "codepad_profile", None):
                if not cv2.imwrite(path, image):
                    self.show_toast("Save cancelled or failed", 2.5)
                    return None
            elif callable(getattr(cv2, "imencode", None)):
                ok, encoded = cv2.imencode(".png", image)
                if not ok:
                    raise OSError("PNG encoding failed")
                try:
                    encoded.tofile(path)  # Handles Unicode Windows paths.
                except OSError:
                    path = os.path.join(os.getcwd(), name)
                    encoded.tofile(path)
            elif not cv2.imwrite(path, image):
                raise OSError("PNG writing failed")
        except Exception as error:
            self.show_toast("Save failed: " + str(error)[:90], 3)
            return None
        self.show_toast("Saved PNG", 2)
        print("[Air Canvas] saved ->", path)
        return path

    def finish_stroke(self, now):
        if self.active:
            self.strokes.append(Stroke(self.active, self.color, self.thick))
            self.active = None

    def _ensure_raster(self):
        if self.dirty:
            self.render_static()

    def step_draw(self, p, now):
        self._begin_action()
        self._ensure_raster()
        p = np.asarray(p, np.float32)
        if not self.active:
            self.active, self.active_t0 = [p.copy()], now
            self._mark_changed()
            cv2.circle(self.static, tuple(np.round(p).astype(int)), max(1, self.thick//2), self.color, -1, cv2.LINE_AA)
            return
        last = np.asarray(self.active[-1], np.float32)
        length = dist(p, last)
        if length > JUMP_LIMIT_FRAC * self.w:
            self.finish_stroke(now)
            self.step_draw(p, now)
            return
        if length < MIN_STEP:
            return
        count = int(length // POINT_SPACING) + 1
        for k in range(1, count + 1):
            self.active.append(last + (p-last) * (k/count))
        cv2.line(self.static, tuple(np.round(last).astype(int)), tuple(np.round(p).astype(int)), self.color, self.thick, cv2.LINE_AA)
        self._mark_changed()
        if len(self.active) >= 4096:
            self.finish_stroke(now)
            self.active = [p.copy()]  # A chunk boundary, not a new undo operation.

    def erase_segment(self, a, b):
        a, b = np.asarray(a, np.float32), np.asarray(b, np.float32)
        lower, upper = np.minimum(a, b), np.maximum(a, b)
        vector = b-a
        length2 = max(float(np.dot(vector, vector)), 1e-8)
        result, changed = [], False
        for s in self.strokes:
            radius = ERASER_RADIUS + s.thick*.5
            if np.any(upper < s.lo-radius) or np.any(lower > s.hi+radius):
                result.append(s)
                continue
            t = np.clip(((s.pts-a)*vector).sum(axis=1) / length2, 0, 1)
            hit = ((s.pts - (a+t[:, None]*vector))**2).sum(axis=1) <= radius*radius
            if not hit.any():
                result.append(s)
                continue
            changed = True
            indices = np.flatnonzero(~hit)
            for run in np.split(indices, np.flatnonzero(np.diff(indices)>1)+1):
                if len(run):
                    result.append(Stroke(s.pts[run], s.color, s.thick))
        if changed:
            self._mark_changed()
            self.strokes, self.dirty = result, True

    def erase_at(self, p):
        self.erase_segment(p, p)

    def step_erase(self, p):
        self.erase_segment(p if self.erase_last is None else self.erase_last, p)
        self.erase_last = np.asarray(p, np.float32).copy()

    def find_stroke(self, p):
        best, distance = None, float("inf")
        for s in self.strokes:
            if p[0]<s.lo[0]-GRAB_RADIUS or p[0]>s.hi[0]+GRAB_RADIUS or p[1]<s.lo[1]-GRAB_RADIUS or p[1]>s.hi[1]+GRAB_RADIUS:
                continue
            current = s.distance_to(p) - s.thick*.5
            if current < distance:
                best, distance = s, current
        return best if distance <= GRAB_RADIUS else None

    def begin_grab(self, p):
        self._begin_action()
        self.grab, self.grab_last = self.find_stroke(p), np.asarray(p, np.float32)
        self._grab_detached, self.dirty = False, True

    def step_grab(self, p):
        p = np.asarray(p, np.float32)
        if self.grab is not None and self.grab_last is not None:
            delta = p-self.grab_last
            if np.linalg.norm(delta) > 1e-4:
                if not self._grab_detached:
                    original = self.grab
                    self.grab = Stroke(original.pts, original.color, original.thick)
                    self.strokes.remove(original)
                    self.strokes.append(self.grab)
                    self._grab_detached = True
                self._mark_changed()
                self.grab.translate(delta)
                lower, upper = self.grab.lo, self.grab.hi
                correction = np.where(upper<24, 24-upper, np.where(lower>np.array([self.w,self.h])-24, np.array([self.w,self.h])-24-lower, 0))
                self.grab.translate(correction)
        self.grab_last = p.copy()

    def release_grab(self):
        self.grab = self.grab_last = None
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
        self._end_action()
        self.mode = new
        self.smooth.reset(target)
        if new != IDLE:
            self._begin_action()
        if new == GRAB and target is not None:
            self.begin_grab(target)

    def classify(self, pts, geometry=None):
        return self.gestures.classify(pts, geometry)

    def pause_tracking(self, now):
        if self.mode != IDLE:
            self.set_mode(IDLE, None, now)
        self.finish_stroke(now)
        if self.grab is not None:
            self.release_grab()
        self._end_action()
        self.erase_last, self.last_target = None, None
        self.smooth.reset()
        self.cand, self.cand_n, self.candidate_since = IDLE, 0, now

    def update(self, pts, now=None, geometry=None, switched=False):
        now = time.monotonic() if now is None else now
        gap = self.last_update is not None and (now-self.last_update>.25 or now<=self.last_update)
        self.last_update, self.hand = now, pts
        if pts is None or np.shape(pts)!=(21,2) or not np.isfinite(pts).all():
            self.hand, self.pointer, self.raw = None, None, IDLE
            self.hover_palette(None, now)
            self.pause_tracking(now)
            self.gestures = GestureController()
            return
        if gap or switched:
            self.pause_tracking(now)
            self.gestures = GestureController()
        raw, targets = self.classify(pts, geometry)
        self.hover_palette(pts[8] if raw == DRAW else None, now)
        target = np.asarray(targets[raw], np.float32)
        if (self.in_panel(target) or self.in_controls(target) or not(0<=target[0]<self.w and 0<=target[1]<self.h) or (raw==DRAW and now<self.block_until)):
            raw = IDLE
        palm = max(dist(pts[0],pts[9]), dist(pts[5],pts[17]), 12.)
        if self.last_target is not None and dist(target,self.last_target)>max(.16*self.w,palm*1.6):
            self.pause_tracking(now)
        self.last_target = target.copy()
        self.raw, self.pointer = raw, target
        if raw != self.mode and self.mode != IDLE:
            self.set_mode(IDLE, None, now)
        if raw != self.cand:
            self.cand, self.cand_n, self.candidate_since = raw, 1, now
        else:
            self.cand_n += 1
        dwell = {IDLE:0., DRAW:.045, ERASE:.10, GRAB:.07}[raw]
        if raw != self.mode and self.cand_n>=2 and now-self.candidate_since>=dwell:
            self.set_mode(raw, target, now)
        if raw == self.mode:
            self.pointer = self.smooth(target, now)
            if raw == DRAW:
                self.step_draw(self.pointer, now)
            elif raw == ERASE:
                self.step_erase(self.pointer)
            elif raw == GRAB:
                self.step_grab(self.pointer)

    def render_static(self):
        self.static.fill(0)
        for s in self.strokes:
            if s is not self.grab:
                draw_stroke(self.static, s.pts, s.color, s.thick)
        if self.active:
            draw_stroke(self.static, self.active, self.color, self.thick)
        self.dirty = False
        self.raster_rebuilds += 1

    def draw_palette(self, img):
        hover = next((i for i in range(len(PALETTE)) if dist(self.mouse,self.button_center(i))<self.cell*.48), None)
        key = (self.color_idx, hover)
        x0,y0,x1,y1 = self.panel_rect
        shape = (y1-y0+1, x1-x0+1, 3)
        if key != self._palette_key:
            mask = np.zeros(shape[:2], np.uint8)
            rounded_rect(mask,(0,0),(shape[1]-1,shape[0]-1),18,255,-1)
            overlay = np.zeros(shape,np.uint8)
            rounded_rect(overlay,(0,0),(shape[1]-1,shape[0]-1),18,(90,85,85),1)
            put_text(overlay,"COLORS",(shape[1]//2-text_width("COLORS",.42)//2,24),.42,(210,210,210),shadow=False)
            radius = max(8,min(27,int(self.cell*.35)))
            for i,(_,color) in enumerate(PALETTE):
                cx,cy = self.button_center(i);cx-=x0;cy-=y0
                if i==self.color_idx:
                    cv2.circle(overlay,(cx,cy),radius+6,(255,255,255),2,cv2.LINE_AA)
                elif i==hover:
                    cv2.circle(overlay,(cx,cy),radius+4,(155,155,155),1,cv2.LINE_AA)
                cv2.circle(overlay,(cx,cy),radius,color,-1,cv2.LINE_AA)
                if i==self.color_idx:
                    cv2.circle(overlay,(cx-radius//3,cy-radius//3),max(2,radius//5),(255,255,255),-1,cv2.LINE_AA)
            self._palette_cache=(mask>0,overlay,np.any(overlay!=0,axis=2),np.full(shape,(34,30,30),np.uint8))
            self._palette_key=key
        mask,overlay,elements,bg = self._palette_cache
        roi=img[y0:y1+1,x0:x1+1]
        blend=cv2.addWeighted(roi,.2,bg,.8,0)
        roi[mask]=blend[mask]
        roi[elements]=overlay[elements]

    def draw_hand(self, img):
        if self.hand is None or not self.show_skeleton:
            return
        points=np.round(self.hand).astype(np.int32)
        cv2.polylines(img,[points[[a,b]].reshape(-1,1,2) for a,b in HAND_CONNECTIONS],False,(205,205,205),1,cv2.LINE_AA)
        for i,p in enumerate(points):
            cv2.circle(img,tuple(p),5 if i in (4,8,12,16,20) else 3,self.color if i==8 else (230,230,230),-1,cv2.LINE_AA)

    def draw_pointer(self, img):
        if self.hand is None or self.pointer is None:
            return
        point=tuple(np.round(self.pointer).astype(int))
        if self.raw==DRAW:
            cv2.circle(img,point,max(3,self.thick//2),(255,255,255),1,cv2.LINE_AA)
        elif self.raw==ERASE:
            cv2.circle(img,point,ERASER_RADIUS,(255,220,150),2,cv2.LINE_AA)
        elif self.raw==GRAB:
            cv2.line(img,tuple(np.round(self.hand[4]).astype(int)),tuple(np.round(self.hand[8]).astype(int)),(90,230,255),2,cv2.LINE_AA)
            cv2.circle(img,point,GRAB_RADIUS,(120,255,140) if self.grab is not None else (110,110,255),1,cv2.LINE_AA)

    def draw_hud(self, img, fps):
        label=MODE_LABEL[self.raw] if self.hand is not None else "SHOW YOUR HAND"
        color=MODE_COLOR[self.raw] if self.hand is not None else (155,155,155)
        scale=.60 if self.w>=640 else .42
        width=text_width(label,scale,2);cx=self.w//2
        rounded_rect(img,(cx-width//2-15,12),(cx+width//2+15,49),14,(30,28,28),-1)
        put_text(img,label,(cx-width//2,37),scale,color,2,shadow=False)
        info="FPS %d | Brush %d" % (fps,self.thick)
        put_text(img,info,(self.w-text_width(info,.4)-12,65 if self.w<850 else 28),.4,(155,155,155),shadow=False)
        for name,x0,y0,x1,y1 in self.control_rects():
            enabled=bool(self.undo_stack or self._changed) if name=="UNDO" else bool(self.redo_stack)
            rounded_rect(img,(x0,y0),(x1,y1),7,(36,40,43),-1)
            put_text(img,name,(x0+8,y0+19),.38,(220,225,225) if enabled else (100,105,105),shadow=False)
        for text,y in [("Index: draw | Pinch: move | Pinky: erase",self.h-28),
                       ("1-4 color | C clear | S save | +/- size | Z/Y undo/redo | H hand | Q quit",self.h-11)]:
            scale=min(.4,(self.w-18)/max(text_width(text,1),1))
            put_text(img,text,((self.w-text_width(text,scale))//2,y),scale,(150,150,150),shadow=False)
        if time.monotonic()<self.toast_until:
            text=self.toast_text;scale=min(.55,(self.w-32)/max(text_width(text,1,2),1));width=text_width(text,scale,2)
            y=self.h-88
            rounded_rect(img,(cx-width//2-9,y-23),(cx+width//2+9,y+7),10,(40,36,36),-1)
            put_text(img,text,(cx-width//2,y),scale,(255,255,255),2,shadow=False)

    def compose(self, fps=0):
        self._ensure_raster()
        image=self.static.copy()
        if self.grab is not None:
            glow=tuple(min(255,int(c*.5+130)) for c in self.grab.color)
            draw_stroke(image,self.grab.pts,glow,self.grab.thick+8)
            draw_stroke(image,self.grab.pts,self.grab.color,self.grab.thick)
        self.draw_palette(image)
        self.draw_hand(image)
        self.draw_pointer(image)
        self.draw_hud(image,fps)
        return image



class HandTracker:
    """Current-frame CodePad IDs + raw 3D geometry; one smoothing stage in UI."""
    def __init__(self, num_hands=1):
        try:
            import mediapipe as mp
        except ImportError as error:
            fatal("MediaPipe unavailable", str(error) + "\n" + INSTALL_CMD,
                  "در کدپد ۳٫۶٫۳ کتابخانه همراه برنامه است؛ این دستور نصب برای کامپیوتر است.")
        self.mp = mp
        self.core = self.legacy = self.landmarker = None
        self.geometry = None
        self.center, self.scale, self.last_seen = None, 0., 0.
        self.selected_id = None
        self.switched = False
        self.last_ts = -1
        self.backend = "MediaPipe"
        if getattr(cv2, "codepad_profile", None):
            try:
                from codepad_tracking import Tracker
                # Painting only needs hands. Do not spend CPU/GPU on a body model
                # or smooth the same coordinates twice.
                self.core = Tracker(hands=num_hands, body=False, smooth=False)
                self.backend = "CodePad Tracking 3.6.3 / hands only"
                return
            except ImportError:
                print("[Air Canvas] CodePad 3.6.3 is recommended; using the bundled Hands API.")
        if hasattr(mp, "solutions") and hasattr(mp.solutions, "hands"):
            self.legacy = mp.solutions.hands.Hands(
                static_image_mode=False, max_num_hands=num_hands, model_complexity=1,
                min_detection_confidence=.55, min_tracking_confidence=.50)
        else:
            self._init_tasks(num_hands)

    def _init_tasks(self, num_hands):
        if getattr(cv2, "codepad_profile", None):
            raise RuntimeError("Update CodePad to 3.6.3; its offline hand backend is unavailable.")
        from mediapipe.tasks.python import vision, BaseOptions
        model = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand_landmarker.task")
        if not os.path.isfile(model):
            print("[Air Canvas] downloading the desktop hand model once...")
            temporary = model + ".download"
            try:
                urllib.request.urlretrieve(MODEL_URL, temporary)
                os.replace(temporary, model)
            finally:
                if os.path.isfile(temporary):
                    os.remove(temporary)
        options = vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model),
            running_mode=vision.RunningMode.VIDEO, num_hands=num_hands,
            min_hand_detection_confidence=.55, min_hand_presence_confidence=.50,
            min_tracking_confidence=.50)
        self.landmarker = vision.HandLandmarker.create_from_options(options)
        self.backend = "MediaPipe Tasks / desktop"

    def reset_selection(self):
        self.center, self.scale, self.last_seen = None, 0., 0.
        self.selected_id, self.geometry = None, None

    def choose(self, candidates, now):
        self.switched, self.geometry = False, None
        if not candidates:
            return None
        centers = [c["points"][[0,5,9,13,17],:2].mean(axis=0) for c in candidates]
        sizes = [max(dist(c["points"][0],c["points"][9]), dist(c["points"][5],c["points"][17]), 1.) for c in candidates]
        if self.center is None or now-self.last_seen>.4:
            index = int(np.argmax(sizes))
        else:
            eligible = [i for i in range(len(candidates))
                        if .45 < sizes[i]/max(self.scale,1.) < 2.2
                        and dist(centers[i],self.center) < max(50.,self.scale*1.6)]
            if not eligible:
                return None
            same = [i for i in eligible if self.selected_id is not None and candidates[i]["id"]==self.selected_id]
            index = min(same or eligible, key=lambda i:dist(centers[i],self.center))
        selected = candidates[index]
        self.switched = (self.selected_id is not None and selected["id"] is not None
                         and self.selected_id != selected["id"])
        if now-self.last_seen>.4 and self.center is not None:
            self.switched = True
        self.selected_id = selected["id"]
        self.center, self.scale, self.last_seen = centers[index], sizes[index], now
        self.geometry = selected["geometry"]
        return selected["points"][:,:2].copy()

    def process(self, frame, w, h):
        # CodePad has already detected this exact camera frame in its Worker.
        # Mirroring landmark coordinates avoids both a pixel flip and an RGB copy.
        metadata = hasattr(frame, "landmarks")
        image = frame if metadata else cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        identities, worlds = [], []
        if self.core is not None:
            output = self.core.process(image)
            hands = [hand.raw.landmark for hand in output.hands]
            identities = [hand.id for hand in output.hands]
            worlds = [hand.landmark for hand in (output.raw_hands.multi_hand_world_landmarks or [])]
        elif self.legacy is not None:
            output = self.legacy.process(image)
            hands = [hand.landmark for hand in (output.multi_hand_landmarks or [])]
            worlds = [hand.landmark for hand in (getattr(output,"multi_hand_world_landmarks",None) or [])]
        else:
            timestamp = max(self.last_ts+1, int(time.monotonic()*1000))
            self.last_ts = timestamp
            data = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(image))
            output = self.landmarker.detect_for_video(data, timestamp)
            hands, worlds = output.hand_landmarks, output.hand_world_landmarks
        candidates = []
        for i, hand in enumerate(hands):
            points = np.array([[(1-p.x)*(w-1), p.y*(h-1), p.z*w] for p in hand], np.float32)
            if points.shape!=(21,3) or not np.isfinite(points).all():
                continue
            geometry = points
            if i<len(worlds) and len(worlds[i])==21:
                measured = np.array([[p.x*1000,p.y*1000,p.z*1000] for p in worlds[i]],np.float32)
                if np.isfinite(measured).all() and np.linalg.norm(measured[0]-measured[9])>1e-3:
                    geometry = measured
            candidates.append({"points":points,"geometry":geometry,"id":identities[i] if i<len(identities) else None})
        return self.choose(candidates, time.monotonic())

    def close(self):
        for tracker in (self.core, self.legacy, self.landmarker):
            if tracker is not None:
                tracker.close()



def try_open(index, width, height):
    # Use the default camera backend on both CodePad and desktop.
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
    for alt in (0, 1):
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
    ap.add_argument("--camera", type=int, default=0, help="camera index (default 0)")
    ap.add_argument("--width", type=int, default=640, help="requested capture width")
    ap.add_argument("--height", type=int, default=480, help="requested capture height")
    ap.add_argument("--hands", type=int, choices=(1,2), default=1, help="one hand is faster; two keeps identity across result order")
    ap.add_argument("--no-skeleton", action="store_true", help="hide the skeleton for a cleaner output")
    args = ap.parse_args()
    if not (320<=args.width<=1920 and 240<=args.height<=1080):
        ap.error("width must be 320..1920 and height 240..1080")

    cap = None
    tracker = None
    try:
        cap, first = open_camera(args.camera, args.width, args.height)
        tracker = HandTracker(args.hands)

        h, w = first.shape[:2]
        app = AirCanvas(w, h)
        app.show_skeleton = not args.no_skeleton
        setup_window(app)
        print("[Air Canvas] backend:", tracker.backend)
        print("[Air Canvas] running at %dx%d  -  press Q or Esc to quit" % (w, h))

        fps, t_prev, bad_reads = 0.0, time.monotonic(), 0
        frame = first
        while True:
            if frame is None:
                ok, frame = cap.read()
                if not ok or frame is None:
                    app.update(None, time.monotonic())
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
                tracker.reset_selection()

            pts = tracker.process(frame, w, h)
            now = time.monotonic()
            app.update(pts, now, tracker.geometry, tracker.switched)

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
                app.change_brush(2)
            elif key in (ord("-"), ord("_")):
                app.change_brush(-2)

            elif key in (ord("z"), ord("Z")):
                app.undo()
            elif key in (ord("y"), ord("Y")):
                app.redo()
            elif key in (ord("h"), ord("H")):
                app.show_skeleton = not app.show_skeleton

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