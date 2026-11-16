import {interactiveInput,installInteractiveInput} from './interactive-input.js';
import {mountProjectAssets} from './project-files.js';
import {importedModules} from '../assets/python-engine.js';
/* CodePad 2.10: streaming output and owned asyncio task lifetime. */
let graphicsReady=false;
async function loadGraphics(py){if(graphicsReady)return;const manifest=await(await nativeFetch(new URL('/pyodide/codepad-graphics-packages.json',self.location.origin))).json();await py.loadPackage(manifest.files.map(name=>new URL('/pyodide/'+name,self.location.origin).href));graphicsReady=true;}
let engine, activeId, queue = Promise.resolve();
const installed = new Set(), mounted = new Set();
const nativeFetch = self.fetch.bind(self), requests = new Map();
let requestId = 0;
let streamTimer;const streamQueue=new Map();
function flushStreams(){clearTimeout(streamTimer);streamTimer=null;for(const value of streamQueue.values())self.postMessage({id:activeId,...value});streamQueue.clear();}
function emit(data) {
 if(data.stream){const previous=streamQueue.get(data.kind);streamQueue.set(data.kind,{...data,text:((previous?.text||'')+data.text).slice(-262144)});streamTimer ||= setTimeout(flushStreams,40);return;}
 if(data.done)flushStreams();self.postMessage({id:activeId,...data});
}
self.fetch = async function(input, options = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, self.location.href);
  if (!self.CODEPAD_NATIVE || url.origin === self.location.origin) return nativeFetch(input, options);
  const req = new Request(input, options), id = ++requestId;
  const bytes = new Uint8Array(await req.arrayBuffer());
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  const result = await new Promise((resolve, reject) => {
    const abort = () => { requests.delete(id); reject(new DOMException('Aborted', 'AbortError')); self.postMessage({ nativeCancel: id }); };
    req.signal.addEventListener('abort', abort, { once: true });
    if (req.signal.aborted) return abort();
    requests.set(id, { resolve, reject, signal: req.signal, abort });
    self.postMessage({ nativeRequest: { id, url: url.href, method: req.method, headers: Object.fromEntries(req.headers), body: btoa(binary) } });
  });
  const raw = atob(result.body || ''), body = Uint8Array.from(raw, c => c.charCodeAt(0));
  return new Response(result.status === 204 || result.status === 304 ? null : body, { status: result.status, headers: result.headers });
};
const input=interactiveInput(data=>self.postMessage(data),()=>activeId,flushStreams);
self.onmessage = event => {
  const data = event.data;
  if(input.reply(data))return;
  if (data.nativeReply) {
    const reply = data.nativeReply, pending = requests.get(reply.id);
    if (pending) { requests.delete(reply.id); pending.signal.removeEventListener('abort', pending.abort); reply.error ? pending.reject(new Error(reply.error)) : pending.resolve(reply); }
    return;
  }
  if (data.nativeMode) { self.CODEPAD_NATIVE = true; return; }
  // Pre-warm: load the Python engine in the background so the first Run does not pay the multi-second start-up.
  if (data.warm) { queue = queue.then(() => boot()).then(() => self.postMessage({ warmed: true })).catch(() => {}); return; }
  queue = queue.then(() => run(data)).catch(error => emit({ stdout: '', stderr: String(error), done: true }));
};
async function boot() {
  if (!engine) engine = (async () => {
    const mod = await import(`${self.location.origin}/pyodide/pyodide.mjs`);
    return mod.loadPyodide({ indexURL: `${self.location.origin}/pyodide/`, packageBaseUrl: `https://cdn.jsdelivr.net/pyodide/v${mod.version}/full/` });
  })().catch(error => { engine = null; throw error; });
  return engine;
}
async function install(py, requirements) {
  if (!requirements.length) return '';
  const nativeNames = new Set(['opencv-python', 'opencv-contrib-python', 'opencv-python-headless', 'opencv-contrib-python-headless', 'cv2', 'mediapipe', 'pygame', 'pyopengl', 'pyopengl-accelerate']);
  const ordinary = [], profiles = [];
  let useNumpy = false,usePillow=false;
  for (const requirement of requirements) {
    const match = /^([a-z0-9][a-z0-9._-]*)(?:\[[^\]]+\])?(?:[<>=!~].*)?$/i.exec(requirement.trim());
    const name = match?.[1].toLowerCase().replace(/[_.]+/g, '-');
    if (nativeNames.has(name)) profiles.push(requirement);
    else if (name === 'numpy') useNumpy = true;
    else if(name==='pillow')usePillow=true;
    else ordinary.push(requirement);
  }
  if(usePillow)await loadGraphics(py);
  if (useNumpy) {
    const base = new URL('/pyodide/', self.location.origin);
    const response = await nativeFetch(new URL('pyodide-lock.json', base));
    if (!response.ok) throw Error('فهرست NumPy همراه برنامه پیدا نشد.');
    const lock = await response.json();
    await py.loadPackage(new URL(lock.packages.numpy.file_name, base).href);
  }
  if (ordinary.length) {
    emit({ progress: 'در حال نصب کتابخانه‌ها…' });
    await py.loadPackage('micropip', { messageCallback: message => emit({ progress: message }) });
    py.globals.set('_codepad_packages', ordinary);
    await py.runPythonAsync('import micropip\nawait micropip.install(_codepad_packages.to_py())');
  }
  for (const requirement of requirements) installed.add(requirement);
  const notes = [];
  if (profiles.length) notes.push('Python Vision همراه برنامه است: ' + profiles.join(', ') + '. نسخه‌های native و شماره‌نسخه‌های درخواستی نصب نشدند؛ فقط APIهای مستند دوربین، دست، رسم دوبعدی و OpenGL نقاط در فایل Python پشتیبانی می‌شوند.');
  if (useNumpy) notes.push('NumPy واقعیِ سازگار با Pyodide بارگذاری شد؛ نسخه: ' + py.runPython('__import__("numpy").__version__') + '. پین نسخهٔ دسکتاپ اعمال نمی‌شود.');
  return notes.join('\n');
}
async function run({ id, code = '', stdin = '', assets = [], requirements = [], packageCommand, entryFile, runConfig }) {
  activeId = id;
  emit({ progress: 'در حال آماده‌سازی Python…' });
  let py;
  try {
    py = await boot();
    const moduleSource=code+'\n'+assets.filter(a=>/\.py$/i.test(a.name)&&a.buf).map(a=>new TextDecoder().decode(a.buf)).join('\n');
    const imports=importedModules(moduleSource);
    if(imports.has('PIL')||imports.has('codepad'))await loadGraphics(py);
    if(imports.has('numpy')){
      const lock=await(await nativeFetch(new URL('/pyodide/pyodide-lock.json',self.location.origin))).json();await py.loadPackage(new URL('/pyodide/'+lock.packages.numpy.file_name,self.location.origin).href);
    }
    const installNotes = await install(py, packageCommand?.action === 'install' ? packageCommand.requirements : requirements.filter(x => !installed.has(x)));
    if (packageCommand) {
      const output = packageCommand.action === 'install' ? `بسته‌ها بررسی و آماده شدند.\n${installNotes || packageCommand.requirements.join(', ')}` : String(py.runPython(`import importlib.metadata as m\n"\\n".join(sorted(d.metadata['Name'] + ${packageCommand.action === 'freeze' ? '"=="' : '"    "'} + d.version for d in m.distributions()))`));
      emit({ stdout: output, stderr: '', done: true }); return;
    }
    const names = new Set(assets.map(x => x.name));
    for (const name of mounted) if (!names.has(name)) { try { py.FS.unlink(name); } catch {} mounted.delete(name); }
    const project=mountProjectAssets(py,assets,entryFile,code);for(const name of project.names)mounted.add(name);
    py.globals.set('_codepad_source', code);
    py.globals.set('_codepad_run_config', JSON.stringify(runConfig && typeof runConfig === 'object' ? runConfig : {}));
    py.runPython(`
import sys, os, json
_cfg = json.loads(_codepad_run_config)
for _k in globals().get('_codepad_env_keys', []): os.environ.pop(_k, None)
_blocked = {"LD_PRELOAD", "LD_LIBRARY_PATH", "PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "PATH"}
_codepad_env_keys = [k for k in (_cfg.get("env") or {}) if isinstance(k, str) and k.isidentifier() and k.upper() not in _blocked]
for _k in _codepad_env_keys: os.environ[_k] = str(_cfg["env"][_k])[:4000]
sys.argv = [_codepad_filename] + [str(a) for a in (_cfg.get("argv") or [])][:64]
`);
    py.globals.set('_codepad_stdin', stdin);
    py.globals.set('_codepad_emit', (kind, text, snapshot) => emit({ stream: true, kind, text, snapshot }));
    py.runPython(`
import sys, builtins, asyncio, importlib, ast, inspect, time
from collections import deque
__file__ = _codepad_filename
__name__ = "__main__"
from io import StringIO
importlib.invalidate_caches()
for _name, _module in list(sys.modules.items()):
    if _name != '__main__' and str(getattr(_module, '__file__', '')).startswith('/home/pyodide/'):
        sys.modules.pop(_name, None)
class _CodePadOutput:
    encoding = 'utf-8'
    def __init__(self, kind):
        self.kind, self.parts, self.size = kind, deque(), 0
        self.pending, self.pending_size, self.last_flush = [], 0, 0
    def write(self, text):
        if not isinstance(text, str): raise TypeError('write() requires str')
        if not text: return 0
        self.parts.append(text)
        self.size += len(text)
        while self.size > 262144:
            old = self.parts.popleft()
            remaining = max(0, len(old) - (self.size - 262144))
            self.size -= len(old)
            if remaining:
                self.parts.appendleft(old[-remaining:])
                self.size += remaining
        self.pending.append(text)
        self.pending_size += len(text)
        if self.pending_size >= 8192 or time.monotonic()-self.last_flush >= .04: self.flush()
        return len(text)
    def flush(self):
        if self.pending:
            text = ''.join(self.pending)[-262144:]
            self.pending, self.pending_size = [], 0
            _codepad_emit(self.kind, text, self.getvalue())
        self.last_flush = time.monotonic()
    def isatty(self): return False
    def getvalue(self): return ''.join(self.parts)
_jib_out, _jib_err = _CodePadOutput('out'), _CodePadOutput('err')
sys.stdout, sys.stderr = _jib_out, _jib_err
_codepad_existing = set(asyncio.all_tasks())
_codepad_tree = ast.parse(_codepad_source, filename=_codepad_filename)
_codepad_tasks = []
_codepad_original_create_task = asyncio.create_task
def _codepad_create_task(coro, **kwargs):
    task = _codepad_original_create_task(coro, **kwargs)
    _codepad_tasks.append(task)
    return task
asyncio.create_task = _codepad_create_task
def _codepad_run(coro, *, debug=None, loop_factory=None):
    task = asyncio.ensure_future(coro)
    _codepad_tasks.append(task)
    return task
# Pyodide already has an event loop. Adapt module-level asyncio.run calls to
# top-level await while preserving return values, exceptions and source lines.
# Function bodies stay unchanged: nested asyncio.run must still reject.
_codepad_asyncio_names = {'asyncio'}
_codepad_run_names = set()
for _node in _codepad_tree.body:
    if isinstance(_node, ast.Import):
        for _alias in _node.names:
            if _alias.name == 'asyncio': _codepad_asyncio_names.add(_alias.asname or 'asyncio')
    if isinstance(_node, ast.ImportFrom) and _node.module == 'asyncio':
        for _alias in _node.names:
            if _alias.name == 'run': _codepad_run_names.add(_alias.asname or 'run')
class _CodePadAsyncRun(ast.NodeTransformer):
    def visit_FunctionDef(self, node): return node
    def visit_AsyncFunctionDef(self, node): return node
    def visit_Lambda(self, node): return node
    def visit_ClassDef(self, node): return node
    def visit_Call(self, node):
        node = self.generic_visit(node)
        fn = node.func
        match = (isinstance(fn, ast.Attribute) and fn.attr == 'run' and isinstance(fn.value, ast.Name) and fn.value.id in _codepad_asyncio_names) or (isinstance(fn, ast.Name) and fn.id in _codepad_run_names)
        if match:
            node.func = ast.copy_location(ast.Name(id='_codepad_run', ctx=ast.Load()), fn)
            return ast.copy_location(ast.Await(value=node), node)
        return node
_codepad_tree = ast.fix_missing_locations(_CodePadAsyncRun().visit(_codepad_tree))
`);
    await installInteractiveInput(py,input,stdin);
    py.globals.set('_codepad_display_image',json=>self.postMessage({id:activeId,image:JSON.parse(json)}));
    emit({ phase: 'run' });
    let failure = '';
    try {
      // sys.exit() ends the program normally (exit code 0 is silent, like the native runtime); other codes are reported by value
      await py.runPythonAsync(`
_codepad_exit = None
try:
    _codepad_value = eval(compile(_codepad_tree, _codepad_filename, 'exec', flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT))
    if inspect.isawaitable(_codepad_value): await _codepad_value
except SystemExit as _codepad_exit_error:
    _codepad_exit = _codepad_exit_error.code
`);
      await py.runPythonAsync(`
async def _codepad_wait():
    while True:
        tasks = list(set(_codepad_tasks + [t for t in asyncio.all_tasks() if t not in _codepad_existing and t is not asyncio.current_task() and not t.done()]))
        _codepad_tasks.clear()
        if not tasks: return
        try:
            await asyncio.gather(*tasks)
        except BaseException:
            for task in tasks: task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
await _codepad_wait()
`);
      const exitCode = py.globals.get('_codepad_exit');
      if (exitCode !== undefined && exitCode !== null && exitCode !== 0) failure = 'SystemExit: ' + exitCode;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      await py.runPythonAsync(`
_cancelled = list(set(_codepad_tasks + [t for t in asyncio.all_tasks() if t not in _codepad_existing and t is not asyncio.current_task()]))
for _task in _cancelled:
    if not _task.done(): _task.cancel()
if _cancelled: await asyncio.gather(*_cancelled, return_exceptions=True)
`);
    } finally { py.runPython('_jib_out.flush(); _jib_err.flush(); asyncio.create_task = _codepad_original_create_task'); }
    emit({ stdout: String(py.runPython('_jib_out.getvalue()')), stderr: [String(py.runPython('_jib_err.getvalue()')).trim(), failure].filter(Boolean).join('\n'), displayStderr: failure, streamed: true, done: true });
  } catch (error) { emit({ stdout: '', stderr: error instanceof Error ? error.message : String(error), done: true }); }
}
