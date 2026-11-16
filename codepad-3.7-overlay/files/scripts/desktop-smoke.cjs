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
  await win.evaluate(async () => { const m = await import('/assets/runtime.js'); m.pt.getState().importProject('smoke', [{ name: 'main.py', lang: 'python', content: 'name = input("Name: ")\nprint("SMOKE-OK", name, sum(range(101)))\n' }]); });
  await win.getByRole('button', { name: 'اجرا', exact: true }).click();
  const field = win.locator('dialog.cp-python-input input'); await field.waitFor({ timeout: 120000 });
  await field.fill('codepad'); await win.keyboard.press('Enter');
  await win.getByText(/SMOKE-OK codepad 5050/).first().waitFor({ timeout: 60000 });
  assert.deepEqual(errors, [], 'no uncaught page errors');
  await app.close();
  app = await launch(); win = await app.firstWindow(); await win.waitForLoadState('load'); await win.waitForSelector('text=CODEPAD', { timeout: 60000 });
  const names = await win.evaluate(async () => (await import('/assets/runtime.js')).pt.getState().projects.map(p => p.name));
  assert.ok(names.includes('smoke'), 'saved project survives a restart: ' + names);
  await app.close();
  console.log('DESKTOP SMOKE TEST PASSED: window, secure context, JSPI, Python + input(), persistence');
})().catch(e => { console.error('DESKTOP SMOKE TEST FAILED:', e.stack || e); process.exit(1); });
