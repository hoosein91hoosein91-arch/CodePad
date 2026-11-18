"""CodePad live-camera subset of MediaPipe Pose; real Tasks Lite backend."""
import enum as _pose_enum

_pose_connections = frozenset([(0,1),(1,2),(2,3),(3,7),(0,4),(4,5),(5,6),(6,8),(9,10),
    (11,12),(11,13),(13,15),(15,17),(15,19),(15,21),(17,19),(12,14),(14,16),(16,18),(16,20),(16,22),(18,20),
    (11,23),(12,24),(23,24),(23,25),(24,26),(25,27),(26,28),(27,29),(28,30),(29,31),(30,32),(27,31),(28,32)])
_pose_names='NOSE LEFT_EYE_INNER LEFT_EYE LEFT_EYE_OUTER RIGHT_EYE_INNER RIGHT_EYE RIGHT_EYE_OUTER LEFT_EAR RIGHT_EAR LEFT_MOUTH RIGHT_MOUTH LEFT_SHOULDER RIGHT_SHOULDER LEFT_ELBOW RIGHT_ELBOW LEFT_WRIST RIGHT_WRIST LEFT_PINKY RIGHT_PINKY LEFT_INDEX RIGHT_INDEX LEFT_THUMB RIGHT_THUMB LEFT_HIP RIGHT_HIP LEFT_KNEE RIGHT_KNEE LEFT_ANKLE RIGHT_ANKLE LEFT_HEEL RIGHT_HEEL LEFT_FOOT_INDEX RIGHT_FOOT_INDEX'.split()
PoseLandmark=_pose_enum.IntEnum('PoseLandmark',{name:i for i,name in enumerate(_pose_names)})

class Pose:
    def __init__(self,static_image_mode=False,model_complexity=0,smooth_landmarks=True,
                 enable_segmentation=False,smooth_segmentation=True,
                 min_detection_confidence=.5,min_tracking_confidence=.5):
        if static_image_mode or model_complexity!=0 or enable_segmentation:
            raise NotImplementedError('CodePad Pose supports live camera, model_complexity=0 (Lite), no segmentation.')
        if not all(math.isfinite(v) and 0<=v<=1 for v in (min_detection_confidence,min_tracking_confidence)):
            raise ValueError('Pose confidence must be between zero and one.')
        bridge.pose_options(float(min_detection_confidence),float(min_tracking_confidence))

    def process(self,image):
        if not isinstance(image,_CameraImage) or image.shape[:2]!=image.camera_shape:
            raise NotImplementedError('Pose.process requires a CodePad VideoCapture frame with flip/cvtColor.')
        points=[types.SimpleNamespace(x=1-p['x'] if image.flip_x else p['x'],
            y=1-p['y'] if image.flip_y else p['y'],z=p['z'],visibility=p.get('visibility',0),presence=p.get('presence',0)) for p in image.pose_landmarks]
        world=[types.SimpleNamespace(x=-p['x'] if image.flip_x else p['x'],
            y=-p['y'] if image.flip_y else p['y'],z=p['z'],visibility=p.get('visibility',0)) for p in image.pose_world_landmarks]
        return types.SimpleNamespace(pose_landmarks=types.SimpleNamespace(landmark=points) if len(points)==33 else None,
            pose_world_landmarks=types.SimpleNamespace(landmark=world) if len(world)==33 else None,segmentation_mask=None)

    def close(self):pass
    def __enter__(self):return self
    def __exit__(self,*args):self.close()

mp.solutions.pose=types.SimpleNamespace(Pose=Pose,PoseLandmark=PoseLandmark,POSE_CONNECTIONS=_pose_connections)

# Publish importable compatibility modules as well as the attribute-based API.
mp.__path__=[]
_solutions=types.ModuleType('mediapipe.solutions');_solutions.__path__=[]
_solutions.__dict__.update(vars(mp.solutions));mp.solutions=_solutions
sys.modules['mediapipe.solutions']=_solutions
for _part in ('hands','pose','drawing_utils'):
    _value=getattr(_solutions,_part);_sub=types.ModuleType('mediapipe.solutions.'+_part)
    _sub.__dict__.update(vars(_value));setattr(_solutions,_part,_sub);sys.modules[_sub.__name__]=_sub
