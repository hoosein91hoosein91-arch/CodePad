import {ProjectVideoDecoder} from './vision-video.js';
const BrowserWorker = window.CodePadBrowserWorker || window.Worker;
const FallbackWorker = window.Worker;
const base = new URL('../', import.meta.url);
const sessions = new Set();
import { needsVision, needsHandTracking, needsPoseTracking } from './vision-routing.js';
export { needsVision };

import { saveVisionImage } from './vision-files.js';
import { TurtleRenderer } from './vision-turtle-renderer.js';
import { TurtlePlayback } from './vision-turtle-playback.js';
import { PointRenderer } from './vision-renderer.js';
const preferenceKey = 'codepad-vision-render-v1';
function loadPreferences() {
  try { const value=JSON.parse(localStorage.getItem(preferenceKey)||'{}'); return {quality:['light','balanced','high'].includes(value.quality)?value.quality:'balanced',effects:value.effects!==false,monitorVisible:value.monitorVisible===true,processing:value.processing==='full'?'full':'fast',monitorMode:value.monitorMode==='auto'?'auto':'compatible'}; }
  catch { return {quality:'balanced',effects:true,monitorVisible:false,processing:'fast',monitorMode:'compatible'}; }
}

class VisionSession {
  constructor(owner, payload) {
    this.owner = owner; this.payload = payload; this.alive = true; this.cameraGeneration = 0;
    this.frames = 0; this.monitorFrames = 0; this.captured = 0; this.handCount = 0; this.pendingHands = 0; this.width = 480; this.height = 360;
    this.root = document.createElement('dialog'); this.root.className = 'cp-vision'; this.root.dataset.testid = 'python-vision';this.root.dataset.entryFile=payload.entryFile||'main.py';this.root.setAttribute('role','dialog');this.root.dataset.state='open';
    this.preferences = loadPreferences(); this.processing=this.preferences.processing; this.root.dataset.monitorVisible=String(this.preferences.monitorVisible);
    this.metricsSince=performance.now();this.metricsFrames=0;this.lastMetrics=0;this.fps=0;
    this.root.innerHTML = `<section class="cp-vision-shell" dir="rtl"><header><div class="cp-vision-title"><small>PYTHON <span>VISION</span></small><h2>اجرای دوربین و سه‌بعدی</h2></div><div class="cp-vision-actions"><button type="button" data-expand aria-pressed="false" title="نمایش فقط خروجی برنامه">فقط خروجی · تمام‌صفحه</button><button type="button" data-close aria-label="توقف و بستن">توقف و بستن</button></div></header><div class="cp-vision-toolbar"><p role="status" data-status>در حال آماده‌سازی موتور…</p><button type="button" data-monitor-rebuild hidden>بازسازی تصویر</button><button type="button" data-turtle-save hidden>ذخیرهٔ PNG</button><details class="cp-vision-settings"><summary>تنظیم تصویر</summary><div class="cp-vision-settings-panel"><label>دقت دوربین · اجرای بعدی<select data-processing aria-label="پردازش دوربین"><option value="fast">سریع · حداکثر ۶۴۰ پیکسل</option><option value="full">دقت درخواستی کد</option></select></label><label>نمایش دوربین<select data-monitor-mode aria-label="روش نمایش دوربین"><option value="compatible">سازگار با دستگاه</option><option value="auto">خودکار</option></select></label><label>کیفیت سه‌بعدی<select data-quality aria-label="کیفیت تصویر"><option value="light">سبک</option><option value="balanced">متعادل</option><option value="high">بالا</option></select></label><button type="button" data-effects>درخشش</button><button type="button" data-monitor-toggle title="فقط نمایش تصویر تغییر می‌کند؛ تشخیص دست فعال می‌ماند">تصویر دوربین</button></div></details></div><div class="cp-vision-stage"><p data-display-empty class="cp-vision-empty" role="status">در انتظار اولین تصویر برنامه…</p><canvas data-turtle hidden aria-label="نقاشی Turtle"></canvas><canvas data-stage width="1000" height="700" aria-label="خروجی سه‌بعدی Python"></canvas><figure hidden><canvas data-monitor aria-label="تصویر دوربین و تشخیص دست"></canvas><figcaption>دوربین · پردازش روی دستگاه</figcaption></figure></div><footer><span data-metrics>منتظر اجرای کد…</span><span class="cp-vision-footnote">Escape برای خروج</span><div class="cp-vision-keys" aria-label="کلیدهای برنامه"><span>کلیدهای برنامه</span><button type="button" data-vision-key="1" aria-label="ارسال کلید 1">1</button><button type="button" data-vision-key="2" aria-label="ارسال کلید 2">2</button><button type="button" data-vision-key="3" aria-label="ارسال کلید 3">3</button><button type="button" data-vision-key="c" aria-label="ارسال کلید C">C</button><button type="button" data-vision-key="s" aria-label="ارسال کلید S">S</button><button type="button" data-vision-key="+" aria-label="افزایش ضخامت قلم">+</button><button type="button" data-vision-key="-" aria-label="کاهش ضخامت قلم">−</button><button type="button" data-vision-key="q" aria-label="ارسال کلید Q">Q</button></div><span data-file-status role="status"></span></footer></section>`;
    document.body.append(this.root); this.root.showModal();
    const playbackControls=document.createElement('div');playbackControls.className='cp-turtle-controls';playbackControls.hidden=true;
    playbackControls.innerHTML=`<div class="cp-turtle-transport"><button type="button" data-turtle-pause aria-pressed="false">مکث رسم</button><button type="button" data-turtle-replay disabled>از ابتدا</button><label>سرعت رسم<select data-turtle-speed aria-label="سرعت رسم"><option value="0.5">۰٫۵×</option><option value="1" selected>۱×</option><option value="2">۲×</option><option value="4">۴×</option><option value="0">فوری</option></select></label></div><span data-turtle-progress aria-live="off">در انتظار رسم…</span>`;
    this.root.querySelector('.cp-vision-toolbar').after(playbackControls);
    playbackControls.querySelector('[data-turtle-pause]').onclick=()=>this.turtlePlayback?.togglePause();
    playbackControls.querySelector('[data-turtle-replay]').onclick=()=>this.turtlePlayback?.replay();
    playbackControls.querySelector('[data-turtle-speed]').onchange=event=>this.turtlePlayback?.setSpeed(event.target.value);
    this.status = this.root.querySelector('[data-status]'); this.metrics = this.root.querySelector('[data-metrics]');
    this.stage = this.root.querySelector('[data-stage]'); this.monitor = this.root.querySelector('[data-monitor]');
    this.cvClosedWindows=new Set();this.cvMouseEnabled=false;this.cvWindowName=null;
    const closeImage=document.createElement('button');closeImage.type='button';closeImage.dataset.cvWindowClose='';closeImage.textContent='بستن تصویر';closeImage.hidden=true;
    this.root.querySelector('[data-monitor-rebuild]').after(closeImage);this.cvCloseButton=closeImage;
    closeImage.onclick=()=>{if(!this.cvWindowName)return;this.cvClosedWindows.add(this.cvWindowName);this.worker?.postMessage({visionWindowClosed:this.cvWindowName});this.monitor.parentElement.hidden=true;closeImage.hidden=true;this.root.dataset.monitorState='closed';this.setDisplayEmpty('پنجرهٔ تصویر بسته شد.');};
    this.installMonitorEvents();
    this.stageObserver=new ResizeObserver(()=>this.fitMonitor());
    this.stageObserver.observe(this.root.querySelector('.cp-vision-stage'));
    this.root.querySelector('[data-close]').onclick = () => this.stop();
    this.outputBack=document.createElement('button');this.outputBack.type='button';this.outputBack.className='cp-output-back';this.outputBack.setAttribute('aria-label','بازگشت از تمام‌صفحه');this.outputBack.title='بازگشت · Escape';this.outputBack.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6"/></svg>';this.root.append(this.outputBack);
    this.outputBack.onclick=()=>this.setOutputOnly(false);
    this.root.querySelector('[data-expand]').onclick=()=>this.setOutputOnly(!this.outputOnly);
    this.root.addEventListener('pointermove',()=>this.showOutputControls(),{passive:true});
    this.root.addEventListener('pointerdown',()=>this.showOutputControls(),{passive:true});
    const processing=this.root.querySelector('[data-processing]');processing.value=this.preferences.processing;
    processing.onchange=()=>{this.preferences.processing=processing.value;this.applyPreferences();};
    const quality=this.root.querySelector('[data-quality]');quality.value=this.preferences.quality;
    quality.onchange=()=>{this.preferences.quality=quality.value;this.applyPreferences();};
    const monitorMode=this.root.querySelector('[data-monitor-mode]');monitorMode.value=this.preferences.monitorMode;
    monitorMode.onchange=()=>{this.preferences.monitorMode=monitorMode.value;this.applyPreferences();this.rebuildMonitor();};
    this.root.querySelector('[data-monitor-rebuild]').onclick=()=>{this.preferences.monitorMode='compatible';monitorMode.value='compatible';this.applyPreferences();this.rebuildMonitor();};
    this.root.querySelector('[data-effects]').onclick=()=>{this.preferences.effects=!this.preferences.effects;this.applyPreferences();};
    this.root.querySelector('[data-monitor-toggle]').onclick=()=>{this.preferences.monitorVisible=!this.preferences.monitorVisible;this.applyPreferences();};
    this.applyPreferences();
    this.root.querySelector('[data-turtle-save]').onclick=()=>this.saveTurtle();
    this.root.querySelectorAll('[data-vision-key]').forEach(button => { button.onclick = () => this.sendKey(button.dataset.visionKey); });
    this.root.addEventListener('cancel', event => { event.preventDefault(); this.key({ key: 'Escape', preventDefault() {} }); });
    this.key = event => {
      if(this.outputOnly&&event.key==='Escape'){event.preventDefault();this.setOutputOnly(false);return;}
      if (!this.alive || this.saveInProgress || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (['Enter',' '].includes(event.key) && event.target?.closest?.('button,summary')) return;
      if(this.turtleRenderer&&event.key==='Escape'){event.preventDefault();this.stop();return;}
      if (event.key.length === 1 && event.key.charCodeAt(0) < 128 || ['Escape','Enter','Tab','Backspace'].includes(event.key)) {
        event.preventDefault(); this.sendKey(event.key);
      }
    };
    this.visibility = () => { if (document.visibilityState === 'hidden' && !this.saveInProgress) this.stop(); };
    window.addEventListener('keydown', this.key); document.addEventListener('visibilitychange', this.visibility);
    if(window.__CODEPAD_DIRECT_PYTHON__)this.setOutputOnly(true);
    try {
      this.worker = new BrowserWorker(new URL('background/vision-worker.js', base), { type: 'module' });
      this.worker.onmessage = ({ data }) => this.message(data);
      this.worker.onerror = error => this.fail(error.message || 'موتور Vision متوقف شد.');
      this.worker.postMessage({...payload,visionPreferences:{...this.preferences,viewportWidth:innerWidth,viewportHeight:innerHeight}});
      sessions.add(this);
    } catch (error) { queueMicrotask(() => this.fail(error.message)); }
  }
  async saveTurtle() {
    if(!this.turtleRenderer||this.saveInProgress)return;
    this.saveInProgress=true;
    const button=this.root.querySelector('[data-turtle-save]'),close=this.root.querySelector('[data-close]'),status=this.root.querySelector('[data-file-status]');
    button.disabled=true;close.disabled=true;
    try {
      const blob=await this.turtleRenderer.png();
      const saved=await saveVisionImage('turtle_'+new Date().toISOString().replace(/[:.]/g,'-')+'.png',new Uint8Array(await blob.arrayBuffer()));
      status.textContent=saved?'نقاشی PNG ذخیره شد.':'ذخیره لغو شد.';
    } catch(error){status.textContent='ذخیره انجام نشد: '+error.message;}
    finally{this.saveInProgress=false;button.disabled=false;close.disabled=false;}
  }
  setOutputOnly(value){
    this.outputOnly=!!value;this.root.classList.toggle('cp-vision-output-only',this.outputOnly);this.root.classList.toggle('cp-vision-expanded',this.outputOnly);this.root.dataset.outputOnly=String(this.outputOnly);
    const button=this.root.querySelector('[data-expand]');button.setAttribute('aria-pressed',String(this.outputOnly));
    if(this.outputOnly){this.showOutputControls();this.root.tabIndex=-1;this.root.focus({preventScroll:true});}else{clearTimeout(this.outputControlTimer);button.focus({preventScroll:true});}
    this.fitMonitor();this.renderer?.redraw();
  }
  showOutputControls(){if(!this.outputOnly)return;this.root.classList.add('cp-output-controls-visible');clearTimeout(this.outputControlTimer);this.outputControlTimer=setTimeout(()=>this.root.classList.remove('cp-output-controls-visible'),2600);}
  ensureRenderer() {
    if (!this.renderer) this.renderer = new PointRenderer(this.stage,{...this.preferences,onContextLost:()=>this.fail('نمایش گرافیکی متوقف شد؛ دوباره اجرا کن. اگر تکرار شد، کیفیت سبک را انتخاب کن.')});
    return this.renderer;
  }
  setDisplayEmpty(message) {
    const node=this.root.querySelector('[data-display-empty]');node.textContent=message;node.hidden=false;
  }
  installMonitorEvents() {
    this.monitor.style.touchAction=this.cvMouseEnabled?'none':'';
    const sendNow=(event,kind)=>{
      if(!this.alive||!this.cvMouseEnabled||!this.cvWindowName||this.saveInProgress)return;
      const rect=this.monitor.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
      event.preventDefault();
      const x=Math.max(0,Math.min(this.monitor.width-1,Math.floor((event.clientX-rect.left)*this.monitor.width/rect.width)));
      const y=Math.max(0,Math.min(this.monitor.height-1,Math.floor((event.clientY-rect.top)*this.monitor.height/rect.height)));
      const flags=(event.buttons||0)|(event.ctrlKey?8:0)|(event.shiftKey?16:0)|(event.altKey?32:0)|(event.wheelBits||0);
      this.worker?.postMessage({visionMouse:{name:this.cvWindowName,event:kind,x,y,flags}});
    };
    const flush=()=>{if(this.pointerFrame)cancelAnimationFrame(this.pointerFrame);this.pointerFrame=null;if(this.pointerMove){const e=this.pointerMove;this.pointerMove=null;sendNow(e,0);}};
    const send=(e,kind)=>{if(kind===0){this.pointerMove=e;if(!this.pointerFrame)this.pointerFrame=requestAnimationFrame(flush);}else{flush();sendNow(e,kind);}};
    this.monitor.addEventListener('wheel',e=>{if(!this.cvMouseEnabled)return;e.preventDefault();const horizontal=Math.abs(e.deltaX)>Math.abs(e.deltaY);const raw=horizontal?e.deltaX:e.deltaY;const scale=e.deltaMode===1?16:e.deltaMode===2?this.monitor.height:1;const delta=Math.max(-32767,Math.min(32767,Math.round(-raw*scale*1.2)));flush();sendNow({clientX:e.clientX,clientY:e.clientY,buttons:e.buttons,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey,wheelBits:delta<<16,preventDefault(){}},horizontal?11:10);},{passive:false});
    this.monitor.addEventListener('pointerdown',e=>{if(this.cvMouseEnabled){this.monitor.setPointerCapture(e.pointerId);send(e,{0:1,1:3,2:2}[e.button]??1);}});
    this.monitor.addEventListener('pointermove',e=>send(e,0));
    this.monitor.addEventListener('pointerup',e=>send(e,{0:4,1:6,2:5}[e.button]??4));
    this.monitor.addEventListener('pointercancel',e=>send(e,4));
    this.monitor.addEventListener('dblclick',e=>send(e,{0:7,1:9,2:8}[e.button]??7));
    this.monitor.addEventListener('contextmenu',e=>{if(this.cvMouseEnabled)e.preventDefault();});
    this.monitor.addEventListener('contextlost',event=>{
      event.preventDefault();this.monitorPaintError=true;this.root.dataset.monitorState='lost';
      this.setDisplayEmpty('نمایش تصویر متوقف شد؛ «بازسازی تصویر» را بزن.');
    });
    this.monitor.addEventListener('contextrestored',()=>{this.monitorContext=null;this.monitorPaintError=false;this.paintMonitor();});
  }
  fitMonitor() {
    if(!this.root.classList.contains('cp-vision-camera-only')){this.monitor.style.removeProperty('width');this.monitor.style.removeProperty('height');return;}
    const bounds=this.root.querySelector('.cp-vision-stage').getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const scale=Math.min(bounds.width/this.monitor.width,bounds.height/this.monitor.height);
    const width=Math.max(1,Math.floor(this.monitor.width*scale))+'px',height=Math.max(1,Math.floor(this.monitor.height*scale))+'px';
    if(this.monitor.style.width!==width)this.monitor.style.width=width;
    if(this.monitor.style.height!==height)this.monitor.style.height=height;
  }
  rebuildMonitor() {
    const canvas=this.monitor.cloneNode(false);this.monitor.replaceWith(canvas);this.monitor=canvas;this.monitorContext=null;this.monitorPaintError=false;
    this.installMonitorEvents();this.root.dataset.monitorRebuilds=String(Number(this.root.dataset.monitorRebuilds||0)+1);
    this.paintMonitor();
  }
  paintMonitor() {
    if(!this.lastMonitorImage||this.monitorPaintError)return false;
    try {
      const image=this.lastMonitorImage;const sizeChanged=this.monitor.width!==image.width||this.monitor.height!==image.height;
      if(this.monitor.width!==image.width)this.monitor.width=image.width;
      if(this.monitor.height!==image.height)this.monitor.height=image.height;
      // This canvas is inside a modal/top layer. Keep its paint in the normal
      // compositor; compatible mode also avoids a dedicated GPU 2D surface.
      this.monitorContext ||= this.monitor.getContext('2d',{alpha:false,desynchronized:false,willReadFrequently:this.preferences.monitorMode!=='auto'});
      if(!this.monitorContext)throw Error('Canvas 2D در دسترس نیست.');
      this.monitorContext.putImageData(image,0,0);this.monitor.parentElement.hidden=false;
      this.root.dataset.monitorState='live';this.root.querySelector('[data-display-empty]').hidden=true;
      if(sizeChanged)this.fitMonitor();return true;
    }catch(error){
      if(this.preferences.monitorMode==='auto'){
        this.preferences.monitorMode='compatible';this.root.querySelector('[data-monitor-mode]').value='compatible';this.applyPreferences();this.rebuildMonitor();return this.root.dataset.monitorState==='live';
      }
      this.monitorPaintError=true;this.root.dataset.monitorState='error';this.setDisplayEmpty('تصویر نمایش داده نشد؛ «بازسازی تصویر» را بزن. '+error.message);return false;
    }
  }
  sendKey(key) { if (this.alive && !this.saveInProgress) this.worker?.postMessage({ visionKey: key }); }
  forward(data) { this.owner.dispatchEvent(new MessageEvent('message', { data })); }
  async message(data) {
    if (!this.alive) return;
    if (!data.vision) {
      if (data.progress) this.status.textContent = data.progress;
      if (data.done) { this.status.textContent = data.stderr ? 'اجرا با خطا پایان یافت.' : 'اجرا پایان یافت.'; this.finish(); }
      this.forward(data); return;
    }
    switch (data.vision) {
      case 'cv-window':{
        if(data.action==='create'){this.cvWindowName=data.name;this.cvClosedWindows.delete(data.name);this.cvCloseButton.hidden=false;this.monitor.setAttribute('aria-label',data.name);this.root.querySelector('h2').textContent=data.name;}
        else if(data.action==='mouse'){this.cvMouseEnabled=!!data.enabled;this.monitor.style.touchAction=this.cvMouseEnabled?'none':'';}
        else if(data.action==='destroy'&&(data.name==null||data.name===this.cvWindowName)){this.cvClosedWindows.add(this.cvWindowName);this.cvCloseButton.hidden=true;this.cvMouseEnabled=false;this.monitor.style.touchAction='';this.monitor.parentElement.hidden=true;this.root.dataset.monitorState='closed';}
        break;
      }
      case 'turtle-batch': {
        try {
          const batch=JSON.parse(data.json);
          this.root.classList.add('cp-vision-turtle');this.root.classList.remove('cp-vision-camera-only');
          this.root.querySelector('[data-display-empty]').hidden=true;
          this.root.querySelector('.cp-vision-title small span').textContent='TURTLE';
          this.root.querySelector('h2').textContent=batch.title;
          this.root.querySelector('[data-turtle-save]').hidden=false;
          const canvas=this.root.querySelector('[data-turtle]');canvas.hidden=false;
          this.turtleRenderer ||= new TurtleRenderer(canvas);
          if(!this.turtlePlayback){
            this.root.querySelector('.cp-turtle-controls').hidden=false;
            this.turtlePlayback=new TurtlePlayback(this.turtleRenderer,state=>{
              const pause=this.root.querySelector('[data-turtle-pause]');pause.textContent=state.paused?'ادامهٔ رسم':'مکث رسم';pause.setAttribute('aria-pressed',String(state.paused));pause.disabled=!state.playing;
              this.root.querySelector('[data-turtle-replay]').disabled=!state.sealed||!state.replayAvailable;
              this.root.dataset.turtlePlaying=String(state.playing);this.root.dataset.turtleSteps=String(state.completed);
              this.root.querySelector('[data-turtle-progress]').textContent=state.paused?'رسم مکث شده':state.playing?'در حال رسم · '+state.completed.toLocaleString('fa-IR')+' مرحله':state.sealed?'رسم کامل شد':'دریافت ادامهٔ رسم…';
            });
          }
          this.status.textContent='در حال رسم نقاشی…';
          this.metrics.textContent=`${batch.width} × ${batch.height} · Turtle`;
          await this.turtlePlayback.enqueue(batch,data.present);
          if(this.alive)this.worker.postMessage({reply:true,requestId:data.requestId,value:true});
        } catch(error){if(this.alive)this.worker.postMessage({reply:true,requestId:data.requestId,error:error.message});}
        break;
      }
      case 'turtle-ready':this.turtlePlayback?.seal();this.status.textContent='نقاشی آماده است؛ می‌توانی ذخیره یا بازپخش کنی.';this.root.dataset.turtleReady='true';break;
      case 'turtle-bye':this.turtlePlayback?.dispose();this.root.close();this.root.remove();break;
      case 'save-image': {
        this.saveInProgress = true;
        const close = this.root.querySelector('[data-close]'), status = this.root.querySelector('[data-file-status]');
        close.disabled = true; status.textContent = 'در حال ذخیرهٔ تصویر…';
        let saved = false;
        try {
          saved = await saveVisionImage(data.name, data.data);
          status.textContent = saved ? 'تصویر ذخیره شد.' : 'ذخیره لغو شد.';
          if (saved) this.root.dataset.savedImages = String(Number(this.root.dataset.savedImages || 0) + 1);
        } catch (error) { status.textContent = 'ذخیره انجام نشد: ' + error.message; }
        finally {
          this.saveInProgress = false; close.disabled = false;
          if (this.alive) this.worker.postMessage({ reply: true, requestId: data.requestId, value: saved });
        }
        break;
      }
      case 'video-file': {
        try{this.fileDecoder ||= new ProjectVideoDecoder();const value=await this.fileDecoder.call(data);if(data.action==='open'&&this.alive){this.inputKind='video';this.status.textContent='پردازش فایل ویدیو؛ خروجی برنامه در این پنجره نمایش داده می‌شود.';this.root.querySelector('figcaption').textContent='فایل ویدیو · پردازش روی دستگاه';}if(this.alive)this.worker.postMessage({reply:true,requestId:data.requestId,value},value?.rgba?[value.rgba.buffer]:[]);}
        catch(error){if(this.alive)this.worker.postMessage({reply:true,requestId:data.requestId,error:error.message});}
        break;
      }
      case 'video-file-close':this.fileDecoder?.close(data.id);break;
      case 'camera': {
        try { this.inputKind='camera';this.root.querySelector('figcaption').textContent='دوربین · پردازش روی دستگاه';await this.openCamera(data.index); if (this.alive) this.worker.postMessage({ reply: true, requestId: data.requestId, value: true }); }
        catch (error) { if (this.alive) this.worker.postMessage({ reply: true, requestId: data.requestId, error: this.cameraError(error) }); }
        break;
      }
      case 'frame-consumed': this.cameraDemand = true; this.captureNext?.(performance.now()); break;
      case 'camera-size': this.width = data.width; this.height = data.height; break;
      case 'camera-close': this.closeCamera(); break;
      case 'pose-options':{const c=v=>Number.isFinite(v)?Math.min(1,Math.max(0,v)):.5;this.poseOptions={minPoseDetectionConfidence:c(data.detection),minPosePresenceConfidence:c(data.tracking),minTrackingConfidence:c(data.tracking)};this.cameraWorker?.postMessage({poseOptions:this.poseOptions});break;}
      case 'hand-options': {
        const confidence=(value,fallback)=>Number.isFinite(value)?Math.min(1,Math.max(0,value)):fallback;
        this.handOptions = { numHands: Math.min(2,Math.max(1,Math.round(data.numHands)||1)),
          minHandDetectionConfidence:confidence(data.detection,.55),
          minHandPresenceConfidence:confidence(data.tracking,.5),
          minTrackingConfidence:confidence(data.tracking,.5) };
        this.cameraWorker?.postMessage({ options: this.handOptions }); break;
      }
      case 'display': try {this.ensureRenderer().setSourceSize(data.width,data.height);} catch(error) {this.fail(error.message);} break;
      case 'caption': this.root.querySelector('h2').textContent = data.title; this.root.querySelector('h2').title=data.title; break;
      case 'render':
        this.root.classList.remove('cp-vision-camera-only');
        this.root.querySelector('[data-display-empty]').hidden=true;this.root.querySelector('[data-monitor-rebuild]').hidden=true;this.root.querySelector('[data-monitor-toggle]').disabled=false;this.fitMonitor();
        try { this.ensureRenderer().draw(data); this.frames++; this.root.dataset.frames = String(this.frames); this.root.dataset.points = String(data.data.byteLength / 28); this.root.dataset.color = [...new Float32Array(data.data.buffer, data.data.byteOffset, 7).slice(3)].map(value => Number(value.toFixed(2))).join(','); this.updateMetrics(); }
        catch (error) { this.fail(error.message); }
        break;
      case 'monitor': {
        if(this.cvClosedWindows.has(data.name)){if(data.requestId)this.worker?.postMessage({reply:true,requestId:data.requestId,value:false});break;}
        if(this.pendingMonitor?.requestId)this.worker?.postMessage({reply:true,requestId:this.pendingMonitor.requestId,value:false});
        this.pendingMonitor=data;
        if(!this.monitorFrame)this.monitorFrame=requestAnimationFrame(()=>{
          this.monitorFrame=null;const frame=this.pendingMonitor;this.pendingMonitor=null;if(!frame||!this.alive)return;
          try{
            if(!this.frames){this.root.classList.add('cp-vision-camera-only');this.root.querySelector('.cp-vision-title small span').textContent=this.inputKind==='video'?'VIDEO':this.inputKind==='camera'?'CAMERA':'OUTPUT';if(frame.name?.trim())this.root.querySelector('h2').textContent=frame.name;this.root.querySelector('[data-monitor-rebuild]').hidden=false;this.root.querySelector('[data-monitor-toggle]').disabled=true;}
            if(!(this.frames&&!this.preferences.monitorVisible)){
              this.lastMonitorImage=new ImageData(frame.rgba,frame.width,frame.height);
              if(this.paintMonitor()){this.monitorFrames++;this.root.dataset.monitorFrames=String(this.monitorFrames);this.root.dataset.processingSize=`${frame.width}×${frame.height}`;this.updateMetrics();}
            }
          }finally{if(frame.requestId)this.worker?.postMessage({reply:true,requestId:frame.requestId,value:true});}
        });break;
      }
      case 'ready':this.status.textContent='پایتون آماده است؛ خروجی برنامه در همین پنجره نمایش داده می‌شود.';break;
      case 'monitor-close': this.monitor.parentElement.hidden = true;this.root.dataset.monitorState='closed';if(!this.frames)this.setDisplayEmpty('پنجرهٔ تصویر توسط برنامه بسته شد.');break;
      case 'thread-error': this.status.textContent = 'خطا در پردازش دوربین؛ جزئیات در خروجی Python است.'; break;
    }
  }
  applyPreferences() {
    this.root.dataset.monitorVisible=String(this.preferences.monitorVisible);
    this.root.querySelector('[data-effects]').setAttribute('aria-pressed',String(this.preferences.effects));
    this.root.querySelector('[data-monitor-toggle]').setAttribute('aria-pressed',String(this.preferences.monitorVisible));
    this.renderer?.setOptions(this.preferences);
    this.root.dataset.processing=this.processing;
    this.root.dataset.monitorMode=this.preferences.monitorMode;
    this.worker?.postMessage({visionPreferences:this.preferences});
    try { localStorage.setItem(preferenceKey,JSON.stringify(this.preferences)); } catch {}
  }
  updateMetrics(force=false) {
    const now=performance.now(),sample=now-this.lastMetrics>=500;if(!sample&&!force)return;
    if(sample) {
    const count=this.frames||this.monitorFrames;
    this.fps=(count-this.metricsFrames)/Math.max(0.001,(now-this.metricsSince)/1000);
    this.metricsSince=now;this.metricsFrames=count;this.lastMetrics=now;
    }
    const format=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0});
    let tracking=this.inputKind==='video'?'فایل ویدیوی پروژه':this.inputKind!=='camera'?'خروجی برنامه':this.pendingHands&&!this.handCount?'در حال تأیید دست':`${format.format(this.handCount)} دست تأییدشده`;
    if(this.payload.trackPose)tracking+=this.bodyCount?' · ۱ بدن':' · بدن تأیید نشده';
    this.metrics.textContent=this.frames?`${format.format(Number(this.root.dataset.points)||0)} ذره · ${format.format(this.fps)} فریم/ثانیه · ${tracking}`:`${format.format(this.fps)} فریم/ثانیه · ${this.root.dataset.processingSize || "دوربین فعال"} · ${tracking}`;
  }
  cameraError(error) {
    if (error.name === 'NotAllowedError') return 'مجوز دوربین داده نشد. اجازهٔ دوربین را در مرورگر یا تنظیمات برنامه فعال کن و دوباره اجرا کن.';
    if (error.name === 'NotFoundError') return 'دوربینی پیدا نشد. دوربین را وصل کن و دوباره اجرا کن.';
    if (error.name === 'NotReadableError') return 'دوربین در دسترس نیست؛ ممکن است برنامهٔ دیگری از آن استفاده کند.';
    return error.message || String(error);
  }
  async openCamera(index) {
    if (!navigator.mediaDevices?.getUserMedia) throw Error('دوربین به HTTPS یا localhost و مرورگر به‌روز نیاز دارد.');
    this.status.textContent = 'منتظر اجازهٔ دوربین و آماده‌سازی مدل ردیابی…';
    const generation = ++this.cameraGeneration;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: index === 1 ? 'environment' : 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    if (!this.alive || this.cameraGeneration !== generation) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    const video = this.video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    if (!this.alive || this.cameraGeneration !== generation) { this.closeCamera(); return; }
    const cameraWorker = this.cameraWorker = new BrowserWorker(new URL('background/hand-camera-worker.js', base));
    const ready = new Promise((resolve, reject) => {
      this.cameraReadyReject = reject;
      const timeout = setTimeout(() => reject(Error('بارگذاری مدل ردیابی بیش از حد طول کشید.')), 60000);
      cameraWorker.onerror = event => { clearTimeout(timeout); reject(Error(event.message || 'خطا در بارگذاری MediaPipe')); this.fail(event.message || 'خطا در پردازش MediaPipe'); };
      cameraWorker.onmessage = ({ data }) => {
        if (!this.alive || this.cameraWorker !== cameraWorker) return;
        if (data.ready) { clearTimeout(timeout); this.cameraReadyReject = null; resolve(); }
        else if (data.error) { clearTimeout(timeout); reject(Error(data.error)); this.fail(data.error); }
        else if (data.frame) {
          const previousHands=this.handCount,previousPending=this.pendingHands;
          this.bodyCount=data.frame.poseLandmarks?.length===33?1:0;this.root.dataset.posePoints=String(data.frame.poseLandmarks?.length||0);this.cameraBusy = false; this.captured++; this.root.dataset.inferenceMs=String(data.frame.inferenceMs||0); this.root.dataset.detector=data.frame.delegate||'CPU'; this.handCount = data.frame.landmarks.length;
          this.root.dataset.cameraFrames = String(this.captured); this.root.dataset.hands = String(this.handCount); this.pendingHands=data.frame.pendingHands||0; this.root.dataset.pendingHands=String(this.pendingHands);
          this.worker.postMessage({ visionFrame: data.frame }, [data.frame.rgba.buffer]); this.updateMetrics(previousHands!==this.handCount||previousPending!==this.pendingHands);
        }
      };
    });
    cameraWorker.postMessage({ init: true,processing:this.processing,trackHands:this.payload.trackHands!==false,trackPose:this.payload.trackPose===true });
    try { await ready; } catch (error) { this.closeCamera(); throw error; }
    if (!this.alive || this.cameraGeneration !== generation) return;
    if (this.handOptions) cameraWorker.postMessage({ options: this.handOptions });
    if(this.poseOptions)cameraWorker.postMessage({poseOptions:this.poseOptions});
    const capture = document.createElement('canvas'), context = capture.getContext('2d');
    this.status.textContent = 'دوربین فعال است؛ خروجی برنامه در این پنجره نمایش داده می‌شود.';
    let lastCapture = -Infinity, lastVideoTime = -1; this.cameraDemand=true;
    const captureNext = async now => {
      if (!this.alive || this.cameraGeneration !== generation || this.cameraWorker !== cameraWorker) return;
      // rAF timestamps can be a fraction below 33.333 ms; without tolerance
      // a 30 Hz camera repeatedly waits a third 60 Hz display tick (20 Hz).
      if (this.cameraBusy || !this.cameraDemand || now - lastCapture < 1000/30-1.5 || video.readyState < 2 || video.currentTime===lastVideoTime) return;
      this.cameraBusy = true; this.cameraDemand=false; lastCapture = now; lastVideoTime=video.currentTime;
      try {
        const scale=this.processing==='fast'?Math.min(1,640/Math.max(this.width,this.height)):1;
        const width=Math.max(1,Math.round(this.width*scale)),height=Math.max(1,Math.round(this.height*scale));
        if(capture.width!==width||capture.height!==height){capture.width=width;capture.height=height;}
        // Center-crop to the requested aspect ratio rather than stretching hands/faces.
        const sourceWidth=video.videoWidth,sourceHeight=video.videoHeight;
        const cropWidth=Math.min(sourceWidth,sourceHeight*width/height),cropHeight=cropWidth*height/width;
        context.drawImage(video,(sourceWidth-cropWidth)/2,(sourceHeight-cropHeight)/2,cropWidth,cropHeight,0,0,width,height);
        // Pixel readback belongs to the inference worker, not the scrolling UI thread.
        const bitmap = await createImageBitmap(capture);
        if (!this.alive || this.cameraGeneration !== generation) { bitmap.close(); return; }
        cameraWorker.postMessage({ frame: { bitmap, width, height, timestamp: now } }, [bitmap]);
      } catch (error) { this.cameraBusy = false; this.fail(this.cameraError(error)); }
    };
    this.captureNext=captureNext;
    const tick=now=>{
      if(!this.alive||this.cameraGeneration!==generation)return;
      this.cameraRaf=requestAnimationFrame(tick);captureNext(now);
    };
    this.cameraRaf = requestAnimationFrame(tick);
  }
  closeCamera() {
    this.cameraGeneration++; cancelAnimationFrame(this.cameraRaf); this.captureNext=null; this.cameraBusy = false;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video = null; }
    this.cameraWorker?.terminate(); this.cameraWorker = null;
    if (this.cameraReadyReject) { this.cameraReadyReject(Error('دوربین بسته شد.')); this.cameraReadyReject = null; }
    this.monitor.parentElement.hidden = true;
    if(this.root.classList.contains('cp-vision-camera-only')){this.root.dataset.monitorState=this.alive?'waiting':'ended';this.setDisplayEmpty(this.alive?'در انتظار تصویر دوربین…':'اجرای برنامه پایان یافت.');}
  }
  finish() {
    this.turtlePlayback?.seal();clearTimeout(this.outputControlTimer);if(this.monitorFrame)cancelAnimationFrame(this.monitorFrame);if(this.pointerFrame)cancelAnimationFrame(this.pointerFrame);this.pendingMonitor=null;
    this.root.querySelectorAll('[data-vision-key]').forEach(button => { button.disabled = true; });
    this.alive = false; this.fileDecoder?.dispose();this.closeCamera(); this.worker?.terminate(); this.worker = null;
    this.stageObserver?.disconnect();
    window.removeEventListener('keydown', this.key); document.removeEventListener('visibilitychange', this.visibility);
    sessions.delete(this);
    this.root.querySelector('[data-close]').textContent = 'بستن';
    this.root.querySelector('[data-close]').setAttribute('aria-label', 'بستن');
    this.root.querySelector('[data-close]').onclick = () => { this.turtlePlayback?.dispose();this.renderer?.dispose(); this.root.remove(); };
  }
  fail(message) {
    if (!this.alive) return;
    this.status.textContent = message;
    this.forward({ id: this.payload.id, stdout: '', stderr: message, streamed: true, done: true });
    this.finish();
  }
  stop() {
    this.turtlePlayback?.dispose();
    if (this.alive) { this.forward({ id: this.payload.id, stdout: '', stderr: '', streamed: true, done: true }); this.finish(); }
    this.renderer?.dispose(); this.root.remove();
  }
}

// Route Python jobs at the existing Worker boundary. This keeps editor,
// launcher and the Android foreground-service path intact for ordinary Python.
window.Worker = class extends EventTarget {
  constructor(url, options) {
    super(); this.url = url; this.options = options; this.dead = false; this.delegate = null; this.vision = null; this.assetCache = new Map();
    if (!/(?:py\.worker|python-worker)/.test(String(url))) return new FallbackWorker(url, options);
  }
  set onmessage(callback) { if (this.messageHandler) this.removeEventListener('message', this.messageHandler); this.messageHandler = callback; if (callback) this.addEventListener('message', callback); }
  set onerror(callback) { if (this.errorHandler) this.removeEventListener('error', this.errorHandler); this.errorHandler = callback; if (callback) this.addEventListener('error', callback); }
  postMessage(payload, transfer) {
    if (this.dead) return;
    if(payload.inputReply){(this.vision?.worker || this.delegate)?.postMessage(payload);return;}
    for (const asset of payload.assets || []) if (asset.buf) this.assetCache.set(asset.name, { stamp: asset.stamp, buf: asset.buf.slice(0) });
    const moduleSources=(payload.assets||[]).filter(a=>/\.py$/i.test(a.name)).map(a=>a.buf||this.assetCache.get(a.name)?.buf).filter(Boolean).map(buf=>new TextDecoder().decode(buf));
    if (!payload.packageCommand && needsVision(payload.code,moduleSources)) {
      const assets = (payload.assets || []).map(asset => {
        const cached = this.assetCache.get(asset.name);
        return !asset.buf && cached?.stamp === asset.stamp ? { ...asset, buf: cached.buf.slice(0) } : asset;
      });
      this.vision?.stop(); this.vision = new VisionSession(this, { ...payload, assets,trackHands:needsHandTracking(payload.code,moduleSources),trackPose:needsPoseTracking(payload.code,moduleSources) }); return;
    }
    if (!this.delegate) {
      this.delegate = new FallbackWorker(this.url, this.options);
      this.delegate.addEventListener('message', event => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
      this.delegate.addEventListener('error', event => this.dispatchEvent(new ErrorEvent('error', { message: event.message })));
    }
    this.delegate.postMessage(payload, transfer || []);
  }
  terminate() { this.dead = true; this.delegate?.terminate(); this.vision?.stop(); }
};

window.CodePadVision = { stop: () => [...sessions].forEach(session => session.stop()) };
window.addEventListener('pagehide', () => window.CodePadVision.stop());
