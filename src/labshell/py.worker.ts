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
    py.runPython(`
import sys
from io import StringIO
sys.stdin = StringIO(${JSON.stringify(source)})
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
