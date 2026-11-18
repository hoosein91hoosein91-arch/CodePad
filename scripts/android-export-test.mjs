// Run only on a fresh test emulator. Exercises the real plugin and document picker.
import {_android}from'playwright';import assert from'node:assert/strict';import{execFileSync}from'node:child_process';import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';import{resolve,join}from'node:path';
const pkg=JSON.parse(readFileSync('capacitor.config.json','utf8')).appId,output=resolve('build-qa');mkdirSync(output,{recursive:true});
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:60000});
const xml=()=>{try{adb('shell','uiautomator','dump','/sdcard/codepad-ui.xml');return adb('shell','cat','/sdcard/codepad-ui.xml')}catch{return ''}};
const nodes=text=>[...text.matchAll(/<node\s+([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
const tap=node=>{const b=node?.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);if(!b)throw Error('Document picker target missing');adb('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)))};
async function waitPicker(){for(let i=0;i<60;i++){const value=xml();if(/documentsui/.test(value)&&nodes(value).some(n=>/^save$/i.test(n.text)))return value;await new Promise(r=>setTimeout(r,1000))}throw Error('Android document picker did not open. Window: '+adb('shell','dumpsys','window','windows').slice(-4000)+' UI: '+xml())}
let device,page;
try{
 adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk');adb('shell','am','start','-n',pkg+'/'+pkg+'.MainActivity');
 [device]=await _android.devices();assert(device,'No Android test emulator');const webview=await device.webView({pkg,timeout:60000});page=await webview.page();page.setDefaultTimeout(30000);
 await page.getByRole('button',{name:'پروژه‌ها',exact:true}).waitFor();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await page.evaluate(()=>window.Capacitor.isPluginAvailable('ApkExport')),true,'ApkExport is not registered');
 await page.evaluate(async()=>{const m=await import('/assets/runtime.js');const id=m.pt.getState().importProject('CodePadExportQA',[{name:'main.py',lang:'python',content:'print("NATIVE_EXPORT_OK")'}]);await m.Et(id,[new File(['native attachment'],'notes.txt',{type:'text/plain'})]);});
 // Cancellation must resolve false and clean the temporary file.
 await page.evaluate(()=>{window.__cancelExport=null;import('/assets/runtime.js').then(m=>m.saveCodePadFile('cancel.txt',new TextEncoder().encode('cancel'),'text/plain')).then(value=>window.__cancelExport=value)});
 await waitPicker();adb('shell','input','keyevent','4');await page.waitForFunction(()=>window.__cancelExport!==null);assert.equal(await page.evaluate(()=>window.__cancelExport),false);
 await page.getByRole('button',{name:'خروجی برنامه',exact:true}).click();await page.getByRole('button',{name:'ساخت و ذخیرهٔ APK',exact:true}).click();await page.getByTestId('apk-ready').waitFor({timeout:180000});let view=await waitPicker();
 const showRoots=nodes(view).find(n=>/show roots/i.test(n['content-desc']));if(showRoots){tap(showRoots);view=xml();const downloads=nodes(view).find(n=>n.text==='Downloads');assert(downloads,'Downloads folder missing: '+view);tap(downloads);view=xml()}
 const save=nodes(view).find(n=>/^save$/i.test(n.text)&&n.enabled==='true');assert(save,'Save button missing: '+view);tap(save);
 await page.getByTestId('apk-status').filter({hasText:'APK برای ذخیره فرستاده شد.'}).waitFor({timeout:30000});await device.screenshot({path:join(output,'android-apk-saved.png')});
 const apk=join(output,'native-exported.apk');adb('pull','/sdcard/Download/CodePadExportQA.apk',apk);assert(readFileSync(apk).length>1000000);
 const tools=join(process.env.ANDROID_HOME,'build-tools',readdirSync(join(process.env.ANDROID_HOME,'build-tools')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1));execFileSync(join(tools,'apksigner'),['verify',apk]);execFileSync(join(tools,'zipalign'),['-c','-P','16','4',apk]);
 const badging=execFileSync(join(tools,'aapt'),['dump','badging',apk],{encoding:'utf8'});const exported=/package: name='([^']+)'/.exec(badging)[1];adb('install','-r',apk);adb('shell','monkey','-p',exported,'-c','android.intent.category.LAUNCHER','1');
 const exportedView=await device.webView({pkg:exported,timeout:60000});const exportedPage=await exportedView.page();await exportedPage.getByText('NATIVE_EXPORT_OK',{exact:false}).waitFor({timeout:60000});await device.screenshot({path:join(output,'android-exported-app-running.png')});
 const remaining=adb('shell','run-as',pkg,'ls','cache');assert(!remaining.includes('codepad-export-'),'Temporary export file leaked');assert.deepEqual(errors,[]);console.log('PASS Android plugin registration, cancellation, real APK build, chunked native save via SAF, signature/alignment, install and execution of exported Python app');
}catch(error){try{writeFileSync(join(output,'android-ui.xml'),xml());if(device)await device.screenshot({path:join(output,'android-failure.png')});if(page)console.log('WEBVIEW',await page.locator('body').innerText());console.log(adb('logcat','-d','-t','300'));}catch{}throw error}finally{if(device)await device.close()}
