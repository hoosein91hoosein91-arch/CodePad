"""Use the actual bundled OpenCV Python wheel; adapt device I/O only.
The main namespace and submodules come from the upstream WASM build. Camera
metadata and CodePad's window/save bridges remain compatible with old projects.
"""
import functools as _cv_functools

_native_cv=_codepad_native_cv2
_keep_gui={name:getattr(cv2,name) for name in ('VideoCapture','namedWindow','setMouseCallback','getWindowProperty','destroyWindow','destroyAllWindows','imshow','waitKey','waitKeyEx','pollKey')}
for _name in dir(_native_cv):
    if not _name.startswith('__'):
        setattr(cv2,_name,getattr(_native_cv,_name))
for _name in ('__file__','__path__','__spec__','__version__'):
    if hasattr(_native_cv,_name):setattr(cv2,_name,getattr(_native_cv,_name))
for _name,_value in _keep_gui.items():setattr(cv2,_name,_value)
_CVError=_native_cv.error
cv2.error=_native_cv.error
cv2.native=_native_cv
cv2.codepad_profile='3.5.0: upstream OpenCV Python WASM + Android/browser camera, windows and video timeline adapter'


def _camera_result(src,result,flipCode=None):
    if not isinstance(src,_CameraImage):return result
    result=result.view(_CameraImage)
    for attr in ('landmarks','handedness','world_landmarks','pose_landmarks','pose_world_landmarks','timestamp','flip_x','flip_y'):
        setattr(result,attr,getattr(src,attr))
    if flipCode is not None:
        if flipCode!=0:result.flip_x=not result.flip_x
        if flipCode<=0:result.flip_y=not result.flip_y
    result.camera_shape=result.shape[:2]
    return result


def _native_flip(src,flipCode,dst=None):
    return _camera_result(src,_native_cv.flip(src,flipCode,dst),flipCode)


def _native_resize(src,dsize,dst=None,fx=0,fy=0,interpolation=1):
    return _camera_result(src,_native_cv.resize(src,dsize,dst,fx,fy,interpolation))


def _native_color(src,code,dst=None,dstCn=0):
    return _camera_result(src,_native_cv.cvtColor(src,code,dst,dstCn))

cv2.flip,cv2.resize,cv2.cvtColor=_native_flip,_native_resize,_native_color

# Keep CodePad's existing support for non-contiguous destinations. Native
# OpenCV's Python bindings reject negative strides in dst/in-place arguments.
def _dst_adapter(fn,inplace=False):
    @_cv_functools.wraps(fn)
    def call(*args,**kwargs):
        if inplace and args and isinstance(args[0],np.ndarray) and not args[0].flags.c_contiguous:
            original=args[0];temp=np.ascontiguousarray(original);fn(temp,*args[1:],**kwargs);original[...] = temp;return original
        dst=kwargs.get('dst')
        if isinstance(dst,np.ndarray) and not dst.flags.c_contiguous:
            temp=np.ascontiguousarray(dst);kwargs['dst']=temp;result=fn(*args,**kwargs);dst[...] = temp
            return tuple(dst if isinstance(x,np.ndarray) and x is temp else x for x in result) if isinstance(result,tuple) else dst
        return fn(*args,**kwargs)
    return call

for _name in ('blur','GaussianBlur','medianBlur','bilateralFilter','filter2D','Sobel','Laplacian','convertScaleAbs','threshold','adaptiveThreshold','equalizeHist','erode','dilate','morphologyEx','inRange','copyMakeBorder','rotate','warpAffine','warpPerspective','transform','merge','add','addWeighted','bitwise_and','bitwise_or','bitwise_xor','bitwise_not'):
    setattr(cv2,_name,_dst_adapter(getattr(_native_cv,_name)))
for _name in ('fillPoly','polylines','ellipse','circle','rectangle','line','putText','drawContours'):
    setattr(cv2,_name,_dst_adapter(getattr(_native_cv,_name),inplace=True))


def _native_encode(ext,img,params=None):
    ok,buffer=_native_cv.imencode(ext,img,[] if params is None else params)
    return ok,buffer.view(_EncodedPNG) if ok else buffer


def _native_write(filename,img,params=None):
    path=_VideoPath(_video_os.fspath(filename))
    ok,buffer=_native_encode(path.suffix,img,params)
    if not ok:return False
    try:path.write_bytes(buffer.tobytes())
    except OSError:return False
    return bool(run_sync(bridge.save_png(path.name,to_js(bytearray(buffer.tobytes())))))

cv2.imencode,cv2.imwrite=_native_encode,_native_write

def _native_build_info():
    return cv2.codepad_profile+'\nCamera 0/1 and one HighGUI canvas use CodePad device bridges. Local VideoCapture files sample browser timeline at configurable FPS (default 30), not original container frame indexes. Hardware/native OS backends remain limited to this WASM build.\n'+_native_cv.getBuildInformation()
cv2.getBuildInformation=_native_build_info
