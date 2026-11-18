import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

// Isolated browser data: never read or change the owner's real projects.
const out = resolve(process.env.CODEPAD_QA_OUTPUT || 'screenshots/ui-rebuild');
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true, ...(process.env.CODEPAD_CHROMIUM
  ? {executablePath:process.env.CODEPAD_CHROMIUM} : process.platform === 'win32' ? {channel:'chrome'} : {})});
const context = await browser.newContext({viewport:{width:360,height:800},acceptDownloads:true});
await context.addInitScript(() => {
  if (window !== window.top || localStorage.getItem('ui-qa-seeded')) return;
  localStorage.setItem('ui-qa-seeded','1');
  const project = {id:'ui-qa',name:'کارگاه آزمایش',activeFileId:'py',files:[
    {id:'py',name:'main.py',lang:'python',content:'# سلام دنیا\nname = input()\nprint("سلام", name)',stdin:'حسین'},
    {id:'html',name:'index.html',lang:'html',content:'<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><h1>خروجی آزمایش</h1></html>',stdin:''}
  ]};
  localStorage.setItem('jibcode-en',JSON.stringify({state:{projects:[project],activeProjectId:project.id},version:1}));
  localStorage.setItem('jibcode-launcher',JSON.stringify({state:{apps:[]},version:0}));
});
const page = await context.newPage(), errors = [], checks = [];
page.setDefaultTimeout(20000);
page.on('pageerror',error => errors.push(error.message));
page.on('console',message => {if(message.type() === 'error') errors.push(message.text());});
// No outside APIs, analytics or account connections during local UI tests.
await page.route('**/*',route => {
  const url = new URL(route.request().url());
  return ['127.0.0.1','localhost'].includes(url.hostname) || ['data:','blob:'].includes(url.protocol)
    ? route.continue() : route.fulfill({status:200,body:'',contentType:'application/javascript'});
});
const check = name => { checks.push(name); console.log('PASS',name); };
async function shot(name) {
  await page.evaluate(async()=>{
    await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations !== Infinity).map(a=>a.finished.catch(()=>{})));
  });
  await page.screenshot({path:resolve(out,name+'.png')});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),false,'page overflow: '+name);
}
async function closeReact() {await page.keyboard.press('Escape'); await page.locator('.ui-modal,.ui-drawer').waitFor({state:'hidden'});}
async function openExport() {
  await page.getByRole('button',{name:'گزینه‌های بیشتر',exact:true}).click();
  await page.getByRole('button',{name:'خروجی APK یا PC',exact:true}).click();
  await page.getByTestId('apk-export-sheet').waitFor();
}
try {
  await page.goto(process.argv.slice(2).find(value => /^https?:/.test(value)) || 'http://127.0.0.1:8080');
  await page.locator('.cm-content').waitFor();
  await page.locator('main > header [data-codepad-background]').waitFor({state:'attached'});
  assert.match(await page.locator('.cm-content').innerText(),/سلام دنیا/);
  await page.evaluate(() => document.fonts.ready);
  await shot('editor-360');
  for (const size of [{width:412,height:915},{width:800,height:1100},{width:1280,height:800}]) {
    await page.setViewportSize(size); await shot('editor-'+size.width);
    if(size.width === 1280) {
      const code = await page.locator('.ui-canvas').boundingBox(), side = await page.locator('.ui-sidebar').boundingBox();
      assert(code.width > 200 && code.height > 400 && side.width > 200,'tablet grid leaves room for code and files');
    }
  }
  check('editor renders at 360, 412, 800 and 1280 widths with a working tablet grid');
  await page.setViewportSize({width:412,height:915});
  await page.getByRole('button',{name:'ظاهر',exact:true}).click();
  for(const palette of ['Ember','Porcelain','Aurora Ink']) {
    await page.getByRole('button',{name:palette,exact:true}).click();
    assert.equal(await page.locator('.ui-canvas').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
    await shot('appearance-'+palette.split(' ')[0].toLowerCase());
  }
  await page.locator('#ui-fs').fill('20');
  await page.locator('#ui-lig').check();
  await closeReact(); await page.reload(); await page.locator('.cm-content').waitFor();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ui-code-size').trim()),'20px');
  check('all palettes keep the code black; appearance persists after reload');
  await page.getByRole('button',{name:'اجرا',exact:true}).click();
  await page.locator('.ui-log').filter({hasText:'سلام حسین'}).waitFor({timeout:90000});
  await shot('python-output');
  check('real Python runs with Persian input and output');
  await page.locator('.cm-content').click();
  await page.evaluate(()=>{
    const vv=window.visualViewport;
    Object.defineProperty(vv,'height',{configurable:true,get:()=>window.__qaViewportHeight || innerHeight});
    window.__qaViewportHeight=500;vv.dispatchEvent(new Event('resize'));
  });
  await page.locator('.ui-app[data-kb="open"]').waitFor();
  assert.equal(await page.locator('.ui-dock').isVisible(),false);
  const stdinBox=await page.getByRole('textbox',{name:'ورودی برنامه',exact:true}).boundingBox();
  assert(stdinBox && stdinBox.y+stdinBox.height<=501,'input remains above the simulated keyboard');
  await page.screenshot({path:resolve(out,'keyboard-simulated.png'),clip:{x:0,y:0,width:412,height:500}});
  await page.evaluate(()=>{window.__qaViewportHeight=0;window.visualViewport.dispatchEvent(new Event('resize'));});
  check('simulated keyboard viewport keeps input visible and hides the bottom dock');
  await page.getByRole('button',{name:'پروژه‌ها و فایل‌ها',exact:true}).click();
  await shot('files');
  await page.getByRole('dialog').getByRole('button',{name:'HTML index.html',exact:false}).click();
  await page.locator('.cm-content').filter({hasText:'خروجی آزمایش'}).waitFor();
  await page.getByRole('button',{name:'اجرا',exact:true}).click();
  await page.getByRole('tab',{name:'پیش‌نمایش',exact:false}).or(page.getByRole('tab',{name:'صفحه',exact:true})).first().click();
  await page.frameLocator('iframe').first().getByRole('heading',{name:'خروجی آزمایش'}).waitFor();
  await shot('preview');
  check('file switching and the real HTML preview work');
  await openExport();
  await page.getByText('تنظیمات اختیاری',{exact:true}).click();
  await page.getByLabel('نام APK',{exact:true}).fill('آزمون طراحی');
  await shot('export-android');
  await page.getByRole('button',{name:'ویندوز · PC',exact:true}).click();
  await page.getByLabel('نام برنامه PC',{exact:true}).waitFor();
  await shot('export-windows'); await closeReact();
  check('both export forms expose their options through the shared sheet');

  for(const tab of ['projects','browser','terminal','packages','extensions','device','camera','agent','media','opencv','updates']) {
    await page.evaluate(tab => window.CodePadStudio.open(tab),tab);
    await page.getByTestId('codepad-studio').waitFor();
    await shot('studio-'+tab);
  }
  await page.evaluate(()=>window.CodePadStudio.close());
  check('all eleven Studio destinations render');
  await page.evaluate(()=>window.CodePadStudio.open('media'));
  await page.locator('[data-media-demo]').click();
  await page.locator('[data-zip-import]').waitFor();
  await page.locator('[data-zip-entry]').selectOption('lesson.html');
  await page.locator('[data-zip-import]').click();
  await page.locator('[data-zip-import]').waitFor({state:'hidden'});
  await page.evaluate(()=>window.CodePadStudio.open('media'));
  await page.locator('[data-lesson-preview]').click();
  const lesson=page.frameLocator('iframe[title="پیش‌نمایش درس تعاملی"]');
  await lesson.locator('.lesson-video').waitFor();
  await shot('lesson-preview');
  await page.locator('.media-lesson-preview header button').click();
  await page.evaluate(()=>window.CodePadStudio.close());
  await page.evaluate(async()=>{
    const rt=await import('/assets/runtime.js');
    rt.pt.getState().importProject('آزمون رسم',[{name:'draw.py',lang:'python',content:'import turtle\nturtle.speed(0)\nturtle.color("#b7a1ff")\nfor i in range(4):\n    turtle.forward(80)\n    turtle.left(90)\nturtle.done()'}]);
  });
  await page.getByRole('button',{name:'اجرا',exact:true}).click();
  await page.locator('.cp-vision[data-turtle-ready="true"]').waitFor({timeout:90000});
  await shot('turtle-output');
  await page.locator('.cp-vision [data-close]').click();
  await page.evaluate(async()=>{const rt=await import('/assets/runtime.js');rt.pt.getState().setActiveProject('ui-qa');});
  check('ZIP import, real lesson preview and Turtle output work with the new shell');
  for(const tab of ['home','samples','academy','security','tools']) {
    await page.evaluate(tab=>window.CodePadHub.open(tab),tab);
    await shot('hub-'+tab);
  }
  await page.evaluate(async()=>{
    const {modal,h}=await import('/assets/ui-dom.js');
    window.__qaModal=modal({title:'بررسی پنجرهٔ تو در تو',body:h('button',{type:'button'},'تمرکز')});
  });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('[role=dialog]')?.getAttribute('aria-label')),'بررسی پنجرهٔ تو در تو');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ui-hub').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('ui-locked')),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('ui-locked')),false);
  check('hub views render; nested dialogs trap focus and Escape closes only the top layer');

  await page.evaluate(async()=>{await (await import('/assets/recovery.js')).openTools();});
  await page.getByRole('button',{name:'ثبت نسخهٔ اکنون',exact:true}).click();
  await page.getByRole('status').filter({hasText:'نسخهٔ فعلی ذخیره شد'}).waitFor();
  await shot('recovery');
  await page.getByRole('tab',{name:'پشتیبان',exact:true}).click();
  const backupPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'ذخیرهٔ پشتیبان کامل',exact:true}).click();
  const backup = await backupPromise;
  assert.match(backup.suggestedFilename(),/json/);
  await closeReact();
  check('snapshot and full backup remain usable after the UI rebuild');
  await page.evaluate(()=>window.CodePadHub.open('tools'));
  await page.evaluate(()=>window.CodePadCyber.open());
  assert.equal(await page.evaluate(()=>document.elementFromPoint(100,200)?.closest('[role="dialog"]')?.id),'ui-cyber');
  await shot('cyber');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ui-hub').isVisible(),true);
  await page.evaluate(()=>window.CodePadHub.close());
  await page.evaluate(()=>window.CodePadMusic.open());await shot('music');
  await page.evaluate(()=>window.CodePadMusic.close());
  await page.evaluate(()=>window.CodePadReports.show({name:'qa-report.txt',text:'گزارش آزمایش فارسی',mime:'text/plain',title:'گزارش آزمایش'}));
  await page.getByRole('dialog',{name:'گزارش',exact:true}).getByText('گزارش آزمایش فارسی',{exact:true}).waitFor();
  await shot('report');await closeReact();
  check('Cyber Lab layers above the hub; music and report windows render');
  await page.goto(new URL('/launcher',page.url()).href);await page.locator('.ui-root').first().waitFor();
  await shot('launcher');
  for(const [id,name] of [['dock-browser','browser'],['dock-gemini','assistant']]) {
    await page.getByTestId(id).click();await shot('launcher-'+name);
    await page.getByRole('button',{name:/بستن/}).last().click();
  }
  await page.getByRole('button',{name:'ظاهر',exact:true}).click();await shot('launcher-settings');await closeReact();
  await page.getByRole('button',{name:'افزودن برنامه',exact:true}).click();await shot('launcher-install');await closeReact();
  check('launcher renders with the shared design system');

  if(process.argv.includes('--exports')) {
    await page.goto(new URL('/',page.url()).href);await page.locator('.cm-content').waitFor();
    await openExport();
    for(const platform of ['android','windows']) {
      await page.getByRole('button',{name:platform === 'android' ? 'اندروید · APK' : 'ویندوز · PC',exact:true}).click();
      const downloadPromise=page.waitForEvent('download',{timeout:240000});
      await page.getByRole('button',{name:platform === 'android' ? 'ساخت و ذخیرهٔ APK' : 'ساخت و ذخیرهٔ PC',exact:true}).click();
      const download=await downloadPromise;
      await download.saveAs(resolve(out,'export-test.'+(platform==='android'?'apk':'zip')));
      await page.getByTestId('apk-ready').waitFor();
      check('real '+platform+' build produces a browser download');
    }
    await closeReact();
  }
  assert.deepEqual(errors,[],'browser console/page errors');
  await writeFile(resolve(out,'verdict.json'),JSON.stringify({ok:true,checks,errors},null,2));
} catch(error) {
  console.log('BODY', (await page.locator('body').innerText()).slice(-8000));
  console.log('ERRORS',errors);await shot('failure');
  await writeFile(resolve(out,'verdict.json'),JSON.stringify({ok:false,checks,errors,error:error.message},null,2));
  throw error;
} finally {await browser.close();}
