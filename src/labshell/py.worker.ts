type Pyodide = {
  runPython: (code: string) => unknown;
};

type PyModule = {
  loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>;
};

let engine: Promise<Pyodide> | null = null;

function boot(): Promise<Pyodide> {
  if (!engine) {
    engine = (async () => {
      const origin = self.location.origin;
      const mod = (await import(/* @vite-ignore */ `${origin}/pyodide/pyodide.mjs`)) as PyModule;
      return mod.loadPyodide({ indexURL: `${origin}/pyodide/` });
    })();
  }
  return engine;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  return "";
}

self.onmessage = async (event: MessageEvent<{ id: number; code: string; stdin: string }>) => {
  const { id, code, stdin } = event.data;
  try {
    const py = await boot();
    const source = stdin.endsWith("\n") ? stdin : `${stdin}\n`;
    const answers = stdin === "" ? [] : stdin.replace(/\n$/, "").split("\n");
    py.runPython(`
import sys, builtins
from io import StringIO
sys.stdin = StringIO(${JSON.stringify(source)})
_ans = ${JSON.stringify(answers)}
_pos = [0]
_need = [""]
class _NeedInput(BaseException):
    pass
def _input(prompt=""):
    if _pos[0] >= len(_ans):
        _need[0] = str(prompt)
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
    let failure = "";
    try {
      py.runPython(code);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (failure.includes("_NeedInput")) {
      // برنامه ورودی خواست و جوابش را ندارد: به صفحه خبر بده تا بپرسد و دوباره اجرا کند
      const need = textOf(py.runPython("_need[0]"));
      self.postMessage({ id, stdout: "", stderr: "@@NEED_INPUT@@" + encodeURIComponent(need) });
      return;
    }
    const stdout = textOf(py.runPython("_jib_out.getvalue()"));
    const stderr = textOf(py.runPython("_jib_err.getvalue()"));
    const merged = [stderr.trim(), trimPython(failure)].filter(Boolean).join("\n");
    self.postMessage({ id, stdout, stderr: merged });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({
      id,
      stdout: "",
      stderr: message.includes("Failed to load")
        ? "Python did not load. Check the connection and press Run again."
        : message,
    });
  }
};

function trimPython(message: string): string {
  if (!message) return "";
  return message.split("\n").slice(0, 18).join("\n");
}
