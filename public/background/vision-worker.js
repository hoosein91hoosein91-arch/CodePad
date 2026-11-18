import {interactiveInput,installInteractiveInput} from './interactive-input.js';
import {openCVOperation} from './vision-opencv.js';
import {mountProjectAssets} from './project-files.js';
import { imageOp, monitorPixels, cameraPixels } from './vision-kernels.js';
import { needsTurtle, needsCameraGraphics } from '../assets/vision-routing.js';
import { loadPyodide } from '../pyodide/pyodide.mjs';

let preferences={}, displayActive=false, monitorAck=null;
let job, engine, stopped = false, threadError = null, latestFrame = null, frameWaiter;
let nextRequest = 0, stdout = '', stderr = '';
const requests = new Map(), events = [], highguiEvents = [], threads = new Map(), keys = [];
const emit = data => self.postMessage({ id: job, ...data });
const vision = (type, data = {}, transfer = []) => self.postMessage({ vision: type, ...data }, transfer);
function request(type, data, transfer = []) {
  const requestId = ++nextRequest;
  return new Promise((resolve, reject) => {
    const timeout = ['save-image','turtle-batch'].includes(type) ? null : setTimeout(() => { requests.delete(requestId); reject(Error('زمان دریافت پاسخ دوربین تمام شد.')); }, 120000);
    requests.set(requestId, { resolve, reject, timeout });
    vision(type, { ...data, requestId }, transfer);
  });
}
let turtleColorContext;
const sleep = seconds => new Promise(resolve => setTimeout(resolve, Math.max(1, seconds * 1000)));
globalThis._codepad_vision = {
  sleep,
  window_create:(name,flags)=>vision('cv-window',{action:'create',name,flags}),
  window_destroy:name=>vision('cv-window',{action:'destroy',name}),
  window_mouse:(name,enabled)=>vision('cv-window',{action:'mouse',name,enabled}),
  highgui_events:()=>highguiEvents.splice(0),
  text_metrics(text,scale,thickness){
    const c=new OffscreenCanvas(1,1).getContext('2d');c.font=`${Math.max(1,scale*30)}px sans-serif`;
    const m=c.measureText(text),stroke=Math.max(0,thickness-1);
    return [Math.ceil(m.width+stroke*2),Math.ceil(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent+stroke*2),Math.ceil(m.actualBoundingBoxDescent+thickness)];
  },
  image_op: imageOp,
  camera_pixels: cameraPixels,
  cv_op:openCVOperation,
  turtle_batch: (json,present) => request('turtle-batch',{json,present}),
  turtle_wait() {vision('turtle-ready');return new Promise(()=>{});},
  turtle_bye:()=>vision('turtle-bye'),
  turtle_viewport:()=>({width:preferences.viewportWidth||800,height:preferences.viewportHeight||480}),
  turtle_color(value) {
    value=value.replace(/\s+/g,'');
    const gray=/^gr[ae]y(\d{1,3})$/i.exec(value);
    if(gray&&Number(gray[1])<=100){const v=Math.round(Number(gray[1])*255/100);value=`rgb(${v},${v},${v})`;}
    turtleColorContext ||= new OffscreenCanvas(1,1).getContext('2d');
    const c=turtleColorContext;c.fillStyle='#010203';c.fillStyle=value;const first=c.fillStyle;
    c.fillStyle='#040506';c.fillStyle=value;if(first!==c.fillStyle)throw Error('Invalid Turtle color');return value;
  },
  check_error() { if (threadError) throw Error(threadError); if (stopped) throw Error('اجرای Vision متوقف شد.'); },
  open_camera: index => request('camera', { index }),
  video_open:(name,data)=>request('video-file',{action:'open',name,data},[data.buffer]),
  video_read:(id,time)=>request('video-file',{action:'read',id,time}),
  video_close:id=>vision('video-file-close',{id}),
  async decode_image(data){
    if(data.byteLength>64*1024*1024)throw Error('Image file exceeds 64 MiB.');
    const bitmap=await createImageBitmap(new Blob([data]));
    try{if(bitmap.width*bitmap.height>16777216)throw Error('Image dimensions too large.');const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),c=canvas.getContext('2d');c.drawImage(bitmap,0,0);return {rgba:c.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};}finally{bitmap.close();}
  },
  camera_size: (width, height) => vision('camera-size', { width, height }),
  next_frame() {
    if (stopped) return Promise.resolve(null);
    vision('frame-consumed');
    if (latestFrame) { const frame = latestFrame; latestFrame = null; return Promise.resolve(frame); }
    return new Promise(resolve => { frameWaiter = resolve; });
  },
  close_camera() { vision('camera-close'); if (frameWaiter) { frameWaiter(null); frameWaiter = null; } },
  start_thread(target) {
    // Own the PyProxy across the async boundary; otherwise Python's temporary
    // argument proxy is automatically destroyed on returning from this call.
    const owned = target.copy();
    const promise = Promise.resolve().then(() => owned.callPromising()).catch(error => {
      threadError = String(error); vision('thread-error', { error: threadError });
    }).finally(() => { threads.set(promise, false); owned.destroy(); });
    threads.set(promise, true);
    return promise;
  },
  join_thread: (promise, timeout) => timeout == null ? promise : Promise.race([promise, sleep(timeout)]),
  thread_alive: promise => threads.get(promise) === true,
  text_mask(text, scale, thickness) {
    const fontSize = Math.max(1, scale * 30);
    const canvas = new OffscreenCanvas(1, 1), context = canvas.getContext('2d', { willReadFrequently: true });
    context.font = `${fontSize}px sans-serif`;
    canvas.width = Math.max(1, Math.ceil(context.measureText(text).width + thickness * 2 + 4));
    canvas.height = Math.ceil(fontSize * 1.4 + thickness * 2);
    const baseline = Math.ceil(fontSize * 1.1 + thickness);
    context.font = `${fontSize}px sans-serif`; context.fillStyle = 'white'; context.strokeStyle = 'white'; context.lineWidth = Math.max(0, thickness-1);
    if (thickness > 1) context.strokeText(text, thickness, baseline);
    context.fillText(text, thickness, baseline);
    return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, baseline };
  },
  monitor(name, frame, width, height) {
    if(displayActive&&!preferences.monitorVisible)return Promise.resolve(false);
    const rgba=monitorPixels(frame,width,height),previous=monitorAck||Promise.resolve();
    return previous.then(()=>{if(stopped)return false;const pending=request('monitor',{name,rgba,width,height},[rgba.buffer]).catch(error=>{threadError=String(error);return false;});monitorAck=pending;pending.then(()=>{if(monitorAck===pending)monitorAck=null;});return true;});
  },
  close_monitor: () => vision('monitor-close'),
  take_key() { return keys.length ? keys.shift() : -1; },
  save_png(name, data) { return request('save-image', { name, data }, [data.buffer]); },
  pose_options:(detection,tracking)=>vision('pose-options',{detection,tracking}),
  hand_options: (numHands, detection, tracking) => vision('hand-options', { numHands, detection, tracking }),
  display_size: (width, height) => {displayActive=true;vision('display', { width, height });},
  caption: title => vision('caption', { title }),
  end_display: () => vision('display-close'),
  events() { return events.splice(0); },
  render(data, projection, model, pointSize, clear, depth, blend) {
    vision('render', { data, projection, model, pointSize, clear, depth, blend }, [data.buffer, projection.buffer, model.buffer]);
  },
};
const input=interactiveInput(data=>self.postMessage(data),()=>job);
self.onmessage = async ({ data }) => {
  if(input.reply(data))return;
  if(data.visionMouse || data.visionWindowClosed){
    const value=data.visionMouse?{...data.visionMouse,type:'mouse'}:{name:data.visionWindowClosed,type:'close'};
    const last=highguiEvents.at(-1);
    if(value.type==='mouse'&&value.event===0&&last?.type==='mouse'&&last.event===0&&last.name===value.name)highguiEvents[highguiEvents.length-1]=value;
    else{if(highguiEvents.length>=128){const move=highguiEvents.findIndex(e=>e.type==='mouse'&&e.event===0);highguiEvents.splice(move<0?0:move,1);}highguiEvents.push(value);}return;
  }
  if(data.visionPreferences) {preferences=data.visionPreferences;if(data.id==null)return;}
  if (data.reply) {
    const pending = requests.get(data.requestId);
    if (pending) { clearTimeout(pending.timeout); requests.delete(data.requestId); data.error ? pending.reject(Error(data.error)) : pending.resolve(data.value); }
    return;
  }
  if (data.visionFrame) {
    const frame = data.visionFrame;
    if (frameWaiter) { frameWaiter(frame); frameWaiter = null; } else latestFrame = frame;
    return;
  }
  if (data.visionKey != null) {
    const key = data.visionKey;
    const value = key.length === 1 && key.charCodeAt(0) < 128 ? key.charCodeAt(0) : ({Escape:27,Enter:13,Tab:9,Backspace:8}[key] ?? -1);
    if (value >= 0) { if (keys.length >= 128) keys.shift(); keys.push(value); if (events.length >= 128) events.shift(); events.push({ type: 768, key: value }); } return;
  }
  if (data.visionQuit) { events.push({ type: 256 }); return; }
  if (data.id == null || job != null) return;
  job = data.id;
  try {
    if (!WebAssembly.Suspending || !WebAssembly.promising) throw Error('اجرای این کد به Chrome یا Android System WebView نسخهٔ ۱۳۷ یا جدیدتر با JSPI نیاز دارد.');
    const moduleSources=(data.assets||[]).filter(a=>/\.py$/i.test(a.name)&&a.buf).map(a=>new TextDecoder().decode(a.buf));
    const withTurtle=needsTurtle(data.code,moduleSources),withVision=needsCameraGraphics(data.code,moduleSources);
    emit({progress:withVision?'در حال آماده‌سازی Python Vision و NumPy…':'در حال آماده‌سازی Python و Turtle…'});
    // The bundled Python OpenCV wheel executes directly on NumPy buffers.
    // Avoid starting a second OpenCV.js WASM runtime for the same job.
    engine = await loadPyodide({ indexURL: new URL('../pyodide/', import.meta.url).href });
    if(withVision){await engine.loadPackage(['numpy','opencv-python']);engine.runPython('import cv2 as _codepad_native_cv2');}
    const {path:sourcePath}=mountProjectAssets(engine,data.assets||[],data.entryFile,data.code);
    if(withVision) {
      const compatibility=await fetch(new URL('./vision-compat.py',import.meta.url));
      if(!compatibility.ok)throw Error('فایل سازگاری Python Vision پیدا نشد.');
      engine.runPython(await compatibility.text());
      const extended=await fetch(new URL('./vision-opencv.py',import.meta.url));
      if(!extended.ok)throw Error('فایل پشتیبانی OpenCV پیدا نشد.');
      engine.runPython(await extended.text());
      const gui=await fetch(new URL('./vision-highgui.py',import.meta.url));if(!gui.ok)throw Error('فایل پشتیبانی پنجرهٔ OpenCV پیدا نشد.');engine.runPython(await gui.text());
      for(const name of ['vision-video.py','vision-native-cv.py','vision-pose.py']){const r=await fetch(new URL('./'+name,import.meta.url));if(!r.ok)throw Error('OpenCV support file missing: '+name);engine.runPython(await r.text());}
    }
    if(withVision){engine.FS.mkdirTree('/codepad-compat');const r=await fetch(new URL('./codepad_tracking.py',import.meta.url));if(!r.ok)throw Error('کتابخانهٔ ردیابی پیدا نشد.');engine.FS.writeFile('/codepad-compat/codepad_tracking.py',await r.text());engine.runPython('import sys; sys.path.insert(0, "/codepad-compat")');}
    if(withTurtle) {
      const compatibility=await fetch(new URL('./vision-turtle.py',import.meta.url));
      if(!compatibility.ok)throw Error('فایل پشتیبانی Turtle پیدا نشد.');
      engine.FS.mkdirTree('/codepad-compat');
      engine.FS.writeFile('/codepad-compat/turtle.py',await compatibility.text());
      engine.runPython('import sys; sys.path.insert(0, "/codepad-compat")');
    }
    engine.setStdout({ batched: text => { stdout = (stdout + text + '\n').slice(-262144); emit({ stream: true, kind: 'out', text: text + '\n' }); } });
    engine.setStderr({ batched: text => { stderr = (stderr + text + '\n').slice(-262144); emit({ stream: true, kind: 'err', text: text + '\n' }); } });
    if(/(?:^|[\n;])\s*(?:from\s+(?:PIL|codepad)\b|import\s+(?:PIL|codepad)\b)/m.test(data.code+'\n'+(data.assets||[]).filter(a=>/\.py$/i.test(a.name)&&a.buf).map(a=>new TextDecoder().decode(a.buf)).join('\n'))){const graphics=await(await fetch(new URL('../pyodide/codepad-graphics-packages.json',import.meta.url))).json();await engine.loadPackage(graphics.files.map(n=>new URL('../pyodide/'+n,import.meta.url).href));}
    await installInteractiveInput(engine,input,data.stdin||'');
    engine.globals.set('_codepad_display_image',json=>self.postMessage({id:job,image:JSON.parse(json)}));
    const globals = engine.runPython('dict(__name__="__main__", __file__=_codepad_filename)');
    emit({ phase: 'run' });
    vision('ready');
    // Execute the exact submitted source. No AST rewriting or line edits.
    try { await engine.runPythonAsync(data.code, { globals, filename: sourcePath }); }
    finally {
      try {if(withTurtle)await engine.runPythonAsync('import turtle; turtle._codepad_finish()');}
      finally {globals.destroy();}
    }
    await Promise.race([Promise.all([...threads.keys()]), sleep(2)]);
    if(monitorAck)await monitorAck;
    if (threadError) throw Error(threadError);
    emit({ stdout, stderr, displayStderr:'', streamed: true, done: true });
  } catch (error) {
    emit({ stdout, stderr: stderr + (error.message || String(error)), displayStderr:error.message||String(error), streamed: true, done: true });
  } finally { stopped = true; vision('finished'); }
};
