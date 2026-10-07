import JSCPP from "JSCPP";
import type { FarsiPage } from "@/labshell/farsi";

export type RunResult = {
  stdout: string;
  stderr: string;
  aborted: boolean;
  page?: FarsiPage;
  machine?: { a: number; bits: string; pc: number; steps: number; gloss: string };
  /** Mix files: page from @@ html blocks (+ css, DOM scripts); `data` = final shared JSON for the page. */
  web?: { html: string; css: string; js: string; data?: string };
};

type Pending = {
  resolve: (result: RunResult) => void;
  timer: number;
};

let pythonWorker: Worker | null = null;
let jsWorker: Worker | null = null;
let pythonWarm = false;
const pythonPending = new Map<number, Pending>();
let seq = 0;

export function isPythonWarm(): boolean {
  return pythonWarm;
}

function settle(map: Map<number, Pending>, id: number, result: RunResult) {
  const job = map.get(id);
  if (!job) return;
  window.clearTimeout(job.timer);
  map.delete(id);
  job.resolve(result);
}

function bindWorker(
  worker: Worker,
  map: Map<number, Pending>,
  onDone?: () => void,
) {
  worker.addEventListener("message", (event: MessageEvent<{ id: number; stdout?: string; stderr?: string }>) => {
    if (onDone) onDone();
    settle(map, event.data.id, {
      stdout: event.data.stdout ?? "",
      stderr: event.data.stderr ?? "",
      aborted: false,
    });
  });
  worker.addEventListener("error", () => {
    for (const [id] of map) {
      settle(map, id, { stdout: "", stderr: "The engine failed.", aborted: false });
    }
  });
}

function python(): Worker {
  if (!pythonWorker) {
    pythonWorker = new Worker(new URL("./py.worker.ts", import.meta.url), { type: "module" });
    bindWorker(pythonWorker, pythonPending, () => {
      pythonWarm = true;
    });
  }
  return pythonWorker;
}

function abortMap(map: Map<number, Pending>) {
  for (const [id] of map) {
    settle(map, id, { stdout: "", stderr: "", aborted: true });
  }
}

export function stopRuntimes() {
  pythonWorker?.terminate();
  pythonWorker = null;
  pythonWarm = false;
  abortMap(pythonPending);
  jsWorker?.terminate();
  jsWorker = null;
}

function runWorker(
  worker: Worker,
  map: Map<number, Pending>,
  code: string,
  stdin: string,
  timeoutMs: number,
  timeoutText: string,
): Promise<RunResult> {
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      if (worker === pythonWorker) {
        pythonWorker = null;
        pythonWarm = false;
      }
      map.delete(id);
      resolve({ stdout: "", stderr: timeoutText, aborted: false });
    }, timeoutMs);
    map.set(id, { resolve, timer });
    worker.postMessage({ id, code, stdin });
  });
}

function runPythonRaw(code: string, stdin: string): Promise<RunResult> {
  return runWorker(
    python(),
    pythonPending,
    code,
    stdin,
    25000,
    "Python timed out. If a loop never ends, run it again.",
  );
}

function explainCpp(message: string): string {
  const first = message.split("\n").slice(0, 8).join("\n");
  if (first.includes("Time limit exceeded")) return "The run timed out. A loop may not stop.";
  if (first.includes("Parsing Failure")) return `This text is not supported by the pocket interpreter.\n${first}`;
  return first;
}

export function runCpp(code: string, stdin: string): Promise<RunResult> {
  let stdout = "";
  try {
    const mod = JSCPP as {
      run?: (code: string, input: string, config: object) => unknown;
      default?: { run?: (code: string, input: string, config: object) => unknown };
    };
    const api = typeof mod.run === "function" ? mod : mod.default;
    if (!api?.run) return Promise.resolve({ stdout: "", stderr: "The C engine was not found.", aborted: false });
    api.run(code, stdin, {
      stdio: {
        write(chunk: string) {
          stdout += String(chunk);
        },
      },
      maxTimeout: 2500,
    });
    return Promise.resolve({ stdout, stderr: "", aborted: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Promise.resolve({ stdout, stderr: explainCpp(message), aborted: false });
  }
}

export function runJavaScript(code: string): Promise<RunResult> {
  jsWorker?.terminate();
  const worker = new Worker(
    URL.createObjectURL(
      new Blob(
        [
          `
          const fmt = (values) => values.map((value) => {
            if (typeof value === "string") return value;
            try { return JSON.stringify(value); } catch { return String(value); }
          }).join(" ");
          self.onmessage = (event) => {
            const logs = [];
            const errs = [];
            const console = {
              log: (...values) => logs.push(fmt(values)),
              info: (...values) => logs.push(fmt(values)),
              warn: (...values) => errs.push(fmt(values)),
              error: (...values) => errs.push(fmt(values)),
            };
            try {
              const result = new Function("console", '"use strict";\\n' + event.data)(console);
              if (result !== undefined) logs.push(fmt([result]));
              self.postMessage({ logs, errs });
            } catch (error) {
              errs.push(error && error.stack ? String(error.stack).split("\\n").slice(0, 6).join("\\n") : String(error));
              self.postMessage({ logs, errs });
            }
          };
        `,
        ],
        { type: "text/javascript" },
      ),
    ),
  );
  jsWorker = worker;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      if (jsWorker === worker) jsWorker = null;
      resolve({ stdout: "", stderr: "JavaScript timed out. A loop may not stop.", aborted: false });
    }, 2500);
    worker.addEventListener("message", (event: MessageEvent<{ logs?: string[]; errs?: string[] }>) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (jsWorker === worker) jsWorker = null;
      resolve({
        stdout: (event.data.logs ?? []).join("\n"),
        stderr: (event.data.errs ?? []).join("\n"),
        aborted: false,
      });
    });
    worker.addEventListener("error", (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (jsWorker === worker) jsWorker = null;
      resolve({ stdout: "", stderr: event.message || "JavaScript error", aborted: false });
    });
    worker.postMessage(code);
  });
}

const FARSI_WORKER = `
const show = (value) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "invalid";
    const rounded = Math.round(value * 1000) / 1000;
    return String(rounded);
  }
  if (Array.isArray(value)) return "[" + value.map(show).join(", ") + "]";
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null || value === undefined) return "null";
  return String(value);
};
const faError = (error) => {
  const msg = String(error && error.message ? error.message : error);
  const missing = msg.match(/^(.*) is not defined$/);
  if (missing) return missing[1] + " is not defined. Create it with let.";
  if (msg.includes("already been declared")) return "That name was declared twice with let.";
  if (msg.includes("Illegal break") || msg.includes("Illegal continue")) return "break and continue only work inside a loop.";
  if (msg.includes("Unexpected")) return "The program structure is not valid.";
  return msg;
};
const bitsOf = (value) => (value & 255).toString(2).padStart(8, "0");
self.onmessage = (event) => {
  const logs = [];
  const errs = [];
  const page = { title: "", text: "", mark: "", css: "" };
  let machine = null;
  const hasInput = String(event.data.stdin || "") !== "";
  const stdinLines = !hasInput ? [] : String(event.data.stdin).replace(/\\n$/, "")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .split(/\\n/);
  let at = 0;
  const takeLine = () => {
    if (at >= stdinLines.length) throw { __need: true };
    return (stdinLines[at++] ?? "").trim();
  };
  const readBits = () => {
    const raw = takeLine();
    if (!raw) return 0;
    if (/^[01]+$/.test(raw) && raw.length > 1) return parseInt(raw, 2) & 255;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error("Input must be a number or bits");
    return Math.trunc(value) & 255;
  };
  const __چاپ = (...values) => logs.push(values.map(show).join(" "));
  const __بخوان = () => {
    const raw = takeLine();
    if (raw === "") return "";
    if (/^-?\\d+(\\.\\d+)?$/.test(raw)) return Number(raw);
    return raw;
  };
  const __صفحه = (props) => {
    if (!props) return;
    if (props.title) page.title = String(props.title);
    if (props.text) page.text = String(props.text);
    if (props.mark) page.mark = String(props.mark);
    if (props.css) page.css += String(props.css);
  };
  const __len = (value) => (value && typeof value.length === "number" ? value.length : 0);
  const __push = (list, item) => {
    if (!Array.isArray(list)) throw new Error("push needs a list");
    list.push(item);
    return list.length;
  };
  const __machine = (source) => {
    const rows = String(source || "").split("\\n");
    const ops = [];
    for (let i = 0; i < rows.length; i++) {
      const bits = String(rows[i] || "").split("#")[0].replace(/\\s+/g, "");
      if (!bits) continue;
      if (!/^[01]{8}$/.test(bits)) throw new Error("machine line " + (i + 1) + " must be 8 bits");
      ops.push({ code: bits.slice(0, 4), n: parseInt(bits.slice(4), 2) });
    }
    let a = 0;
    let pc = 0;
    let steps = 0;
    let gloss = "ready";
    const names = { "0001": "load", "0010": "add", "0011": "sub", "0101": "print", "0110": "skip if equal", "0111": "skip if smaller", "1000": "jump", "1001": "read", "1010": "and", "1111": "halt" };
    while (pc < ops.length) {
      if (steps > 300) throw new Error("machine loop did not stop");
      const op = ops[pc];
      gloss = (names[op.code] || "unknown") + " " + op.n;
      steps += 1;
      if (op.code === "0001") { a = op.n; pc += 1; }
      else if (op.code === "0010") { a = (a + op.n) & 255; pc += 1; }
      else if (op.code === "0011") { a = (a - op.n) & 255; pc += 1; }
      else if (op.code === "0101") { logs.push(a + " = " + bitsOf(a)); pc += 1; }
      else if (op.code === "0110") pc += a === op.n ? 2 : 1;
      else if (op.code === "0111") pc += a < op.n ? 2 : 1;
      else if (op.code === "1000") {
        if (op.n >= ops.length) throw new Error("jump leaves the machine program");
        pc = op.n;
      } else if (op.code === "1001") { a = readBits(); pc += 1; }
      else if (op.code === "1010") { a = a & op.n; pc += 1; }
      else if (op.code === "1111") { gloss = "halt"; pc = ops.length; }
      else throw new Error("unknown machine order " + op.code);
    }
    machine = { a, bits: bitsOf(a), pc, steps, gloss };
    return a;
  };
  try {
    const run = new Function("__چاپ", "__بخوان", "__صفحه", "__machine", "__len", "__push", String(event.data.code || ""));
    run(__چاپ, __بخوان, __صفحه, __machine, __len, __push);
    self.postMessage({ logs, errs, page, machine });
  } catch (error) {
    if (error && error.__need) {
      self.postMessage({ need: true, prompt: logs.length ? logs[logs.length - 1] : "" });
      return;
    }
    errs.push(faError(error));
    self.postMessage({ logs, errs, page, machine });
  }
};
`;

function runFarsiRaw(code: string, stdin: string): Promise<RunResult> {
  jsWorker?.terminate();
  const worker = new Worker(URL.createObjectURL(new Blob([FARSI_WORKER], { type: "text/javascript" })));
  jsWorker = worker;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      if (jsWorker === worker) jsWorker = null;
      resolve({ stdout: "", stderr: "The program ran too long. A loop may not stop.", aborted: false });
    }, 2500);
    worker.addEventListener("message", (event: MessageEvent<{ need?: boolean; prompt?: string; logs?: string[]; errs?: string[]; page?: FarsiPage; machine?: RunResult["machine"] }>) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (jsWorker === worker) jsWorker = null;
      if (event.data.need) {
        resolve({ stdout: "", stderr: NEED + encodeURIComponent(event.data.prompt ?? ""), aborted: false });
        return;
      }
      resolve({
        stdout: (event.data.logs ?? []).join("\n"),
        stderr: (event.data.errs ?? []).join("\n"),
        aborted: false,
        page: event.data.page,
        machine: event.data.machine ?? undefined,
      });
    });
    worker.addEventListener("error", (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (jsWorker === worker) jsWorker = null;
      resolve({ stdout: "", stderr: event.message || "Jib failed", aborted: false });
    });
    worker.postMessage({ code, stdin });
  });
}

// ── ورودی تعاملی ──
// برنامه وسط اجرا جواب نداشت ← از کاربر می‌پرسیم، جواب را اضافه می‌کنیم و برنامه را از اول دوباره اجرا می‌کنیم.
// (برای برنامه‌هایی که چاپ می‌کنند و ورودی می‌خوانند درست است؛ random و زمان هر بار دوباره حساب می‌شوند.)
const NEED = "@@NEED_INPUT@@";

async function interactive(run: (stdin: string) => Promise<RunResult>, stdin: string): Promise<RunResult> {
  const answers = stdin === "" ? [] : stdin.replace(/\n$/, "").split("\n");
  for (let round = 0; round < 200; round++) {
    const result = await run(answers.length ? `${answers.join("\n")}\n` : "");
    if (!result.stderr.startsWith(NEED)) return result;
    const asked = decodeURIComponent(result.stderr.slice(NEED.length)) || "Input:";
    const reply = window.prompt(asked);
    if (reply === null) return { stdout: "", stderr: "Input cancelled.", aborted: true };
    answers.push(reply);
  }
  return { stdout: "", stderr: "Too many inputs asked in one run.", aborted: false };
}

export const runPython = (code: string, stdin: string) => interactive((text) => runPythonRaw(code, text), stdin);
export const runFarsi = (code: string, stdin: string) => interactive((text) => runFarsiRaw(code, text), stdin);
