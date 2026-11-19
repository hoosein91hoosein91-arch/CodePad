import {updateNative,updateCall} from './update-runtime.js';import {VERSION} from './version.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderUpdateStudio(host){
 let token=null,busy=false;host.innerHTML=`<div class="ui-intro"><h2>به‌روزرسانی با یک فایل کوچک</h2><p>فایل رسمی <code>.cpupdate</code> را از حافظه انتخاب کن. امضا و سازگاری بررسی می‌شود و پروژه‌ها در جای خود می‌مانند.</p></div><section class="ui-card"><h3>نسخهٔ فعلی <b dir="ltr">${esc(VERSION)}</b></h3><p data-update-native></p><div class="ui-actions"><button data-update-pick class="ui-btn ui-btn--primary">انتخاب فایل به‌روزرسانی</button><button data-update-rollback>بازگشت به نسخهٔ قبل</button></div></section><section class="ui-card" data-update-review hidden><h3 data-update-version></h3><p data-update-summary></p><pre data-update-notes dir="auto"></pre><button data-update-apply class="ui-btn ui-btn--primary">نصب و راه‌اندازی دوباره</button></section><p data-update-status role="status" class="ui-caption"></p><section class="ui-cards"><article><h3>چه چیزهایی با فایل کوچک تغییر می‌کنند؟</h3><p>رابط، کدهای اجرا، سازگاری Python و قالب خروجی. اضافه‌کردن هستهٔ بومی، مجوز اندروید یا کتابخانهٔ native جدید به APK نیاز دارد.</p></article><article><h3>اگر نسخه باز نشد</h3><p>نصب ابتدا در پوشهٔ جدا انجام می‌شود. اگر نسخهٔ جدید آماده نشود، برنامه به نسخهٔ قبلی برمی‌گردد. برای خطای شروع، یک بار برنامه را ببند و دوباره باز کن.</p></article></section>`;
 const get=s=>host.querySelector(s),status=text=>{if(host.isConnected)get('[data-update-status]').textContent=text;};
 if(!updateNative()&&globalThis.cpDesktop?.update)return desktopUpdate(host,get,status);const available=updateNative();get('[data-update-pick]').disabled=!available;get('[data-update-rollback]').disabled=true;
 if(!available){get('[data-update-native]').textContent='این قابلیت از APK دارای هستهٔ ۳٫۶٫۰ به بعد فعال است. پیش‌نمایش مرورگر فایل نصب اندروید را تغییر نمی‌دهد.';return;}
 async function refresh(){try{const s=await updateCall('status');get('[data-update-native]').textContent='هستهٔ Android: '+s.nativeCode+' · کد فعال: '+s.version;get('[data-update-rollback]').disabled=!s.canRollback;if(s.lastError)status(s.lastError);}catch(e){status(e.message||String(e));}}
 await refresh();
 get('[data-update-pick]').onclick=async()=>{if(busy)return;busy=true;status('در حال بررسی فایل و امضای آن…');try{const r=await updateCall('pick');if(r.cancelled){status('انتخاب فایل لغو شد.');return;}token=r.token;const m=r.manifest;get('[data-update-version]').textContent='نسخهٔ '+m.version;get('[data-update-summary]').textContent=Object.keys(m.files).length.toLocaleString('fa-IR')+' فایل · '+(r.bytes/1024/1024).toLocaleString('fa-IR',{maximumFractionDigits:2})+' مگابایت';get('[data-update-notes]').textContent=m.notes||'';get('[data-update-review]').hidden=false;status('امضا معتبر است؛ نسخه برای نصب آماده است.');}catch(e){token=null;get('[data-update-review]').hidden=true;status(e.message||String(e));}finally{busy=false;}};
 get('[data-update-apply]').onclick=async()=>{if(busy||!token)return;busy=true;get('[data-update-apply]').disabled=true;status('در حال نصب؛ تا پایان این مرحله برنامه را نبند…');try{window.dispatchEvent(new Event('codepad-stop-python'));for(const plugin of ['CodePadRuntime','CodePadPython'])await window.Capacitor.nativePromise(plugin,'stop',{}).catch(()=>{});const r=await updateCall('apply',{token});status('نسخهٔ '+r.version+' نصب شد؛ در حال بازشدن…');await updateCall('restart');}catch(e){status(e.message||String(e));busy=false;get('[data-update-apply]').disabled=false;}};
 get('[data-update-rollback]').onclick=async()=>{if(busy)return;busy=true;try{await updateCall('rollback');}catch(e){status(e.message||String(e));busy=false;}};
}

const MAX_BYTES=300*1024*1024,MAX_FILES=5000;
const hex=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const safePath=p=>typeof p==='string'&&p&&!p.includes('\0')&&!p.includes('\\')&&!p.startsWith('/')&&!/^[A-Za-z]:/.test(p)&&!p.split('/').some(x=>x===''||x==='..'||x==='.');
/** Desktop (Windows) path: .cpupdate is a ZIP with manifest.json {format,version,notes,files:{path:sha256}} plus the files. Not signed; integrity is checked by SHA-256 and the user approves. */
async function desktopUpdate(host,get,status){
 const api=globalThis.cpDesktop.update;let pending=null,busy=false;
 get('[data-update-native]').textContent='ویندوز: فایل به‌روزرسانی (.cpupdate) بررسی و بدون امضای دیجیتال نصب می‌شود؛ صحت هر فایل با SHA-256 سنجیده می‌شود. نسخهٔ قبلی برای بازگشت نگه داشته می‌شود.';
 get('[data-update-pick]').disabled=false;
 const refresh=async()=>{try{const st=await api.status();get('[data-update-rollback]').disabled=!st.canRollback;}catch(e){status(e.message||String(e));}};
 await refresh();
 const input=document.createElement('input');input.type='file';input.accept='.cpupdate,.zip,application/zip';input.hidden=true;host.append(input);
 get('[data-update-pick]').onclick=()=>{if(!busy)input.click();};
 input.onchange=async()=>{const file=input.files[0];input.value='';if(!file||busy)return;busy=true;pending=null;get('[data-update-review]').hidden=true;status('در حال بررسی فایل…');
  try{
   if(file.size>MAX_BYTES)throw Error('فایل بزرگ‌تر از ۳۰۰ مگابایت است.');
   const {unzipSync}=await import('./vendor/fflate.js');const entries=unzipSync(new Uint8Array(await file.arrayBuffer()));
   const mraw=entries['manifest.json'];if(!mraw)throw Error('manifest.json در فایل نیست؛ این فایل به‌روزرسانی CodePad نیست.');
   const m=JSON.parse(new TextDecoder().decode(mraw));
   if(m.format!=='codepad-web-update/1'||typeof m.version!=='string'||!m.files||typeof m.files!=='object')throw Error('قالب manifest پشتیبانی نمی‌شود.');
   const names=Object.keys(m.files);if(!names.length||names.length>MAX_FILES)throw Error('تعداد فایل‌ها معتبر نیست.');
   const files=[];let total=0;
   for(const name of names){
    if(!safePath(name))throw Error('مسیر نامعتبر در فایل: '+name);
    const bytes=entries[name];if(!bytes)throw Error('فایل در بسته نیست: '+name);
    if(await hex(bytes)!==String(m.files[name]).toLowerCase())throw Error('SHA-256 این فایل نمی‌خواند: '+name);
    total+=bytes.length;files.push({path:name,bytes});
   }
   for(const name of Object.keys(entries))if(name!=='manifest.json'&&!name.endsWith('/')&&!(name in m.files))throw Error('فایل خارج از manifest: '+name);
   pending={files,version:m.version};
   get('[data-update-version]').textContent='نسخهٔ '+m.version;get('[data-update-summary]').textContent=names.length.toLocaleString('fa-IR')+' فایل · '+(total/1024/1024).toLocaleString('fa-IR',{maximumFractionDigits:2})+' مگابایت';get('[data-update-notes]').textContent=m.notes||'';get('[data-update-review]').hidden=false;
   status('همهٔ فایل‌ها سالم‌اند (SHA-256). این بسته امضای دیجیتال ندارد؛ فقط اگر منبعش را می‌شناسی نصب کن.');
  }catch(e){pending=null;status(e.message||String(e));}finally{busy=false;}};
 get('[data-update-apply]').onclick=async()=>{if(busy||!pending)return;if(!confirm('نصب به‌روزرسانی '+pending.version+'؟ برنامه دوباره باز می‌شود و نسخهٔ قبلی برای بازگشت نگه داشته می‌شود.'))return;busy=true;get('[data-update-apply]').disabled=true;status('در حال نصب؛ برنامه را نبند…');
  try{await api.apply(pending.files);status('نصب شد؛ در حال بازشدن دوباره…');}catch(e){status(e.message||String(e));busy=false;get('[data-update-apply]').disabled=false;}};
 get('[data-update-rollback]').onclick=async()=>{if(busy||!confirm('به نسخهٔ قبل برگردد؟'))return;busy=true;try{await api.rollback();status('در حال بازگشت…');}catch(e){status(e.message||String(e));busy=false;}};
}
