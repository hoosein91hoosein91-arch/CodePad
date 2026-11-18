import {VERSION} from './version.js';
import {pt as lab,j as launcher,Mt as assets,kt as loadAssets,x as stop,saveCodePadFile as saveFile,E as importLauncher} from './runtime.js';

const MAX_SNAPSHOTS=20, MAX_BYTES=160*1024*1024;
const BASE_KEYS=['jibcode-en','jibcode-launcher','jibcode-launcher-preferences','codepad.python.requirements.v1','codepad.apk.signing-key.v1','codepad.apk.versions.v1','codepad.studio.extensions','codepad.studio.app-links','codepad.studio.undo'];
const allowed=k=>BASE_KEYS.includes(k)||k.startsWith('jibos-app-');
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const complete=t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=t.onerror=()=>reject(t.error||Error('ذخیره‌سازی انجام نشد.'))});
function openDB(name,version,upgrade){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade?.(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
const recoveryDB=openDB('codepad-recovery-v1',1,db=>{db.createObjectStore('snapshots',{keyPath:'id'});db.createObjectStore('blobs',{keyPath:'hash'})});
recoveryDB.catch(error=>{setTimeout(()=>{lastError=error.message||String(error)},0)});
let assetDB;
async function assetsDB(){return assetDB||=await openDB('jibcode-assets',1,db=>db.createObjectStore('files',{keyPath:'key'}).createIndex('projectId','projectId'))}
async function assetRecords(){return request((await assetsDB()).transaction('files').objectStore('files').getAll())}
function storage(){const result={};for(const key of Object.keys(localStorage).sort())if(allowed(key))result[key]=localStorage.getItem(key);return result}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
let queue=Promise.resolve(),lastError='',lastHash='',timer;
function serial(fn){const next=queue.then(fn);queue=next.catch(error=>{lastError=error.message||String(error)});return next}
export async function snapshot(reason='خودکار',force=false){return serial(async()=>{
  const db=await recoveryDB, values=storage(), rows=await assetRecords(), references=[], blobs=[];
  for(const row of rows){const digest=await hash(await row.blob.arrayBuffer());references.push({...row,blob:undefined,hash:digest});blobs.push({hash:digest,blob:row.blob})}
  const fingerprint=await hash(new TextEncoder().encode(JSON.stringify([values,references])));
  if(!force&&fingerprint===lastHash)return null;
  const tx=db.transaction(['snapshots','blobs'],'readwrite'), done=complete(tx);
  for(const blob of blobs)tx.objectStore('blobs').put(blob);
  const record={id:Date.now()+':'+crypto.randomUUID(),at:Date.now(),reason,values,assets:references,fingerprint};
  tx.objectStore('snapshots').put(record);await done;lastHash=fingerprint;lastError='';
  await prune(db);return record;
})}
async function prune(db){const all=await request(db.transaction('snapshots').objectStore('snapshots').getAll());all.sort((a,b)=>b.at-a.at);
  const keep=all.slice(0,MAX_SNAPSHOTS), used=new Set(keep.flatMap(s=>s.assets.map(a=>a.hash))), stored=await request(db.transaction('blobs').objectStore('blobs').getAllKeys());
  const tx=db.transaction(['snapshots','blobs'],'readwrite'),done=complete(tx);
  for(const row of all.slice(MAX_SNAPSHOTS))tx.objectStore('snapshots').delete(row.id);
  for(const key of stored)if(!used.has(key))tx.objectStore('blobs').delete(key);await done;
}
function validateValues(values){
  if(!values||typeof values!=='object'||Array.isArray(values))throw Error('پشتیبان معتبر نیست.');
  for(const [key,value]of Object.entries(values))if(!allowed(key)||typeof value!=='string')throw Error('تنظیمات پشتیبان معتبر نیست.');
  const projects=JSON.parse(values['jibcode-en']||'null')?.state;
  if(!projects||!Array.isArray(projects.projects)||!projects.projects.length||!projects.projects.some(p=>p.id===projects.activeProjectId))throw Error('فهرست پروژه‌ها معتبر نیست.');
  const ids=new Set();for(const p of projects.projects){if(!p||typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||!Array.isArray(p.files)||!p.files.length)throw Error('پروژهٔ پشتیبان معتبر نیست.');ids.add(p.id);
    const fids=new Set();for(const f of p.files){if(!f||typeof f.id!=='string'||fids.has(f.id)||typeof f.name!=='string'||typeof f.lang!=='string'||typeof f.content!=='string')throw Error('فایل پروژه معتبر نیست.');fids.add(f.id)}if(!fids.has(p.activeFileId))throw Error('فایل فعال پروژه معتبر نیست.')}
  const apps=JSON.parse(values['jibcode-launcher']||'{"state":{"apps":[]}}')?.state?.apps;
  if(!Array.isArray(apps)||apps.some(a=>!a||typeof a.id!=='string'||typeof a.name!=='string'||!Array.isArray(a.files)||a.files.some(f=>typeof f.name!=='string'||typeof f.content!=='string')))throw Error('پشتیبان لانچر معتبر نیست.');
  const key=values['codepad.apk.signing-key.v1'];if(key){const jwk=JSON.parse(key);if(jwk.kty!=='RSA'||jwk.e!=='AQAB'||!jwk.n||!jwk.d)throw Error('کلید امضای پشتیبان معتبر نیست.')}
}
function validateAssets(rows){if(!Array.isArray(rows)||rows.length>10000)throw Error('پیوست‌های پشتیبان معتبر نیستند.');let total=0;const keys=new Set();for(const r of rows){if(!r||typeof r.projectId!=='string'||typeof r.name!=='string'||r.key!==r.projectId+'\0'+r.name||keys.has(r.key)||!(r.blob instanceof Blob))throw Error('پیوست پشتیبان معتبر نیست.');keys.add(r.key);total+=r.blob.size;if(total>MAX_BYTES)throw Error('پیوست‌ها بیش از ۱۶۰ مگابایت هستند.')}}
async function apply(values,rows){validateValues(values);validateAssets(rows);
  if(values['codepad.apk.signing-key.v1']) {const jwk=JSON.parse(values['codepad.apk.signing-key.v1']), algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},privateKey=await crypto.subtle.importKey('jwk',jwk,algorithm,false,['sign']),publicKey=await crypto.subtle.importKey('jwk',{kty:'RSA',n:jwk.n,e:jwk.e},algorithm,false,['verify']),probe=new TextEncoder().encode('CodePad backup key check');if(!await crypto.subtle.verify(algorithm,publicKey,await crypto.subtle.sign(algorithm,privateKey,probe),probe))throw Error('کلید امضای پشتیبان خراب است.');}
  const counters=JSON.parse(values['codepad.apk.versions.v1']||'{}'),currentCounters=JSON.parse(localStorage.getItem('codepad.apk.versions.v1')||'{}');for(const [k,v]of Object.entries(currentCounters))if(Number.isInteger(v)&&v>0)counters[k]=Math.max(v,Number(counters[k])||0);values={...values,'codepad.apk.versions.v1':JSON.stringify(counters)};
  await snapshot('پیش از بازگردانی',true);stop();
  const previous=storage(),db=await assetsDB();
  try{
    for(const k of Object.keys(previous))if(!(k in values))localStorage.removeItem(k);
    for(const [k,v]of Object.entries(values))localStorage.setItem(k,v);
    const tx=db.transaction('files','readwrite'),done=complete(tx),store=tx.objectStore('files');store.clear();for(const row of rows)store.put(row);await done;
  }catch(error){for(const k of Object.keys(storage()))localStorage.removeItem(k);for(const [k,v]of Object.entries(previous))localStorage.setItem(k,v);throw error}
  lastHash='';return true;
}
export async function restore(id){const db=await recoveryDB,record=await request(db.transaction('snapshots').objectStore('snapshots').get(id));if(!record)throw Error('این نسخه پیدا نشد.');const rows=[];
  for(const r of record.assets){const saved=await request(db.transaction('blobs').objectStore('blobs').get(r.hash));if(!saved)throw Error('پیوست این نسخه در دسترس نیست.');const{hash,...rest}=r;rows.push({...rest,blob:saved.blob})}return apply(record.values,rows);
}
const b64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text)};
export async function exportFull(){await snapshot('خروجی پشتیبان',true);const rows=await assetRecords(),out=[];for(const r of rows)out.push({...r,blob:undefined,b64:b64(new Uint8Array(await r.blob.arrayBuffer()))});return JSON.stringify({format:'codepad-full-backup',schema:1,version:VERSION,exportedAt:Date.now(),values:storage(),assets:out})}
export async function importFull(file){if(file.size>MAX_BYTES*1.4)throw Error('فایل پشتیبان بیش از حد بزرگ است.');const doc=JSON.parse(await file.text());
  if(doc.jibosBackup===1||doc.format==='jibcode-launcher-backup-v1'){await snapshot('پیش از انتقال لانچر',true);const result=await importLauncher(JSON.stringify(doc));if(result.prefs)localStorage.setItem('jibcode-launcher-preferences',JSON.stringify(result.prefs));await snapshot('انتقال لانچر',true);return {legacy:true,count:result.installed}}
  if(doc.format!=='codepad-full-backup'||doc.schema!==1)throw Error('این فایل پشتیبان CodePad نیست.');validateValues(doc.values);
  const rows=doc.assets?.map(r=>{if(typeof r.b64!=='string')throw Error('پیوست خراب است.');const raw=atob(r.b64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const{b64,...rest}=r;return {...rest,blob:new Blob([bytes],{type:r.type||'application/octet-stream'})}});await apply(doc.values,rows);return {legacy:false};
}
const guides=[
 ['Faker','Python خالص','pip install faker','from faker import Faker\nfake = Faker()\nprint(fake.name())','ساخت نام، متن و دادهٔ آزمایشی؛ بدون نیاز به رابط گرافیکی.'],
 ['pyfiglet','Python خالص','pip install pyfiglet','import pyfiglet\nprint(pyfiglet.figlet_format("CodePad"))','نوشتهٔ بزرگ در کنسول.'],
 ['SymPy','Python خالص','pip install sympy','import sympy as sp\nprint(sp.factor(sp.Symbol("x")**2 - 1))','محاسبات نمادین؛ نصب اولیه ممکن است کمی زمان ببرد.'],
 ['NumPy / pandas / Pillow','بستهٔ مخصوص Pyodide','pip install numpy','import numpy as np\nprint(np.array([1, 2, 3]))','این‌ها به نسخهٔ سازگار با Pyodide نیاز دارند؛ wheel معمول ویندوز یا اندروید قابل نصب نیست.'],
 ['pygame / tkinter','رابط دسکتاپ','', '', 'پروفایل Python Vision از دوربین، تشخیص دست MediaPipe و نمایش ذرات OpenGL با APIهای همین نمونه پشتیبانی می‌کند؛ نصب pip لازم نیست. این پشتیبانی کامل pygame یا tkinter نیست. برای سایر بازی‌ها از Mix یا Nava استفاده کن.'],
 ['requests / socket / subprocess','وابسته به سیستم','', '', 'نصب موفق، دسترسی به سوکت یا فرمان سیستم ایجاد نمی‌کند. برای HTTP از pyodide.http.pyfetch و برای فرمان‌های گوشی از گزینهٔ Termux استفاده کن.']
];
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n};
let dialog,body,status,tab='history',busy=false;
function message(text,error=false){status.textContent=text;status.dataset.error=String(error)}
function button(text,action,primary=false){const b=el('button',text,primary?'cp-primary':'');b.type='button';b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;message('در حال انجام…');try{await action()}catch(error){message(error.message||String(error),true)}finally{busy=false;b.disabled=false}};return b}
async function render(){body.replaceChildren();if(tab==='history'){
  body.append(el('p','تا ۲۰ نسخهٔ آخر به‌صورت خودکار روی همین دستگاه نگه داشته می‌شود. بازگردانی، یک نسخه از وضعیت فعلی هم حفظ می‌کند.','cp-muted'));
  body.append(button('ثبت نسخهٔ اکنون',async()=>{await snapshot('دستی',true);await render();message('نسخهٔ فعلی ذخیره شد.')}));
  const list=el('div',undefined,'cp-history');body.append(list);const all=await request((await recoveryDB).transaction('snapshots').objectStore('snapshots').getAll());all.sort((a,b)=>b.at-a.at);
  if(!all.length)list.append(el('p','هنوز نسخه‌ای ذخیره نشده است.'));
  for(const s of all){const row=el('article'),info=el('div');info.append(el('strong',new Date(s.at).toLocaleString('fa-IR')),el('p',s.reason+' · '+JSON.parse(s.values['jibcode-en']||'{}')?.state?.projects?.length+' پروژه','cp-muted'));row.append(info,button('بازگردانی',async()=>{await restore(s.id);message('نسخه بازگردانده شد.');location.reload()}));list.append(row)}
  if(lastError)message('پشتیبان خودکار ذخیره نشد: '+lastError,true);
}else if(tab==='backup'){
  body.append(el('p','پشتیبان کامل شامل کدها، پیوست‌ها، برنامه‌های لانچر، دادهٔ برنامه‌ها و کلید امضای خروجی‌های شخصی است. کلید Gemini ذخیره نمی‌شود.','cp-muted'));
  body.append(button('ذخیرهٔ پشتیبان کامل',async()=>{const text=await exportFull();const saved=await saveFile('CodePad-backup-'+new Date().toISOString().slice(0,10)+'.json',new TextEncoder().encode(text),'application/json');message(saved?'پشتیبان ذخیره شد.':'ذخیره لغو شد.')},true));
  const file=el('input');file.type='file';file.accept='.json,.codepad-backup';file.hidden=true;body.append(file);file.onchange=async()=>{if(!file.files[0])return;busy=true;message('در حال بررسی پشتیبان…');try{const result=await importFull(file.files[0]);message(result.legacy?result.count+' برنامه منتقل شد.':'پشتیبان بازگردانده شد.');location.reload()}catch(error){message(error.message,true)}finally{busy=false;file.value=''}};
  body.append(button('بازگردانی از فایل',()=>{file.click();message('فایل پشتیبان را انتخاب کن.')}));
  body.append(el('h3','انتقال از نسخهٔ ۲.۱۰'),el('p','در نسخهٔ قبلی، از تنظیمات لانچر پشتیبان بگیر و اینجا همان فایل را بازگردانی کن. پروژه‌های ویرایشگر را نیز از گزینهٔ ذخیرهٔ فایل منتقل کن. این نصب مستقل است؛ نسخهٔ قبلی را تا انتقال اطلاعات نگه دار.','cp-muted'));
}else{
  body.append(el('p','CodePad از Python مرورگری استفاده می‌کند. بسته‌های Python خالص و بسته‌های مخصوص Pyodide قابل استفاده‌اند؛ همهٔ کتابخانه‌های سیستم قابل نصب نیستند.','cp-muted'));
  for(const[name,kind,install,use,note]of guides){const card=el('article',undefined,'cp-package');card.append(el('strong',name),el('span',kind,'cp-badge'),el('p',note,'cp-muted'));if(install){const code=el('pre',install+'\n\n'+use);code.dir='ltr';card.append(code,button('کپی نصب و نمونه',async()=>{await navigator.clipboard.writeText(install+'\n\n'+use);message('دستور نصب برای کنسول و کد استفاده برای فایل Python کپی شد.')}))}body.append(card)}
}}
export async function openTools(){if(!dialog){dialog=el('dialog',undefined,'cp-tools');dialog.dir='rtl';const header=el('header'),titles=el('div');titles.append(el('h2','مرکز پروژه'),el('p','CodePad '+VERSION,'cp-muted'));header.append(titles,button('بستن',()=>dialog.close()));const nav=el('nav');for(const[id,label]of[['history','تاریخچه'],['backup','پشتیبان'],['packages','کتابخانه‌ها']]){const b=button(label,async()=>{tab=id;for(const other of nav.children)other.dataset.active=String(other===b);message('');await render()});b.dataset.active=String(id===tab);nav.append(b)}body=el('section',undefined,'cp-tools-body');status=el('p','', 'cp-status');status.setAttribute('role','status');dialog.append(header,nav,body,status);document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}})}dialog.showModal();await render()}
window.CodePadRecovery={open:openTools};
function schedule(){clearTimeout(timer);timer=setTimeout(()=>snapshot().catch(()=>{}),8000)}
lab.subscribe((next,previous)=>{if(next.projects!==previous.projects)schedule()});launcher.subscribe(schedule);assets.subscribe(schedule);
setTimeout(()=>snapshot('شروع جلسه').catch(()=>{}),6000);setInterval(()=>snapshot().catch(()=>{}),120000);
addEventListener('pagehide',()=>snapshot('پایان جلسه').catch(()=>{}));

// Camera and 3D samples are available in the dedicated Studio workspace.
