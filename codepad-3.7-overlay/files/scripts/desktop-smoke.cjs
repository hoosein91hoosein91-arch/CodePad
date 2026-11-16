// Smoke test of the packaged desktop app: node desktop-smoke.cjs PATH_TO_CodePad.exe   (needs the "playwright" package)
// Optional CODEPAD_SMOKE_ARGS: extra launch arguments (e.g. the app's main.js and --no-sandbox when testing with a bare Electron binary).
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
(async () => {
  const exe = process.argv[2];
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'codepad-ud-'));
  const launch = () => electron.launch({ executablePath: exe, args: [...(process.env.CODEPAD_SMOKE_ARGS || '').split(' ').filter(Boolean), '--disable-gpu'], env: { ...process.env, CODEPAD_USER_DATA: userData } });
  let app = await launch(), win = await app.firstWindow();
  const errors = []; win.on('pageerror', e => errors.push(String(e)));
  await win.waitForLoadState('load'); await win.waitForSelector('text=CODEPAD', { timeout: 60000 });
  assert.equal(win.url(), 'codepad://app/');
  assert.equal(await win.evaluate(() => isSecureContext), true);
  assert.equal(await win.evaluate(() => !!(WebAssembly.Suspending && WebAssembly.promising)), true, 'JSPI (live input) must be available');
  const info = await win.evaluate(() => window.cpDesktop.system.info());
  assert.ok(info.python, 'a real Python was found (bundled or installed): ' + JSON.stringify(info));
  if (process.env.CODEPAD_EXPECT_BUNDLED === '1') assert.equal(info.python.source, 'bundled', 'the packaged Python is used first');
  assert.equal(info.shell, process.platform === 'win32' ? 'powershell' : 'sh');
  // shell replacement for Termux (PowerShell on Windows): exit code, UTF-8 Persian output
  const shellCmd = process.platform === 'win32' ? 'Write-Output "ps-ok-فارسی"; exit 3' : 'echo "ps-ok-فارسی"; exit 3';
  const sh = await win.evaluate((c) => window.cpDesktop.shell.run(c), shellCmd);
  assert.match(sh.stdout, /ps-ok-فارسی/); assert.equal(sh.exitCode, 3);
  // a Cyber Lab sample, built exactly like the lab does it for this platform (PowerShell here-string on Windows)
  const lab = await win.evaluate(async () => { const cyber = await import('/assets/cyber-lab.js'), data = await import('/assets/cyber-samples.js'); const jwt = data.CYBER_SAMPLES.find((x) => x.id === 'jwt_inspect'); const cmd = cyber.sampleCommand(jwt, 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.'); return window.cpDesktop.shell.run(cmd); });
  assert.match(lab.stdout, /alg=none/, 'lab sample ran: ' + JSON.stringify(lab));
  // Python projects use real CPython here: sockets + sqlite3 + threads + live input()
  const program = 'import socket, sqlite3, threading, sys\nsrv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen(1)\nthreading.Thread(target=lambda: (lambda c: (c.sendall(c.recv(8).upper()), c.close()))(srv.accept()[0])).start()\nc = socket.create_connection(("127.0.0.1", srv.getsockname()[1])); c.sendall(b"smoke"); net = c.recv(8)\ndb = sqlite3.connect(":memory:"); db.execute("create table t(x)"); db.execute("insert into t values (9)")\nname = input("Name: ")\nprint("SMOKE-OK", name, sum(range(101)), net, db.execute("select x from t").fetchone()[0], sys.implementation.name)\n';
  await win.evaluate(async (code) => { const m = await import('/assets/runtime.js'); m.pt.getState().importProject('smoke', [{ name: 'main.py', lang: 'python', content: code }]); }, program);
  await win.getByRole('button', { name: 'اجرا', exact: true }).click();
  const field = win.locator('dialog.cp-python-input input'); await field.waitFor({ timeout: 120000 });
  await field.fill('codepad'); await win.keyboard.press('Enter');
  await win.getByText(/SMOKE-OK codepad 5050 b'SMOKE' 9 cpython/).first().waitFor({ timeout: 60000 });
  // Stop kills a running program; numpy still runs on the WebAssembly engine
  await win.evaluate(async () => { const m = await import('/assets/runtime.js'); m.pt.getState().importProject('loop', [{ name: 'main.py', lang: 'python', content: 'import time\nprint("LOOP-READY", flush=True)\nwhile True: time.sleep(0.2)\n' }]); });
  await win.getByRole('button', { name: 'اجرا', exact: true }).click();
  await win.getByText(/LOOP-READY/).first().waitFor({ timeout: 60000 });
  await win.evaluate(() => window.dispatchEvent(new Event('codepad-stop-python')));
  await win.waitForFunction(async () => !(await window.cpDesktop.python.status()).running, null, { timeout: 20000 });
  await win.evaluate(async () => { const m = await import('/assets/runtime.js'); m.pt.getState().importProject('wasm', [{ name: 'main.py', lang: 'python', content: 'import numpy as np\nprint("WASM-NUMPY-OK", int(np.arange(10).sum()))\n' }]); });
  await win.getByRole('button', { name: 'اجرا', exact: true }).click();
  await win.getByText(/WASM-NUMPY-OK 45/).first().waitFor({ timeout: 180000 });
  assert.deepEqual(errors, [], 'no uncaught page errors');
  await app.close();
  app = await launch(); win = await app.firstWindow(); await win.waitForLoadState('load'); await win.waitForSelector('text=CODEPAD', { timeout: 60000 });
  const names = await win.evaluate(async () => (await import('/assets/runtime.js')).pt.getState().projects.map(p => p.name));
  assert.ok(names.includes('smoke'), 'saved project survives a restart: ' + names);
  await app.close();

  // Music library + embedded attack-map view (audio playback itself is not asserted: CI machines may have no sound device)
  const http = require('node:http'), music = fs.mkdtempSync(path.join(os.tmpdir(), 'codepad-music-'));
  fs.writeFileSync(path.join(music, 'a track.wav'), Buffer.alloc(4096, 1)); fs.mkdirSync(path.join(music, 'sub')); fs.writeFileSync(path.join(music, 'sub', 'b track.mp3'), Buffer.alloc(2048, 2)); fs.writeFileSync(path.join(music, 'skip.txt'), 'x');
  const server = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html'); r.end('<h1>MAP-SMOKE-PAGE</h1>'); }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  app = await electron.launch({ executablePath: exe, args: [...(process.env.CODEPAD_SMOKE_ARGS || '').split(' ').filter(Boolean), '--disable-gpu'], env: { ...process.env, CODEPAD_USER_DATA: userData, CODEPAD_MUSIC_DIR: music, CODEPAD_TEST_MAP_URL: `http://127.0.0.1:${server.address().port}/` } });
  win = await app.firstWindow(); await win.waitForLoadState('load'); await win.waitForSelector('text=CODEPAD', { timeout: 60000 });
  const files = await win.evaluate(async () => (await window.cpDesktop.music.list()).files.map(f => f.name));
  assert.deepEqual(files.sort(), ['a track', 'b track'], 'folder scan finds audio recursively and skips other files');
  const range = await win.evaluate(async () => { const r = await fetch('/__media/m0', { headers: { Range: 'bytes=0-9' } }); return [r.status, (await r.arrayBuffer()).byteLength, (await fetch('/__media/m99')).status]; });
  assert.deepEqual(range, [206, 10, 404], 'media protocol: range + unknown id');
  assert.equal(await win.evaluate(() => window.cpDesktop.maps.show('kaspersky', { x: 10, y: 120, width: 700, height: 400 })), true);
  await win.waitForTimeout(1500);
  const text = await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.at(-1).webContents.executeJavaScript('document.body.innerText'));
  assert.match(text, /MAP-SMOKE-PAGE/, 'attack-map view is embedded and loads');
  assert.equal(await win.evaluate(() => typeof window.CodePadMusic.open), 'function');
  await app.close(); server.close();
  console.log('DESKTOP SMOKE TEST PASSED: window, JSPI, shell, real CPython (sockets/sqlite/threads/input), Stop, WebAssembly numpy, lab sample, persistence, music folder, embedded map');
})().catch(e => { console.error('DESKTOP SMOKE TEST FAILED:', e.stack || e); process.exit(1); });
