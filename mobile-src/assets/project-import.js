import {prepareProjectFiles,ZIP_LIMITS} from './project-zip.js';
import {modal} from './ui-dom.js';
const runtime=()=>import('./runtime.js');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const message=(node,text)=>{node.textContent=text;};
export function readZIP(file,signal){return new Promise(async(resolve,reject)=>{
 let worker,timer;
 const finish=(error,result)=>{clearTimeout(timer);worker?.terminate();signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
 const abort=()=>finish(new DOMException('لغو شد','AbortError'));
 try{
  if(file.size>ZIP_LIMITS.compressed)throw Error('فایل ZIP از ۶۴ مگابایت بزرگ‌تر است.');
  signal?.throwIfAborted();const bytes=await file.arrayBuffer();signal?.throwIfAborted();
  const W=window.CodePadBrowserWorker||window.Worker;worker=new W(new URL('./project-zip-worker.js',import.meta.url),{type:'module'});
  signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('بازکردن ZIP بیش از حد طول کشید.')),30000);
  worker.onmessage=({data})=>finish(data.error?Error(data.error):null,data.result);worker.onerror=e=>finish(Error(e.message||'ZIP باز نشد.'));
  worker.postMessage({bytes},[bytes]);
 }catch(error){finish(error);}
});}
export async function importPreparedProject(plan,name,entry){
 if(!name.trim()||name.length>80||!plan.files.some(f=>f.name===entry))throw Error('نام پروژه یا فایل شروع را انتخاب کن.');
 const rt=await runtime(),previous=rt.pt.getState().activeProjectId;
 const ordered=[plan.files.find(f=>f.name===entry),...plan.files.filter(f=>f.name!==entry)];
 const id=rt.pt.getState().importProject(name.trim(),ordered);
 try{
  const assets=plan.assets.map(f=>new File([f.bytes],f.name));const result=await rt.Et(id,assets);
  if(result.failed.length)throw Error('پیوست‌ها ذخیره نشدند: '+result.failed.join('، '));
  rt.pt.setState(s=>({projects:s.projects.map(p=>p.id===id?{...p,entryFile:entry}:p)}));
  rt.pt.getState().pushLines([rt.ft('sys',`پروژهٔ «${name}» وارد شد: ${plan.files.length} فایل سورس، ${assets.length} پیوست. فایل شروع: ${entry}`)]);
  return id;
 }catch(error){
  for(const a of rt.Ot(id))await rt.jt(id,a.name);
  rt.pt.setState(s=>({projects:s.projects.filter(p=>p.id!==id),activeProjectId:s.activeProjectId===id?previous:s.activeProjectId}));throw error;
 }
}
export function openZip(file){return new Promise(async resolve=>{
 const box=modal({title:'بازکردن پروژه از ZIP',kind:'modal',onClose:()=>{if(!settled){settled=true;controller.abort();resolve(false);}}});
 const dialog=box.body;dialog.classList.add('ui-form');dialog.innerHTML='<p data-zip-status role="status">در حال خواندن و بررسی فایل‌ها…</p><div data-zip-preview class="ui-form"></div>';
 const controller=new AbortController();let saving=false,settled=false;
 const close=value=>{if(saving||settled)return;settled=true;controller.abort();box.close();resolve(value);};
 
 try{
  const unpacked=await readZIP(file,controller.signal),rt=await runtime(),plan=prepareProjectFiles(unpacked,rt.gt);if(settled)return;
  const preview=dialog.querySelector('[data-zip-preview]');
  preview.innerHTML=`<div class="ui-actions"><strong>${plan.files.length.toLocaleString('fa-IR')} فایل سورس</strong><span>${plan.assets.length.toLocaleString('fa-IR')} پیوست</span></div><p>همهٔ فایل‌ها در یک پروژه قرار می‌گیرند. فایل شروع اجرا می‌شود و فایل‌های کمکی را با import بارگذاری می‌کند.</p><label>نام پروژه<input data-zip-name maxlength="80" value="${escape(file.name.replace(/\.zip$/i,'').slice(0,80))}"></label><label>فایل شروع<select data-zip-entry dir="ltr"><option value="">انتخاب فایل شروع…</option>${plan.candidates.map(n=>`<option value="${escape(n)}" ${n===plan.entry?'selected':''}>${escape(n)}</option>`).join('')}</select></label><details><summary>فایل‌های پروژه</summary><ul dir="ltr">${[...plan.files,...plan.assets].map(f=>`<li>${escape(f.name)}</li>`).join('')}</ul></details><button data-zip-import class="ui-btn ui-btn--primary">افزودن پروژه</button><p class="ui-caption">ZIP تا ۶۴ مگابایت، حداکثر ۱۲۸ مگابایت پس از بازشدن. نصب وابستگی‌های خارجی جداست؛ واردکردن ZIP همهٔ کتابخانه‌های دسکتاپ را فراهم نمی‌کند.</p>`;
  message(dialog.querySelector('[data-zip-status]'),plan.prefix?'پوشهٔ بیرونی ZIP شناسایی شد؛ ساختار داخلی پروژه حفظ می‌شود.':'آمادهٔ افزودن پروژه');
  preview.querySelector('[data-zip-import]').onclick=async()=>{
   if(saving)return;saving=true;const button=preview.querySelector('[data-zip-import]');button.disabled=true;
   try{await importPreparedProject(plan,preview.querySelector('[data-zip-name]').value,preview.querySelector('[data-zip-entry]').value);saving=false;close(true);}
   catch(error){message(dialog.querySelector('[data-zip-status]'),error.message);saving=false;button.disabled=false;}
  };
 }catch(error){if(!settled&&error.name!=='AbortError')message(dialog.querySelector('[data-zip-status]'),error.message);}
});}
export function chooseZIP(){const input=document.createElement('input');input.type='file';input.accept='.zip,application/zip,application/x-zip-compressed';input.onchange=()=>{if(input.files[0])openZip(input.files[0]);};input.click();}
export async function runProject(){
 const rt=await runtime(),state=rt.pt.getState(),project=rt.dt(state);
 if(state.running)throw Error('برنامه در حال اجراست. ابتدا آن را متوقف کن.');
 if(!project.entryFile)throw Error('فایل شروع پروژه را انتخاب کن.');
 if(!project.files.some(f=>f.name===project.entryFile))throw Error('فایل شروع دیگر در پروژه وجود ندارد.');
 const button=document.querySelector('[data-codepad-run]');if(!button)throw Error('برای اجرا به ویرایشگر برگرد.');
 window.CodePadStudio?.close();button.click();
}
export async function renderProjectHub(host){
 const rt=await runtime(),p=rt.dt(rt.pt.getState());
 host.innerHTML=`<div class="ui-intro"><h2>یک پروژه، همهٔ فایل‌ها</h2><p>سورس ZIP را وارد کن، فایل شروع را مشخص کن و پروژه را اجرا کن. فایل‌های کمکی از همان پروژه import می‌شوند.</p></div><div class="ui-actions"><button class="ui-btn ui-btn--primary" data-project-zip>واردکردن پروژه ZIP</button><button data-portal-example>نمونهٔ فیلترهای دو دست</button></div><article class="ui-card"><h3>${escape(p.name)}</h3><p>${p.files.length.toLocaleString('fa-IR')} فایل سورس در پروژهٔ فعال</p><label>فایل شروع<select data-project-entry dir="ltr"><option value="">اجرای فایل بازشده</option>${p.files.map(f=>`<option value="${escape(f.name)}" ${p.entryFile===f.name?'selected':''}>${escape(f.name)}</option>`).join('')}</select></label><div class="ui-actions"><button data-run-project class="ui-btn ui-btn--primary">اجرای پروژه</button></div><p class="ui-caption">با انتخاب فایل شروع، دکمهٔ اجرای ویرایشگر هم همان فایل را اجرا می‌کند؛ حتی وقتی یک فایل کمکی را برای ویرایش باز کرده‌ای.</p></article><pre data-project-status dir="auto"></pre>`;
 host.querySelector('[data-project-zip]').onclick=chooseZIP;
 host.querySelector('[data-portal-example]').onclick=async()=>{try{const response=await fetch(new URL('../examples/Filters-Portal.zip',import.meta.url));if(!response.ok)throw Error('نمونه پیدا نشد.');window.CodePadStudio?.close();await openZip(new File([await response.arrayBuffer()],'Filters-Portal.zip',{type:'application/zip'}));}catch(error){message(host.querySelector('[data-project-status]'),error.message);}};
 host.querySelector('[data-project-entry]').onchange=e=>{rt.pt.setState(s=>({projects:s.projects.map(x=>x.id===p.id?{...x,entryFile:e.target.value||undefined}:x)}));};
 host.querySelector('[data-run-project]').onclick=()=>runProject().catch(error=>message(host.querySelector('[data-project-status]'),error.message));
}
window.CodePadProjects={openZip,chooseZIP,runProject};
