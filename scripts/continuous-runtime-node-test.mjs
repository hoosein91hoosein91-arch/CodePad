// Real Pyodide/WASM tests. Node substitutes only the Worker transport and local
// package URL; the interpreter and application worker are the shipped files.
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve('dist/client');
const temporary = await mkdtemp(join(tmpdir(), 'codepad-engine-'));
let source = await readFile(join(root, 'background/python-worker.js'), 'utf8');
source = source.replace('`${self.location.origin}/pyodide/pyodide.mjs`', JSON.stringify(pathToFileURL(join(root, 'pyodide/pyodide.mjs')).href));
source = source.replace('`${self.location.origin}/pyodide/`', JSON.stringify(join(root, 'pyodide/') + '/'));
await writeFile(join(temporary, 'worker.mjs'), `import {parentPort} from 'node:worker_threads';
globalThis.self=globalThis;self.location={origin:'http://codepad.test',href:'http://codepad.test/background/python-worker.js'};
self.postMessage=data=>parentPort.postMessage(data);
parentPort.on('message',data=>self.onmessage({data}));
${source}`);
const worker = new Worker(join(temporary, 'worker.mjs'));
const messages = [];
let workerError;
worker.on('message', value => messages.push({...value, at: performance.now()}));
worker.on('error', error => {workerError = error;});
let id = 0;
async function job(code, assets=[]) {
  const key=++id, start=performance.now();
  worker.postMessage({id:key, code, stdin:'', assets});
  while (!messages.some(x=>x.id===key && x.done)) {
    if (workerError) throw workerError;
    if (performance.now()-start>45000) throw Error('Worker did not finish');
    await new Promise(r=>setTimeout(r,10));
  }
  return messages.filter(x=>x.id===key);
}
const lines = list => list.filter(x=>x.stream && x.kind==='out' && x.text.trim());
try {
  const slow = await job('import random, time\nfor i in range(3):\n    print(random.choice(["سلام", "خوبی"]), flush=True)\n    time.sleep(1)');
  assert.equal(slow.at(-1).stderr, ''); assert.equal(lines(slow).length,3);
  assert.ok(lines(slow)[1].at-lines(slow)[0].at>900);
  console.log('PASS synchronous random greeting prints live with 1-second gaps');
  const tasks=await job('import asyncio\nasync def background():\n    print("first")\n    await asyncio.sleep(1)\n    print("second")\nasyncio.create_task(background())');
  assert.equal(tasks.at(-1).stderr,''); assert.equal(tasks.at(-1).stdout,'first\nsecond\n');
  console.log('PASS execution waits for asyncio background tasks');
  const result=await job('import asyncio\nasync def main():\n    await asyncio.sleep(.05)\n    return 42\nvalue=asyncio.run(main())\nprint(value)');
  assert.equal(result.at(-1).stderr,''); assert.equal(result.at(-1).stdout,'42\n');
  console.log('PASS asyncio.run returns the awaited result');
  const error=await job('import asyncio\nasync def main():\n    raise ValueError("async failure")\nasyncio.run(main())');
  assert.match(error.at(-1).stderr,/async failure/);
  console.log('PASS asynchronous errors are visible');
  const modules=await job('from helper import greeting\nprint(greeting)',[{name:'helper.py',stamp:'1',buf:new TextEncoder().encode('greeting="imported"').buffer}]);
  assert.equal(modules.at(-1).stdout,'imported\n');
  const input=await job('input("Name?")');assert.match(input.at(-1).stderr,/@@NEED_INPUT@@/);
  const long=++id;worker.postMessage({id:long,code:'import asyncio\nasync def main():\n    while True:\n        print("tick")\n        await asyncio.sleep(1)\nasyncio.run(main())',stdin:''});
  await new Promise(r=>setTimeout(r,27000));
  const output=messages.filter(x=>x.id===long);
  assert.ok(!output.some(x=>x.done));assert.ok(lines(output).length>=26);
  await worker.terminate();
  console.log('PASS imports, input, continuous execution beyond 25 seconds and Stop');
} finally {await worker.terminate(); await rm(temporary,{recursive:true,force:true});}
