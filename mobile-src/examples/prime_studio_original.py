"""غربال استودیو — Python-only, genuinely scrollable CodePad program.

Requires CodePad 3.5.0 HighGUI touch support (checked against its source).
No HTML, JavaScript source, Turtle, page selection, or package install.
The optional CodePad text bridge rasterizes Persian glyphs; all layout,
sieving, scrolling, gestures, hit testing, and drawing are Python/NumPy.
"""
from collections import OrderedDict
from math import ceil, cos, exp, floor, isqrt, sin
import time
import numpy as np
import cv2

LIMIT = 1_000_000
WIDTH, HEIGHT = 440, 700
TOP, BOTTOM = 266, 644
COLS, CELL_W, ROW_H = 7, 54, 48
WINDOW = 'Prime Studio | Python'
DIGITS = str.maketrans('0123456789-', '۰۱۲۳۴۵۶۷۸۹−')


def fa(value):
    return str(value).translate(DIGITS)


def color(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i+2], 16) for i in (4, 2, 0))


BG = color('0c1020')
PANEL = color('171d31')
LINE = color('2b344d')
WHITE = color('eef0fb')
MUTED = color('a1abc5')
LIME = color('d5f585')
VIOLET = color('b3a4fc')
CORAL = color('e9a29b')


def read_integer(prompt):
    while True:
        raw = input(prompt).strip().replace('−', '-')
        try:
            number = int(raw)
        except ValueError:
            print('فقط عدد صحیح وارد کن.')
            continue
        if abs(number) <= LIMIT:
            return number
        print('عدد باید بین منفی یک میلیون و یک میلیون باشد.')


def sieve(first, second):
    lo, hi = sorted((first, second))
    flags = bytearray(b'\x01') * (max(hi, 1) + 1)
    flags[:2] = b'\x00\x00'
    for p in range(2, isqrt(max(hi, 0)) + 1):
        if flags[p]:
            start = p*p
            flags[start::p] = b'\x00' * ((hi-start)//p + 1)
    primes = [n for n in range(max(2, lo), hi+1) if flags[n]]
    return lo, hi, flags, primes


class Scroll:
    """Continuous pixel offset, overscroll bounds, dragging and inertia."""
    def __init__(self, count):
        self.offset = 0.0
        self.velocity = 0.0
        self.drag = None
        self.set_count(count)

    def set_count(self, count):
        self.count = count
        self.content_height = max(0, ceil(count/COLS)*ROW_H + 14)
        self.maximum = max(0, self.content_height-(BOTTOM-TOP))
        self.offset = min(self.offset, self.maximum)

    def move(self, value):
        self.offset = min(float(self.maximum), max(0.0, float(value)))

    def begin(self, x, y, now):
        self.velocity = 0.0
        self.drag = dict(x=x, y=y, last=y, time=now, start=self.offset,
                         moved=False, bar=x>=413)
        if self.drag['bar']:
            self.bar_to(y)

    def bar_to(self, y):
        track = BOTTOM-TOP-10
        handle = self.handle_height()
        self.move((y-TOP-5-handle/2)/max(1,track-handle)*self.maximum)

    def handle_height(self):
        track = BOTTOM-TOP-10
        return min(track,max(26,track*(BOTTOM-TOP)/max(1,self.content_height)))

    def update_drag(self, x, y, now):
        if self.drag is None:
            return
        d = self.drag
        if abs(y-d['y'])>5 or abs(x-d['x'])>5:
            d['moved'] = True
        if d['bar']:
            self.bar_to(y)
        else:
            self.move(d['start']+d['y']-y)
            dt=max(.001,now-d['time'])
            self.velocity=max(-1800,min(1800,(d['last']-y)/dt))
        d['last'],d['time']=y,now

    def end(self, now):
        d,self.drag=self.drag,None
        if d and (d['bar'] or now-d['time']>.12 or not d['moved']):
            self.velocity=0.0
        return d

    def tick(self, dt):
        if self.drag or abs(self.velocity)<5:
            self.velocity=0.0
            return
        before=self.offset
        self.move(self.offset+self.velocity*dt)
        self.velocity*=exp(-7*dt)
        if self.offset==before:
            self.velocity=0.0


class Text:
    def __init__(self):
        self.cache=OrderedDict()
        try:
            from js import _codepad_vision
            self.bridge=_codepad_vision
        except ImportError:
            self.bridge=None

    def mask(self, content, size):
        key=(str(content),size)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        if self.bridge is not None:
            result=self.bridge.text_mask(str(content),size/30,1)
            rgba=np.frombuffer(result.data.to_py(),dtype=np.uint8)
            alpha=rgba.reshape(int(result.height),int(result.width),4)[:,:,3].copy()
        else:
            # Desktop preview only; Pillow is never needed inside CodePad.
            from PIL import Image, ImageDraw, ImageFont
            font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',size)
            box=font.getbbox(str(content))
            image=Image.new('L',(max(1,box[2]-box[0]+4),max(1,box[3]-box[1]+4)))
            ImageDraw.Draw(image).text((2-box[0],2-box[1]),str(content),font=font,fill=255)
            alpha=np.array(image)
        self.cache[key]=alpha
        if len(self.cache)>320:
            self.cache.popitem(last=False)
        return alpha

    def draw(self, image, x, y, content, size=14, ink=WHITE, align='right'):
        alpha=self.mask(content,size)
        ah,aw=alpha.shape
        if align=='right': x-=aw
        elif align=='center': x-=aw//2
        x,y=int(x),int(y)
        x0,y0,x1,y1=max(0,x),max(0,y),min(image.shape[1],x+aw),min(image.shape[0],y+ah)
        if x1<=x0 or y1<=y0:
            return
        mask=alpha[y0-y:y1-y,x0-x:x1-x]>70
        image[y0:y1,x0:x1][mask]=ink


def rect(image, x, y, w, h, ink):
    x0,y0,x1,y1=max(0,int(x)),max(0,int(y)),min(image.shape[1],int(x+w)),min(image.shape[0],int(y+h))
    if x1>x0 and y1>y0:
        image[y0:y1,x0:x1]=ink


def poly(image, points, ink):
    """Small convex polygon rasterizer; no external drawing library."""
    ymin=max(0,int(floor(min(y for x,y in points))))
    ymax=min(image.shape[0]-1,int(ceil(max(y for x,y in points))))
    for y in range(ymin,ymax+1):
        yy=y+.5
        cuts=[]
        for i,(x1,y1) in enumerate(points):
            x2,y2=points[(i+1)%len(points)]
            if min(y1,y2)<=yy<max(y1,y2):
                cuts.append(x1+(yy-y1)*(x2-x1)/(y2-y1))
        if len(cuts)>=2:
            start=max(0,int(ceil(min(cuts))))
            end=min(image.shape[1],int(ceil(max(cuts))))
            if end>start:image[y,start:end]=ink


class Studio:
    def __init__(self, first, second):
        self.lo,self.hi,self.flags,self.primes=sieve(first,second)
        self.mode='all'
        self.scroll=Scroll(self.hi-self.lo+1)
        self.text=Text()
        self.detail='برای اسکرول، انگشتت را روی اعداد بالا و پایین بکش.'
        self.dirty=True

    def count(self):
        return len(self.primes) if self.mode=='prime' else self.hi-self.lo+1

    def number(self,index):
        return self.primes[index] if self.mode=='prime' else self.lo+index

    def switch(self, mode):
        self.mode=mode
        self.scroll.move(0)
        self.scroll.velocity=0
        self.scroll.set_count(self.count())
        self.detail='نمایش همهٔ عددها' if mode=='all' else 'فقط عددهای اول؛ برای دیدن ادامه اسکرول کن.'
        self.dirty=True

    def select(self,x,y):
        if not TOP<=y<BOTTOM:
            return
        col=int((x-24)//CELL_W)
        row=int((y-TOP+self.scroll.offset-10)//ROW_H)
        index=row*COLS+col
        if not (24<=x<24+COLS*CELL_W and 0<=col<COLS and 0<=index<self.count() and row>=0):
            return
        n=self.number(index)
        if n<2:
            self.detail=fa(n)+' اول یا مرکب نیست.'
        elif self.flags[n]:
            self.detail=fa(n)+' اول است؛ فقط بر ۱ و خودش بخش‌پذیر است.'
        else:
            p=next(p for p in range(2,isqrt(n)+1) if n%p==0)
            self.detail=fa(n)+' = '+fa(p)+' × '+fa(n//p)+'؛ عدد مرکب'
        self.dirty=True

    def on_mouse(self,event,x,y,flags,param):
        now=time.monotonic()
        if event==cv2.EVENT_LBUTTONDOWN:
            if 192<=y<=228:
                if x<220:self.switch('all')
                else:self.switch('prime')
            elif TOP<=y<BOTTOM:
                self.scroll.begin(x,y,now)
            elif 650<=y<=686:
                if x<72:self.scroll.move(0);self.scroll.velocity=0
                elif x>370:self.scroll.move(self.scroll.maximum);self.scroll.velocity=0
        elif event==cv2.EVENT_MOUSEMOVE:
            self.scroll.update_drag(x,y,now)
        elif event==cv2.EVENT_LBUTTONUP:
            gesture=self.scroll.end(now)
            if gesture and not gesture['moved'] and not gesture['bar']:
                self.select(x,y)
        elif event==10: # Native desktop OpenCV mouse wheel, if forwarded.
            delta=(flags>>16)&65535
            if delta>=32768:delta-=65536
            self.scroll.move(self.scroll.offset-delta/120*ROW_H*3)
        self.dirty=True

    def tile(self,image,x,y,n):
        prime=n>=2 and bool(self.flags[n])
        face=LIME if prime else (color('171e30') if n<2 else color('33364b'))
        side=color('738941') if prime else color('202538')
        top=color('ebffae') if prime else color('484c67')
        rect(image,x,y,43,30,face)
        poly(image,[(x,y),(x+5,y-5),(x+48,y-5),(x+43,y)],top)
        poly(image,[(x+43,y),(x+48,y-5),(x+48,y+25),(x+43,y+30)],side)
        size=16 if len(str(n))<=3 else (12 if len(str(n))<=6 else 10)
        ink=color('253119') if prime else MUTED
        self.text.draw(image,x+21,y+6,fa(n),size,ink,'center')

    def frame(self):
        image=np.empty((HEIGHT,WIDTH,3),dtype=np.uint8);image[:]=BG
        t=self.text.draw
        t(image,416,14,'غربال استودیو',23,WHITE)
        t(image,24,22,'PYTHON / SCROLL',10,VIOLET,'left')
        rect(image,24,52,392,1,LINE)
        t(image,416,67,'نظم پنهان میان عددها',22,LIME)
        # Isometric cube: three shaded faces, all drawn by Python.
        poly(image,[(34,77),(59,66),(84,78),(58,91)],VIOLET)
        poly(image,[(34,77),(58,91),(58,119),(34,105)],color('786499'))
        poly(image,[(58,91),(84,78),(84,106),(58,119)],color('a594d3'))
        t(image,416,105,'از '+fa(self.lo)+' تا '+fa(self.hi)+'؛ دو سر بازه محاسبه می‌شوند',12,MUTED)
        rect(image,24,137,392,47,PANEL)
        positive=max(0,self.hi-max(2,self.lo)+1)
        for x,title,value,ink in [(350,'کل',self.hi-self.lo+1,WHITE),(220,'اول',len(self.primes),LIME),(89,'مرکب',positive-len(self.primes),CORAL)]:
            t(image,x+40,141,title,11,MUTED)
            t(image,x-3,157,fa(value),17,ink,'center')
        for x,mode,title in [(24,'all','همهٔ عددها'),(224,'prime','فقط عددهای اول')]:
            rect(image,x,194,192,32,color('38354f') if self.mode==mode else PANEL)
            t(image,x+96,201,title,13,VIOLET if self.mode==mode else MUTED,'center')
        t(image,416,239,self.detail,11,MUTED)
        # Virtualized grid: only the visible rows are rendered, regardless of range size.
        board=image[TOP:BOTTOM].copy()
        count=self.count()
        start_row=max(0,int(self.scroll.offset//ROW_H)-1)
        end_row=min(ceil(count/COLS),int((self.scroll.offset+BOTTOM-TOP)//ROW_H)+2)
        for row in range(start_row,end_row):
            y=int(10+row*ROW_H-self.scroll.offset)
            for col in range(COLS):
                index=row*COLS+col
                if index>=count:break
                self.tile(board,24+col*CELL_W,y,self.number(index))
        if not count:t(board,220,60,'در این بازه عدد اولی وجود ندارد.',16,MUTED,'center')
        image[TOP:BOTTOM]=board
        # A real draggable scrollbar; no page changes or repeated runs.
        rect(image,420,TOP+5,4,BOTTOM-TOP-10,LINE)
        handle=self.scroll.handle_height()
        travel=BOTTOM-TOP-10-handle
        y=TOP+5+(self.scroll.offset/self.scroll.maximum*travel if self.scroll.maximum else 0)
        rect(image,417,y,10,handle,VIOLET)
        rect(image,0,TOP-3,WIDTH,1,LINE)
        rect(image,0,BOTTOM,WIDTH,1,LINE)
        t(image,47,657,'ابتدا',12,VIOLET,'center')
        t(image,393,657,'انتها',12,VIOLET,'center')
        if count:
            first=min(count,int(self.scroll.offset//ROW_H)*COLS+1)
            last=min(count,int(ceil((self.scroll.offset+BOTTOM-TOP)/ROW_H))*COLS)
            t(image,220,657,fa(first)+' تا '+fa(last)+' از '+fa(count),11,MUTED,'center')
        t(image,220,684,'با انگشت بکش؛ با لمس عدد، توضیحش را ببین.',10,MUTED,'center')
        return image

    def run(self):
        cv2.namedWindow(WINDOW,cv2.WINDOW_NORMAL)
        cv2.setMouseCallback(WINDOW,self.on_mouse)
        last=time.monotonic()
        try:
            cv2.imshow(WINDOW,self.frame())
            while cv2.getWindowProperty(WINDOW,cv2.WND_PROP_VISIBLE)>=1:
                now=time.monotonic();dt=min(.08,now-last);last=now
                before=self.scroll.offset
                self.scroll.tick(dt)
                if self.dirty or self.scroll.offset!=before:
                    cv2.imshow(WINDOW,self.frame())
                    self.dirty=False
                key=cv2.waitKey(20)
                if key in (27,ord('q')):break
                if key in (ord('j'),ord('s'),ord('2')):self.scroll.move(self.scroll.offset+ROW_H*3);self.dirty=True
                elif key in (ord('k'),ord('w'),ord('1')):self.scroll.move(self.scroll.offset-ROW_H*3);self.dirty=True
        finally:
            cv2.destroyAllWindows()


def main():
    first=read_integer('عدد اول بازه را وارد کن: ')
    second=read_integer('عدد دوم بازه را وارد کن: ')
    app=Studio(first,second)
    print('عددهای اول:',len(app.primes))
    print('برای اسکرول انگشتت را روی جدول بکش؛ نوار بنفش هم قابل کشیدن است.')
    app.run()


if __name__=='__main__':
    main()
