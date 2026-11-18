"""CodePad Turtle drawing profile: Python geometry with a Canvas renderer.

Core drawing API only. No Tkinter widgets, event bindings or native windows.
"""
import math as _math
import json as _json
from pyodide.ffi import run_sync as _run_sync
from js import _codepad_vision as _bridge

class TurtleGraphicsError(Exception):
    pass

class Terminator(Exception):
    pass

def _number(value):
    value = float(value)
    if not _math.isfinite(value):
        raise TurtleGraphicsError('Coordinates and sizes must be finite.')
    return value

class Vec2D(tuple):
    def __new__(cls, x, y):
        return tuple.__new__(cls, (_number(x), _number(y)))
    def __add__(self, other): return Vec2D(self[0]+other[0], self[1]+other[1])
    def __sub__(self, other): return Vec2D(self[0]-other[0], self[1]-other[1])
    def __neg__(self): return Vec2D(-self[0], -self[1])
    def __abs__(self): return _math.hypot(*self)
    def __mul__(self, other):
        if isinstance(other, (tuple,list)): return self[0]*other[0]+self[1]*other[1]
        return Vec2D(self[0]*other,self[1]*other)
    __rmul__ = __mul__
    def rotate(self, angle):
        a = _math.radians(angle)
        return Vec2D(self[0]*_math.cos(a)-self[1]*_math.sin(a), self[0]*_math.sin(a)+self[1]*_math.cos(a))

_screen = None
_default = None
_colors = {}

def _color(value):
    if isinstance(value, str):
        if value not in _colors:
            try:
                _colors[value] = str(_bridge.turtle_color(value))
            except Exception as error:
                raise TurtleGraphicsError('Invalid color: '+value) from error
        return _colors[value]
    if len(value) != 3:
        raise TurtleGraphicsError('A color requires three components.')
    mode = Screen()._colormode
    components = [_number(c) for c in value]
    if any(c<0 or c>mode for c in components):
        raise TurtleGraphicsError('Color components exceed colormode.')
    return '#'+''.join('%02x' % round(c*255/mode) for c in components)

class _Screen:
    def __init__(self):
        self._width, self._height, self._background = 800, 480, 'white'
        self._title, self._colormode, self._tracer, self._delay = 'Turtle', 1.0, 1, 10
        self._turtles, self._commands, self._frames, self._operations = [], [], [], 0
        self._closed = False
    def _emit(self, command=None):
        if self._closed: raise Terminator('The Turtle window has closed.')
        if command is not None: self._commands.append(command)
        duration = 0
        if command is not None and len(command)>1:
            if command[1] in ('path','preview-path'):
                points=command[4]
                duration=sum(_math.dist(a,b) for a,b in zip(points,points[1:]))*0.8
            elif command[1]=='dot':duration=20
            elif command[1]=='fill':duration=65
        self._frames.append([command,[t._cursor() for t in self._turtles],duration])
        self._operations += 1
        speeds=[t._speed for t in self._turtles if t._speed]
        limit=max(12,max(speeds)*12) if speeds else 256
        if self._operations >= limit: self._flush(bool(self._tracer))
    def _flush(self, present=True):
        data = {'width':self._width,'height':self._height,'background':self._background,'title':self._title,
                'commands':self._commands,'cursors':[t._cursor() for t in self._turtles], 'frames':self._frames}
        self._commands, self._frames, self._operations = [], [], 0
        _run_sync(_bridge.turtle_batch(_json.dumps(data), bool(present)))
        if present and self._tracer and any(t._speed for t in self._turtles):
            _run_sync(_bridge.sleep(self._delay/1000))
    def setup(self, width=800, height=480, startx=None, starty=None):
        if startx is not None or starty is not None:
            raise NotImplementedError('Native Turtle window positioning is unavailable in CodePad.')
        w,h = _number(width),_number(height)
        viewport = _bridge.turtle_viewport()
        if 0<w<=1: w *= float(viewport.width)
        if 0<h<=1: h *= float(viewport.height)
        if not 1<=w<=8192 or not 1<=h<=8192:
            raise TurtleGraphicsError('Turtle canvas dimensions must be between 1 and 8192.')
        self._width,self._height = round(w),round(h)
        self._emit()
    def bgcolor(self, *args):
        if not args: return self._background
        self._background = _color(args[0] if len(args)==1 else args)
        self._emit()
    def title(self, titlestring):
        self._title = str(titlestring); self._emit()
    def colormode(self, cmode=None):
        if cmode is None:return self._colormode
        if cmode not in (1.0,255):raise TurtleGraphicsError('colormode must be 1.0 or 255.')
        self._colormode = cmode
    def tracer(self, n=None, delay=None):
        if n is None:return self._tracer
        self._tracer = max(0,int(n))
        if delay is not None:self.delay(delay)
        if self._tracer:self._flush()
    def delay(self, delay=None):
        if delay is None:return self._delay
        self._delay = max(0,int(delay))
    def update(self): self._flush(True)
    def window_width(self):return self._width
    def window_height(self):return self._height
    def turtles(self):return list(self._turtles)
    def clear(self):
        self._commands.append(['clear-all'])
        self._background='white'
        for t in self._turtles:t._reset_state()
        self._flush(True)
    clearscreen = clear
    def reset(self):
        for t in self._turtles:t.reset()
        self.update()
    resetscreen = reset
    def mainloop(self):
        if self._closed:return
        self._flush(True)
        _run_sync(_bridge.turtle_wait())
    done = mainloop
    def bye(self):
        self._flush(True); self._closed=True; _bridge.turtle_bye()
    def __getattr__(self,name):
        raise NotImplementedError('Turtle Screen.'+name+' is not supported by the CodePad drawing profile.')

def Screen():
    global _screen
    if _screen is None:_screen=_Screen()
    return _screen

class Turtle:
    def __init__(self, shape='classic', undobuffersize=1000, visible=True):
        self._screen=Screen()
        self._id=len(self._screen._turtles)+1
        self._reset_state()
        self.shape(shape)
        self._visible=bool(visible)
        self._screen._turtles.append(self)
        self._screen._emit()
    def _reset_state(self):
        self._x,self._y,self._angle=0.,0.,0.
        self._down,self._visible=True,True
        self._pen,self._fill,self._width='black','black',1.
        self._speed,self._fullcircle,self._shape=3,360.,'classic'
        self._fillpath,self._fillstrokes=None,[]
    def _cursor(self):return [self._x,self._y,self._angle,self._pen,self._visible,self._shape]
    def _item(self, *item):self._screen._emit([self._id,*item])
    def _stroke(self, start, end):
        if self._fillpath is not None:
            strokes=self._fillstrokes
            if strokes and strokes[-1][0:2]==[self._pen,self._width] and strokes[-1][2][-1]==start:
                strokes[-1][2].append(end)
            else:strokes.append([self._pen,self._width,[start,end]])
            self._item('preview-path',self._pen,self._width,[start,end])
        else:self._item('path', self._pen,self._width,[start,end])
    def goto(self, x, y=None):
        if y is None:x,y=x
        x,y=_number(x),_number(y)
        start,end=[self._x,self._y],[x,y]
        self._x,self._y=x,y
        if self._down:self._stroke(start,end)
        if self._fillpath is not None:self._fillpath.append(end)
        self._screen._emit()
    setpos=setposition=goto
    def forward(self, distance):
        a=_math.radians(self._angle);d=_number(distance)
        self.goto(self._x+d*_math.cos(a),self._y+d*_math.sin(a))
    fd=forward
    def backward(self, distance):self.forward(-_number(distance))
    back=bk=backward
    def left(self, angle):
        self._angle=(self._angle+_number(angle)*360/self._fullcircle)%360
        self._screen._emit()
    lt=left
    def right(self, angle):self.left(-_number(angle))
    rt=right
    def setheading(self, angle):
        self._angle=(_number(angle)*360/self._fullcircle)%360
        self._screen._emit()
    seth=setheading
    def heading(self):return self._angle*self._fullcircle/360
    def degrees(self, fullcircle=360.0):
        fullcircle=_number(fullcircle)
        if fullcircle<=0:raise TurtleGraphicsError('fullcircle must be positive.')
        self._fullcircle=fullcircle
    def radians(self):self.degrees(2*_math.pi)
    def position(self):return Vec2D(self._x,self._y)
    pos=position
    def xcor(self):return self._x
    def ycor(self):return self._y
    def setx(self, x):self.goto(x,self._y)
    def sety(self, y):self.goto(self._x,y)
    def home(self):self.goto(0,0);self.setheading(0)
    def distance(self, x, y=None):
        if isinstance(x,Turtle):x,y=x.position()
        elif y is None:x,y=x
        return _math.hypot(_number(x)-self._x,_number(y)-self._y)
    def towards(self, x, y=None):
        if isinstance(x,Turtle):x,y=x.position()
        elif y is None:x,y=x
        return (_math.degrees(_math.atan2(_number(y)-self._y,_number(x)-self._x))%360)*self._fullcircle/360
    def circle(self, radius, extent=None, steps=None):
        radius=_number(radius)
        if extent is None:extent=self._fullcircle
        extent=_number(extent)
        if steps is None:steps=1+int(min(11+abs(radius)/6,59)*abs(extent)/self._fullcircle)
        if not isinstance(steps,int) or steps<=0:raise TurtleGraphicsError('circle steps must be a positive integer.')
        w=extent/steps;w2=w/2
        length=2*radius*_math.sin(w2*2*_math.pi/self._fullcircle)
        if radius<0:length,w,w2=-length,-w,-w2
        self.left(w2)
        for _ in range(steps):self.forward(length);self.left(w)
        self.right(w2)
    def penup(self):self._down=False;self._screen._emit()
    up=pu=penup
    def pendown(self):self._down=True;self._screen._emit()
    down=pd=pendown
    def isdown(self):return self._down
    def pensize(self, width=None):
        if width is None:return self._width
        width=_number(width)
        if width<=0:raise TurtleGraphicsError('pensize must be positive.')
        self._width=width
    width=pensize
    def pencolor(self, *args):
        if not args:return self._pen
        self._pen=_color(args[0] if len(args)==1 else args)
    def fillcolor(self, *args):
        if not args:return self._fill
        self._fill=_color(args[0] if len(args)==1 else args)
    def color(self, *args):
        if not args:return self._pen,self._fill
        if len(args)==2:self.pencolor(args[0]);self.fillcolor(args[1])
        else:self.pencolor(*args);self.fillcolor(*args)
    def begin_fill(self):
        if self._fillpath is None:self._fillpath=[[self._x,self._y]];self._fillstrokes=[]
    def end_fill(self):
        if self._fillpath is not None:
            self._item('fill', self._fill,self._fillpath,self._fillstrokes)
            self._fillpath,self._fillstrokes=None,[]
    def filling(self):return self._fillpath is not None
    def dot(self, size=None, *color):
        if isinstance(size,(str,tuple,list)):
            color=(size,);size=None
        if size is None:size=max(self._width+4,self._width*2)
        size=_number(size)
        if size<0:raise TurtleGraphicsError('dot size must be nonnegative.')
        value=_color(color[0] if len(color)==1 else color) if color else self._pen
        self._item('dot',self._x,self._y,size,value)
    def speed(self, speed=None):
        if speed is None:return self._speed
        if isinstance(speed,str):speed={'fastest':0,'fast':10,'normal':6,'slow':3,'slowest':1}.get(speed,0)
        self._speed=round(speed) if .5<speed<10.5 else 0
    def hideturtle(self):self._visible=False;self._screen._emit()
    ht=hideturtle
    def showturtle(self):self._visible=True;self._screen._emit()
    st=showturtle
    def isvisible(self):return self._visible
    def shape(self, name=None):
        if name is None:return self._shape
        if name not in ('classic','arrow','triangle','circle','square','blank'):
            raise NotImplementedError('Custom Turtle shapes are not supported in CodePad.')
        self._shape=name
    def clear(self):self._item('clear');self._fillpath,self._fillstrokes=None,[]
    def reset(self):self.clear();self._reset_state();self._screen._emit()
    def write(self, arg, move=False, align='left', font=('Arial',8,'normal')):
        if align not in ('left','center','right'):raise TurtleGraphicsError('Invalid text alignment.')
        if move:raise NotImplementedError('write(move=True) is not supported in CodePad.')
        family,size,style=font
        self._item('text',self._x,self._y,str(arg),align,[str(family),_number(size),str(style)],self._pen)
    def getscreen(self):return self._screen
    def getturtle(self):return self
    getpen=getturtle
    def __getattr__(self,name):
        raise NotImplementedError('Turtle.'+name+' is not supported by the CodePad drawing profile.')

Pen=Turtle

def _default_turtle():
    global _default
    if _default is None:_default=Turtle()
    return _default

def _forward_turtle(name):
    def call(*args,**kwargs):return getattr(_default_turtle(),name)(*args,**kwargs)
    call.__name__=name
    return call

def _forward_screen(name):
    def call(*args,**kwargs):return getattr(Screen(),name)(*args,**kwargs)
    call.__name__=name
    return call

_turtle_functions='forward fd backward back bk left lt right rt goto setpos setposition setheading seth heading home position pos xcor ycor setx sety distance towards circle penup up pu pendown down pd isdown pensize width pencolor fillcolor color begin_fill end_fill filling dot speed hideturtle ht showturtle st isvisible shape clear reset write getscreen getturtle getpen degrees radians'.split()
_screen_functions='setup bgcolor title colormode tracer delay update window_width window_height turtles clearscreen resetscreen mainloop done bye'.split()
for _name in _turtle_functions:globals()[_name]=_forward_turtle(_name)
for _name in _screen_functions:globals()[_name]=_forward_screen(_name)
__all__=['Turtle','Pen','Screen','Vec2D','TurtleGraphicsError','Terminator']+_turtle_functions+_screen_functions

def __getattr__(name):
    if name.startswith('__'):raise AttributeError(name)
    raise NotImplementedError('turtle.'+name+' is not supported by the CodePad drawing profile.')

def _codepad_finish():
    if _screen is not None and not _screen._closed:_screen._flush(True)
