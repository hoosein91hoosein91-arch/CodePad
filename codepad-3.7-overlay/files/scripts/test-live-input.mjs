// input() در ویرایشگر: پنجرهٔ سؤال وجود ندارد؛ جواب‌ها از «جواب‌های آماده» می‌آیند (Pyodide، دسکتاپ و موبایل).
// استفاده: CODEPAD_URL=http://127.0.0.1:8080/ node scripts/test-live-input.mjs
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const URL=process.env.CODEPAD_URL||'http://127.0.0.1:8080/';
const browser=await chromium.launch({executablePath:process.env.CODEPAD_CHROMIUM||undefined,headless:true});
const age=`age = int(input("سن شما چند است؟ "))
if age > 17:
    print("87")
elif age < 17:
    print("کوچولو")
else:
    print("دقیقاً ۱۷")`;
try {
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(URL);
  await page.locator('[data-codepad-run]').waitFor();
  async function start(code,stdin,files=[]){
   await page.evaluate(async({code,stdin,files})=>{
    const rt=window.__rt=await import('/assets/runtime.js');
    rt.pt.getState().importProject('جواب آماده',[{name:'main.py',lang:'python',content:code},...files]);
    rt.pt.setState(s=>({projects:s.projects.map(p=>p.id===s.activeProjectId?{...p,files:p.files.map((f,i)=>i===0?{...f,stdin}:f)}:p)}));
    rt.pt.getState().clearLines();
   },{code,stdin,files});
   await page.locator('[data-codepad-run]').click();
  }
  async function finish(marker){
   await page.waitForFunction(marker=>{const s=window.__rt.pt.getState();return !s.running && s.lines.some(l=>l.text.includes(marker));},marker,{timeout:60000}).catch(async error=>{console.error('INPUT TEST FAILED',marker,JSON.stringify(await page.evaluate(()=>window.__rt.pt.getState().lines.map(l=>l.text))));throw error;});
   assert.equal(await page.locator('.cp-python-input').count(),0,'no question dialog may exist');
   return page.evaluate(()=>window.__rt.pt.getState().lines.map(l=>l.text).join('\n'));
  }
  for(const [value,expected] of [['18','87'],['14','کوچولو'],['17','دقیقاً ۱۷']]){
   await start(age,value);const out=await finish(expected);
   assert.ok(out.includes('سن شما چند است؟ '+value),'the prepared answer is echoed after the question');
  }
  // helper modules read the same prepared lines; nothing is replayed
  await start(`from pathlib import Path
import helper
p=Path('side-effect.txt')
p.write_text(p.read_text()+'x' if p.exists() else 'x')
a=helper.ask()
b=input('خالی: ')
print('RESULT',repr(a),repr(b),p.read_text())`,'  حسین  \n\n',[{name:'helper.py',lang:'python',content:`def ask():\n    return input('نام: ')`}]);
  const output=await finish('RESULT');assert.ok(output.includes("RESULT '  حسین  ' '' x"),output);
  assert.equal((output.match(/نام:/g)||[]).length,1,'prompt replayed');
  await start(`import sys
a=sys.stdin.readline()
b=input('بعدی: ')
print('READLINE',repr(a),b)`,'سلام\nok');
  assert.ok((await finish('READLINE')).includes("READLINE 'سلام\\n' ok"));
  // running out of answers: a normal EOFError a program can catch ...
  await start(`try:\n input('EOF: ')\nexcept EOFError:\n print('EOF_OK')`,'');
  await finish('EOF_OK');
  // ... and, when not caught, a clear message instead of a hang or a dialog
  await start(`input('بی‌جواب: ')`,'');
  const failed=await finish('ورودی آماده تمام شد');assert.ok(failed.includes('ورودی آماده تمام شد'));
  assert.deepEqual(errors,[],errors.join('\n'));
  await page.close();
 }
 console.log('PASS input() is answered from the prepared answers; no dialog; EOF is clear; desktop and mobile');
} finally {await browser.close();}
