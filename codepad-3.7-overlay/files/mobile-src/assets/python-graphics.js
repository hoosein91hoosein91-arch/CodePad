import {saveVisionImage} from './vision-files.js';
let dialog,current;
window.addEventListener('codepad-python-image',event=>{
 const d=event.detail;
 if(d&&d.kind==='file')return;   // گزارش/فایل را report-export.js نشان می‌دهد
 if(!dialog){
  dialog=document.createElement('dialog');dialog.className='cp-python-graphics';dialog.dir='rtl';
  dialog.innerHTML='<header><div><small>PYTHON / GRAPHICS</small><h2></h2></div><button data-close>بستن</button></header><section><img alt="خروجی گرافیکی Python"></section><footer><span role="status"></span><button data-save>ذخیرهٔ PNG</button></footer>';
  document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-save]').onclick=async()=>{const s=dialog.querySelector('[role=status]');try{const bytes=new Uint8Array(await (await fetch(current)).arrayBuffer());s.textContent=await saveVisionImage('python-graphics.png',bytes)?'ذخیره شد.':'ذخیره لغو شد.';}catch(e){s.textContent=e.message;}};
 }
 current=d.path?window.Capacitor.convertFileSrc('file://'+d.path):'data:image/png;base64,'+d.b64;
 dialog.querySelector('h2').textContent=d.title||'خروجی Python';dialog.querySelector('img').src=current;
 if(!dialog.open)dialog.showModal();
});
