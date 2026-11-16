'use strict';
// Windows replacements for the Android-only pieces: a real shell (instead of Termux), real CPython with live input
// (instead of Chaquopy), and a few device tools. Pure Node (no Electron imports) so it is unit-tested on Linux too.
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUTPUT_CAP = 1_000_000;
const tail = (text, limit = 65536) => (text.length > limit ? text.slice(text.length - limit) : text);

// Windows: the command goes into a temp .ps1 (UTF-8 with BOM) run with -File, so quotes, backslashes, here-strings and
// Persian text survive untouched (no command-line escaping rules involved). Elsewhere: sh -c.
function shellCommand(platform, command, tmpDir) {
  if (platform === 'win32') {
    fs.mkdirSync(tmpDir, { recursive: true });
    const file = path.join(tmpDir, `cmd-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`);
    fs.writeFileSync(file, '\ufeff[Console]::OutputEncoding=[Text.Encoding]::UTF8;$OutputEncoding=[Text.Encoding]::UTF8\n' + command + '\nif ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }\n', 'utf8');
    return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], cleanup: () => { try { fs.rmSync(file, { force: true }); } catch { /* ignore */ } } };
  }
  return { file: '/bin/sh', args: ['-c', command], cleanup: () => {} };
}

function killTree(proc, platform) {
  if (!proc || proc.exitCode !== null) return;
  try {
    if (platform === 'win32') childProcess.spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill('SIGKILL'); } }
  } catch { /* already gone */ }
}

function createSystem(options) {
  const platform = options.platform || process.platform;
  const userData = options.userData;
  const resourcesPath = options.resourcesPath || '';
  const hostDir = options.hostDir;
  const env = options.env || process.env;
  const settingsFile = path.join(userData, 'settings.json');
  const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')) || {}; } catch { return {}; } };
  const writeSettings = (patch) => { try { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(settingsFile, JSON.stringify({ ...readSettings(), ...patch })); } catch { /* not critical */ } };

  // ── Python discovery: explicit path → CODEPAD_PYTHON → bundled → system ──
  let pythonCache = null;
  const probe = (file, pre) => {
    try {
      const r = childProcess.spawnSync(file, [...pre, '-c', 'import sys;print("%d.%d"%sys.version_info[:2])'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
      const m = r.status === 0 && /^(\d+)\.(\d+)/.exec(String(r.stdout).trim());
      return m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 9)) ? `${m[1]}.${m[2]}` : null;
    } catch { return null; }
  };
  function findPython(force = false) {
    if (pythonCache && !force) return pythonCache;
    const bundled = platform === 'win32' ? path.join(resourcesPath, 'python', 'python.exe') : '';
    const candidates = [
      env.CODEPAD_PYTHON && [env.CODEPAD_PYTHON, [], 'CODEPAD_PYTHON'],
      readSettings().pythonPath && [readSettings().pythonPath, [], 'settings'],
      bundled && fs.existsSync(bundled) && [bundled, [], 'bundled'],
      ...(platform === 'win32' ? [['py', ['-3'], 'system'], ['python', [], 'system']] : [['python3', [], 'system'], ['python', [], 'system']]),
    ].filter(Boolean);
    for (const [file, pre, source] of candidates) {
      const version = probe(file, pre);
      if (version) return (pythonCache = { file, pre, source, version });
    }
    return (pythonCache = null);
  }
  const childEnv = () => {
    const py = findPython();
    const extra = { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', CODEPAD: '1' };
    if (py) { extra.CODEPAD_PYTHON = py.file; if (path.isAbsolute(py.file)) extra.PATH = path.dirname(py.file) + path.delimiter + (env.PATH || env.Path || ''); }
    return { ...env, ...extra };
  };

  // ── generic process runner ──
  function runProcess(file, args, opts = {}) {
    return new Promise((resolve) => {
      let stdout = '', stderr = '', timedOut = false, done = false, truncated = false;
      let proc;
      try {
        proc = childProcess.spawn(file, args, { cwd: opts.cwd || os.homedir(), env: opts.env || childEnv(), windowsHide: true, detached: platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) { return resolve({ stdout: '', stderr: String(e.message || e), exitCode: -1, internalError: true }); }
      if (opts.onSpawn) opts.onSpawn(proc);
      const timer = setTimeout(() => { timedOut = true; killTree(proc, platform); }, Math.min(Math.max(Number(opts.timeoutMs) || 60000, 1000), 600000));
      const add = (cur, chunk) => { const t = cur + chunk.toString('utf8'); if (t.length > OUTPUT_CAP) { truncated = true; return t.slice(0, OUTPUT_CAP); } return t; };
      proc.stdout.on('data', (c) => { stdout = add(stdout, c); });
      proc.stderr.on('data', (c) => { stderr = add(stderr, c); });
      const finish = (exitCode, extra = {}) => { if (done) return; done = true; clearTimeout(timer); resolve({ stdout, stderr: timedOut ? stderr + '\n[timeout]' : stderr, exitCode: timedOut ? 124 : exitCode, timedOut, truncated, ...extra }); };
      proc.on('error', (e) => finish(-1, { stderr: stderr + String(e.message || e), internalError: true }));
      proc.on('close', (code) => finish(code === null ? -1 : code));
      if (opts.stdin != null) proc.stdin.end(String(opts.stdin)); else proc.stdin.end();
    });
  }

  // ── shell (Termux replacement) ──
  const running = new Map();
  let shellSeq = 0;
  async function shellRun(command, opts = {}) {
    const text = String(command ?? '');
    if (!text.trim() || text.length > 12000) throw new Error('فرمان باید بین ۱ تا ۱۲۰۰۰ نویسه باشد.');
    const { file, args, cleanup } = shellCommand(platform, text, path.join(userData, 'tmp'));
    const id = ++shellSeq;
    const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : os.homedir();
    const result = await runProcess(file, args, { cwd, timeoutMs: opts.timeoutMs, onSpawn: (p) => running.set(id, p) });
    running.delete(id); cleanup();
    return { ...result, shell: platform === 'win32' ? 'powershell' : 'sh' };
  }
  const shellKill = () => { for (const p of running.values()) killTree(p, platform); running.clear(); return true; };
  function shellExternal(cwd) {
    const dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
    if (platform === 'win32') childProcess.spawn('cmd.exe', ['/c', 'start', '""', 'powershell.exe', '-NoLogo', '-NoExit'], { cwd: dir, detached: true, stdio: 'ignore', env: childEnv() }).unref();
    else childProcess.spawn('x-terminal-emulator', [], { cwd: dir, detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    return true;
  }

  // ── interactive project runs (Chaquopy replacement) ──
  let job = null;
  async function pythonStart({ channel, payload }, emit) {
    if (job && job.stopped) { // a fast Stop → Run: wait (briefly) for the killed process to disappear
      for (let i = 0; i < 100 && job; i++) await new Promise((r) => setTimeout(r, 30));
    }
    if (job) throw new Error('پایتون در حال اجراست؛ ابتدا آن را متوقف کن.');
    const py = findPython();
    if (!py) throw new Error('Python پیدا نشد. Python 3.9+ نصب کن (python.org یا winget install Python.Python.3.13) یا مسیر python.exe را در Studio ← ترمینال بده.');
    let id;
    try { id = JSON.parse(payload).id; } catch { throw new Error('درخواست اجرای Python نامعتبر است.'); }
    const tmp = path.join(userData, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
    const payloadFile = path.join(tmp, `job-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(payloadFile, payload, 'utf8');
    const filesDir = path.join(userData, 'python-files'); fs.mkdirSync(filesDir, { recursive: true });
    const proc = childProcess.spawn(py.file, [...py.pre, '-X', 'utf8', path.join(hostDir, 'desktop_host.py'), payloadFile, filesDir], {
      cwd: filesDir, env: childEnv(), windowsHide: true, detached: platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const me = { id, channel, proc, out: '', err: '', waiting: 0, finished: false, buffer: '' };
    job = me;
    const send = (data) => emit({ channel, data: { id, ...data } });
    const cleanup = () => { try { fs.unlinkSync(payloadFile); } catch { /* ignore */ } if (job === me) job = null; };
    const finish = (extra) => {
      if (me.finished) return; me.finished = true;
      send({ stdout: me.out, stderr: me.err + (extra.failure || ''), displayStderr: extra.failure || '', streamed: true, done: true, ...(extra.aborted ? { aborted: true } : {}) });
      cleanup();
    };
    send({ progress: `در حال آماده‌سازی Python ${py.version}…` });
    send({ phase: 'run', engine: `CPython ${py.version}` });
    proc.stdout.on('data', (chunk) => {
      me.buffer += chunk.toString('utf8');
      let nl;
      while ((nl = me.buffer.indexOf('\n')) >= 0) {
        const line = me.buffer.slice(0, nl); me.buffer = me.buffer.slice(nl + 1);
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { me.err = tail(me.err + line + '\n'); send({ stream: true, kind: 'err', text: line + '\n' }); continue; }
        if (msg.stream) { if (msg.kind === 'err') me.err = tail(me.err + msg.text); else me.out = tail(me.out + msg.text); send({ stream: true, kind: msg.kind, text: msg.text }); }
        else if (msg.inputRequest) { me.waiting = msg.requestId; send({ inputRequest: true, requestId: msg.requestId, prompt: msg.prompt }); }
        else if (msg.image) send({ image: msg.image });
        else if (msg.done) me.doneFailure = msg.failure || '';
      }
    });
    proc.stderr.on('data', (c) => { const text = c.toString('utf8'); me.err = tail(me.err + text); send({ stream: true, kind: 'err', text }); });
    proc.on('error', (e) => finish({ failure: `اجرای Python شروع نشد: ${e.message}\n` }));
    proc.on('close', (code) => {
      if (me.doneFailure !== undefined) return finish({ failure: me.doneFailure ? me.doneFailure : '' });
      finish({ failure: me.stopped ? '' : `فرایند Python بدون پایان عادی بسته شد (کد ${code}).\n`, aborted: !!me.stopped });
    });
    return true;
  }
  function pythonInput({ channel, id, requestId, value, eof }) {
    if (!job || job.channel !== channel || job.id !== id || !job.waiting || job.waiting !== requestId) throw new Error('این درخواست ورودی دیگر فعال نیست.');
    job.waiting = 0;
    job.proc.stdin.write(JSON.stringify({ eof: !!eof, value: String(value ?? '').slice(0, 65536) }) + '\n');
    return true;
  }
  function pythonStop() {
    if (!job) return true;
    job.stopped = true; killTree(job.proc, platform); return true;
  }
  const pythonStatus = () => ({ running: !!job, channel: job?.channel || '', id: job?.id ?? 0 });

  // one-shot run of staged files (agent "run native python" and Studio)
  async function pythonExec({ id = 'project', files = [], entry, stdin = '', argv = [], timeoutMs = 120000 }) {
    const py = findPython();
    if (!py) throw new Error('Python پیدا نشد.');
    const safeId = String(id).replace(/[^\w-]/g, '_').slice(0, 80) || 'project';
    const root = path.resolve(userData, 'projects', safeId); fs.mkdirSync(root, { recursive: true });
    for (const f of files) {
      const name = String(f.name);
      if (!name || name.startsWith('/') || name.includes('\\') || /(^|\/)\.\.(\/|$)/.test(name) || /^[a-z]:/i.test(name)) throw new Error('مسیر فایل نامعتبر است: ' + name);
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep)) throw new Error('مسیر فایل از پروژه بیرون می‌زند.');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.b64 != null ? Buffer.from(f.b64, 'base64') : String(f.content ?? ''));
    }
    return runProcess(py.file, [...py.pre, '-X', 'utf8', String(entry), ...argv.map(String)], { cwd: root, stdin, timeoutMs });
  }

  // ── info / device tools ──
  const which = (name) => {
    const r = childProcess.spawnSync(platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', windowsHide: true, env: childEnv() });
    return r.status === 0 ? String(r.stdout).split(/\r?\n/)[0].trim() : '';
  };
  function info() {
    const py = findPython();
    return {
      os: platform, shell: platform === 'win32' ? 'powershell' : 'sh',
      python: py ? { file: py.file, version: py.version, source: py.source } : null,
      tools: { git: which('git'), nmap: which('nmap'), winget: platform === 'win32' ? which('winget') : '' },
      userData,
    };
  }
  async function psJson(script, extraEnv = {}) {
    const { file, args, cleanup } = shellCommand(platform, script, path.join(userData, 'tmp'));
    const r = await runProcess(file, args, { timeoutMs: 30000, env: { ...childEnv(), ...extraEnv } });
    cleanup();
    if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || 'PowerShell failed').trim().split('\n')[0]);
    try { return JSON.parse(r.stdout.trim() || 'null'); } catch { throw new Error('خروجی PowerShell قابل‌خواندن نبود.'); }
  }
  async function location() {
    if (platform !== 'win32') throw new Error('موقعیت‌یابی دسکتاپ فقط در ویندوز پشتیبانی می‌شود.');
    const res = await psJson(`Add-Type -AssemblyName System.Device
$w=New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High);$w.Start();$t=0
while(($w.Status -ne 'Ready') -and ($w.Permission -ne 'Denied') -and ($t -lt 15000)){Start-Sleep -Milliseconds 200;$t+=200}
if($w.Permission -eq 'Denied'){'{"error":"denied"}'}elseif($w.Status -ne 'Ready'){'{"error":"timeout"}'}else{$l=$w.Position.Location;(@{latitude=$l.Latitude;longitude=$l.Longitude;accuracyMeters=$l.HorizontalAccuracy;altitude=$l.Altitude;speed=$l.Speed;heading=$l.Course}|ConvertTo-Json -Compress)}`);
    if (res.error === 'denied') throw new Error('مکان در ویندوز بسته است (Settings ← Privacy ← Location را روشن کن).');
    if (res.error) throw new Error('زمان دریافت مکان تمام شد؛ Location services را روشن کن.');
    return { ...res, timestamp: new Date().toISOString(), map: `https://www.openstreetmap.org/?mlat=${res.latitude}&mlon=${res.longitude}#map=17/${res.latitude}/${res.longitude}` };
  }
  async function apps() {
    if (platform !== 'win32') throw new Error('فهرست برنامه‌ها فقط در ویندوز پشتیبانی می‌شود.');
    const list = await psJson(`$p='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
Get-ItemProperty $p -ErrorAction SilentlyContinue|Where-Object{$_.DisplayName -and -not $_.SystemComponent}|Select-Object @{n='label';e={$_.DisplayName}},@{n='versionName';e={$_.DisplayVersion}},@{n='publisher';e={$_.Publisher}},@{n='installLocation';e={$_.InstallLocation}}|Sort-Object label -Unique|ConvertTo-Json -Compress`);
    const rows = Array.isArray(list) ? list : list ? [list] : [];
    return { apps: rows.map((a) => ({ packageName: a.label, ...a, system: false })) };
  }
  async function openApp(name) {
    if (platform !== 'win32') throw new Error('فقط در ویندوز.');
    const text = String(name || '').slice(0, 120);
    if (!text) throw new Error('نام برنامه لازم است.');
    const { file, args, cleanup } = shellCommand(platform, `$a=Get-StartApps|Where-Object{$_.Name -like ('*'+$env:CP_APP+'*')}|Select-Object -First 1;if($a){Start-Process explorer.exe ('shell:AppsFolder\\'+$a.AppID);'opened '+$a.Name}else{throw 'برنامه در Start Menu پیدا نشد'}`);
    const r = await runProcess(file, args, { timeoutMs: 20000, env: { ...childEnv(), CP_APP: text } });
    cleanup();
    if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || 'ناموفق').trim().split('\n')[0]);
    return { opened: true, detail: r.stdout.trim() };
  }

  return {
    platform, shellRun, shellKill, shellExternal, pythonStart, pythonInput, pythonStop, pythonStatus, pythonExec,
    info, location, apps, openApp, findPython, setPythonPath: (p) => { writeSettings({ pythonPath: String(p || '') }); pythonCache = null; return findPython(true); },
    _shellCommand: shellCommand,
  };
}

module.exports = { createSystem, shellCommand };
