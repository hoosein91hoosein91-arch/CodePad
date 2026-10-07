import { runBinary } from "../src/labshell/binary.ts";
import { compileEnglish } from "../src/labshell/english.ts";
import { compileFarsi } from "../src/labshell/farsi.ts";
import { SAMPLES } from "../src/labshell/samples.ts";

type Page = { title: string; text: string; mark: string; css: string };
type Snap = { a: number; bits: string; pc: number; steps: number; gloss: string };

function run(js: string, stdin: string): { logs: string[]; page: Page; machine: Snap | null } {
  const logs: string[] = [];
  const page: Page = { title: "", text: "", mark: "", css: "" };
  let machine: Snap | null = null;
  const stdinLines = String(stdin || "").split(/\n/);
  let at = 0;
  const takeLine = () => (stdinLines[at++] ?? "").trim();
  const readBits = () => {
    const raw = takeLine();
    if (!raw) return 0;
    if (/^[01]+$/.test(raw) && raw.length > 1) return Number.parseInt(raw, 2) & 255;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error("Input must be a number or bits");
    return Math.trunc(value) & 255;
  };
  const show = (value: unknown): string => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "invalid";
      return String(Math.round(value * 1000) / 1000);
    }
    if (Array.isArray(value)) return `[${value.map(show).join(", ")}]`;
    if (value === true) return "true";
    if (value === false) return "false";
    if (value === null || value === undefined) return "null";
    return String(value);
  };
  const bitsOf = (value: number) => (value & 255).toString(2).padStart(8, "0");
  const print = (...values: unknown[]) => logs.push(values.map(show).join(" "));
  const read = () => {
    const raw = takeLine();
    if (raw === "") return "";
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return raw;
  };
  const setPage = (props: Page | null) => {
    if (!props) return;
    if (props.title) page.title = String(props.title);
    if (props.text) page.text = String(props.text);
    if (props.mark) page.mark = String(props.mark);
    if (props.css) page.css += String(props.css);
  };
  const len = (value: { length?: number } | null) => (value && typeof value.length === "number" ? value.length : 0);
  const push = (list: unknown, item: unknown) => {
    if (!Array.isArray(list)) throw new Error("push needs a list");
    list.push(item);
    return list.length;
  };
  const machineFn = (source: string) => {
    const rows = String(source || "").split("\n");
    const ops: { code: string; n: number }[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const bits = String(rows[i] || "").split("#")[0]?.replace(/\s+/g, "") ?? "";
      if (!bits) continue;
      if (!/^[01]{8}$/.test(bits)) throw new Error(`machine line ${i + 1} must be 8 bits`);
      ops.push({ code: bits.slice(0, 4), n: Number.parseInt(bits.slice(4), 2) });
    }
    let a = 0;
    let pc = 0;
    let steps = 0;
    let gloss = "ready";
    while (pc < ops.length) {
      if (steps > 300) throw new Error("machine loop did not stop");
      const op = ops[pc];
      if (!op) break;
      steps += 1;
      if (op.code === "0001") {
        a = op.n;
        pc += 1;
      } else if (op.code === "0010") {
        a = (a + op.n) & 255;
        pc += 1;
      } else if (op.code === "0011") {
        a = (a - op.n) & 255;
        pc += 1;
      } else if (op.code === "0101") {
        logs.push(`${a} = ${bitsOf(a)}`);
        pc += 1;
      } else if (op.code === "0110") pc += a === op.n ? 2 : 1;
      else if (op.code === "0111") pc += a < op.n ? 2 : 1;
      else if (op.code === "1000") pc = op.n;
      else if (op.code === "1001") {
        a = readBits();
        pc += 1;
      } else if (op.code === "1010") {
        a = a & op.n;
        pc += 1;
      } else if (op.code === "1111") {
        gloss = "halt";
        pc = ops.length;
      } else throw new Error(`unknown machine order ${op.code}`);
    }
    machine = { a, bits: bitsOf(a), pc, steps, gloss };
    return a;
  };
  const fn = new Function("__چاپ", "__بخوان", "__صفحه", "__machine", "__len", "__push", js);
  fn(print, read, setPage, machineFn, len, push);
  return { logs, page, machine };
}

function must(label: string, cond: boolean) {
  if (!cond) {
    console.error("FAIL", label);
    process.exitCode = 1;
  } else {
    console.log("ok", label);
  }
}

const eng = compileEnglish(SAMPLES.english.content);
if (!eng.ok) {
  console.error(eng.error);
  process.exit(1);
}
const calc = run(eng.js, "12\n30");
console.log(calc.logs.join("\n"));
must("sum", calc.logs.includes("sum: 42"));
must("product", calc.logs.includes("product: 360"));
must("list", calc.logs.includes("list total: 84"));
must("lamps print", calc.logs.includes("7 = 00000111"));
must("register", calc.logs.includes("register: 7"));
must("machine a", calc.machine?.a === 7 && calc.machine.bits === "00000111");
must("page", calc.page.title === "Calculator" && calc.page.mark === "JIB");

const stop = compileEnglish("let n = 0\nwhile n lt 10 {\n  n = n + 1\n  if n eq 3 { break }\n}\nprint(n)\n");
if (!stop.ok) {
  console.error(stop.error);
  process.exit(1);
}
must("break", run(stop.js, "").logs[0] === "3");

const fa = compileFarsi(SAMPLES.farsi.content);
must("farsi compiles", fa.ok);
if (fa.ok) {
  const heat = run(fa.js, "38.2");
  console.log(heat.logs.join("\n"));
  must("farsi ran", heat.logs.length >= 3);
}

const bits = runBinary(SAMPLES.binary.content, "");
must("binary", bits.ok && bits.lines.length === 5 && bits.snap.a === 5);

const bad = runBinary("0001 12\n", "");
must("bad bits english", !bad.ok && bad.error.startsWith("line 1:"));

const readMachine = compileEnglish("let lamps = machine {\n  1001 0000\n  0010 0001\n  1111 0000\n}\nprint(lamps)\n");
if (!readMachine.ok) {
  console.error(readMachine.error);
  process.exit(1);
}
must("machine read", run(readMachine.js, "4").logs[0] === "5");

if (process.exitCode) process.exit(process.exitCode);
console.log("ALL PASSED");
