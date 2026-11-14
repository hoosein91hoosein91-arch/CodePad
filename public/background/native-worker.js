/* Keeps Python owned by an Android foreground service, not an Activity. */
(() => {
  const OriginalWorker = window.Worker;
  let bridge;
  const native = () => {
    const cap=window.Capacitor;
    if(!cap?.nativePromise || cap.getPlatform?.() !== 'android')return null;
    return bridge ||= {start:options=>cap.nativePromise('CodePadRuntime','start',options),stop:options=>cap.nativePromise('CodePadRuntime','stop',options),status:options=>cap.nativePromise('CodePadRuntime','status',options),addListener:(event,fn)=>cap.addListener('CodePadRuntime',event,fn)};
  };
  const workers = new Map();
  let listening = null;
  async function subscribe() {
    if (!listening) listening = native().addListener('runtimeEvent', event => {
      const worker = workers.get(event.channel);
      if (worker) worker.dispatchEvent(new MessageEvent('message', { data: event.data }));
      else if (event.data.stream) window.dispatchEvent(new CustomEvent('codepad-runtime-stream', { detail: event.data }));
      if (event.data.done) window.dispatchEvent(new CustomEvent('codepad-runtime-state', { detail: { running:false } }));
    });
    await listening;
  }
  class NativeWorker extends EventTarget {
    constructor() { super(); this.channel = crypto.randomUUID(); this.alive = true; this.assets=new Map(); workers.set(this.channel,this); }
    set onmessage(fn) { if(this.messageHandler)this.removeEventListener('message',this.messageHandler); this.messageHandler=fn;if(fn)this.addEventListener('message',fn); }
    set onerror(fn) { if(this.errorHandler)this.removeEventListener('error',this.errorHandler);this.errorHandler=fn;if(fn)this.addEventListener('error',fn); }
    async postMessage(payload) {
      try {
        await subscribe(); if (!this.alive) return;
        const copy = {...payload, assets:(payload.assets || []).map(asset => {
          if(!asset.buf)return {...asset,b64:this.assets.get(asset.name)}; let text='';for(const b of new Uint8Array(asset.buf))text+=String.fromCharCode(b);
          const {buf,...rest}=asset,b64=btoa(text);this.assets.set(asset.name,b64);return {...rest,b64};
        })};
        await native().start({channel:this.channel,payload:JSON.stringify(copy)});
        if(!this.alive)await native().stop({channel:this.channel});
        else window.dispatchEvent(new CustomEvent('codepad-runtime-state',{detail:{running:true}}));
      } catch(error) { this.dispatchEvent(new MessageEvent('message',{data:{id:payload.id,stdout:'',stderr:error.message || String(error),done:true}})); }
    }
    terminate() {this.alive=false;workers.delete(this.channel);native()?.stop({channel:this.channel}).catch(()=>{});}
  }
  window.Worker = class extends OriginalWorker {
    constructor(url, options) { if(native() && /(?:py\.worker|python-worker)/.test(String(url)))return new NativeWorker();super(url,options); }
  };
  window.CodePadBackground = {stop:() => native()?.stop({}).catch(()=>{}), status:() => native()?.status({})};
  function attachStatus() {
    const header = document.querySelector('main > header');
    if (!header || header.querySelector('[data-codepad-background]'))return;
    const button=document.createElement('button');button.dataset.codepadBackground='';button.type='button';button.hidden=true;
    button.className='codepad-background-status';button.title='اجرای Python در پس‌زمینه؛ برای توقف لمس کن';
    button.textContent='در حال اجرا';button.onclick=()=>window.CodePadBackground.stop();header.append(button);
    const update=event=>{button.hidden=!event.detail.running;button.textContent='پس‌زمینه';};
    window.addEventListener('codepad-runtime-state',update);
    if(native())subscribe().then(()=>native().status({})).then(status=>{
      button.hidden=!status.running;
      if(status.running)window.dispatchEvent(new CustomEvent('codepad-runtime-restored',{detail:status}));
    }).catch(()=>{});
  }
  new MutationObserver(attachStatus).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',attachStatus);
})();
