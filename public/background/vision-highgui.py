"""One real OpenCV output window, with mouse/touch and PNG document export.

Image drawing/resize use upstream OpenCV.js. Text metrics match the existing
Canvas text renderer. Unsupported desktop-only window options raise explicitly.
"""
import os as _gui_os
from pathlib import Path as _GuiPath


class _CVError(RuntimeError):
    pass


cv2.error = _CVError
for _name, _value in {
    'WINDOW_NORMAL': 0, 'WINDOW_AUTOSIZE': 1,
    'WND_PROP_AUTOSIZE': 1, 'WND_PROP_VISIBLE': 4,
    'EVENT_MOUSEMOVE': 0, 'EVENT_LBUTTONDOWN': 1,
    'EVENT_RBUTTONDOWN': 2, 'EVENT_MBUTTONDOWN': 3,
    'EVENT_LBUTTONUP': 4, 'EVENT_RBUTTONUP': 5, 'EVENT_MBUTTONUP': 6,
    'EVENT_LBUTTONDBLCLK': 7, 'EVENT_RBUTTONDBLCLK': 8, 'EVENT_MBUTTONDBLCLK': 9,
    'EVENT_FLAG_LBUTTON': 1, 'EVENT_FLAG_RBUTTON': 2, 'EVENT_FLAG_MBUTTON': 4,
    'EVENT_FLAG_CTRLKEY': 8, 'EVENT_FLAG_SHIFTKEY': 16, 'EVENT_FLAG_ALTKEY': 32,
}.items():
    setattr(cv2, _name, _value)

_cv_windows = {}
_cv_mouse = {}
_cv_metrics = {}


def _gui_events():
    pending = bridge.highgui_events()
    pending = pending.to_py() if hasattr(pending, 'to_py') else pending
    for event in pending:
        name = event['name']
        if event['type'] == 'close':
            if name in _cv_windows:
                _cv_windows[name]['visible'] = False
        elif event['type'] == 'mouse' and _cv_windows.get(name, {}).get('visible'):
            entry = _cv_mouse.get(name)
            if entry:
                callback, param = entry
                callback(int(event['event']), int(event['x']), int(event['y']), int(event['flags']), param)


def namedWindow(winname, flags=1):
    name = str(winname)
    if flags not in (cv2.WINDOW_NORMAL, cv2.WINDOW_AUTOSIZE):
        raise NotImplementedError('CodePad supports WINDOW_NORMAL and WINDOW_AUTOSIZE.')
    if any(n != name and w['visible'] for n, w in _cv_windows.items()):
        raise NotImplementedError('CodePad supports one visible cv2 output window per run.')
    if not _cv_windows.get(name, {}).get('visible'):
        _cv_windows[name] = dict(visible=True, flags=int(flags))
        bridge.window_create(name, int(flags))


def setMouseCallback(windowName, onMouse, param=None):
    name = str(windowName)
    if name not in _cv_windows:
        raise _CVError('Create the window before registering its mouse callback.')
    if onMouse is not None and not callable(onMouse):
        raise TypeError('Mouse callback must be callable or None.')
    if onMouse is None:
        _cv_mouse.pop(name, None)
    else:
        _cv_mouse[name] = (onMouse, param)
    bridge.window_mouse(name, onMouse is not None)


def getWindowProperty(winname, prop_id):
    _gui_events()
    value = _cv_windows.get(str(winname))
    if prop_id == cv2.WND_PROP_VISIBLE:
        return float(bool(value and value['visible']))
    if prop_id == cv2.WND_PROP_AUTOSIZE:
        return float(value['flags'] == cv2.WINDOW_AUTOSIZE) if value else -1.0
    raise NotImplementedError('This desktop window property is not supported in CodePad.')


def destroyWindow(winname):
    name = str(winname)
    _cv_windows.pop(name, None)
    _cv_mouse.pop(name, None)
    bridge.window_destroy(name)


def destroyAllWindows():
    _cv_windows.clear()
    _cv_mouse.clear()
    bridge.window_destroy(None)


_gui_imshow = cv2.imshow
_gui_waitKey = cv2.waitKey


def _window_imshow(winname, frame):
    name = str(winname)
    if not _cv_windows.get(name, {}).get('visible'):
        namedWindow(name)
    return _gui_imshow(name, frame)


def _window_waitKey(delay=0):
    _gui_events()
    if delay<=0:
        while any(w['visible'] for w in _cv_windows.values()):
            value=_gui_waitKey(16)
            _gui_events()
            if value>=0:return value
        return -1
    value = _gui_waitKey(delay)
    _gui_events()
    return value


def getTextSize(text, fontFace, fontScale, thickness):
    if fontFace != cv2.FONT_HERSHEY_SIMPLEX:
        raise NotImplementedError('This renderer supports FONT_HERSHEY_SIMPLEX.')
    if not math.isfinite(fontScale) or fontScale <= 0 or thickness < 0:
        raise _CVError('Invalid text scale or thickness.')
    key = (str(text), float(fontScale), int(thickness))
    if key not in _cv_metrics:
        value = bridge.text_metrics(*key)
        value = value.to_py() if hasattr(value, 'to_py') else value
        if len(_cv_metrics) >= 128:
            _cv_metrics.pop(next(iter(_cv_metrics)))
        _cv_metrics[key] = ((int(value[0]), int(value[1])), int(value[2]))
    return _cv_metrics[key]


class _EncodedPNG(np.ndarray):
    """A real encoded uint8 buffer; binary .tofile exports through CodePad's picker."""
    def __array_finalize__(self, original):
        self._cancelled = getattr(original, '_cancelled', False)

    def tofile(self, fid, sep='', format='%s'):
        if sep:
            raise NotImplementedError('Encoded image buffers support binary tofile only.')
        data = self.tobytes()
        if hasattr(fid, 'write'):
            fid.write(data)
            return
        if self._cancelled:
            raise OSError('Image export was cancelled.')
        path = _GuiPath(_gui_os.fspath(fid))
        path.write_bytes(data)
        if not bool(run_sync(bridge.save_png(path.name, to_js(bytearray(data))))):
            self._cancelled = True
            raise OSError('Image export was cancelled or failed.')


def imencode(ext, img, params=None):
    if str(ext).lower() not in ('.png', 'png'):
        raise NotImplementedError('This encoder supports PNG.')
    return True, np.frombuffer(_encode_png(img, params), dtype=np.uint8).copy().view(_EncodedPNG)


cv2.namedWindow = namedWindow
cv2.setMouseCallback = setMouseCallback
cv2.getWindowProperty = getWindowProperty
cv2.destroyWindow, cv2.destroyAllWindows = destroyWindow, destroyAllWindows
cv2.imshow, cv2.waitKey = _window_imshow, _window_waitKey
cv2.getTextSize, cv2.imencode = getTextSize, imencode
cv2.waitKeyEx=_window_waitKey
cv2.pollKey=lambda:_window_waitKey(1)
