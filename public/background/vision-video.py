"""Local file VideoCapture and real browser image decoding, beside existing camera."""
import os as _video_os
from pathlib import Path as _VideoPath
_file_camera_capture=cv2.VideoCapture
for _n,_v in {'CAP_PROP_POS_MSEC':0,'CAP_PROP_POS_FRAMES':1,'CAP_PROP_FPS':5,'CAP_PROP_FRAME_COUNT':7,'CAP_PROP_BACKEND':42,'IMREAD_UNCHANGED':-1,'IMREAD_GRAYSCALE':0,'IMREAD_COLOR':1}.items(): setattr(cv2,_n,_v)

class _VideoCapture:
    def __init__(self,index=None,apiPreference=0,*args):
        self._camera=None;self._id=None;self._opened=False;self._fps=30.;self._position=0;self._duration=0.;self.width=self.height=0;self.last_error=''
        if index is not None:self.open(index,apiPreference,*args)

    def open(self,index,apiPreference=0,*args):
        self.release();self._position=0;self._fps=30.;self.last_error=''
        if apiPreference!=0 or args: raise NotImplementedError('VideoCapture supports CAP_ANY only.')
        if isinstance(index,(int,np.integer)):
            self._camera=_file_camera_capture(index,apiPreference);self._opened=self._camera.isOpened();return self._opened
        try:
            path=_VideoPath(_video_os.fspath(index));data=path.read_bytes()
            if len(data)>256*1024*1024: raise ValueError('Video file exceeds 256 MiB.')
            result=run_sync(bridge.video_open(path.name,to_js(bytearray(data))))
            self._id=int(result.id);self.width=int(result.width);self.height=int(result.height);self._duration=float(result.duration);self._opened=True
        except Exception as e:self.last_error=str(e);self._opened=False
        return self._opened

    def isOpened(self): return self._camera.isOpened() if self._camera else self._opened
    def read(self):
        if self._camera:return self._camera.read()
        if not self._opened or self._position/self._fps>=self._duration:return False,None
        frame=run_sync(bridge.video_read(self._id,self._position/self._fps))
        if frame is None:return False,None
        image=np.empty((self.height,self.width,3),np.uint8);bridge.camera_pixels(frame.rgba,image);self._position+=1
        return True,image
    def get(self,prop):
        if self._camera:return self._camera.get(prop)
        return {0:self._position/self._fps*1000,1:self._position,3:self.width,4:self.height,5:self._fps,7:math.ceil(self._duration*self._fps),42:0}.get(prop,0)
    def set(self,prop,value):
        if self._camera:return self._camera.set(prop,value)
        if not self._opened or not math.isfinite(value):return False
        if prop==cv2.CAP_PROP_FPS:
            if not 1<=value<=120:return False
            time=self._position/self._fps;self._fps=float(value);self._position=round(time*self._fps);return True
        if prop in (0,1):
            position=round(value*self._fps/1000) if prop==0 else round(value)
            if position<0 or position>math.ceil(self._duration*self._fps):return False
            self._position=position;return True
        return False
    def release(self):
        if self._camera:self._camera.release();self._camera=None
        if self._id is not None:bridge.video_close(self._id);self._id=None
        self._opened=False
    def getBackendName(self):return 'CodePad camera' if self._camera else 'Browser timeline sampler'

# Keep the diagnostic/type introspection used by existing camera tests.
_VideoCapture.read.__globals__['_CameraImage']=_CameraImage
cv2.VideoCapture=_VideoCapture

def imdecode(buf,flags=1,dst=None):
    if flags not in (-1,0,1):raise NotImplementedError('imdecode supports IMREAD_UNCHANGED, GRAYSCALE and COLOR.')
    if np.asarray(buf).dtype!=np.uint8:raise TypeError('Encoded image buffer must have uint8 dtype.')
    try:frame=run_sync(bridge.decode_image(to_js(bytearray(np.asarray(buf).tobytes()))))
    except Exception:return None
    rgba=np.frombuffer(frame.rgba.to_py(),np.uint8).reshape(int(frame.height),int(frame.width),4)
    raw=np.asarray(buf).tobytes();png=raw.startswith(b'\x89PNG\r\n\x1a\n')
    alpha=(png and len(raw)>25 and (raw[25] in (4,6) or b'tRNS' in raw)) or np.any(rgba[:,:,3]!=255)
    out=rgba[:,:,[2,1,0,3]].copy() if flags==-1 and alpha else rgba[:,:,2::-1].copy()
    if flags==-1 and png and len(raw)>25 and raw[25]==0: out=rgba[:,:,0].copy()
    if flags==0:out=cv2.cvtColor(out,cv2.COLOR_BGR2GRAY)
    if dst is not None:
        if dst.shape!=out.shape or dst.dtype!=out.dtype:raise ValueError('Invalid image destination.')
        dst[...] = out;return dst
    return out

def imread(filename,flags=1):
    try:data=_VideoPath(_video_os.fspath(filename)).read_bytes()
    except OSError:return None
    return imdecode(np.frombuffer(data,np.uint8),flags)

cv2.imread,cv2.imdecode=imread,imdecode

def getBuildInformation():
    return 'CodePad 3.5.0: OpenCV.js 4.13.0 + NumPy. Imgproc/contours/geometry and one HighGUI canvas. Camera 0/1; local video timeline sampling (default 30 fps; not container source fps). Browser-supported image decode, PNG encode. No CUDA, desktop window backend, native FFmpeg, VideoWriter, dnn or contrib Python bindings. See Studio cv2 support.'
cv2.getBuildInformation=getBuildInformation
