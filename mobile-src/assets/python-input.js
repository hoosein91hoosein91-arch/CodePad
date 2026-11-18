// A small, focus-managed console prompt: no page reload and no source rewriting.
let current;
const dialog = document.createElement('dialog');
dialog.className = 'cp-python-input';
dialog.setAttribute('aria-labelledby','cp-input-title');
dialog.innerHTML = `<form><header><div><small>PYTHON / STDIN</small><h2 id="cp-input-title">برنامه منتظر پاسخ است</h2></div><span class="cp-input-state">در حال اجرا</span></header><label for="cp-input-value" class="cp-input-prompt" dir="auto"></label><input id="cp-input-value" name="answer" dir="auto" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="پاسخ برنامه"><p>پاسخ را بنویس؛ اجرای برنامه از همین‌جا ادامه پیدا می‌کند.</p><footer><button type="button" data-stop>توقف</button><button type="button" data-eof title="ارسال پایان ورودی؛ مانند Ctrl+D">پایان ورودی</button><button type="submit" data-send>ارسال ↵</button></footer></form>`;
document.body.append(dialog);
const field = dialog.querySelector('input');
function close() {current = null; if(dialog.open)dialog.close();field.value='';field.type='text';}
function reply(eof = false) {
  const request = current;
  if(!request)return;
  const value=field.value;
  close();request.respond(value,eof);
}
dialog.querySelector('form').onsubmit = event => {event.preventDefault();reply();};
dialog.querySelector('[data-eof]').onclick=()=>reply(true);
dialog.querySelector('[data-stop]').onclick=()=>{close();window.dispatchEvent(new Event('codepad-stop-python'));};
dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.querySelector('[data-stop]').click();});
window.addEventListener('codepad-python-input',event=>{
  current=event.detail;
  const secret=String(current.prompt||'').startsWith('\u0001secret\u0001'),prompt=String(current.prompt||'').replace('\u0001secret\u0001','');
  field.type=secret?'password':'text';field.autocomplete=secret?'new-password':'off';
  dialog.querySelector('label').textContent=prompt || 'ورودی برنامه';
  field.value='';
  if(!dialog.open)dialog.showModal();
  field.focus();
});
window.addEventListener('codepad-python-input-close',close);
window.addEventListener('codepad-runtime-state',event=>{if(!event.detail.running)close();});
