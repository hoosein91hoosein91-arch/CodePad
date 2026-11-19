// A focused Python entry path: no editor, launcher, React or other languages.
import {outputBuffer} from './output-buffer.js';
import {safeProjectPath} from './background/project-files.js';
let worker,sequence=0,job=0,project,stopped=true,lines=0;
const root=document.createElement('main');root.className='cp-python-runner';root.innerHTML='<header><div><small>PYTHON</small><h1></h1></div><div><button data-run>اجرای دوباره</button><button data-stop disabled>توقف</button></div></header><p data-status role="status">در حال آماده‌سازی…</p><pre data-output dir="auto" aria-label="خروجی برنامه"></pre>';
document.body.append(root);const status=root.querySelector('[data-status]'),output=root.querySelector('[data-output]');
const ready=()=>window.dispatchEvent(new Event('codepad-interpreter-ready'));
const buffer=outputBuffer(output);
function text(value){buffer.write(value);}
function stop(terminate=true){buffer.flush();job=0;stopped=true;if(terminate){worker?.terminate();worker=null;}window.dispatchEvent(new Event('codepad-python-input-close'));root.querySelector('[data-stop]').disabled=true;}
async function run(){
 if(!stopped)stop();buffer.clear();const id=job=++sequence;stopped=false;status.textContent='در حال آماده‌سازی Python…';root.querySelector('[data-stop]').disabled=false;
 try{
  const files=project.files,entry=files.find(f=>f.name===project.entryFile);if(!entry)throw Error('فایل شروع Python پیدا نشد.');
  const assets=[];for(const f of files){safeProjectPath(f.name);assets.push({name:f.name,stamp:'source:'+f.content,buf:new TextEncoder().encode(f.content).buffer});}
  for(const a of project.assets||[]){safeProjectPath(a.name);const bytes=a.url?await(await fetch(new URL(a.url,location.href))).arrayBuffer():Uint8Array.from(atob(a.b64||''),c=>c.charCodeAt(0)).buffer;assets.push({name:a.name,stamp:a.sha256||a.name,buf:bytes});}
  if(stopped||job!==id)return;
  worker ||=new Worker(new URL('./assets/py.worker-Ox6J_UBn.js',location.href),{type:'module'});
  worker.onmessage=({data})=>{
   if(data.id!=null&&data.id!==job)return;
   if(data.image){window.dispatchEvent(new CustomEvent('codepad-python-image',{detail:data.image}));return;}
   if(data.progress){status.textContent=data.progress;return;}
   if(data.phase==='run'){status.textContent='در حال اجرا';ready();return;}
   if(data.inputRequest){buffer.flush();status.textContent='برنامه منتظر پاسخ است';ready();window.dispatchEvent(new CustomEvent('codepad-python-input',{detail:{...data,respond:(value,eof)=>{if(job!==id||!worker)return;status.textContent='در حال اجرا';worker.postMessage({inputReply:true,id:data.id,requestId:data.requestId,value,eof});}}}));return;}
   if(data.stream){text(data.text||'');return;}
   if(data.done){if(!data.streamed){text(data.stdout||'');text(data.stderr||'');}else if(data.displayStderr)text(data.displayStderr);status.textContent=data.stderr?'اجرا با خطا پایان یافت.':'اجرا پایان یافت.';stop(false);ready();}
  };
  worker.onerror=e=>{text(e.message||'موتور متوقف شد.');status.textContent='اجرا انجام نشد.';stop();ready();};
  worker.postMessage({id,code:entry.content,entryFile:project.entryFile,projectKey:'standalone',requirements:project.requirements||[],assets,interactive:true,stdin:entry.stdin||''},assets.map(a=>a.buf));
 }catch(e){text(e.message||String(e));status.textContent='اجرا انجام نشد.';stop();ready();}
}
root.querySelector('[data-run]').onclick=()=>run();root.querySelector('[data-stop]').onclick=()=>{stop();status.textContent='اجرا متوقف شد.';ready();};
window.addEventListener('codepad-stop-python',()=>{stop();status.textContent='اجرا متوقف شد.';ready();});
try{project=await (window.__CODEPAD_RUNTIME_PROMISE__||fetch('./runtime.json').then(r=>{if(!r.ok)throw Error('بستهٔ برنامه پیدا نشد.');return r.json();}));if(project.format!=='codepad-app-1')throw Error('بستهٔ Python معتبر نیست.');root.querySelector('h1').textContent=project.name;window.__CODEPAD_DIRECT_PYTHON__=true;await run();}catch(e){status.textContent=e.message||String(e);ready();}

window.addEventListener('pagehide',()=>stop(),{once:true});
