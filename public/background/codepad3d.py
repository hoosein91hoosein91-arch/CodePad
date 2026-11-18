"""codepad3d - real-time 3-D scenes from Python, inside CodePad (phone, tablet or PC).

    from codepad3d import Scene

    s = Scene("Hello 3D", sky="#0b1220", ground="#1c2a3a")
    cube = s.box(pos=(0, 1, -4), size=1.2, color="#ff4081")
    s.camera.mode = "orbit"                    # "orbit" (drag to look around), "fps" (WASD + mouse / touch sticks) or "manual"

    async def update(dt):                      # called ~60 times per second
        cube.rotate(y=90 * dt)                 # degrees

    await s.run(update)                        # runs until the viewer is closed

The scene is drawn by the bundled three.js in a full-screen viewer; Python only sends changes, so even a phone stays smooth.
Colours are CSS strings ("#rrggbb", "red", ...).  Rotations are degrees.  The y axis points up, -z is "forward" at the start.
"""
import asyncio
import json
import math
import time

try:                                    # only exists inside CodePad's Pyodide worker
    from js import BroadcastChannel
    from pyodide.ffi import create_proxy
except ImportError:                     # pragma: no cover
    BroadcastChannel = None
    create_proxy = None

__all__ = ["Scene", "Entity", "Camera", "color_rgb"]
_CH = "codepad3d"


def color_rgb(r, g, b):
    """Make a colour string from 0-255 numbers."""
    return "#%02x%02x%02x" % (max(0, min(255, int(r))), max(0, min(255, int(g))), max(0, min(255, int(b))))


def _vec(v, n=3, default=0.0):
    if isinstance(v, (int, float)):
        return [float(v)] * n
    v = list(v)
    return [float(x) for x in (v + [default] * n)[:n]]


class Entity:
    """One object in the scene.  Change its attributes and the viewer follows."""

    def __init__(self, scene, eid, kind, props):
        self.__dict__["_scene"] = scene
        self.__dict__["id"] = eid
        self.__dict__["kind"] = kind
        self.__dict__["_p"] = dict(props)
        self.__dict__["_dirty"] = {}
        self.__dict__["removed"] = False
        self.__dict__["name"] = props.get("name", "")

    # -- properties sent to the viewer -------------------------------------------------------------------------
    _VEC = ("pos", "rot", "scale")

    def __getattr__(self, key):
        p = self.__dict__["_p"]
        if key in p:
            return tuple(p[key]) if isinstance(p[key], list) else p[key]
        if key in ("x", "y", "z"):
            return p["pos"]["xyz".index(key)]
        raise AttributeError(key)

    def __setattr__(self, key, value):
        if key in self._VEC:
            value = _vec(value, 3, 1.0 if key == "scale" else 0.0)
        elif key in ("x", "y", "z"):
            pos = list(self.__dict__["_p"]["pos"])
            pos["xyz".index(key)] = float(value)
            key, value = "pos", pos
        elif key in ("color", "text", "visible", "opacity", "solid", "name"):
            pass
        else:
            self.__dict__[key] = value
            return
        self.__dict__["_p"][key] = value
        self.__dict__["_dirty"][key] = value
        self._scene._touch(self)

    def move(self, x=0.0, y=0.0, z=0.0):
        p = self._p["pos"]
        self.pos = (p[0] + x, p[1] + y, p[2] + z)

    def rotate(self, x=0.0, y=0.0, z=0.0):
        r = self._p["rot"]
        self.rot = (r[0] + x, r[1] + y, r[2] + z)

    def distance_to(self, other):
        a = self._p["pos"]
        b = other._p["pos"] if isinstance(other, Entity) else _vec(other)
        return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))

    def remove(self):
        if not self.removed:
            self.__dict__["removed"] = True
            self._scene._remove(self)

    def __repr__(self):
        return "<%s #%d %s>" % (self.kind, self.id, tuple(round(v, 2) for v in self._p["pos"]))


class Camera:
    """mode: "orbit" | "fps" | "manual".   In fps mode the viewer moves the camera (WASD, mouse or touch sticks, Space = jump)."""

    def __init__(self, scene):
        self.__dict__["_scene"] = scene
        self.__dict__["_p"] = {"mode": "orbit", "pos": [0.0, 3.0, 8.0], "target": [0.0, 1.0, 0.0], "fov": 70.0, "speed": 4.5, "gravity": 22.0, "jump": 7.4, "height": 1.7, "yaw": 0.0, "pitch": 0.0}
        self.__dict__["_live"] = {"pos": (0.0, 3.0, 8.0), "yaw": 0.0, "pitch": 0.0}      # live values in degrees, reported by the viewer

    def __getattr__(self, key):
        if key == "pos":
            return tuple(self._live["pos"])
        if key in ("yaw", "pitch"):
            return self._live[key]                 # degrees: yaw 0 = looking along -z, positive = turn left; pitch positive = look up
        if key in self._p:
            v = self._p[key]
            return tuple(v) if isinstance(v, list) else v
        raise AttributeError(key)

    def __setattr__(self, key, value):
        if key in ("pos", "target"):
            value = _vec(value)
        elif key == "mode" and value not in ("orbit", "fps", "manual"):
            raise ValueError('camera.mode must be "orbit", "fps" or "manual"')
        elif key not in self._p:
            raise AttributeError(key)
        self._p[key] = value
        if key == "pos":
            self._live["pos"] = tuple(value)
        elif key in ("yaw", "pitch"):
            value = float(value)
            self._live[key] = value
        self._scene._cam_dirty[key] = value

    def look_at(self, x, y=None, z=None):
        self.target = x if y is None else (x, y, z)

    def forward(self):
        """Unit vector the camera looks along (fps mode)."""
        yaw, pitch = math.radians(self._live["yaw"]), math.radians(self._live["pitch"])
        return (-math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch))


class Scene:
    def __init__(self, title="Python 3D", sky="#0b1220", ground="#18222f", fog=0.0, grid=False, shadows=False, hud_font=15):
        if BroadcastChannel is None:
            raise RuntimeError("codepad3d works inside CodePad (Python on WebAssembly).  Open the program in CodePad and press Run.")
        self._ch = BroadcastChannel.new(_CH)
        self._proxy = create_proxy(self._on_message)
        self._ch.onmessage = self._proxy
        self._next = 1
        self._ents = {}
        self._ops = []
        self._cam_dirty = {}
        self._hud = None
        self._handlers = {"click": [], "key": []}
        self.camera = Camera(self)
        self.keys = set()               # names of keys held right now: "w", "a", "s", "d", "space", "shift", "up", ...
        self.mouse = (0.0, 0.0)         # mouse movement since the previous frame (pixels)
        self.joy = (0.0, 0.0)           # touch joystick, each -1..1 (x right, y forward)
        self.closed = False
        self.ready = False
        self._error = None
        self._started = False
        self._last_hb = 0.0
        self._pending = {}
        self._send({"t": "open", "title": str(title), "sky": sky, "ground": ground, "fog": float(fog), "grid": bool(grid), "shadows": bool(shadows),
                    "hud_font": int(hud_font)})
        self._send({"t": "cam", "p": dict(self.camera._p)})

    # -- messaging ---------------------------------------------------------------------------------------------------
    def _send(self, msg):
        msg["from"] = "py"
        try:
            self._ch.postMessage(json.dumps(msg))
        except Exception:
            self.closed = True

    def _on_message(self, event):
        try:
            d = json.loads(event.data)
        except Exception:
            return
        if d.get("from") != "ui":
            return
        t = d.get("t")
        if t == "ready":
            self.ready = True
        elif t == "state":
            self.keys = set(d.get("keys", ()))
            m = d.get("mouse", (0, 0))
            self.mouse = (self.mouse[0] + m[0], self.mouse[1] + m[1])
            self.joy = tuple(d.get("joy", (0, 0)))
            cam = d.get("cam")
            if cam:
                self.camera._live["pos"] = tuple(cam[:3])
                self.camera._live["yaw"], self.camera._live["pitch"] = math.degrees(cam[3]), math.degrees(cam[4])
        elif t == "click":
            ent = self._ents.get(d.get("id"))
            info = {"entity": ent, "point": tuple(d.get("pt", (0, 0, 0))), "normal": tuple(d.get("n", (0, 1, 0))), "button": d.get("button", 0)}
            for fn in list(self._handlers["click"]):
                self._call(fn, info)
        elif t == "key":
            for fn in list(self._handlers["key"]):
                self._call(fn, d.get("k"), bool(d.get("down")))
        elif t == "closed":
            self.closed = True
        elif t == "error":
            self._error = str(d.get("msg") or "unknown viewer error")

    def _call(self, fn, *args):
        try:
            r = fn(*args)
            if asyncio.iscoroutine(r):
                asyncio.ensure_future(r)
        except Exception as exc:            # a bug in the user's handler must not kill the viewer loop
            print("codepad3d: error in handler:", repr(exc))

    def on(self, event, fn=None):
        """scene.on("click", fn)  - fn(info) with info["entity"], ["point"], ["normal"];  scene.on("key", fn) - fn(key, down).  Usable as a decorator."""
        if event not in self._handlers:
            raise ValueError("events: " + ", ".join(self._handlers))
        if fn is None:
            return lambda f: (self._handlers[event].append(f), f)[1]
        self._handlers[event].append(fn)
        return fn

    # -- building the scene -----------------------------------------------------------------------------------------------
    def _add(self, kind, props):
        eid = self._next
        self._next += 1
        base = {"pos": [0.0, 0.0, 0.0], "rot": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0], "color": "#cccccc", "visible": True, "opacity": 1.0, "solid": False}
        base.update(props)
        e = Entity(self, eid, kind, base)
        self._ents[eid] = e
        self._ops.append({"op": "add", "id": eid, "k": kind, "p": base})
        return e

    def _touch(self, e):
        d = e.__dict__["_dirty"]
        if d:
            self._pending.setdefault(e.id, {}).update(d)
            d.clear()

    def _remove(self, e):
        self._ents.pop(e.id, None)
        self._pending.pop(e.id, None)
        self._ops.append({"op": "del", "id": e.id})

    def _opts(self, kw):
        out = {}
        for k in ("pos", "rot", "scale"):
            if k in kw:
                out[k] = _vec(kw.pop(k), 3, 1.0 if k == "scale" else 0.0)
        out.update(kw)
        return out

    def box(self, size=1.0, **kw):
        return self._add("box", dict(self._opts(kw), size=_vec(size)))

    def sphere(self, r=0.5, **kw):
        return self._add("sphere", dict(self._opts(kw), r=float(r)))

    def cylinder(self, r=0.5, h=1.0, **kw):
        return self._add("cylinder", dict(self._opts(kw), r=float(r), h=float(h)))

    def cone(self, r=0.5, h=1.0, **kw):
        return self._add("cone", dict(self._opts(kw), r=float(r), h=float(h)))

    def torus(self, r=0.6, tube=0.2, **kw):
        return self._add("torus", dict(self._opts(kw), r=float(r), tube=float(tube)))

    def plane(self, size=(10, 10), **kw):
        """A flat rectangle lying on the ground (size = width, depth)."""
        return self._add("plane", dict(self._opts(kw), size=_vec(size, 2)))

    def text(self, text, size=0.5, **kw):
        """Floating text that always faces the camera."""
        return self._add("text", dict(self._opts(kw), text=str(text), size=float(size)))

    def light(self, pos=(5, 8, 4), color="#ffffff", intensity=1.0):
        return self._add("light", {"pos": _vec(pos), "color": color, "intensity": float(intensity)})

    def hud(self, *lines):
        """Text lines drawn on the screen (score, hints ...)."""
        self._hud = [str(x) for x in lines]

    def clear(self):
        for e in list(self._ents.values()):
            e.remove()

    def entities(self):
        return list(self._ents.values())

    def close(self):
        self._send({"t": "close"})
        self.closed = True

    # -- the loop ---------------------------------------------------------------------------------------------------------------
    def _flush(self):
        ops, self._ops = self._ops, []
        for eid, p in self._pending.items():
            ops.append({"op": "set", "id": eid, "p": p})
        self._pending = {}
        if self._cam_dirty:
            ops.append({"op": "cam", "p": dict(self._cam_dirty)})
            self._cam_dirty = {}
        if self._hud is not None:
            ops.append({"op": "hud", "lines": self._hud})
            self._hud = None
        now = time.perf_counter()
        if ops or now - self._last_hb > 0.8:
            self._last_hb = now
            self._send({"t": "frame", "ops": ops})

    async def wait_ready(self, timeout=45.0):
        t0 = time.perf_counter()
        while not self.ready and not self.closed:
            if self._error:
                raise RuntimeError("3D viewer error: " + self._error)
            if time.perf_counter() - t0 > timeout:
                raise RuntimeError("The 3D viewer did not open within %d s. Is this program running inside CodePad? "
                                   "Run the 3D self-test in Hub > 3D to see what this device lacks." % int(timeout))
            await asyncio.sleep(0.05)
        if self._error and not self.ready:
            raise RuntimeError("3D viewer error: " + self._error)

    async def run(self, update=None, fps=60):
        """Drive the scene.  `update(dt)` may be a normal function or `async def`.  Returns when the viewer is closed."""
        await self.wait_ready()
        self._started = True
        period = 1.0 / max(5, min(120, fps))
        last = time.perf_counter()
        try:
            while not self.closed:
                if self._error:
                    raise RuntimeError("3D viewer error: " + self._error)
                now = time.perf_counter()
                dt = min(0.1, now - last)
                last = now
                if update is not None:
                    r = update(dt)
                    if asyncio.iscoroutine(r):
                        await r
                self.mouse = (0.0, 0.0)          # per-frame movement: consumed after update() saw it
                self._flush()
                await asyncio.sleep(max(0.0, period - (time.perf_counter() - now)))
        finally:
            self._send({"t": "close"})
            try:
                self._ch.close()
            except Exception:
                pass
