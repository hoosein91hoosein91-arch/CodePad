import { runBinary } from "../src/labshell/binary.ts";
import { compileEnglish } from "../src/labshell/english.ts";
import { compileFarsi } from "../src/labshell/farsi.ts";
import { SAMPLES } from "../src/labshell/samples.ts";
import { detectKind, parseMix, runMix } from "../src/labshell/mix.ts";
import { parsePack } from "../src/labshell/pack.ts";
import { readFileSync } from "node:fs";
import { appAsk, askGemini, extractCode, geminiRequest, generateText } from "../src/labshell/gemini.ts";
import { compileNava } from "../src/labshell/nava.ts";
import { JIBOS_OPEN } from "../src/labshell/jibos.ts";
import { caesar, entropyBits, fromB64, fromHex, sha, toB64, toHex, xorHex } from "../src/labshell/crypto-utils.ts";
import { formatScan, simulateScan } from "../src/labshell/netsim.ts";
import { buildTree, lookup, newVfs, resolvePath } from "../src/labshell/vfs.ts";
import { DEFAULT_PREFS, normalizePrefs } from "../src/labshell/launcher-prefs.ts";
import { injectHead, jibosClient } from "../src/labshell/jibos.ts";

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

// اچ‌تی‌ام‌ال در فایل ترکیبی: نام، تشخیص خودکار، و ساخت صفحه با shared و سی‌اس‌اس
must("html alias", parseMix("@@ html\n<p>hi</p>\n").blocks[0]?.kind === "html");
must("html alias fa", parseMix("@@ اچ‌تی‌ام‌ال\n<p>hi</p>\n").blocks[0]?.kind === "html");
must("html detect", detectKind('<div class="x">\n  <b>hi</b>\n</div>') === "html");
must("html detect doc", detectKind("<!doctype html>\n<html><body></body></html>") === "html");
must("not html: c include", detectKind("#include <stdio.h>\nint main() { return 0; }") === "c");
must("not html: jib compare", detectKind("let a = 1\nif a < 2 { print(a) }") !== "html");
const noop = async () => ({ stdout: "", stderr: "", aborted: false });
const mixed = await runMix('@@ html\n<h1 id="t">x</h1>\n@@ css\nh1 { color: red; }\n<p>auto</p>\n', "", {
  python: noop, javascript: async () => ({ stdout: '\u0001SHARED:{"n":3}', stderr: "", aborted: false }), jib: noop, c: noop, cpp: noop, binary: noop,
});
must("mix html page", !!mixed.web && mixed.web.html.includes('<h1 id="t">') && mixed.web.css.includes("color: red"));
const withShared = await runMix('@@ js\nshared.n = 3\n@@ html\n<p id="n"></p>\n', "", {
  python: noop, javascript: async () => ({ stdout: '\u0001SHARED:{"n":3}', stderr: "", aborted: false }), jib: noop, c: noop, cpp: noop, binary: noop,
});
must("mix html shared", withShared.web?.data === '{"n":3}');

// نمونهٔ آمادهٔ «مار و سیب (با عکس)»: بسته باید یک فایل mix و چهار عکس PNG سالم داشته باشد
const snakePack = parsePack(readFileSync(new URL("../src/labshell/packs/snake-images.jibpack", import.meta.url), "utf8"));
must("pack parses", !!snakePack && snakePack.problems.length === 0);
must("pack files", snakePack?.files.map((f) => f.name).join(",") === "snake.mix");
must("pack assets", snakePack?.assets.map((a) => a.name).sort().join(",") === "apple.png,body.png,grass.png,head.png");
must("pack pngs", !!snakePack && snakePack.assets.every((a) => a.bytes[0] === 0x89 && a.bytes[1] === 0x50 && a.bytes[2] === 0x4e && a.bytes[3] === 0x47));
must("pack mix blocks", parseMix(snakePack?.files[0]?.content ?? "").blocks.map((b) => b.kind).join(",") === "python,html,css,javascript");
// ── نسخهٔ ۲: لانچر، Gemini، نمونه‌های امنیت ──
for (const id of ["security-hash", "security-encoding", "security-classic", "security-xor", "security-password", "security-nmap", "security-portscan", "sound-piano"]) {
  const p = parsePack(readFileSync(new URL(`../src/labshell/packs/${id}.jibpack`, import.meta.url), "utf8"));
  must(`sample ${id}`, !!p && p.problems.length === 0 && p.files.length === 1 && /^(main\.py|index\.html)$/.test(p.files[0].name) && p.files[0].content.length > 200);
}
must("sha256", (await sha("SHA-256", "abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
must("b64 roundtrip", fromB64(toB64("سلام abc")) === "سلام abc");
must("hex roundtrip", toHex("AB") === "4142" && fromHex("4142") === "AB");
must("caesar", caesar("Hello", 3) === "Khoor" && caesar(caesar("Hello", 3), -3) === "Hello");
must("xor", xorHex("A", "A") === "00");
must("entropy", entropyBits("") === 0 && entropyBits("Tr0ub4dor&3xyz!") > 80);
// ── شبیه‌ساز اسکن پورت (آموزشی) و سیستم‌فایل مجازی کنسول ──
must("netsim deterministic", JSON.stringify(simulateScan("192.168.1.10")) === JSON.stringify(simulateScan("192.168.1.10")));
must("netsim states", simulateScan("host-a").every((p) => p.state === "open" || p.state === "closed" || p.state === "filtered"));
must("netsim report", formatScan("10.0.0.5", simulateScan("10.0.0.5")).some((l) => l.includes("شبیه‌سازی")));
must("vfs resolve", resolvePath("/home/user", "../..") === "/" && resolvePath("/apps", "a/./b") === "/apps/a/b");
const vtree = buildTree([{ name: "Demo", files: [{ name: "index.html", content: "<p>hi</p>" }] }], newVfs().scratch);
must("vfs tree apps", lookup(vtree, "/apps/Demo/index.html")?.type === "file");
must("vfs tree home", lookup(vtree, "/home/user/README.txt")?.type === "file");
must("vfs missing", lookup(vtree, "/apps/none") === null);
must("prefs normalize", normalizePrefs({ columns: 99, accent: "javascript:x", devMode: true }).columns === 6 && normalizePrefs({ accent: "bad" }).accent === DEFAULT_PREFS.accent && normalizePrefs({ devMode: true }).devMode);
const req = geminiRequest({ key: "TEST-KEY", model: "gemini-3.8-flash" }, "hi", "sys");
must("gemini url", req.url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
must("gemini header", (req.init.headers as Record<string, string>)["x-goog-api-key"] === "TEST-KEY" && !req.url.includes("TEST-KEY"));
must("gemini body", JSON.parse(String(req.init.body)).contents[0].parts[0].text === "hi");
must("gemini parse", generateText({ candidates: [{ content: { parts: [{ text: "x", thought: true }, { text: "سلام" }] } }] }) === "سلام");
let seen = "";
const answer = await askGemini({ key: "K", model: "m" }, "q", { fetcher: async (u) => { seen = u; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 }); } });
must("gemini call path", answer === "ok" && seen.endsWith("/models/m:generateContent"));
let noKey = "";
await askGemini({ key: "", model: "m" }, "q").catch((e: Error) => { noKey = e.message; });
must("gemini missing key", noKey.includes("کلید"));
let badKey = "";
await askGemini({ key: "K", model: "m" }, "q", { fetcher: async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }) }).catch((e: Error) => { badKey = e.message; });
must("gemini bad key", badKey.includes("نامعتبر"));
must("extract code", extractCode("hi\n```html\n<p>x</p>\n```") === "<p>x</p>\n");
must("jibos inject", injectHead("<html><head><title>t</title></head></html>", jibosClient("n1", "app")).indexOf("window.jibos") < injectHead("<html><head><title>t</title></head></html>", jibosClient("n1", "app")).indexOf("<title>"));

// ── نسخهٔ ۲.۲: زبان نوا ──
must("nava starter sample", !!compileNava(SAMPLES.nava.content).web);
for (const id of ["nava-todo", "nava-clicker", "nava-snake", "nava-cube3d", "nava-ai"]) {
  const p = parsePack(readFileSync(new URL(`../src/labshell/packs/${id}.jibpack`, import.meta.url), "utf8"));
  must(`pack ${id} parses`, !!p && p.problems.length === 0 && p.files.length === 1 && p.files[0]!.name === "main.nava");
  const res = compileNava(p?.files[0]?.content ?? "");
  must(`pack ${id} compiles (${res.error ?? "ok"})`, !!res.web);
}
must("jibos ai command open", JIBOS_OPEN.has("ai") && jibosClient("n", "a").includes('c==="ai"?120000'));
const okFetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "جواب" }] } }] }), { status: 200 });
let denied = "";
await appAsk("app-deny", "q", { settings: { key: "K", model: "m" }, confirm: () => false, fetcher: okFetch }).catch((e: Error) => { denied = e.message; });
must("nava ai asks permission (denied)", denied.includes("اجازه"));
let asked = 0;
const first = await appAsk("app-ok", "q", { settings: { key: "K", model: "m" }, confirm: () => { asked++; return true; }, fetcher: okFetch });
await appAsk("app-ok", "q2", { settings: { key: "K", model: "m" }, confirm: () => { asked++; return true; }, fetcher: okFetch });
must("nava ai answer + permission once per app", first === "جواب" && asked === 1);
let limited = "";
for (let i = 0; i < 12; i++) await appAsk("app-ok", "q", { settings: { key: "K", model: "m" }, fetcher: okFetch }).catch((e: Error) => { limited = e.message; });
must("nava ai rate limit", limited.includes("دقیقه"));
let noKeyApp = "";
await appAsk("app-x", "q", { settings: { key: "", model: "m" } }).catch((e: Error) => { noKeyApp = e.message; });
must("nava ai needs key", noKeyApp.includes("Gemini وصل نیست"));
if (process.exitCode) process.exit(process.exitCode);
console.log("ALL PASSED");
