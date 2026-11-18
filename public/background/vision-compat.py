"""CodePad's documented browser compatibility profile, not native package replacements.

The submitted program is executed verbatim. JSPI suspends synchronous calls;
cooperative Thread targets share the same Python globals. Only APIs below are
supported. NumPy is the actual upstream Pyodide package.
"""
import sys
import types
import math
import time
import threading
import numpy as np
from pyodide.ffi import run_sync, to_js
from js import _codepad_vision as bridge


def _module(name):
    value = types.ModuleType(name)
    sys.modules[name] = value
    return value


def _sleep(seconds):
    if seconds < 0:
        raise ValueError('sleep length must be non-negative')
    run_sync(bridge.sleep(float(seconds)))
    bridge.check_error()


class _Thread:
    def __init__(self, group=None, target=None, name=None, args=(), kwargs=None, *, daemon=None):
        self.target, self.args, self.kwargs = target, args, kwargs or {}
        self.daemon, self.name, self._started = daemon, name, False
        self._promise = None

    def start(self):
        if self._started:
            raise RuntimeError('threads can only be started once')
        self._started = True
        self._promise = bridge.start_thread(lambda: self.target(*self.args, **self.kwargs))

    def join(self, timeout=None):
        if not self._started:
            raise RuntimeError('cannot join thread before it is started')
        run_sync(bridge.join_thread(self._promise, timeout))

    def is_alive(self):
        return bool(self._promise and bridge.thread_alive(self._promise))


# Keep real Lock/RLock: this profile yields only at explicit blocking calls.
threading.Thread = _Thread
time.sleep = _sleep

cv2 = _module('cv2')
cv2.__version__ = 'codepad-vision-1 (compatibility profile)'
cv2.FONT_HERSHEY_SIMPLEX = 0
cv2.LINE_AA = 16
cv2.CAP_ANY = 0
cv2.CAP_DSHOW = 700
cv2.CAP_MSMF = 1400
cv2.CAP_PROP_FRAME_WIDTH = 3
cv2.CAP_PROP_FRAME_HEIGHT = 4
cv2.COLOR_BGR2RGB = cv2.COLOR_RGB2BGR = 4
cv2.COLOR_BGR2GRAY = 6
cv2.COLOR_GRAY2BGR = 8
_last_landmarks = []


class _CameraImage(np.ndarray):
    def __array_finalize__(self, original):
        self.landmarks = getattr(original, 'landmarks', [])
        self.handedness = getattr(original, 'handedness', [])
        self.world_landmarks = getattr(original, 'world_landmarks', [])
        self.pose_landmarks = getattr(original, 'pose_landmarks', [])
        self.pose_world_landmarks = getattr(original, 'pose_world_landmarks', [])
        self.timestamp = getattr(original, 'timestamp', 0)
        self.flip_x = getattr(original, 'flip_x', False)
        self.flip_y = getattr(original, 'flip_y', False)
        self.camera_shape = getattr(original, 'camera_shape', None)


class VideoCapture:
    def __init__(self, index=0, apiPreference=0, *args):
        if apiPreference != cv2.CAP_ANY or args:
            raise NotImplementedError("CodePad cameras support CAP_ANY; desktop-specific backends are unavailable.")
        if index not in (0, 1):
            raise NotImplementedError('CodePad Vision supports camera 0 (front) or 1 (back).')
        self.opened = False
        self.width, self.height = 480, 360
        run_sync(bridge.open_camera(int(index)))
        self.opened = True

    def isOpened(self):
        return self.opened

    def set(self, prop, value):
        if prop == cv2.CAP_PROP_FRAME_WIDTH:
            self.width = max(16, min(1920, int(value)))
        elif prop == cv2.CAP_PROP_FRAME_HEIGHT:
            self.height = max(16, min(1080, int(value)))
        else:
            return False
        bridge.camera_size(self.width, self.height)
        return True

    def get(self, prop):
        return self.width if prop == 3 else self.height if prop == 4 else 0

    def read(self):
        global _last_landmarks
        if not self.opened:
            return False, None
        frame = run_sync(bridge.next_frame())
        if frame is None:
            return False, None
        self.width, self.height = int(frame.width), int(frame.height)
        _last_landmarks = frame.landmarks.to_py()
        image = np.empty((self.height, self.width, 3), dtype=np.uint8).view(_CameraImage)
        bridge.camera_pixels(frame.rgba, image)
        image.landmarks = _last_landmarks
        image.handedness = frame.handedness.to_py() if hasattr(frame, 'handedness') else []
        image.world_landmarks = frame.worldLandmarks.to_py() if hasattr(frame, 'worldLandmarks') else []
        image.pose_landmarks = frame.poseLandmarks.to_py() if hasattr(frame, 'poseLandmarks') else []
        image.pose_world_landmarks = frame.poseWorldLandmarks.to_py() if hasattr(frame, 'poseWorldLandmarks') else []
        image.timestamp = float(frame.timestamp) / 1000 if hasattr(frame, 'timestamp') else 0
        image.camera_shape = image.shape[:2]
        return True, image

    def release(self):
        if self.opened:
            bridge.close_camera()
        self.opened = False


def flip(image, flipCode):
    if flipCode not in (-1, 0, 1):
        raise ValueError('Unsupported flipCode')
    output = image[::(-1 if flipCode in (-1, 0) else 1), ::(-1 if flipCode in (-1, 1) else 1)].copy()
    if isinstance(output, _CameraImage):
        output.flip_x ^= flipCode in (-1, 1)
        output.flip_y ^= flipCode in (-1, 0)
    return output


def cvtColor(image, code):
    if code == cv2.COLOR_BGR2RGB:
        return image[:, :, ::-1].copy()
    if code == cv2.COLOR_BGR2GRAY:
        if image.dtype == np.uint8 and image.ndim == 3 and image.shape[2] == 3:
            output = np.empty(image.shape[:2], dtype=np.uint8)
            bridge.image_op('gray', np.ascontiguousarray(image), None, output, None, 3)
            return output
        return np.rint(image[..., 0]*0.114 + image[..., 1]*0.587 + image[..., 2]*0.299).astype(np.uint8)
    if code == cv2.COLOR_GRAY2BGR:
        return np.repeat(image[..., None], 3, axis=2)
    raise NotImplementedError('Supported conversions: BGR/RGB, BGR2GRAY and GRAY2BGR.')



_text_masks = {}

def putText(image, text, org, fontFace, fontScale, color, thickness=1, lineType=8, bottomLeftOrigin=False):
    # Canvas rasterization keeps the OpenCV baseline/scale convention; it does
    # not claim byte-identical Hershey glyphs or antialiasing.
    if fontFace != cv2.FONT_HERSHEY_SIMPLEX:
        raise NotImplementedError('This profile supports FONT_HERSHEY_SIMPLEX.')
    key = (str(text), float(fontScale), int(thickness))
    cached = _text_masks.get(key)
    if cached is None:
        mask = bridge.text_mask(*key)
        alpha = np.frombuffer(mask.data.to_py(), dtype=np.uint8).reshape(int(mask.height), int(mask.width), 4)[:, :, 3] > 20
        cached = (alpha, int(mask.baseline))
        if len(_text_masks) >= 64:
            del _text_masks[next(iter(_text_masks))]
        _text_masks[key] = cached
    alpha, baseline = cached
    x, y = int(org[0]), int(org[1]) - baseline
    h, w = image.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(w, x + alpha.shape[1]), min(h, y + alpha.shape[0])
    if x1 > x0 and y1 > y0:
        visible = alpha[y0-y:y1-y, x0-x:x1-x]
        image[y0:y1, x0:x1][visible] = color
    return image


def imshow(name, frame):
    if frame.dtype != np.uint8:
        raise TypeError('CodePad imshow currently requires uint8 images.')
    if frame.ndim == 2:
        frame = cvtColor(frame, cv2.COLOR_GRAY2BGR)
    if frame.ndim != 3 or frame.shape[2] != 3:
        raise ValueError('imshow requires an H×W×3 BGR image.')
    run_sync(bridge.monitor(str(name), np.ascontiguousarray(frame), frame.shape[1], frame.shape[0]))


def waitKey(delay=0):
    _sleep(max(0.001, delay / 1000))
    return int(bridge.take_key())


cv2.VideoCapture = VideoCapture
cv2.flip, cv2.cvtColor, cv2.putText = flip, cvtColor, putText
cv2.imshow, cv2.waitKey = imshow, waitKey
cv2.destroyAllWindows = lambda: bridge.close_monitor()

mp = _module('mediapipe')
mp.__version__ = 'codepad-vision-1 (MediaPipe Tasks Web backend)'
mp.solutions = types.SimpleNamespace()
_connections = [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),(5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),(13,17),(0,17),(17,18),(18,19),(19,20)]


class Hands:
    def __init__(self, static_image_mode=False, max_num_hands=2, model_complexity=1, min_detection_confidence=0.5, min_tracking_confidence=0.5):
        if static_image_mode:
            raise NotImplementedError('CodePad Vision currently supports the live-camera Hands profile.')
        bridge.hand_options(int(max_num_hands), float(min_detection_confidence), float(min_tracking_confidence))

    def process(self, image):
        if not isinstance(image, _CameraImage) or image.shape[:2] != image.camera_shape:
            raise NotImplementedError('Hands.process supports VideoCapture frames with flip/cvtColor; arbitrary images are not supported.')
        hands = [types.SimpleNamespace(landmark=[types.SimpleNamespace(x=1-p['x'] if image.flip_x else p['x'], y=1-p['y'] if image.flip_y else p['y'], z=p['z']) for p in hand]) for hand in image.landmarks]
        handedness = []
        for categories in image.handedness:
            if not categories:
                break
            category = categories[0]
            label = category.get('categoryName', category.get('displayName', ''))
            if label not in ('Left', 'Right'):
                break
            # Tasks uses unmirrored handedness. Legacy solutions.hands uses a
            # mirrored-input convention. Each reflected axis swaps handedness.
            if not (image.flip_x ^ image.flip_y):
                label = 'Right' if label == 'Left' else 'Left'
            handedness.append(types.SimpleNamespace(classification=[types.SimpleNamespace(label=label, score=category['score'], index=1 if label=='Right' else 0)]))
        world = [types.SimpleNamespace(landmark=[types.SimpleNamespace(**p) for p in hand]) for hand in image.world_landmarks if len(hand)==21]
        return types.SimpleNamespace(multi_hand_landmarks=hands or None, multi_handedness=handedness if len(handedness)==len(hands) and hands else None, multi_hand_world_landmarks=world or None)

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def draw_landmarks(image, hand, connections, *args, **kwargs):
    h, w = image.shape[:2]
    points = [(int(p.x * w), int(p.y * h)) for p in hand.landmark]
    for a, b in connections:
        if getattr(hand.landmark[a], 'visibility', 1)<0.5 or getattr(hand.landmark[b], 'visibility', 1)<0.5: continue
        x0, y0 = points[a]
        x1, y1 = points[b]
        steps = max(1, abs(x1-x0), abs(y1-y0))
        xs = np.linspace(x0, x1, steps+1).astype(int)
        ys = np.linspace(y0, y1, steps+1).astype(int)
        valid = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
        image[ys[valid], xs[valid]] = (0, 220, 0)
    for i, (x, y) in enumerate(points):
        if getattr(hand.landmark[i], 'visibility', 1)<0.5 or not (0<=x<w and 0<=y<h): continue
        image[max(0,y-2):min(h,y+3), max(0,x-2):min(w,x+3)] = (0, 0, 255)


mp.solutions.hands = types.SimpleNamespace(Hands=Hands, HAND_CONNECTIONS=frozenset(_connections))
mp.solutions.drawing_utils = types.SimpleNamespace(draw_landmarks=draw_landmarks)

pygame = _module('pygame')
pygame.locals = _module('pygame.locals')
_constants = dict(QUIT=256, KEYDOWN=768, K_ESCAPE=27, DOUBLEBUF=1073741824, OPENGL=2)
for _name, _value in _constants.items():
    setattr(pygame, _name, _value)
    setattr(pygame.locals, _name, _value)
pygame.locals.__all__ = list(_constants)
pygame.init = lambda: (1, 0)
pygame.quit = lambda: bridge.end_display()
pygame.display = types.SimpleNamespace(
    set_mode=lambda size, flags=0: bridge.display_size(int(size[0]), int(size[1])),
    set_caption=lambda title, *args: bridge.caption(str(title)),
    flip=lambda: _present(),
)
pygame.event = types.SimpleNamespace(
    pump=lambda: bridge.check_error(),
    get=lambda: [types.SimpleNamespace(**e) for e in bridge.events().to_py()],
)


class Clock:
    def __init__(self):
        self.last = time.perf_counter()

    def tick(self, framerate=0):
        now = time.perf_counter()
        _sleep(max(0.001, (1 / framerate if framerate else 0) - (now-self.last)))
        elapsed = time.perf_counter()-self.last
        self.last = time.perf_counter()
        return int(elapsed*1000)


pygame.time = types.SimpleNamespace(Clock=Clock)
_opengl = _module('OpenGL')
gl = _module('OpenGL.GL')
glu = _module('OpenGL.GLU')
_opengl.GL, _opengl.GLU = gl, glu
_gl_constants = dict(GL_PROJECTION=5889, GL_MODELVIEW=5888, GL_DEPTH_TEST=2929, GL_COLOR_BUFFER_BIT=16384, GL_DEPTH_BUFFER_BIT=256, GL_BLEND=3042, GL_SRC_ALPHA=770, GL_ONE_MINUS_SRC_ALPHA=771, GL_POINTS=0)
for _name, _value in _gl_constants.items():
    setattr(gl, _name, _value)
_matrix_mode = gl.GL_MODELVIEW
_matrices = {gl.GL_MODELVIEW: np.eye(4, dtype=np.float32), gl.GL_PROJECTION: np.eye(4, dtype=np.float32)}
_color, _clear, _point_size = (1,1,1,1), (0,0,0,1), 1
_vertices, _colors = [], []
_depth, _blend = False, False


def glMatrixMode(mode):
    global _matrix_mode
    if mode not in _matrices:
        raise NotImplementedError('Only projection and modelview matrices are supported.')
    _matrix_mode = mode


def glLoadIdentity():
    _matrices[_matrix_mode] = np.eye(4, dtype=np.float32)


def glTranslatef(x,y,z):
    matrix = np.eye(4, dtype=np.float32)
    matrix[:3,3] = (x,y,z)
    _matrices[_matrix_mode] = _matrices[_matrix_mode] @ matrix


def glRotatef(angle,x,y,z):
    axis = np.array([x,y,z], dtype=np.float32)
    length = np.linalg.norm(axis)
    if not length:
        return
    x,y,z = axis/length
    c,s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    t = 1-c
    matrix = np.array([[t*x*x+c,t*x*y-s*z,t*x*z+s*y,0],[t*x*y+s*z,t*y*y+c,t*y*z-s*x,0],[t*x*z-s*y,t*y*z+s*x,t*z*z+c,0],[0,0,0,1]],dtype=np.float32)
    _matrices[_matrix_mode] = _matrices[_matrix_mode] @ matrix


def gluPerspective(fov,aspect,near,far):
    f = 1 / math.tan(math.radians(fov)/2)
    matrix = np.array([[f/aspect,0,0,0],[0,f,0,0],[0,0,(far+near)/(near-far),2*far*near/(near-far)],[0,0,-1,0]],dtype=np.float32)
    _matrices[_matrix_mode] = _matrices[_matrix_mode] @ matrix


def glClearColor(r,g,b,a):
    global _clear
    _clear = (r,g,b,a)


def glClear(mask):
    _vertices.clear()
    _colors.clear()


def glEnable(flag):
    global _depth, _blend
    if flag == gl.GL_DEPTH_TEST:
        _depth = True
    elif flag == gl.GL_BLEND:
        _blend = True
    else:
        raise NotImplementedError('Unsupported OpenGL capability')


def glBlendFunc(source,dest):
    if (source,dest) != (gl.GL_SRC_ALPHA,gl.GL_ONE_MINUS_SRC_ALPHA):
        raise NotImplementedError('Only SRC_ALPHA / ONE_MINUS_SRC_ALPHA blending is supported.')


def glPointSize(size):
    global _point_size
    _point_size = float(size)


def glBegin(mode):
    if mode != gl.GL_POINTS:
        raise NotImplementedError('This profile implements GL_POINTS.')


def glColor4f(r,g,b,a):
    global _color
    _color = (r,g,b,a)


def glVertex3f(x,y,z):
    _vertices.append((x,y,z))
    _colors.append(_color)


def _present():
    bridge.check_error()
    if not _vertices:
        return
    data = np.concatenate((np.asarray(_vertices,dtype=np.float32),np.asarray(_colors,dtype=np.float32)),axis=1)
    bridge.render(to_js(bytearray(data.tobytes())), to_js(bytearray(_matrices[gl.GL_PROJECTION].T.tobytes())), to_js(bytearray(_matrices[gl.GL_MODELVIEW].T.tobytes())), _point_size, to_js(_clear), _depth, _blend)


for _name in ['glMatrixMode','glLoadIdentity','glTranslatef','glRotatef','glClearColor','glClear','glEnable','glBlendFunc','glPointSize','glBegin','glColor4f','glVertex3f']:
    setattr(gl, _name, globals()[_name])
gl.glEnd = lambda: None
gl.__all__ = list(_gl_constants) + [name for name in dir(gl) if name.startswith('gl')]
glu.gluPerspective = gluPerspective
glu.__all__ = ['gluPerspective']

# Basic camera drawing tools. Rasterization is not OpenCV's exact antialiasing.
def circle(image, center, radius, color, thickness=1, lineType=8, shift=0):
    if shift:
        raise NotImplementedError('Fixed-point coordinates are not supported.')
    x, y = map(int, center)
    radius, thickness = int(radius), int(thickness)
    if radius < 0:
        raise ValueError('radius must be non-negative')
    outer = radius + (max(1, thickness)//2 if thickness >= 0 else 0)
    x0, x1 = max(0, x-outer-1), min(image.shape[1], x+outer+2)
    y0, y1 = max(0, y-outer-1), min(image.shape[0], y+outer+2)
    if x0 >= x1 or y0 >= y1:
        return image
    yy, xx = np.ogrid[y0:y1, x0:x1]
    distance = (xx-x)**2 + (yy-y)**2
    mask = distance <= outer**2
    if thickness >= 0:
        mask &= distance >= max(0, radius-(max(1, thickness)+1)//2)**2
    image[y0:y1, x0:x1][mask] = color
    return image


def line(image, pt1, pt2, color, thickness=1, lineType=8, shift=0):
    if shift or thickness < 1:
        raise ValueError('line requires integer coordinates and positive thickness')
    x0, y0 = map(int, pt1)
    x1, y1 = map(int, pt2)
    if thickness == 1 and y0 == y1:
        left, right = max(0, min(x0, x1)), min(image.shape[1], max(x0, x1)+1)
        if 0 <= y0 < image.shape[0] and left < right:
            image[y0, left:right] = color
        return image
    if thickness == 1 and x0 == x1:
        top, bottom = max(0, min(y0, y1)), min(image.shape[0], max(y0, y1)+1)
        if 0 <= x0 < image.shape[1] and top < bottom:
            image[top:bottom, x0] = color
        return image
    radius = max(0.5, thickness/2)
    left, right = max(0, int(min(x0,x1)-radius)), min(image.shape[1], int(max(x0,x1)+radius)+1)
    top, bottom = max(0, int(min(y0,y1)-radius)), min(image.shape[0], int(max(y0,y1)+radius)+1)
    if left >= right or top >= bottom:
        return image
    yy, xx = np.ogrid[top:bottom, left:right]
    dx, dy = x1-x0, y1-y0
    ratio = np.clip(((xx-x0)*dx + (yy-y0)*dy)/max(1, dx*dx+dy*dy), 0, 1)
    mask = (xx-x0-ratio*dx)**2 + (yy-y0-ratio*dy)**2 <= radius**2
    image[top:bottom, left:right][mask] = color
    return image


def rectangle(image, pt1, pt2, color, thickness=1, lineType=8, shift=0):
    if shift:
        raise NotImplementedError('Fixed-point coordinates are not supported.')
    x0, x1 = sorted((int(pt1[0]), int(pt2[0])))
    y0, y1 = sorted((int(pt1[1]), int(pt2[1])))
    if thickness < 0:
        left, right = max(0,x0), min(image.shape[1],x1+1)
        top, bottom = max(0,y0), min(image.shape[0],y1+1)
        if left < right and top < bottom:
            image[top:bottom, left:right] = color
    else:
        for a,b in [((x0,y0),(x1,y0)),((x1,y0),(x1,y1)),((x1,y1),(x0,y1)),((x0,y1),(x0,y0))]:
            line(image,a,b,color,thickness)
    return image


def addWeighted(src1, alpha, src2, beta, gamma, dst=None, dtype=-1):
    if dtype != -1:
        raise NotImplementedError('Explicit output depth is not supported.')
    if src1.dtype == np.uint8 and src2.dtype == np.uint8 and src1.shape == src2.shape:
        return _kernel('weighted', src1, src2, dst, None, alpha, beta, gamma)
    result = np.clip(np.rint(src1.astype(float)*alpha + src2.astype(float)*beta + gamma), 0, 255).astype(np.uint8)
    if dst is not None:
        dst[...] = result
        return dst
    return result

cv2.circle, cv2.line, cv2.rectangle, cv2.addWeighted = circle, line, rectangle, addWeighted

# Core uint8 image operations used by camera compositing programs.
cv2.THRESH_BINARY, cv2.THRESH_BINARY_INV = 0, 1
cv2.THRESH_TRUNC, cv2.THRESH_TOZERO, cv2.THRESH_TOZERO_INV = 2, 3, 4


def _u8_image(src):
    array = np.asarray(src)
    if array.dtype != np.uint8 or array.ndim not in (2, 3):
        raise TypeError('CodePad image operations currently require uint8 HxW or HxWxC arrays.')
    return array


def _image_result(value, dst=None, mask=None):
    if dst is not None:
        if not isinstance(dst, np.ndarray) or dst.dtype != value.dtype or dst.shape != value.shape:
            raise ValueError('dst must have the same shape and dtype as the output image.')
        output = dst
    else:
        output = np.zeros_like(value) if mask is not None else value
    if mask is None:
        if dst is not None:
            output[...] = value
    else:
        mask = np.asarray(mask)
        if mask.dtype not in (np.dtype('uint8'), np.dtype('int8')) or mask.shape != value.shape[:2]:
            raise ValueError('mask must be a single-channel uint8/int8 image of matching height and width.')
        output[mask != 0] = value[mask != 0]
    return output


def threshold(src, thresh, maxval, type, dst=None):
    src = _u8_image(src)
    if type not in range(5):
        raise NotImplementedError('Supported threshold modes: BINARY, BINARY_INV, TRUNC, TOZERO and TOZERO_INV; automatic thresholds are not supported.')
    if not math.isfinite(thresh) or not math.isfinite(maxval):
        raise ValueError('threshold and maxval must be finite')
    level = math.floor(thresh)
    high = max(0, min(255, round(maxval)))
    return float(level), _kernel('threshold', src, None, dst, None, type, level, high)


def _binary_images(src1, src2):
    left, right = _u8_image(src1), _u8_image(src2)
    if left.shape != right.shape:
        raise ValueError('Input images must have the same shape.')
    return left, right


def _kernel(operation, src, other=None, dst=None, mask=None, a=0, b=0, c=0):
    src = _u8_image(src)
    if dst is not None and (not isinstance(dst, np.ndarray) or dst.dtype != src.dtype or dst.shape != src.shape):
        raise ValueError('dst must have the same shape and dtype as the output image.')
    if dst is not None and not dst.flags.writeable:
        raise ValueError('dst is read-only.')
    if mask is not None:
        mask = np.asarray(mask)
        if mask.dtype not in (np.dtype('uint8'), np.dtype('int8')) or mask.shape != src.shape[:2]:
            raise ValueError('mask must be a single-channel uint8/int8 image of matching height and width.')
        mask = np.ascontiguousarray(mask).view(np.uint8)
    output = dst if dst is not None else (np.zeros_like(src) if mask is not None else np.empty_like(src))
    contiguous = output if output.flags.c_contiguous else np.ascontiguousarray(output)
    source = np.ascontiguousarray(src)
    second = None if other is None else np.ascontiguousarray(other)
    # Exact in-place calls are safe; shifted overlapping slices need a snapshot.
    if np.shares_memory(source, contiguous) and source.ctypes.data != contiguous.ctypes.data:
        source = source.copy()
    if second is not None and np.shares_memory(second, contiguous) and second.ctypes.data != contiguous.ctypes.data:
        second = second.copy()
    if mask is not None and np.shares_memory(mask, contiguous):
        mask = mask.copy()
    bridge.image_op(operation, source, second, contiguous, mask, 1 if src.ndim == 2 else src.shape[2], a, b, c)
    if contiguous is not output:
        output[...] = contiguous
    return output


def bitwise_and(src1, src2, dst=None, mask=None):
    left, right = _binary_images(src1, src2)
    return _kernel('and', left, right, dst, mask)


def bitwise_or(src1, src2, dst=None, mask=None):
    left, right = _binary_images(src1, src2)
    return _kernel('or', left, right, dst, mask)


def bitwise_xor(src1, src2, dst=None, mask=None):
    left, right = _binary_images(src1, src2)
    return _kernel('xor', left, right, dst, mask)


def bitwise_not(src, dst=None, mask=None):
    return _kernel('not', src, None, dst, mask)


def add(src1, src2, dst=None, mask=None, dtype=-1):
    if dtype != -1:
        raise NotImplementedError('Explicit output depth is not supported.')
    left, right = _binary_images(src1, src2)
    return _kernel('add', left, right, dst, mask)


def _encode_png(img, params=None):
    import struct
    import zlib
    image = _u8_image(img)
    if params:
        raise NotImplementedError('PNG encoder parameters are not supported.')
    height, width = image.shape[:2]
    if not height or not width:
        raise ValueError('Cannot save an empty image.')
    channels = 1 if image.ndim == 2 else image.shape[2]
    if channels == 1:
        pixels, color_type = image.reshape(height, width), 0
    elif channels == 3:
        pixels, color_type = image[:, :, ::-1], 2
    elif channels == 4:
        pixels, color_type = image[:, :, [2, 1, 0, 3]], 6
    else:
        raise ValueError('PNG images require 1, 3 or 4 channels.')
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    raw = b''.join(b'\x00' + row.tobytes() for row in pixels)
    encoded = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, color_type, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    return encoded


def imwrite(filename, img, params=None):
    from pathlib import Path
    path = Path(filename)
    if path.suffix.lower() != '.png':
        raise NotImplementedError('CodePad imwrite currently supports PNG images only.')
    encoded = _encode_png(img, params)
    try:
        path.write_bytes(encoded)
    except OSError:
        return False
    # Await the real host export: False on user cancellation or export failure.
    return bool(run_sync(bridge.save_png(path.name, to_js(bytearray(encoded)))))


cv2.threshold = threshold
cv2.bitwise_and, cv2.bitwise_or = bitwise_and, bitwise_or
cv2.bitwise_xor, cv2.bitwise_not = bitwise_xor, bitwise_not
cv2.add, cv2.imwrite = add, imwrite
