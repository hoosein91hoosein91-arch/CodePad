// زبان ترکیبی: چند زبان در یک فایل. هر بلوک با «@@ نام‌زبان» شروع می‌شود.
// بلوک‌ها به ترتیب اجرا می‌شوند. پایتون و جاوااسکریپت از طریق متغیر مشترک `shared` داده رد و بدل می‌کنند.
import type { RunResult } from "@/labshell/runtime";

export type MixKind = "python" | "javascript" | "jib" | "farsi" | "c" | "cpp" | "binary" | "css" | "html";

export type MixBlock = { kind: MixKind; code: string; line: number; auto?: boolean };

export const MIX_NAMES: Record<MixKind, string> = {
  python: "پایتون",
  javascript: "جاوااسکریپت",
  jib: "جیب",
  farsi: "جیب فارسی",
  c: "سی",
  cpp: "سی‌پلاس‌پلاس",
  binary: "ماشین صفر و یک",
  css: "سی‌اس‌اس",
  html: "صفحهٔ وب",
};

const ALIASES: Record<string, MixKind> = {
  py: "python", python: "python", "پایتون": "python",
  js: "javascript", javascript: "javascript", "جاوااسکریپت": "javascript", "جاوا_اسکریپت": "javascript", "جاوا": "javascript",
  jib: "jib", "جیب": "jib",
  fa: "farsi", farsi: "farsi", "فارسی": "farsi",
  c: "c", "سی": "c",
  cpp: "cpp", "c++": "cpp", "سی‌پلاس": "cpp", "سی_پلاس": "cpp", "سی‌پلاس‌پلاس": "cpp",
  bit: "binary", binary: "binary", machine: "binary", "ماشین": "binary", "صفرویک": "binary", "صفر_و_یک": "binary",
  css: "css", "سی‌اس‌اس": "css", "استایل": "css",
  html: "html", htm: "html", "اچ‌تی‌ام‌ال": "html", "وب": "html", "صفحه‌وب": "html", "اچ_تی_ام_ال": "html",
};

export function kindOf(word: string): MixKind | null {
  return ALIASES[word.trim().toLowerCase().replace(/\s+/g, "_")] ?? ALIASES[word.trim().toLowerCase()] ?? null;
}

export type MixParse = { blocks: MixBlock[]; error?: string };

// ── تشخیص خودکار زبان ──
// classify: برای یک تکه کد، زبان و قطعی‌بودن تشخیص را برمی‌گرداند. strong=false یعنی نشانهٔ روشنی پیدا نشد.
type Guess = { kind: MixKind; strong: boolean };

export function classify(code: string): Guess {
  const src = code.replace(/^\s*(#|\/\/).*$/gm, "").trim();
  if (!src) return { kind: "jib", strong: false };
  if (/^[01\s]+$/.test(src)) return { kind: "binary", strong: true };
  if (/^<(!doctype|[a-z][\w-]*)[\s>/]/i.test(src) || /<\/(div|body|html|p|span|section|script|style|canvas|button)>/i.test(src)) return { kind: "html", strong: true };
  if (/^\s*#\s*include\b/m.test(code)) return { kind: /iostream|std::|\bcout\b|\bclass\b|using\s+namespace/.test(code) ? "cpp" : "c", strong: true };
  if (/^\s*(int|void|float|double|char)\s+\w+\s*\([^)]*\)\s*\{/m.test(src)) return { kind: /std::|\bcout\b|\bcin\b/.test(src) ? "cpp" : "c", strong: true };
  if (/^\s*(@media|@keyframes|@font-face|:root)\b[^{]*\{/m.test(src)) return { kind: "css", strong: true };
  if (!/^\s*(page|صفحه)\b/m.test(src) && /^[^\n{};=]+\{\s*[a-z-]+\s*:[^{}]*;/m.test(src) && !/\b(let|fn|function|const|var)\b/.test(src)) return { kind: "css", strong: true };
  if (/^\s*(def |class |import |from \S+ import |elif\b)|^\s*(if|for|while|else|try|except|with)\b[^\n{]*:\s*$/m.test(src)) return { kind: "python", strong: true };
  if (/[\u0600-\u06FF]/.test(src.replace(/"[^"\n]*"|'[^'\n]*'/g, ""))) return { kind: "farsi", strong: true };
  if (/\bfn\b|\bfor\s+\w+\s+from\b|^\s*page\s*\{/m.test(src)) return { kind: "jib", strong: true };
  if (/\b(const|var|function)\b|console\.|document\.|window\.|=>|\bnew\s+\w+\(|\blet\s+\w+\s*=[^\n]*;\s*$/m.test(src)) return { kind: "javascript", strong: true };
  return { kind: "jib", strong: false };
}

export function detectKind(code: string): MixKind {
  return classify(code).kind;
}

const VOID_TAGS = new Set(["meta", "link", "img", "input", "br", "hr", "source", "area", "base", "col", "embed", "param", "track", "wbr"]);

function openness(line: string): number {
  const bare = line.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`/g, '""');
  let depth = 0;
  for (const ch of bare) {
    if ("{([".includes(ch)) depth++;
    else if ("})]".includes(ch)) depth--;
  }
  return depth;
}

function tagBalance(line: string): number {
  let n = 0;
  for (const t of line.matchAll(/<(\/?)([a-z][\w-]*)\b[^<>]*?(\/?)>/gi)) {
    if (t[3] || VOID_TAGS.has(t[2].toLowerCase())) continue;
    n += t[1] ? -1 : 1;
  }
  return n;
}

// متن بدون نام زبان را به تکه‌های جدا می‌شکند: جداکننده = خط خالی در عمق صفر، وقتی خط بعدی تو رفته نیست
export function splitAuto(text: string, firstLine: number): { code: string; line: number }[] {
  const rows = text.split("\n");
  const parts: { code: string; line: number }[] = [];
  let buf: string[] = [];
  let start = firstLine;
  let depth = 0;
  let tags = 0;
  const flush = () => {
    const code = buf.join("\n");
    if (code.trim()) parts.push({ code: code + "\n", line: start });
    buf = [];
    depth = 0;
    tags = 0;
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.trim() && depth <= 0 && tags <= 0 && buf.length) {
      let k = i + 1;
      while (k < rows.length && !rows[k].trim()) k++;
      const next = rows[k] ?? "";
      if (!next || (!/^\s/.test(next) && !/^(else|elif|except|finally|catch)\b/.test(next))) {
        flush();
        start = firstLine + k;
        i = k - 1;
        continue;
      }
    }
    if (!buf.length) start = firstLine + i;
    buf.push(row);
    depth += openness(row);
    if (/^\s*</.test(buf[0])) tags += tagBalance(row); // شمارش تگ فقط وقتی تکه با < شروع شده (HTML)
  }
  flush();
  return parts;
}

// تکه‌های مبهم به بلوک قبلی می‌چسبند؛ تکه‌های هم‌زبان یکی می‌شوند
export function autoBlocks(text: string, firstLine: number): MixBlock[] {
  const guessed = splitAuto(text, firstLine).map((p) => ({ ...p, guess: classify(p.code) }));
  const blocks: MixBlock[] = [];
  let carry = "";
  let carryLine = 0;
  for (const p of guessed) {
    const prev = blocks[blocks.length - 1];
    if (!p.guess.strong) {
      if (prev) prev.code += "\n" + p.code;
      else {
        carry += p.code;
        carryLine ||= p.line;
      }
      continue;
    }
    const code = carry ? carry + "\n" + p.code : p.code;
    const line = carry ? carryLine : p.line;
    carry = "";
    carryLine = 0;
    if (prev && prev.kind === p.guess.kind) prev.code += "\n" + code;
    else blocks.push({ kind: p.guess.kind, code, line, auto: true });
  }
  if (carry) blocks.push({ kind: classify(carry).kind, code: carry, line: carryLine, auto: true });
  return blocks;
}

export function parseMix(source: string): MixParse {
  const rows = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MixBlock[] = [];
  let current: MixBlock | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const head = row.match(/^\s*@@\s*([^:]*?)\s*(?::\s?(.*))?$/);
    if (head) {
      const kind = kindOf(head[1]);
      current = { kind: kind ?? "jib", code: "", line: i + 1, auto: !kind };
      blocks.push(current);
      if (head[2] !== undefined) {
        current.code = head[2] + "\n";
        current = null; // تک‌خطی: @@ پایتون: print(1)
      }
      continue;
    }
    if (current) current.code += row + "\n";
    else if (row.trim() && !row.trim().startsWith("#")) {
      current = { kind: "jib", code: row + "\n", line: i + 1, auto: true }; // بدون نام زبان: خودکار
      blocks.push(current);
    }
  }
  const expanded = blocks.flatMap((b) => (b.auto ? autoBlocks(b.code, b.line) : [b]));
  blocks.splice(0, blocks.length, ...expanded);
  if (blocks.length === 0) return { blocks, error: "فایل خالی است. کد را بنویس؛ نام زبان لازم نیست." };
  return { blocks };
}

const MARK = "\u0001SHARED:";

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

export function wrapPython(code: string, shared: unknown): string {
  return [
    "import json as _j, base64 as _b",
    `shared = _j.loads(_b.b64decode("${b64(JSON.stringify(shared))}").decode("utf-8"))`,
    `_code = _b.b64decode("${b64(code)}").decode("utf-8")`,
    "try:",
    '    exec(compile(_code, "<mix>", "exec"), globals())',
    "finally:",
    `    print("\\x01SHARED:" + _j.dumps(shared, default=str))`,
  ].join("\n");
}

export function wrapJavaScript(code: string, shared: unknown): string {
  return `const shared = JSON.parse(${JSON.stringify(JSON.stringify(shared))});\ntry {\n${code}\n} finally { console.log("\\u0001SHARED:" + JSON.stringify(shared)); }`;
}

export type MixRunners = {
  python: (code: string, stdin: string) => Promise<RunResult>;
  javascript: (code: string) => Promise<RunResult>;
  jib: (code: string, stdin: string, farsi: boolean) => Promise<RunResult>;
  c: (code: string, stdin: string) => Promise<RunResult>;
  cpp: (code: string, stdin: string) => Promise<RunResult>;
  binary: (code: string, stdin: string) => Promise<RunResult>;
};

function takeShared(stdout: string, previous: Record<string, unknown>): { out: string; shared: Record<string, unknown> } {
  let shared = previous;
  const keep: string[] = [];
  for (const row of stdout.split("\n")) {
    if (row.startsWith(MARK)) {
      try {
        const parsed = JSON.parse(row.slice(MARK.length));
        if (parsed && typeof parsed === "object") shared = parsed as Record<string, unknown>;
      } catch {
        /* داده مشترک خراب بود؛ مقدار قبلی می‌ماند */
      }
    } else keep.push(row);
  }
  return { out: keep.join("\n").replace(/\n+$/, ""), shared };
}

export async function runMix(
  source: string,
  stdin: string,
  runners: MixRunners,
  onBlock?: (text: string) => void,
): Promise<RunResult> {
  const parsed = parseMix(source);
  if (parsed.error) return { stdout: "", stderr: parsed.error, aborted: false };
  let shared: Record<string, unknown> = {};
  const out: string[] = [];
  const result: RunResult = { stdout: "", stderr: "", aborted: false };
  const hasHtml = parsed.blocks.some((b) => b.kind === "html");
  const web = { html: "", css: "", js: "" };
  const pageCss: string[] = [];
  const DOM = /\b(document|window|canvas|getElementById|querySelector|addEventListener|requestAnimationFrame|localStorage)\b/;
  for (const block of parsed.blocks) {
    const title = `── ${MIX_NAMES[block.kind]}${block.auto ? " · تشخیص خودکار" : ""} (خط ${block.line}) ──`;
    onBlock?.(title);
    out.push(title);
    let r: RunResult;
    if (block.kind === "html") {
      web.html += block.code + "\n";
      out.push("(صفحه در پنل «صفحه» نشان داده می‌شود)");
      continue;
    }
    if (block.kind === "css" && hasHtml) {
      web.css += block.code + "\n";
      out.push("(استایل روی صفحه اعمال شد)");
      continue;
    }
    if (block.kind === "javascript" && hasHtml && DOM.test(block.code)) {
      web.js += block.code + "\n";
      out.push("(اسکریپت داخل صفحه اجرا می‌شود؛ کنسولش همین‌جا پیدا می‌شود)");
      continue;
    }
    if (block.kind === "python") r = await runners.python(wrapPython(block.code, shared), stdin);
    else if (block.kind === "javascript") r = await runners.javascript(wrapJavaScript(block.code, shared));
    else if (block.kind === "jib" || block.kind === "farsi") r = await runners.jib(block.code, stdin, block.kind === "farsi");
    else if (block.kind === "c") r = await runners.c(block.code, stdin);
    else if (block.kind === "cpp") r = await runners.cpp(block.code, stdin);
    else if (block.kind === "binary") r = await runners.binary(block.code, stdin);
    else {
      // بدون اچ‌تی‌ام‌ال، سی‌اس‌اس روی صفحهٔ جیب (page { }) اعمال می‌شود
      pageCss.push(block.code);
      out.push("(سی‌اس‌اس روی صفحهٔ جیب اعمال می‌شود)");
      continue;
    }
    const taken = takeShared(r.stdout, shared);
    shared = taken.shared;
    if (taken.out) out.push(taken.out);
    if (r.page) result.page = r.page;
    if (r.machine) result.machine = r.machine;
    if (r.aborted) {
      result.aborted = true;
      break;
    }
    if (r.stderr.trim()) {
      result.stderr = `${title}\n${r.stderr}`;
      break;
    }
  }
  if (Object.keys(shared).length) out.push(`── داده مشترک ──\n${JSON.stringify(shared)}`);
  if (hasHtml) {
    // داده‌ای که پایتون یا بلوک‌های دیگر در shared گذاشته‌اند به اسکریپت صفحه هم می‌رسد
    // window.shared در <head> تعریف می‌شود تا اسکریپت‌های داخل بلوک html هم به آن برسند
    const data = JSON.stringify(shared).replace(/</g, "\\u003c");
    result.web = { ...web, data };
  }
  const css = pageCss.join("\n").trim();
  if (css && result.page) result.page = { ...result.page, css: [result.page.css, css].filter(Boolean).join("\n") };
  result.stdout = out.join("\n");
  return result;
}
