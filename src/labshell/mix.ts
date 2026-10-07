// زبان ترکیبی: چند زبان در یک فایل. هر بلوک با «@@ نام‌زبان» شروع می‌شود.
// بلوک‌ها به ترتیب اجرا می‌شوند. پایتون و جاوااسکریپت از طریق متغیر مشترک `shared` داده رد و بدل می‌کنند.
// بلوک‌های اچ‌تی‌ام‌ال (و سی‌اس‌اس) کنار هم یک صفحه می‌سازند که در زبانهٔ «صفحه» نشان داده می‌شود؛
// داخل آن صفحه هم `shared` (دادهٔ نهایی بلوک‌ها) در دسترس است.
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
  html: "اچ‌تی‌ام‌ال",
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
  html: "html", htm: "html", "اچ‌تی‌ام‌ال": "html", "اچ_تی_ام_ال": "html", "وب": "html",
};

export function kindOf(word: string): MixKind | null {
  return ALIASES[word.trim().toLowerCase().replace(/\s+/g, "_")] ?? ALIASES[word.trim().toLowerCase()] ?? null;
}

export type MixParse = { blocks: MixBlock[]; error?: string };

// تشخیص خودکار زبان از روی خود کد (وقتی بالای کد «@@ نام» نیامده یا نام ناشناخته است)
export function detectKind(code: string): MixKind {
  const src = code.replace(/^\s*(#|\/\/).*$/gm, "").trim();
  if (!src) return "jib";
  if (/^[01\s]+$/.test(src)) return "binary";
  if (/^<(!doctype\s+html|[a-z][\w-]*)(\s[^<>]*)?\/?>/i.test(src) && /<\/[a-z][\w-]*\s*>|\/>/i.test(src)) return "html";
  if (/^\s*#\s*include\b/m.test(code)) return /iostream|std::|\bcout\b|\bclass\b|using\s+namespace/.test(code) ? "cpp" : "c";
  if (!/^\s*(page|صفحه)\b/m.test(src) && /^[^\n{};]+\{\s*[a-z-]+\s*:[^{}]*;/m.test(src) && !/\b(let|fn|function|const|var)\b/.test(src)) return "css";
  if (/^\s*(def |class |import |from \S+ import |elif\b)|^\s*(if|for|while|else|try|except|with)\b[^\n{]*:\s*$/m.test(src)) return "python";
  if (/[\u0600-\u06FF]/.test(src.replace(/"[^"\n]*"|'[^'\n]*'/g, ""))) return "farsi";
  if (/\bfn\b|\bfor\s+\w+\s+from\b|^\s*page\s*\{/m.test(src)) return "jib";
  if (/\b(const|var|function)\b|console\.|document\.|=>|;\s*$/m.test(src)) return "javascript";
  return "jib";
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
  for (const b of blocks) if (b.auto) b.kind = detectKind(b.code);
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
  const htmlParts: string[] = [];
  const cssParts: string[] = [];
  for (const block of parsed.blocks) {
    const title = `── ${MIX_NAMES[block.kind]}${block.auto ? " · تشخیص خودکار" : ""} (خط ${block.line}) ──`;
    onBlock?.(title);
    out.push(title);
    let r: RunResult;
    if (block.kind === "python") r = await runners.python(wrapPython(block.code, shared), stdin);
    else if (block.kind === "javascript") r = await runners.javascript(wrapJavaScript(block.code, shared));
    else if (block.kind === "jib" || block.kind === "farsi") r = await runners.jib(block.code, stdin, block.kind === "farsi");
    else if (block.kind === "c") r = await runners.c(block.code, stdin);
    else if (block.kind === "cpp") r = await runners.cpp(block.code, stdin);
    else if (block.kind === "binary") r = await runners.binary(block.code, stdin);
    else if (block.kind === "html") {
      htmlParts.push(block.code);
      out.push("(اچ‌تی‌ام‌ال در زبانهٔ «صفحه» نشان داده می‌شود)");
      continue;
    } else {
      cssParts.push(block.code);
      out.push("(سی‌اس‌اس روی صفحهٔ اچ‌تی‌ام‌ال یا صفحهٔ جیب اعمال می‌شود)");
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
  const css = cssParts.join("\n").trim();
  if (htmlParts.length) result.html = { body: htmlParts.join("\n"), css, shared };
  else if (css && result.page) result.page = { ...result.page, css: [result.page.css, css].filter(Boolean).join("\n") };
  if (Object.keys(shared).length) out.push(`── داده مشترک ──\n${JSON.stringify(shared)}`);
  result.stdout = out.join("\n");
  return result;
}
