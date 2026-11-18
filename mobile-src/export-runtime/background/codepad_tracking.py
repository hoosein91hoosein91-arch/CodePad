"""Hand + body fusion facade. Uses real model output, never invents landmarks.

One Euro smoothing and 3D joint angles are post-processing, not trained models.
Raw hands remain available; all filters reset immediately on tracking loss.
"""
import math
import time
from types import SimpleNamespace
import mediapipe as mp

__version__='1.0.0'

class OneEuro:
    def __init__(self,min_cutoff=1.5,beta=15.0):
        self.min_cutoff=min_cutoff;self.beta=beta;self.reset()
    def reset(self):self.raw=self.value=self.stamp=None;self.velocity=0.
    @staticmethod
    def alpha(cutoff,dt):return 1/(1+1/(2*math.pi*cutoff*dt))
    def update(self,value,stamp):
        if self.stamp is None or stamp<=self.stamp or stamp-self.stamp>.25:
            self.raw=self.value=value;self.stamp=stamp;self.velocity=0.;return value
        dt=max(.001,stamp-self.stamp);v=(value-self.raw)/dt
        self.velocity+=self.alpha(1,dt)*(v-self.velocity)
        self.value+=self.alpha(self.min_cutoff+self.beta*abs(self.velocity),dt)*(value-self.value)
        self.raw=value;self.stamp=stamp;return self.value

def joint_angle(a,b,c):
    u=[getattr(a,k)-getattr(b,k) for k in ('x','y','z')]
    v=[getattr(c,k)-getattr(b,k) for k in ('x','y','z')]
    n=math.sqrt(sum(x*x for x in u)*sum(x*x for x in v))
    return math.degrees(math.acos(max(-1,min(1,sum(x*y for x,y in zip(u,v))/n)))) if n>1e-12 else 0.

class Tracker:
    def __init__(self,hands=2,body=True,smooth=True):
        if hands not in (1,2):raise ValueError('hands must be one or two')
        self.hands=mp.solutions.hands.Hands(max_num_hands=hands,min_detection_confidence=.55,min_tracking_confidence=.5)
        self.pose=mp.solutions.pose.Pose() if body else None
        self.smooth=smooth;self.previous=[];self.counter=0
    def process(self,image):
        result=self.hands.process(image);now=getattr(image,'timestamp',0) or time.monotonic()
        raw=result.multi_hand_landmarks or [];used=set();tracks=[];next_tracks=[]
        for hand_index,hand in enumerate(raw):
            x=sum(hand.landmark[i].x for i in (0,5,9,13,17))/5
            y=sum(hand.landmark[i].y for i in (0,5,9,13,17))/5
            choices=[(math.hypot(x-t['x'],y-t['y']),i,t) for i,t in enumerate(self.previous) if i not in used and 0<now-t['time']<=.25]
            distance,i,track=min(choices,key=lambda item:item[0]) if choices else (9,None,None)
            if distance>.2:
                self.counter+=1;track={'id':self.counter,'filters':[[OneEuro() for _ in range(3)] for _ in range(21)]}
            else:used.add(i)
            points=[]
            for j,p in enumerate(hand.landmark):
                values=[getattr(p,k) for k in ('x','y','z')]
                points.append(SimpleNamespace(**dict(zip(('x','y','z'),[f.update(v,now) for f,v in zip(track['filters'][j],values)] if self.smooth else values))))
            # Joint angles use raw 3D measurements; smoothed points are for drawing.
            worlds=result.multi_hand_world_landmarks or []
            metric=worlds[hand_index].landmark if hand_index<len(worlds) else [SimpleNamespace(x=p.x*image.shape[1],y=p.y*image.shape[0],z=p.z*image.shape[1]) for p in hand.landmark]
            extended={name:joint_angle(metric[a],metric[b],metric[c])>155 for name,a,b,c in [('index',5,6,8),('middle',9,10,12),('ring',13,14,16),('pinky',17,18,20)]}
            tracks.append(SimpleNamespace(id=track['id'],landmark=points,raw=hand,extended=extended))
            track.update(x=x,y=y,time=now);next_tracks.append(track)
        self.previous=next_tracks  # Never hold a missing hand or synthesize a detection.
        pose=self.pose.process(image) if self.pose else None
        return SimpleNamespace(hands=tracks,raw_hands=result,body=pose.pose_landmarks if pose else None,
            body_world=pose.pose_world_landmarks if pose else None,timestamp=now)
    def close(self):
        self.hands.close()
        if self.pose:self.pose.close()
        self.previous=[]
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
