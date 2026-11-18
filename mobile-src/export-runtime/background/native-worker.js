/* Keeps Python owned by an Android foreground service, not an Activity. */
(() => {
  const OriginalWorker = window.Worker;
  window.CodePadBrowserWorker = OriginalWorker;
  let bridge;
  const native = () => {
    const cap=window.Capacitor;
    if(!cap?.nativePromise || cap.getPlatform?.() !== 'android' || window.CodePadNativeFeatures?.python===false)return null;
    return bridge ||= {start:options=>cap.nativePromise('CodePadRuntime','start',options),input:options=>cap.nativePromise('CodePadRuntime','input',options),stop:options=>cap.nativePromise('CodePadRuntime','stop',options),status:options=>cap.nativePromise('CodePadRuntime','status',options),addListener:(event,fn)=>cap.addListener('CodePadRuntime',event,fn)};
  };
  let pythonBridge;
  const nativePython=()=>pythonBridge ||= {start:options=>window.Capacitor.nativePromise('CodePadPython','start',options),input:options=>window.Capacitor.nativePromise('CodePadPython','input',options),stop:options=>window.Capacitor.nativePromise('CodePadPython','stop',options),status:options=>window.Capacitor.nativePromise('CodePadPython','status',options),addListener:(event,fn)=>window.Capacitor.addListener('CodePadPython',event,fn)};
  const workers = new Map();
  // A replacement job waits for the previous channel's stop acknowledgement.
  // This also covers a fast double tap on Restart while input() is waiting.
  let stopBarrier=Promise.resolve();
  let listening = null;
  async function subscribe() {
    if (!listening) {const deliver = (event, backend) => {
      const worker = workers.get(event.channel);
      if (worker) worker.dispatchEvent(new MessageEvent('message', { data: event.data }));
      else if (event.data.stream) window.dispatchEvent(new CustomEvent('codepad-runtime-stream', { detail: event.data }));
      else if(event.data.image)window.dispatchEvent(new CustomEvent('codepad-python-image',{detail:event.data.image}));
      else if(event.data.inputRequest)window.dispatchEvent(new CustomEvent('codepad-python-input',{detail:{...event.data,respond:(value,eof)=>backend.input({channel:event.channel,id:event.data.id,requestId:event.data.requestId,value,eof})}}));
      if (event.data.done) window.dispatchEvent(new CustomEvent('codepad-runtime-state', { detail: { running:false } }));
    };listening=Promise.all([native().addListener('runtimeEvent',event=>deliver(event,native())),nativePython().addListener('pythonEvent',event=>deliver(event,nativePython()))]);}
    await listening;
  }
  class NativeWorker extends EventTarget {
    constructor() { super(); this.channel = crypto.randomUUID(); this.alive = true; this.assets=new Map(); workers.set(this.channel,this); }
    set onmessage(fn) { if(this.messageHandler)this.removeEventListener('message',this.messageHandler); this.messageHandler=fn;if(fn)this.addEventListener('message',fn); }
    set onerror(fn) { if(this.errorHandler)this.removeEventListener('error',this.errorHandler);this.errorHandler=fn;if(fn)this.addEventListener('error',fn); }
    async postMessage(payload) {
      try {
        await subscribe(); if (!this.alive) return;
        if(payload.inputReply){await this.backend.input({...payload,channel:this.channel});return;}
        const mode=localStorage.getItem('codepad-python-engine')||'auto';
        // Package installation keeps its existing browser-compatible environment.
        // Auto preserves installed third-party libraries. CPython can be selected explicitly.
        const copy = {...payload, assets:(payload.assets || []).map(asset => {
          if(!asset.buf){const cached=this.assets.get(asset.name);return typeof cached==='string'?{...asset,b64:cached}:{...asset,...cached};}
          if(asset.buf.byteLength>2*1024*1024 && !/\.py$/i.test(asset.name))return {...asset,buf:undefined};let text='';for(const b of new Uint8Array(asset.buf))text+=String.fromCharCode(b);
          const {buf,...rest}=asset,b64=btoa(text);this.assets.set(asset.name,b64);return {...rest,b64};
        })};
        const useNative=window.CodePadNativeFeatures?.cpython!==false && (window.CodePadPythonRouting?window.CodePadPythonRouting(copy,mode):!payload.packageCommand && (mode==='native' || (mode==='auto' && (!(payload.requirements||[]).length || !/\b(?:import|__import__|exec|eval)\b/.test(payload.code||'')))));
        this.backend=useNative?nativePython():native();
        if(!useNative){for(const asset of copy.assets||[]){if(asset.localPath){const bytes=new Uint8Array(await(await fetch(window.Capacitor.convertFileSrc('file://'+asset.localPath))).arrayBuffer());let raw='';for(const b of bytes)raw+=String.fromCharCode(b);asset.b64=btoa(raw);delete asset.localPath;this.assets.set(asset.name,asset.b64);}}for(let i=0;i<(payload.assets||[]).length;i++){const asset=payload.assets[i];if(asset.buf && copy.assets[i].b64==null){let raw='';for(const b of new Uint8Array(asset.buf))raw+=String.fromCharCode(b);copy.assets[i]={name:asset.name,stamp:asset.stamp,b64:btoa(raw)};this.assets.set(asset.name,copy.assets[i].b64);}}}
        if(useNative){
            for(let i=0;i<(payload.assets||[]).length;i++){
                const asset=payload.assets[i];
                if(asset.buf && asset.buf.byteLength>2*1024*1024){
                    const id=crypto.randomUUID();await window.Capacitor.nativePromise('CodePadPython','stageAsset',{id,action:'begin'});
                    const bytes=new Uint8Array(asset.buf);
                    for(let at=0;at<bytes.length;at+=262144){let raw='';for(const b of bytes.subarray(at,at+262144))raw+=String.fromCharCode(b);await window.Capacitor.nativePromise('CodePadPython','stageAsset',{id,action:'append',data:btoa(raw)});}
                    const {path}=await window.Capacitor.nativePromise('CodePadPython','stageAsset',{id,action:'finish'});
                    copy.assets[i]={name:asset.name,stamp:asset.stamp,localPath:path};this.assets.set(asset.name,{localPath:path});
                }else if(!asset.buf && this.assets.get(asset.name)?.localPath)copy.assets[i]={name:asset.name,stamp:asset.stamp,localPath:this.assets.get(asset.name).localPath};
            }
        }
        await stopBarrier;
        if(!this.alive)return;
        await this.backend.start({channel:this.channel,payload:JSON.stringify(copy)});
        if(!this.alive)await this.backend.stop({channel:this.channel});
        else window.dispatchEvent(new CustomEvent('codepad-runtime-state',{detail:{running:true,engine:this.backend===nativePython()?'CPython 3.13':'Python WASM'}}));
      } catch(error) { this.dispatchEvent(new MessageEvent('message',{data:{id:payload.id,stdout:'',stderr:error.message || String(error),done:true}})); }
    }
    terminate() {this.alive=false;workers.delete(this.channel);if(this.backend){const pending=this.backend.stop({channel:this.channel}).catch(()=>{});stopBarrier=Promise.all([stopBarrier,pending]).then(()=>{});}}
  }
  window.Worker = class extends OriginalWorker {
    constructor(url, options) { if(native() && /(?:py\.worker|python-worker)/.test(String(url)))return new NativeWorker();super(url,options); }
  };
  window.CodePadBackground = {stop:() => {native()?.stop({}).catch(()=>{});if(native())nativePython().stop({}).catch(()=>{});}, status:async() => {if(!native())return {};const status=await nativePython().status({});return status.running?status:native().status({});}};
  function attachStatus() {
    const header = document.querySelector('main > header');
    if (!header || header.querySelector('[data-codepad-background]'))return;
    const button=document.createElement('button');button.dataset.codepadBackground='';button.type='button';button.hidden=true;
    button.className='codepad-background-status';button.title='اجرای Python در پس‌زمینه؛ برای توقف لمس کن';
    button.textContent='در حال اجرا';button.onclick=()=>window.CodePadBackground.stop();header.append(button);
    const update=event=>{button.hidden=!event.detail.running;button.textContent='پس‌زمینه';};
    window.addEventListener('codepad-runtime-state',update);
    if(native())subscribe().then(()=>window.CodePadBackground.status()).then(status=>{
      button.hidden=!status.running;
      if(status.running){window.dispatchEvent(new CustomEvent('codepad-runtime-restored',{detail:status}));if(status.input)window.dispatchEvent(new CustomEvent('codepad-python-input',{detail:{...status.input,respond:(value,eof)=>(status.engine==='CPython 3.13'?nativePython():native()).input({channel:status.channel,id:status.id,requestId:status.input.requestId,value,eof})}}));}
    }).catch(()=>{});
  }
  new MutationObserver(attachStatus).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',attachStatus);
})();
