/* CodePad 2.10: streaming output and owned asyncio task lifetime. */
let engine, activeId, queue = Promise.resolve();
const installed = new Set(), mounted = new Set();
const nativeFetch = self.fetch.bind(self), requests = new Map();
let requestId = 0;
function emit(data) { self.postMessage({ id: activeId, ...data }); }
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
self.onmessage = event => {
  const data = event.data;
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
  if (!requirements.length) return;
  emit({ progress: 'در حال نصب کتابخانه‌ها…' });
  await py.loadPackage('micropip', { messageCallback: message => emit({ progress: message }) });
  py.globals.set('_codepad_packages', requirements);
  await py.runPythonAsync('import micropip\nawait micropip.install(_codepad_packages.to_py())');
  for (const requirement of requirements) installed.add(requirement);
}
async function run({ id, code = '', stdin = '', assets = [], requirements = [], packageCommand }) {
  activeId = id;
  emit({ progress: 'در حال آماده‌سازی Python…' });
  let py;
  try {
    py = await boot();
    await install(py, packageCommand?.action === 'install' ? packageCommand.requirements : requirements.filter(x => !installed.has(x)));
    if (packageCommand) {
      const output = packageCommand.action === 'install' ? `نصب انجام شد: ${packageCommand.requirements.join(', ')}` : String(py.runPython(`import importlib.metadata as m\n"\\n".join(sorted(d.metadata['Name'] + ${packageCommand.action === 'freeze' ? '"=="' : '"    "'} + d.version for d in m.distributions()))`));
      emit({ stdout: output, stderr: '', done: true }); return;
    }
    const names = new Set(assets.map(x => x.name));
    for (const name of mounted) if (!names.has(name)) { try { py.FS.unlink(name); } catch {} mounted.delete(name); }
    for (const asset of assets) if (asset.buf) { py.FS.writeFile(asset.name, new Uint8Array(asset.buf)); mounted.add(asset.name); }
    py.globals.set('_codepad_source', code);
    py.globals.set('_codepad_stdin', stdin);
    py.globals.set('_codepad_emit', (kind, text, snapshot) => emit({ stream: true, kind, text, snapshot }));
    py.runPython(`
import sys, builtins, asyncio, importlib, ast, inspect
from io import StringIO
importlib.invalidate_caches()
for _name, _module in list(sys.modules.items()):
    if str(getattr(_module, '__file__', '')).startswith('/home/pyodide/'):
        sys.modules.pop(_name, None)
sys.stdin = StringIO(_codepad_stdin + "\\n")
_ans = [] if not _codepad_stdin else _codepad_stdin.rstrip("\\n").split("\\n")
_pos = 0
_asked = False
_need = ""
class _NeedInput(BaseException): pass
def _input(prompt=""):
    global _pos, _asked, _need
    if _pos >= len(_ans):
        _asked, _need = True, str(prompt)
        raise _NeedInput()
    value = _ans[_pos]
    _pos += 1
    print(str(prompt) + value)
    return value
builtins.input = _input
class _CodePadOutput:
    encoding = 'utf-8'
    def __init__(self, kind): self.kind, self.content = kind, ''
    def write(self, text):
        if not isinstance(text, str): raise TypeError('write() requires str')
        self.content = (self.content + text)[-262144:]
        _codepad_emit(self.kind, text, self.content)
        return len(text)
    def flush(self): pass
    def isatty(self): return False
    def getvalue(self): return self.content
_jib_out, _jib_err = _CodePadOutput('out'), _CodePadOutput('err')
sys.stdout, sys.stderr = _jib_out, _jib_err
_codepad_existing = set(asyncio.all_tasks())
_codepad_tree = ast.parse(_codepad_source, filename="<project>")
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
    emit({ phase: 'run' });
    let failure = '';
    try {
      await py.runPythonAsync(`
_codepad_value = eval(compile(_codepad_tree, '<project>', 'exec', flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT))
if inspect.isawaitable(_codepad_value): await _codepad_value
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
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      await py.runPythonAsync(`
_cancelled = list(set(_codepad_tasks + [t for t in asyncio.all_tasks() if t not in _codepad_existing and t is not asyncio.current_task()]))
for _task in _cancelled:
    if not _task.done(): _task.cancel()
if _cancelled: await asyncio.gather(*_cancelled, return_exceptions=True)
`);
    } finally { py.runPython('asyncio.create_task = _codepad_original_create_task'); }
    if (py.runPython('_asked')) {
      emit({ stdout: '', stderr: '@@NEED_INPUT@@' + encodeURIComponent(String(py.runPython('_need'))), done: true }); return;
    }
    emit({ stdout: String(py.runPython('_jib_out.getvalue()')), stderr: [String(py.runPython('_jib_err.getvalue()')).trim(), failure].filter(Boolean).join('\n'), streamed: true, done: true });
  } catch (error) { emit({ stdout: '', stderr: error instanceof Error ? error.message : String(error), done: true }); }
}
