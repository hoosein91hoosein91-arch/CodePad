// زبان ترکیبی: چند زبان در یک فایل. هر بلوک با «@@ نام‌زبان» شروع می‌شود.
// بلوک‌ها به ترتیب اجرا می‌شوند. پایتون و جاوااسکریپت از طریق متغیر مشترک `shared` داده رد و بدل می‌کنند.
import type { RunResult } from "@/labshell/runtime";

export type MixKind = "python" | "javascript" | "jib" | "farsi" | "c" | "cpp" | "binary" | "css";

export type MixBlock = { kind: MixKind; code: string; line: number };

export const MIX_NAMES: Record<MixKind, string> = {
  python: "پایتون",
  javascript: "جاوااسکریپت",
  jib: "جیب",
  farsi: "جیب فارسی",
  c: "سی",
  cpp: "سی‌پلاس‌پلاس",
  binary: "ماشین صفر و یک",
  css: "سی‌اس‌اس",
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
};

function kindOf(word: string): MixKind | null {
  return ALIASES[word.trim().toLowerCase().replace(/\s+/g, "_")] ?? ALIASES[word.trim().toLowerCase()] ?? null;
}

export type MixParse = { blocks: MixBlock[]; error?: string };

export function parseMix(source: string): MixParse {
  const rows = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MixBlock[] = [];
  let current: MixBlock | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const head = row.match(/^\s*@@\s*([^:\s][^:]*?)\s*(?::\s?(.*))?$/);
    if (head) {
      const kind = kindOf(head[1]);
      if (!kind) return { blocks, error: `خط ${i + 1}: زبان «${head[1]}» شناخته نشد. نمونه‌ها: پایتون، جاوااسکریپت، جیب، سی، سی‌پلاس، ماشین، سی‌اس‌اس` };
      current = { kind, code: "", line: i + 1 };
      blocks.push(current);
      if (head[2] !== undefined) {
        current.code = head[2] + "\n";
        current = null; // تک‌خطی: @@ پایتون: print(1)
      }
      continue;
    }
    if (current) current.code += row + "\n";
    else if (row.trim() && !row.trim().startsWith("#")) {
      return { blocks, error: `خط ${i + 1}: بالای هر کد باید نام زبان بیاید، مثلاً «@@ پایتون»` };
    }
  }
  if (blocks.length === 0) return { blocks, error: "هیچ بلوکی پیدا نشد. با «@@ پایتون» یا «@@ جاوااسکریپت» شروع کن." };
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
  for (const block of parsed.blocks) {
    const title = `── ${MIX_NAMES[block.kind]} (خط ${block.line}) ──`;
    onBlock?.(title);
    out.push(title);
    let r: RunResult;
    if (block.kind === "python") r = await runners.python(wrapPython(block.code, shared), stdin);
    else if (block.kind === "javascript") r = await runners.javascript(wrapJavaScript(block.code, shared));
    else if (block.kind === "jib" || block.kind === "farsi") r = await runners.jib(block.code, stdin, block.kind === "farsi");
    else if (block.kind === "c") r = await runners.c(block.code, stdin);
    else if (block.kind === "cpp") r = await runners.cpp(block.code, stdin);
    else if (block.kind === "binary") r = await runners.binary(block.code, stdin);
    else {
      out.push("(سی‌اس‌اس روی صفحهٔ زنده اعمال می‌شود)");
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
  result.stdout = out.join("\n");
  return result;
}
