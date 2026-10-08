/** Browser regression for generated shaders, orbit and active-project installation. */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { compileNava } from "../src/labshell/nava.ts";
import { NAVA_PRESETS } from "../src/labshell/nava-kit.ts";
const screenshots = "/workspace/screenshots"; mkdirSync(screenshots, { recursive: true });
const studio = NAVA_PRESETS.find((p) => p.id === "studio3d")!.code;
const scene = (source: string) => { const r = compileNava(source); assert.ok(r.web, r.error); return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${r.web.css}</style></head><body>${r.web.html}<script>${r.web.js}</script></body></html>`; };
const docs: Record<string,string> = { "/studio": scene(studio), "/low": scene(studio.replace("G9", "G1")), "/shapes": scene('Ap "Primitives" | Sc N600,N400 | Cu Box "#67f5a5" Pos -N2,N0,N0 | Cy Stand "#a0aaff" | Cn Tip "#ffa0b0" Pos N2,N0,N0 | Floor Base "#182331" Pos N0,-N1,N0 | Cm N9,N18,N0 | Ob Tr | Sl Stand N0d8,N1d5,N0d8') };
const server = createServer((req,res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(docs[req.url!] ?? docs["/studio"]); });
await new Promise<void>((resolve) => server.listen(8090,"127.0.0.1",resolve));
let dev: ReturnType<typeof spawn> | null = null;
const appUrl = process.env.STUDIO_APP_URL ?? "http://127.0.0.1:8080/";
if (!process.env.STUDIO_APP_URL) {
  dev = spawn("npm",["run","dev"],{stdio:["ignore","pipe","pipe"],env:process.env});
  dev.stdout?.on("data",()=>{}); dev.stderr?.on("data",()=>{});
  for (let i=0;i<200;i++) { try { if ((await fetch(appUrl)).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
}
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless:true, args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const results: any[]=[];
const pixelSignature = (frame: any) => frame.evaluate(() => {
  const c=document.querySelector<HTMLCanvasElement>("#nv-scene")!, gl=c.getContext("webgl")!;
  // capture immediately after an animated draw, rather than a discarded drawing buffer.
  return new Promise<any>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=> {
    const p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
    let bright=0, hash=0;for(let i=0;i<p.length;i+=4){if(p[i]!+p[i+1]!+p[i+2]!>150)bright++;hash=(hash*31+p[i]!+p[i+1]!+p[i+2]!)>>>0;}
    resolve({width:c.width,height:c.height,bright,hash,error:gl.getError()});
  })));
});
try {
 for (const vp of [{width:390,height:844},{width:1280,height:800}]) {
  const page=await browser.newPage({viewport:vp});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto("http://127.0.0.1:8090/studio");await page.waitForTimeout(250);
  const before=await pixelSignature(page);assert.ok(before.bright>100,JSON.stringify(before));assert.equal(before.error,0);
  const c=await page.locator("canvas").boundingBox();assert.ok(c);
  await page.mouse.move(c.x+c.width*.4,c.y+c.height*.4);await page.mouse.down();await page.mouse.move(c.x+c.width*.8,c.y+c.height*.55,{steps:6});await page.mouse.up();
  await page.waitForTimeout(100);const after=await pixelSignature(page);assert.notEqual(after.hash,before.hash);
  assert.equal(await page.locator(".nv-error").isVisible(),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${screenshots}/nava-studio-${vp.width}.png`});
  results.push({viewport:vp,before,after,errors});await page.close();
 }
 // Actual editor -> install -> launcher flow, with a template main file before the custom entry.
 const project={id:"qa-project",name:"Custom 3D",activeFileId:"custom",files:[{id:"starter",name:"main.nava",lang:"nava",content:'Pg "Starter" | Cnt',stdin:""},{id:"custom",name:"custom.nava",lang:"nava",content:studio.replace('"Nava Studio"','"CUSTOM PROJECT"'),stdin:""}]};
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript((p)=>{ if (window.top === window) localStorage.setItem("jibcode-en",JSON.stringify({version:1,state:{projects:[p],activeProjectId:p.id}})); },project);
 await page.goto(appUrl);await page.locator('.cm-content').waitFor();await page.getByRole('button',{name:'اجرا',exact:true}).click();
 await page.locator('iframe').waitFor();
 let frame=page.frames().find(f=>f.parentFrame());assert.ok(frame);await frame.waitForSelector('#nv-scene');
 await page.getByRole('button',{name:'لانچر',exact:true}).click();await page.getByRole('button',{name:'نصب پروژهٔ فعال در لانچر',exact:true}).click();await page.getByText('«Custom 3D» نصب شد.',{exact:true}).waitFor();
 const apps=await page.evaluate(()=>JSON.parse(localStorage.getItem('jibcode-launcher')!).state.apps);assert.equal(apps[0].entryFile,'custom.nava');assert.match(apps[0].files[1].content,/CUSTOM PROJECT/);
 await page.getByRole('link',{name:'رفتن به لانچر',exact:true}).click();await page.getByRole('button',{name:'اجرای Custom 3D',exact:true}).click();
 await page.locator('iframe').waitFor();frame=page.frames().find(f=>f.parentFrame());assert.ok(frame);await frame.waitForSelector('#nv-scene');assert.equal(await frame.locator('.nv-brand').textContent(),'CUSTOM PROJECT');
 await page.waitForTimeout(100);assert.equal(await frame.locator('.nv-error').isVisible(),false);assert.deepEqual(errors,[]);await page.screenshot({path:`${screenshots}/codepad-launcher-project.png`});
 results.push({launcherEntry:apps[0].entryFile,sourceProjectId:apps[0].sourceProjectId,errors});
 writeFileSync(`${screenshots}/nava-studio-verdict.json`,JSON.stringify({ok:true,results},null,2));console.log(JSON.stringify({ok:true,results},null,2));
} finally { await browser.close();server.close();dev?.kill("SIGTERM"); }
