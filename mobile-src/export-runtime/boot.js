// Small startup path. HTML/video apps never parse React or start a Python engine.
(async()=>{
 const splash=document.getElementById('codepad-splash'),message=document.getElementById('boot-message'),picture=document.getElementById('boot-image');
 const hide=()=>{splash?.remove();document.documentElement.dataset.codepadReady='true';};
 try{
  const response=await fetch('./launch.json',{cache:'no-cache'});if(!response.ok)throw Error('فایل شروع برنامه پیدا نشد.');
  const config=await response.json();if(config.format!=='codepad-launch-1')throw Error('اطلاعات شروع برنامه معتبر نیست.');
  document.title=config.name;document.getElementById('boot-title').textContent=config.name;
  if(config.image){picture.src=config.image;picture.hidden=false;}
  window.CodePadNativeFeatures={python:['python','mix'].includes(config.entryKind),cpython:config.nativePython};
  window.__CODEPAD_BOOT__=config;
  if(config.fast){
   const frame=document.createElement('iframe');frame.id='codepad-fast-app';frame.title=config.name;
   frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
   let cleanup;frame.onload=()=>{cleanup?.();if(frame.src!=='about:blank'){hide();import('./intent-preload.js').then(m=>{try{cleanup=m.installIntentPreload(frame.contentDocument,new URL('./project/',location.href));}catch{}});}};window.addEventListener('pagehide',()=>cleanup?.(),{once:true});
   frame.src=config.entry;document.body.append(frame);
  }else{
   if(config.entryKind==='python')window.__CODEPAD_RUNTIME_PROMISE__=fetch('./runtime.json').then(r=>{if(!r.ok)throw Error('فایل پروژه پیدا نشد.');return r.json();});window.__CODEPAD_RUNTIME_PROMISE__?.catch(()=>{});
   const hints=['./assets/python-engine.js','./assets/python-input.js','./assets/python-graphics.js','./assets/vision-host.js',config.entryKind==='python'?'./python-runner.js':'./assets/standalone-DSlJSeP3.js'];
   for(const href of hints){const link=document.createElement('link');link.rel='modulepreload';link.href=href;document.head.append(link);}
   const classic=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('فایل اجرایی برنامه بارگذاری نشد.'));document.head.append(s);});
   for(const href of [...(config.entryKind==='python'?['./python-runner.css']:['./assets/standalone-EeokGpfa.css']),'./assets/vision.css','./assets/python-input.css','./assets/python-graphics.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
   const root=document.createElement('div');root.id='standalone-root';document.body.append(root);
   await classic('./background/native-worker.js');
   await Promise.all([import('./assets/python-engine.js'),import('./assets/python-input.js'),import('./assets/python-graphics.js')]);
   await import('./assets/vision-host.js');
   window.addEventListener(config.entryKind==='python'?'codepad-interpreter-ready':'codepad-app-ready',hide,{once:true});
   if(config.entryKind==='python')await import('./python-runner.js');else await import('./assets/standalone-DSlJSeP3.js');
  }
  if(config.platform==='windows'){await import('./desktop-host.js');}
 }catch(error){message.textContent=error.message||String(error);splash.dataset.error='true';}
})();
