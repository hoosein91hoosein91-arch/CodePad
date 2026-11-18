"""Additional cv2 bindings backed by the bundled upstream OpenCV WebAssembly."""
import json as _cv_json

def _cv_image(image):
    if not isinstance(image, np.ndarray) or image.dtype != np.uint8 or image.ndim not in (2, 3):
        raise TypeError('This OpenCV profile requires uint8 grayscale/BGR/BGRA images.')
    channels = 1 if image.ndim == 2 else image.shape[2]
    if channels not in (1, 2, 3, 4) or not image.size:
        raise ValueError('Invalid image size or channels.')
    return {'height': image.shape[0], 'width': image.shape[1], 'channels': channels}

def _cv_call(op, image=None, destination=None, **params):
    source = None if image is None else np.ascontiguousarray(image)
    result = bridge.cv_op(op, source, destination, _cv_json.dumps(params))
    return result.to_py() if hasattr(result, 'to_py') else result

def _cv_points(points):
    value = np.asarray(points)
    if value.ndim not in (2, 3) or value.shape[-1] != 2 or not np.isfinite(value).all():
        raise ValueError('Points must be an N x 2 array.')
    if value.dtype not in (np.int32, np.float32):
        raise TypeError('Points must have int32 or float32 dtype.')
    return value.reshape(-1, 2)

def boundingRect(points):
    value = _cv_points(points)
    if not len(value):
        return (0, 0, 0, 0)
    return tuple(_cv_call('boundingRect', points=value.ravel().tolist(), floating=value.dtype == np.float32))

def _cv_draw(op, image, polygons, color, **params):
    spec = _cv_image(image)
    if not image.flags.writeable:
        raise ValueError('Destination is read-only.')
    contours = [_cv_points(p) for p in polygons]
    if any(p.dtype != np.int32 for p in contours):
        raise TypeError('Drawing points require int32.')
    colors = [float(color)] if np.isscalar(color) else [float(v) for v in color]
    if not 1 <= len(colors) <= 4:
        raise ValueError('Invalid drawing color.')
    colors += [0.0] * (4-len(colors))
    out = np.ascontiguousarray(image)
    _cv_call(op, out, out, **spec, polygons=[p.ravel().tolist() for p in contours], color=colors, **params)
    if out is not image:
        image[...] = out
    return image

def fillPoly(img, pts, color, lineType=8, shift=0, offset=(0, 0)):
    return _cv_draw('fillPoly', img, pts, color, lineType=int(lineType), shift=int(shift), offset=[int(v) for v in offset])

def polylines(img, pts, isClosed, color, thickness=1, lineType=8, shift=0):
    return _cv_draw('polylines', img, pts, color, closed=bool(isClosed), thickness=int(thickness), lineType=int(lineType), shift=int(shift))

def _cv_result(image, dst, op, shape=None, **params):
    spec = _cv_image(image)
    shape = image.shape if shape is None else shape
    if dst is not None and (dst.shape != shape or dst.dtype != np.uint8 or not dst.flags.writeable):
        raise ValueError('Destination shape/dtype mismatch or read-only destination.')
    out = dst if dst is not None and dst.flags.c_contiguous else np.empty(shape, dtype=np.uint8)
    _cv_call(op, image, out, **spec, **params)
    if dst is not None:
        if dst.shape != out.shape or dst.dtype != out.dtype:
            raise ValueError('Destination shape/dtype mismatch.')
        if dst is not out:
            dst[...] = out
        return dst
    return out

def GaussianBlur(src, ksize, sigmaX, dst=None, sigmaY=0, borderType=4):
    if len(ksize) != 2:
        raise ValueError('ksize requires two dimensions.')
    return _cv_result(src, dst, 'GaussianBlur', ksize=[int(v) for v in ksize], sigmaX=float(sigmaX), sigmaY=float(sigmaY), borderType=int(borderType))

def applyColorMap(src, colormap, dst=None):
    if src.ndim != 2 and (src.ndim != 3 or src.shape[2] != 3):
        raise ValueError('applyColorMap requires gray or BGR.')
    return _cv_result(src, dst, 'applyColorMap', shape=src.shape[:2]+(3,), colormap=int(colormap))

def transform(src, m, dst=None):
    spec = _cv_image(src)
    matrix = np.asarray(m, dtype=np.float64)
    if matrix.ndim != 2 or matrix.shape[1] not in (spec['channels'], spec['channels']+1) or not 1 <= matrix.shape[0] <= 4 or not np.isfinite(matrix).all():
        raise ValueError('Invalid transformation matrix.')
    shape = src.shape[:2] if matrix.shape[0] == 1 else src.shape[:2]+(matrix.shape[0],)
    return _cv_result(src, dst, 'transform', shape=shape, rows=matrix.shape[0], columns=matrix.shape[1], matrix=matrix.ravel().tolist())

def split(src, mv=None):
    if mv is not None:
        raise NotImplementedError('Preallocated split output is not supported.')
    return (src.copy(),) if src.ndim == 2 else tuple(src[..., i].copy() for i in range(src.shape[2]))

def merge(mv, dst=None):
    if not len(mv) or any(v.shape[:2] != mv[0].shape[:2] or v.dtype != mv[0].dtype for v in mv):
        raise ValueError('Channels must have equal dimensions and dtype.')
    result = np.dstack(mv)
    if dst is not None:
        if dst.shape != result.shape or dst.dtype != result.dtype:
            raise ValueError('Destination shape/dtype mismatch.')
        dst[...] = result
        return dst
    return result

for _name in ('boundingRect', 'fillPoly', 'polylines', 'GaussianBlur', 'applyColorMap', 'transform', 'split', 'merge'):
    setattr(cv2, _name, globals()[_name])
cv2.COLORMAP_JET = 2
cv2.BORDER_CONSTANT, cv2.BORDER_REPLICATE, cv2.BORDER_REFLECT = 0, 1, 2
cv2.BORDER_REFLECT_101 = cv2.BORDER_DEFAULT = 4
cv2.FILLED, cv2.LINE_4, cv2.LINE_8 = -1, 4, 8

_cv_camera_cvtColor = cv2.cvtColor
def _cv_cvtColor(src, code):
    if code == cv2.COLOR_BGR2GRAY and src.dtype == np.uint8:
        return _cv_result(src, None, 'cvtColor', shape=src.shape[:2], code=int(code))
    return _cv_camera_cvtColor(src, code)
cv2.cvtColor = _cv_cvtColor
cv2.__version__ = 'codepad-vision-2 (OpenCV.js 4.13.0 bindings; compatibility subset)'


cv2.INTER_NEAREST, cv2.INTER_LINEAR, cv2.INTER_CUBIC = 0, 1, 2
cv2.INTER_AREA, cv2.INTER_LANCZOS4 = 3, 4


def ellipse(img, center, axes, angle, startAngle, endAngle, color, thickness=1, lineType=8, shift=0):
    _cv_image(img)
    if (len(center) != 2 or len(axes) != 2 or any(v < 0 for v in axes)
            or not 0 <= int(shift) <= 16
            or not all(math.isfinite(v) for v in (*center, *axes, angle, startAngle, endAngle))):
        raise ValueError('Invalid ellipse center, axes, angle or shift.')
    # Bound the rotated ellipse with its maximum radius. Transfer only that ROI,
    # including the antialiased pen edge, instead of two full frames per corner.
    unit = 1 << int(shift)
    radius = math.ceil(max(axes) / unit) + max(1, math.ceil(thickness / 2)) + 2
    cx, cy = center[0] / unit, center[1] / unit
    left, top = max(0, math.floor(cx-radius)), max(0, math.floor(cy-radius))
    right, bottom = min(img.shape[1], math.ceil(cx+radius+1)), min(img.shape[0], math.ceil(cy+radius+1))
    if left >= right or top >= bottom:
        return img
    _cv_draw('ellipse', img[top:bottom, left:right], [], color,
             center=[int(center[0])-left*unit, int(center[1])-top*unit],
             axes=[int(v) for v in axes], angle=float(angle),
             startAngle=float(startAngle), endAngle=float(endAngle),
             thickness=int(thickness), lineType=int(lineType), shift=int(shift))
    return img


def resize(src, dsize, dst=None, fx=0, fy=0, interpolation=1):
    if len(dsize) != 2:
        raise ValueError('dsize requires width and height.')
    width, height = map(int, dsize)
    if width == 0 and height == 0:
        width, height = round(src.shape[1] * fx), round(src.shape[0] * fy)
    if width < 1 or height < 1 or width * height > 16777216:
        raise ValueError('Invalid resize dimensions.')
    shape = (height, width) + src.shape[2:]
    result = _cv_result(src, dst, 'resize', shape=shape, dsize=[width, height], interpolation=int(interpolation))
    if isinstance(src, _CameraImage):
        if not isinstance(result, _CameraImage):
            result = result.view(_CameraImage)
        for attr in ('landmarks','handedness','world_landmarks','flip_x','flip_y'):
            setattr(result, attr, getattr(src, attr))
        result.camera_shape = result.shape[:2]
    return result


cv2.ellipse, cv2.resize = ellipse, resize
