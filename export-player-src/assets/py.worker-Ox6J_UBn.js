(function () {
  let e = /* @__PURE__ */ new Map();
  function t(t, n) {
    let r = new Set(n.map((e) => e.name));
    for (let n of [...e.keys()])
      if (!r.has(n)) {
        try {
          t.FS.unlink(n);
        } catch {}
        e.delete(n);
      }
    for (let r of n) r.buf && (t.FS.writeFile(r.name, new Uint8Array(r.buf)), e.set(r.name, r.stamp));
  }
  let n = null;
  function r() {
    return (
      (n ||= (async () => {
        let e = self.location.origin,
          t = await import(
            /* @vite-ignore */
            `${e}/pyodide/pyodide.mjs`
          );
        return t.loadPyodide({
          indexURL: `${e}/pyodide/`,
          packageBaseUrl: `https://cdn.jsdelivr.net/pyodide/v${t.version}/full/`,
        });
      })().catch((e) => {
        throw ((n = null), e);
      })),
      n
    );
  }
  function i(e) {
    return typeof e == `string` ? e : e && typeof e == `object` && `toString` in e ? String(e) : ``;
  }
  let a = /* @__PURE__ */ new Set();
  async function o(e, t, n) {
    (self.postMessage({ id: n, progress: `در حال آماده‌سازی نصب کتابخانه‌ها…` }),
      await e.loadPackage([`micropip`], { messageCallback: (e) => self.postMessage({ id: n, progress: e }) }),
      await e.runPythonAsync(`import micropip\nawait micropip.install(${JSON.stringify(t)})`));
    for (let e of t) a.add(e);
    e.runPython(`import importlib; importlib.invalidate_caches()`);
  }
  let s = Promise.resolve();
  self.onmessage = (e) => {
    s = s.then(() => c(e.data));
  };
  async function c({ id: e, code: n, stdin: s, assets: c, requirements: u, packageCommand: d }) {
    try {
      self.postMessage({ id: e, progress: `در حال آماده‌سازی Python…` });
      let f = await r();
      if ((f.runPython(`import sys; sys.dont_write_bytecode = True`), d)) {
        if (d.action === `install`)
          (await o(f, d.requirements, e),
            self.postMessage({
              id: e,
              stdout: `نصب انجام شد: ${d.requirements.join(`, `)}\nاکنون در کد از import استفاده کن.`,
              stderr: ``,
            }));
        else {
          let t = (u ?? []).filter((e) => !a.has(e));
          t.length && (await o(f, t, e));
          let n = i(
            f.runPython(
              `import importlib.metadata as _meta\n"\\n".join(sorted(d.metadata['Name'] + ${d.action === `freeze` ? `"=="` : `"    "`} + d.version for d in _meta.distributions()))`,
            ),
          );
          self.postMessage({ id: e, stdout: n || `هنوز بسته‌ای نصب نشده است.`, stderr: `` });
        }
        return;
      }
      let p = (u ?? []).filter((e) => !a.has(e));
      (p.length && (await o(f, p, e)),
        t(f, c ?? []),
        f.runPython(`import sys, importlib
importlib.invalidate_caches()
for _name, _module in list(sys.modules.items()):
    if str(getattr(_module, '__file__', '')).startswith('/home/pyodide/'):
        sys.modules.pop(_name, None)`));
      let m = s.endsWith(`
`)
          ? s
          : `${s}\n`,
        h =
          s === ``
            ? []
            : s.replace(/\n$/, ``).split(`
`);
      f.runPython(`
import sys, builtins
from io import StringIO
sys.stdin = StringIO(${JSON.stringify(m)})
_ans = ${JSON.stringify(h)}
_pos = [0]
_need = [""]
_asked = [False]
class _NeedInput(BaseException):
    pass
def _input(prompt=""):
    if _pos[0] >= len(_ans):
        _need[0] = str(prompt)
        _asked[0] = True
        raise _NeedInput()
    v = _ans[_pos[0]]
    _pos[0] += 1
    sys.stdout.write(str(prompt) + v + "\\n")
    return v
builtins.input = _input
_jib_out = StringIO()
_jib_err = StringIO()
sys.stdout = _jib_out
sys.stderr = _jib_err
`);
      let g = ``;
      try {
        (self.postMessage({ id: e, phase: `run` }), await f.runPythonAsync(n));
      } catch (e) {
        g = e instanceof Error ? e.message : String(e);
      }
      if (g.includes(`_NeedInput`) || f.runPython(`_asked[0]`) === !0) {
        let t = i(f.runPython(`_need[0]`));
        self.postMessage({ id: e, stdout: ``, stderr: `@@NEED_INPUT@@` + encodeURIComponent(t) });
        return;
      }
      let _ = i(f.runPython(`_jib_out.getvalue()`)),
        v = i(f.runPython(`_jib_err.getvalue()`)),
        y = /ModuleNotFoundError/.test(g + v)
          ? `
کتابخانه پیدا نشد. در کنسول بنویس: pip install <نام بسته>
نام نصب ممکن است با نام import فرق داشته باشد؛ pip help`
          : ``,
        b =
          [v.trim(), l(g)].filter(Boolean).join(`
`) + y;
      self.postMessage({ id: e, stdout: _, stderr: b });
    } catch (t) {
      let n = t instanceof Error ? t.message : String(t);
      self.postMessage({
        id: e,
        stdout: ``,
        stderr:
          (d
            ? `نصب یا خواندن بسته‌ها انجام نشد. اتصال اینترنت، نام بسته و سازگاری آن را بررسی کن.
این محیط فقط بسته‌های Python خالص یا WebAssembly سازگار را نصب می‌کند.
`
            : ``) +
          (n.includes(`Failed to load`)
            ? `Python یا کتابخانه بارگذاری نشد. اتصال را بررسی کن و دوباره تلاش کن.`
            : l(n)),
      });
    }
  }
  function l(e) {
    return e
      ? e
          .split(
            `
`,
          )
          .slice(0, 18).join(`
`)
      : ``;
  }
})();
