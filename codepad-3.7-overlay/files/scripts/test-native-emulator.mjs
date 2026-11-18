// Optional integration test. Uses an Android SDK emulator and a QA-only APK
// with WebView debugging enabled. Never enable that flag in a delivered APK.
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,openSync} from 'node:fs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const sdk=process.env.ANDROID_HOME,adb=sdk+'/platform-tools/adb';
if(!sdk || !process.env.CODEPAD_QA_APK)throw Error('ANDROID_HOME and CODEPAD_QA_APK required');
const call=(...args)=>execFileSync(adb,args,{encoding:'utf8',timeout:60000});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let emulator,browser;
try{
 call('start-server');
 emulator=spawn(sdk+'/emulator/emulator',['-avd','CodePadQA','-no-window','-no-audio','-no-boot-anim','-gpu','swiftshader_indirect','-accel','off','-no-snapshot','-memory','1536'],{env:{...process.env,ANDROID_I_WANT_MY_TCG:'yes'},stdio:['ignore',openSync('/tmp/codepad-emulator-qa.log','w'),'inherit']});
 const start=Date.now();let boot=false;
 while(Date.now()-start<480000){
  await delay(5000);
  try{if(call('shell','getprop','sys.boot_completed').trim()==='1'){boot=true;break;}}catch{}
  console.log('Android boot wait',Math.round((Date.now()-start)/1000),'s');
  if(emulator.exitCode!=null)throw Error('Emulator exited '+emulator.exitCode);
 }
 assert.ok(boot,'Android boot timed out');
 call('shell','settings','put','global','window_animation_scale','0');call('shell','settings','put','global','transition_animation_scale','0');
 call('shell','input','keyevent','82');
 console.log(call('install','-r',process.env.CODEPAD_QA_APK).trim());
 call('shell','am','start','-n','com.hoosein.codepad.vision212/.MainActivity');
 let socket;
 for(let n=0;n<60;n++){
  await delay(1000);const result=call('shell','cat','/proc/net/unix');
  socket=result.match(/@([^\s]*webview_devtools_remote[^\s]*)/)?.[1];if(socket)break;
 }
 assert.ok(socket,'WebView debugging socket missing');call('forward','tcp:9222','localabstract:'+socket);
 const targets=await (await fetch('http://127.0.0.1:9222/json/list')).json();
 browser=await chromium.connectOverCDP(targets[0].webSocketDebuggerUrl);
 const page=browser.contexts()[0].pages()[0];await page.locator('[data-codepad-run]').waitFor({timeout:90000});
 const result=await page.evaluate(async()=>{
  const rt=await import('/assets/runtime.js');localStorage.setItem('codepad-python-engine','native');
  rt.pt.getState().importProject('Native test',[{name:'main.py',lang:'python',content:"age=int(input('age: '))\nprint('87' if age>17 else 'small' if age<17 else 'exact17')"}]);
  window.__nativeRt=rt;return window.Capacitor.getPlatform();
 });assert.equal(result,'android');
 for(const [age,want] of [['18','87'],['14','small'],['17','exact17']]){
  // the editor never asks: the answer comes from the prepared-input box
  await page.evaluate(v=>window.__nativeRt.pt.setState(s=>({projects:s.projects.map(p=>p.id===s.activeProjectId?{...p,files:p.files.map(f=>({...f,stdin:v}))}:p)})),age);
  await page.locator('[data-codepad-run]').click();
  await page.waitForFunction(want=>{const s=window.__nativeRt.pt.getState();return !s.running&&s.lines.some(l=>l.text.includes(want));},want,{timeout:60000});
 }
 const native=await page.evaluate(async()=>{
  const rt=window.__nativeRt;return await rt.y(`import sys,socket,threading
assert sys.platform == 'android'
s=socket.socket();s.bind(('127.0.0.1',0));s.listen(1)
def server():
 c,_=s.accept();c.sendall(b'NATIVE_SOCKET_OK');c.close();s.close()
threading.Thread(target=server).start()
c=socket.create_connection(s.getsockname());print(c.recv(100).decode());c.close()
print(sys.version)`,'');
 });assert.equal(native.stderr,'');assert.match(native.stdout,/NATIVE_SOCKET_OK/);assert.match(native.stdout,/3\.13\./);
 await page.evaluate(()=>window.__nativeRt.pt.getState().updateContent("try:\n input('EOF: ')\nexcept EOFError:\n print('EOF_OK')"));
 await page.evaluate(()=>window.__nativeRt.pt.setState(s=>({projects:s.projects.map(p=>p.id===s.activeProjectId?{...p,files:p.files.map(f=>({...f,stdin:''}))}:p)})));
 await page.locator('[data-codepad-run]').click();assert.equal(await page.locator('.cp-python-input').count(),0,'no question dialog');
 await page.waitForFunction(()=>{const s=window.__nativeRt.pt.getState();return !s.running&&s.lines.some(l=>l.text.includes('EOF_OK'));});
 await page.evaluate(()=>window.__nativeRt.pt.getState().updateContent("import time\nprint('WAITING',flush=True)\ntime.sleep(60)"));
 await page.locator('[data-codepad-run]').click();await page.waitForFunction(()=>window.__nativeRt.pt.getState().lines.some(l=>l.text.includes('WAITING')),null,{timeout:60000});
 await page.locator('[data-stop]').click();await page.waitForFunction(()=>!window.__nativeRt.pt.getState().running);
 const restart=await page.evaluate(()=>window.__nativeRt.y("print('RESTART_OK')",''));assert.equal(restart.stderr,'');assert.match(restart.stdout,/RESTART_OK/);
 mkdirSync('/workspace/screenshots',{recursive:true});
 await page.screenshot({path:'/workspace/screenshots/codepad330-native-android.png'});
 console.log('PASS Android native CPython, age branches, real sockets/threads, EOF, stop/restart',native.stdout);
}finally{await browser?.close();try{call('emu','kill');}catch{}emulator?.kill('SIGKILL');}
