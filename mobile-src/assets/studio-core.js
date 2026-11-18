import {nativeProjectCommand,termuxStatusText} from './termux-project.js';
export {nativeProjectCommand,termuxStatusText};
export const STUDIO_VERSION='3.2.0';
export const shellQuote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
export function browserURL(input=''){
 const text=String(input).trim();if(!text)return 'https://duckduckgo.com/';
 let value=text;
 if(!/^https?:\/\//i.test(value)){
  if(/^[a-z][a-z\d+.-]*:/i.test(value)&&!/^localhost:\d+/i.test(value))throw Error('فقط نشانی وب HTTP و HTTPS پذیرفته می‌شود.');
  value=/^[^\s/]+\.[^\s]+/.test(value)||/^localhost(?::\d+)?(?:\/|$)/.test(value)?'https://'+value:'https://duckduckgo.com/?q='+encodeURIComponent(value);
 }
 const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('نشانی نامعتبر است.');return url.href;
}
export const runtime=()=>import('./runtime.js');
export function isAndroid(){return !!globalThis.Capacitor?.isNativePlatform?.();}
// Electron desktop build: window.cpDesktop (preload) provides a real shell, real Python and system tools.
export const isDesktop=()=>!!globalThis.cpDesktop?.shell;
async function desktopCall(plugin,method,args){
 const d=globalThis.cpDesktop;
 if(plugin==='CodePadSystem'){
  if(method==='listApps')return d.system.apps();
  if(method==='appDetails'){const list=await d.system.apps(),app=list.apps.find(a=>a.packageName===args.packageName);if(!app)throw Error('برنامه پیدا نشد.');return app;}
  if(method==='openApp')return d.system.openApp(args.packageName);
  if(method==='openBrowser'){window.open(args.url,'_blank','noopener');return {opened:true};}
  if(method==='openTerminal')return d.shell.external();
  if(method==='pickInstall')throw Error('نصب APK فقط در اندروید ممکن است؛ در ویندوز فایل نصب‌کننده (exe/msi) را مستقیم اجرا کن.');
  throw Error('این قابلیت فقط در اندروید است.');
 }
 if(plugin==='TermuxBridge'){
  if(method==='runCommand')return d.shell.run(args.command,{cwd:args.cwd,timeoutMs:args.timeoutMs});
  if(method==='status'){const info=await d.system.info();return {installed:true,serviceAvailable:true,permission:true,version:info.shell==='powershell'?'PowerShell':'sh'};}
  if(method==='openTermux')return d.shell.external();
  throw Error('این قابلیت فقط در اندروید است.');
 }
 throw Error('این قابلیت در نسخهٔ دسکتاپ پشتیبانی نمی‌شود.');
}
const CONFIDENTIAL_GATED=new Set(['CodePadSystem.openBrowser','TermuxBridge.runCommand','TermuxBridge.openTermux']);
export async function nativeCall(plugin,method,args={}){
 if(CONFIDENTIAL_GATED.has(plugin+'.'+method))globalThis.CodePadConfidential?.guard('ترمینال/مرورگر ('+plugin+'.'+method+')');
 if(isDesktop())return desktopCall(plugin,method,args);
 if(!isAndroid())throw Error('این قابلیت به نسخهٔ نصب‌شدهٔ Android نیاز دارد.');
 const cap=globalThis.Capacitor;if(cap.Plugins?.[plugin]?.[method])return cap.Plugins[plugin][method](args);
 const module=await import('./main.js');return module.a(plugin)[method](args);
}
export async function openBrowser(input){const url=browserURL(input);globalThis.CodePadConfidential?.guard('مرورگر');if(isAndroid())return nativeCall('CodePadSystem','openBrowser',{url});const tab=window.open(url,'_blank');if(!tab)throw Error('مرورگر تب را مسدود کرد؛ اجازهٔ بازشدن تب بده.');try{tab.opener=null;}catch{}return {opened:true,url};}
export async function projectSnapshot(){const rt=await runtime(),state=rt.pt.getState(),p=rt.dt(state);return structuredClone(p);}
export async function textHash(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
export async function readProjectFile(name,projectId){const rt=await runtime(),p=rt.pt.getState().projects.find(p=>p.id===projectId);if(!p)throw Error('پروژه دیگر موجود نیست.');const f=p.files.find(f=>f.name===name);if(!f)throw Error('فایل پیدا نشد.');return {name:f.name,content:f.content,hash:await textHash(f.content)};}
export async function writeProjectFile(name,content,expectedHash,projectId){
 if(!/^[\p{L}\p{N}_. -]+$/u.test(name)||name.includes('..')||name.length>100||typeof content!=='string'||content.length>500000)throw Error('نام یا محتوای فایل نامعتبر است.');
 const rt=await runtime(),before=rt.pt.getState().projects.find(p=>p.id===projectId);if(!before)throw Error('پروژه موجود نیست.');const file=before.files.find(f=>f.name===name);
 if(file&&(!expectedHash||await textHash(file.content)!==expectedHash))throw Error('فایل پس از خواندن تغییر کرده؛ دوباره آن را بخوان.');
 const original=JSON.stringify(before);
 rt.pt.setState(state=>{const p=state.projects.find(p=>p.id===projectId);if(JSON.stringify(p)!==original)throw Error('پروژه هم‌زمان تغییر کرد.');localStorage.setItem('codepad.studio.undo',JSON.stringify(p));return {projects:state.projects.map(p=>p.id===projectId?{...p,files:file?p.files.map(f=>f.id===file.id?{...f,content}:f):[...p.files,{id:crypto.randomUUID(),name,lang:rt.gt(name),content,stdin:''}]}:p)};});
 return {saved:true,name};
}
export async function undoProject(){const saved=JSON.parse(localStorage.getItem('codepad.studio.undo')||'null');if(!saved?.id)throw Error('نسخهٔ قبلی وجود ندارد.');const rt=await runtime();rt.pt.setState(s=>({projects:s.projects.map(p=>p.id===saved.id?saved:p)}));localStorage.removeItem('codepad.studio.undo');return 'نسخهٔ قبلی پروژه برگشت.';}
export async function runTermux(command,options={}){if(isDesktop())return globalThis.cpDesktop.shell.run(command,{cwd:options.cwd,timeoutMs:options.timeoutMs});return nativeCall('TermuxBridge','runCommand',{command,...options});}
export async function runNativeProject(project,entry,stdin=''){
 const rt=await runtime();await rt.kt();
 const assets=[];
 for(const record of rt.Ot(project.id)){
  if(project.files.some(f=>f.name===record.name))continue;
  const blob=await rt.At(project.id,record.name);if(!blob)throw Error('پیوست پیدا نشد: '+record.name);
  if(!isDesktop()&&blob.size>70000)throw Error('پیوست برای ارسال مستقیم به Termux بزرگ است؛ آن را در خود Termux باز کن.');
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  assets.push({name:record.name,b64:btoa(binary)});
 }
 if(isDesktop())return globalThis.cpDesktop.python.exec({id:project.id,files:[...project.files.map(f=>({name:f.name,content:f.content})),...assets.map(a=>({name:a.name,b64:a.b64}))],entry,stdin,timeoutMs:600000});
 return runTermux(nativeProjectCommand({...project,assets},entry,stdin),{timeoutMs:600000});
}
export async function runWebPython(code,stdin=''){const rt=await runtime(),p=await projectSnapshot();return rt.y(code,stdin,p.id);}
export async function webConsole(command){
 const text=command.trim(),rt=await runtime(),p=await projectSnapshot();
 const pip=rt.M(text);if(pip)return rt.b(text);
 if(text==='help')return {stdout:'Python داخلی: pip install/list/freeze، python FILE.py، ls، pwd، cat FILE.\nبرای فرمان‌های لینوکس، موتور Termux را انتخاب کن.',stderr:''};
 if(text==='ls')return {stdout:p.files.map(f=>f.name).join('\n'),stderr:''};
 if(text==='pwd')return {stdout:'CodePad/'+p.name,stderr:''};
 const match=text.match(/^(python3?|run|cat)\s+(.+)$/);if(match){const file=p.files.find(f=>f.name===match[2]);if(!file)throw Error('فایل پروژه پیدا نشد.');return match[1]==='cat'?{stdout:file.content,stderr:''}:rt.y(file.content,file.stdin||'',p.id);}
 throw Error('این فرمان در Python داخلی نیست؛ برای shell یا nmap موتور Termux را انتخاب کن.');
}
export function validateExtension(input){
 const manifest=structuredClone(input);if(!/^[a-z][a-z0-9.-]{2,70}$/.test(manifest.id)||typeof manifest.name!=='string'||manifest.name.length>80||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('شناسه، نام یا نسخهٔ افزونه نامعتبر است.');
 const allowed=['project.read','project.write','python.run','termux.run','browser.open'];
 if(!Array.isArray(manifest.permissions)||manifest.permissions.some(p=>!allowed.includes(p)))throw Error('دسترسی افزونه ناشناخته است.');
 if(!Array.isArray(manifest.commands)||!manifest.commands.length||manifest.commands.length>20)throw Error('افزونه باید ۱ تا ۲۰ فرمان داشته باشد.');
 const ids=new Set();for(const c of manifest.commands){if(!/^[a-z][a-z0-9.-]*$/.test(c.id)||ids.has(c.id)||typeof c.title!=='string'||typeof c.script!=='string'||c.script.length>50000)throw Error('فرمان افزونه معتبر نیست.');ids.add(c.id);}
 return manifest;
}
export const FORMAT_EXTENSION={id:'codepad.json-format',name:'مرتب‌سازی JSON',version:'1.0.0',permissions:['project.read','project.write'],commands:[{id:'format-json',title:'مرتب‌کردن فایل JSON فعال',script:"const p=await api.call('project'); const f=await api.call('read_file',{name:p.activeFile}); const text=JSON.stringify(JSON.parse(f.content),null,2)+'\\n'; await api.call('write_file',{name:f.name,content:text,expectedHash:f.hash}); return 'JSON مرتب و ذخیره شد.';"}]};
export async function executeExtension(manifest,commandId,args={},options={}){
 validateExtension(manifest);const command=manifest.commands.find(c=>c.id===commandId);if(!command)throw Error('فرمان پیدا نشد.');const project=await projectSnapshot();
 const required={project:'project.read',read_file:'project.read',write_file:'project.write',python:'python.run',termux:'termux.run',browser:'browser.open'};
 const source=`let seq=0;const pending=new Map();const api={call:(name,args={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});postMessage({call:true,id,name,args});})};onmessage=async({data})=>{if(data.reply){const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.value);}return;}if(data.start){try{const fn=new Function('api','args','"use strict";return (async()=>{\\n'+data.script+'\\n})()');postMessage({done:true,value:await fn(api,data.args)});}catch(e){postMessage({done:true,error:e.message});}}};`;
 const url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));const WorkerClass=window.CodePadBrowserWorker||window.Worker;const worker=new WorkerClass(url);URL.revokeObjectURL(url);
 return new Promise((resolve,reject)=>{
  const finish=(error,value)=>{clearTimeout(timeout);worker.terminate();error?reject(Error(error)):resolve(value);};const timeout=setTimeout(()=>finish('زمان اجرای افزونه تمام شد.'),options.timeout||30000);
  worker.onerror=e=>finish(e.message);
  worker.onmessage=async({data})=>{
   if(data.done){finish(data.error,data.value);return;}if(!data.call)return;
   try{
    if(!required[data.name]||!manifest.permissions.includes(required[data.name]))throw Error('افزونه این دسترسی را ندارد.');
    const a=data.args||{};let value;
    if(data.name==='project')value={id:project.id,name:project.name,files:project.files.map(f=>f.name),activeFile:project.files.find(f=>f.id===project.activeFileId)?.name};
    if(data.name==='read_file')value=await readProjectFile(a.name,project.id);
    if(data.name==='write_file')value=await writeProjectFile(a.name,a.content,a.expectedHash,project.id);
    if(data.name==='python')value=await (await runtime()).y(String(a.code||''),'',project.id);
    if(data.name==='termux')value=await runTermux(String(a.command||''));
    if(data.name==='browser')value=await openBrowser(a.url);
    worker.postMessage({reply:true,id:data.id,value});
   }catch(e){worker.postMessage({reply:true,id:data.id,error:e.message});}
  };
  worker.postMessage({start:true,script:command.script,args});
 });
}
