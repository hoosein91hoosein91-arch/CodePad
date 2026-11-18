import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve('dist/client');
const server=http.createServer(async(req,res)=>{
  const name=resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!name.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{const data=await readFile(name);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(name)]||'application/octet-stream');res.end(data);}
  catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser = await chromium.launch({headless:true, ...(process.env.CODEPAD_CHROMIUM ? {executablePath:process.env.CODEPAD_CHROMIUM,args:['--no-sandbox']} : {})});
try {
  const page = await browser.newPage();
  await page.addInitScript(()=>{window.CodePadHost={ready(){}};});
  await page.goto(`http://127.0.0.1:${server.address().port}/background/runner.html`);
  // Native runner.html needs a bridge. Tests exercise its exact Worker separately.
  const results = await page.evaluate(async () => {
    const worker = new Worker('/background/python-worker.js', {type:'module'});
    const messages = []; worker.onmessage = e => messages.push({...e.data, at:performance.now()});
    let id = 0;
    async function run(code, assets=[]) {
      const job=++id, start=performance.now(); worker.postMessage({id:job,code,stdin:'',assets});
      while(!messages.some(x=>x.id===job && x.done)) {
        if(performance.now()-start>45000)throw Error('Worker did not finish');
        await new Promise(r=>setTimeout(r,20));
      }
      return messages.filter(x=>x.id===job);
    }
    const slow=await run('import asyncio\nasync def main():\n    for i in range(3):\n        print("hello", flush=True)\n        await asyncio.sleep(1)\nasyncio.run(main())');
    const tasks=await run('import asyncio\nasync def background():\n    print("first")\n    await asyncio.sleep(1)\n    print("second")\nasyncio.create_task(background())');
    const imports=await run('from helper import greeting\nprint(greeting)',[{name:'helper.py',stamp:'test',buf:new TextEncoder().encode('greeting="imported"').buffer}]);
    const error=await run('raise ValueError("test error")');
    const infiniteId=++id;worker.postMessage({id:infiniteId,stdin:'',code:'import asyncio\nasync def forever():\n    while True:\n        print("tick")\n        await asyncio.sleep(1)\nasyncio.run(forever())'});
    await new Promise(r=>setTimeout(r,27000));
    const continuous=messages.filter(x=>x.id===infiniteId);worker.terminate();
    return {slow,tasks,imports,error,continuous};
  });
  const lines = list => list.filter(x=>x.stream && x.text.trim());
  assert.equal(results.slow.at(-1).stderr,'');
  assert.equal(lines(results.slow).length,3);
  assert.ok(lines(results.slow)[1].at-lines(results.slow)[0].at>=900,'outputs should be one second apart');
  assert.equal(results.tasks.at(-1).stdout,'first\nsecond\n');
  assert.ok(results.tasks.at(-1).at-lines(results.tasks)[0].at>=900,'wait for background task');
  assert.equal(results.imports.at(-1).stdout,'imported\n');
  assert.match(results.error.at(-1).stderr,/test error/);
  assert.ok(!results.continuous.some(x=>x.done),'continuous code must not finish by itself');
  assert.ok(lines(results.continuous).length>=26,'continuous output should pass the previous 25s cutoff');
  console.log('PASS: live timed output, asyncio.run, background tasks, file imports, errors, continuous execution >25s, termination.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
