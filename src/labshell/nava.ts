/**
 * «نوا»: زبان سادهٔ فارسی برای ساخت برنامه‌های تعاملی.
 * هر خط یک دستور است. کامپایلر متن را به یک درخت JSON تبدیل می‌کند و صفحه‌ای (HTML/CSS/JS) می‌سازد که آن درخت را با
 * موتور nava-runtime تفسیر می‌کند. هیچ کدی از کاربر به JavaScript تبدیل یا eval نمی‌شود؛ متن‌ها همیشه escape می‌شوند.
 */
import { navaDom, navaEngine } from "./nava-runtime.ts";

export type NavaWeb = { html: string; css: string; js: string };
export type NavaResult = { web?: NavaWeb; error?: string };

type Expr =
  | { k: "v"; v: string | number | boolean }
  | { k: "n"; n: string }
  | { k: "t"; parts: (string | Expr)[] }
  | { k: "l"; items: Expr[] }
  | { k: "i"; a: Expr; i: Expr }
  | { k: "u"; op: string; a: Expr }
  | { k: "b"; op: string; a: Expr; b: Expr }
  | { k: "c"; f: string; args: Expr[] };
type Stmt = { k: string; line: number; [key: string]: any };
type UI =
  | { k: "title" | "text"; v: string }
  | { k: "image"; src: string; alt: string }
  | { k: "input"; n: string; hint: string; type: "text" | "number" | "password" | "multi" }
  | { k: "show"; i: number; cls: "value" | "copy" | "title" }
  | { k: "button"; i: number; label: string }
  | { k: "list"; i: number }
  | { k: "canvas" | "scene"; w: number; h: number }
  | { k: "row"; items: UI[] };

export type NavaProgram = {
  title: string;
  accent: string;
  vars: { n: string; e: Expr; line: number }[];
  persist: string[];
  actions: Record<string, { params: string[]; body: Stmt[] }>;
  start: Stmt[];
  timers: { sec: Expr; body: Stmt[]; once: boolean; line: number }[];
  onTouch: Stmt[] | null;
  onKey: Stmt[] | null;
  buttons: Stmt[][];
  shows: { e: Expr; when?: Expr; line: number }[];
  lists: { n: string; del: boolean }[];
  shapes: { n: string; kind: string; color: string; at?: Expr[]; line: number }[];
  canvas: { w: number; h: number } | null;
  scene: { w: number; h: number } | null;
  images: string[];
};

/** تابع‌های آماده (داخل عبارت‌ها با پرانتز صدا زده می‌شوند) */
export const NAVA_FUNCTIONS = [
  "تصادفی", "طول", "گرد", "صحیح", "قدرمطلق", "جذر", "توان", "حداقل", "حداکثر", "جمع", "سینوس", "کسینوس", "فاصله",
  "عدد", "متن", "زمان", "ساعت", "تاریخ", "شامل", "جای", "جدا", "چسب", "خطوط", "برعکس", "مرتب", "بخش", "فایل",
];
/** کلیدواژه‌های دستورها (برای رنگ‌آمیزی و تکمیل خودکار ویرایشگر) */
export const NAVA_KEYWORDS = [
  "برنامه", "رنگ", "پس‌زمینه", "پسزمینه", "عنوان", "متن", "نمایش", "ورودی", "دکمه", "عکس", "توضیح", "فهرست", "ردیف", "بوم", "صحنه",
  "مکعب", "کره", "هرم", "زمین", "در", "عدد", "متغیر", "لیست", "ذخیره", "کنش", "هر", "ثانیه", "بعد", "از", "وقتی", "لمس", "کلید",
  "اگر", "وگرنه", "پایان", "تکرار", "بار", "برای", "تا", "افزودن", "به", "اول", "آخر", "شماره", "حذف", "خالی", "پیام", "صدا", "آهنگ",
  "بگو", "بپرس", "پاک", "دایره", "مستطیل", "خط", "نوشته", "تصویر", "بچرخان", "جابجا", "حرکت", "اندازه", "دوربین", "اجرا", "توقف",
  "ادامه", "برگرد", "نتیجه", "تابع", "و", "یا", "نه", "درست", "نادرست", "با", "رمز", "چندخطی", "زده", "شد",
];
/** واژه‌هایی که داخل عبارت معنای خاص دارند و نام متغیر نمی‌شوند */
const EXPR_WORDS = new Set(["و", "یا", "نه", "درست", "نادرست", "true", "false", "__proto__", "constructor", "prototype"]);
/** نام‌هایی که برای متغیر/کنش/ورودی مجاز نیستند (ساختار بلوک‌ها را به‌هم می‌ریزند) */
const RESERVED = new Set([...EXPR_WORDS, "اگر", "وگرنه", "پایان", "برای", "تکرار", "تا", "هر", "وقتی", "کنش", "تابع", "اجرا", "نتیجه", "برگرد", "توقف", "ادامه"]);
/** خطی که با «نام =» یا «نام +=» یا «نام[…] =» شروع می‌شود همیشه انتساب است (حتی اگر نام شبیه دستور باشد) */
const LEAD_ASSIGN = /^[\p{L}_][\p{L}\p{N}_\u200c]*\s*(?:\[.*\]\s*)?(?:\+=|-=|=(?!=))/u;
const BUILTIN_VARS = new Set(["ایکس", "ایگرگ", "کلید"]);
const DRAW_ARGS: Record<string, [number, number]> = { دایره: [3, 4], مستطیل: [4, 5], خط: [4, 6], نوشته: [3, 5], تصویر: [3, 5] };

const ID = "([\\p{L}_][\\p{L}\\p{N}_\\u200c]*)";
const IDENT = new RegExp(`^${ID}$`, "u");
const re = (src: string) => new RegExp(src.replace(/ID/g, ID), "u");
const html = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const toAscii = (t: string) => t.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/٫/g, ".");

class NavaError extends Error {
  line: number;
  constructor(line: number, message: string) {
    super(message);
    this.line = line;
  }
}
const oops = (line: number, message: string): never => {
  throw new NavaError(line, message);
};

/** متن داخل گیومه ("…"، '…' یا «…») */
function quoted(raw: string): string | null {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v) as string; } catch { return null; }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/\\(['\\])/g, "$1");
  if (v.length >= 2 && v.startsWith("«") && v.endsWith("»") && !v.slice(1, -1).includes("»")) return v.slice(1, -1);
  return null;
}

/** یک گیومهٔ کامل در ابتدای متن و باقی‌مانده */
function leadingQuoted(raw: string): [string, string] | null {
  const v = raw.trim();
  const m = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|«[^»]*»)/.exec(v);
  if (!m) return null;
  const q = quoted(m[0]);
  return q === null ? null : [q, v.slice(m[0].length).trim()];
}

/** پیمایش متن با رعایت گیومه و پرانتز؛ برای هر نویسهٔ «بیرونی» تابع را صدا می‌زند */
function scanOuter(src: string, visit: (ch: string, at: number) => boolean | void): void {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quote) {
      if (ch === "\\" && quote !== "»") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "«") { quote = "»"; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (depth === 0 && visit(ch, i) === true) return;
  }
}
function splitOuter(src: string, seps: string): string[] {
  const out: string[] = [];
  let last = 0;
  scanOuter(src, (ch, at) => { if (seps.includes(ch)) { out.push(src.slice(last, at)); last = at + 1; } });
  out.push(src.slice(last));
  return out.map((s) => s.trim());
}
function findOuter(src: string, ch: string): number {
  let found = -1;
  scanOuter(src, (c, at) => { if (c === ch) { found = at; return true; } });
  return found;
}
/** جای عملگر انتساب (= یا += یا -=)، به‌شرطی که بخشی از == و != و <= و >= نباشد */
function findAssign(src: string): { at: number; op: string } | null {
  let hit: { at: number; op: string } | null = null;
  scanOuter(src, (c, at) => {
    if (c !== "=") return;
    const prev = src[at - 1] ?? "", next = src[at + 1] ?? "";
    if (next === "=" || prev === "=" || prev === "!" || prev === "<" || prev === ">") return;
    hit = prev === "+" || prev === "-" ? { at: at - 1, op: `${prev}=` } : { at, op: "=" };
    return true;
  });
  return hit;
}

// ───────────── عبارت‌ها ─────────────
const TOKEN = /\s+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|«[^»]*»|[0-9۰-۹٠-٩]+(?:[.٫][0-9۰-۹٠-٩]+)?|[\p{L}_][\p{L}\p{N}_\u200c]*|==|!=|<=|>=|&&|\|\||[()[\],،+\-*/%<>=!×÷≠]/uy;

function tokenize(src: string, line: number): string[] {
  const out: string[] = [];
  let at = 0;
  while (at < src.length) {
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(src);
    if (!m) oops(line, `نویسهٔ «${src[at]}» را در عبارت نمی‌فهمم.`);
    at = TOKEN.lastIndex;
    if (!/^\s+$/.test(m![0])) out.push(m![0]);
  }
  return out;
}

function template(text: string, line: number): Expr {
  if (!text.includes("{")) return { k: "v", v: text };
  const parts: (string | Expr)[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{([^{}]+)\}/g)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(parseExpr(m[1]!, line));
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? { k: "v", v: parts[0] } : { k: "t", parts };
}

const LEVEL: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 3, ">": 3, "<=": 3, ">=": 3, "+": 4, "-": 4, "*": 5, "/": 5, "%": 5 };
const ALIAS: Record<string, string> = { یا: "||", و: "&&", "=": "==", "×": "*", "÷": "/", "≠": "!=" };

export function parseExpr(src: string, line: number): Expr {
  const t = tokenize(src, line);
  if (!t.length) oops(line, "اینجا یک مقدار یا عبارت لازم است.");
  let at = 0;
  const peek = () => t[at];
  const expect = (tok: string, msg: string) => { if (t[at] !== tok) oops(line, msg); at++; };
  const args = (close: string): Expr[] => {
    const list: Expr[] = [];
    if (peek() === close) { at++; return list; }
    for (;;) {
      list.push(expr(0));
      const tok = t[at++];
      if (tok === close) return list;
      if (tok !== "," && tok !== "،") oops(line, `اینجا «${close}» یا ویرگول لازم است.`);
    }
  };
  const primary = (): Expr => {
    const tok = t[at++];
    if (tok === undefined) return oops(line, "عبارت ناقص است.");
    if (tok === "(") { const e = expr(0); expect(")", "پرانتز «)» بسته نشده است."); return post(e); }
    if (tok === "[") return post({ k: "l", items: args("]") });
    if (tok === "-" || tok === "+") return { k: "u", op: tok, a: primary() };
    if (tok === "!" || tok === "نه") return { k: "u", op: "!", a: expr(2) };
    const s = quoted(tok);
    if (s !== null) return post(template(s, line));
    if (/^[0-9۰-۹٠-٩]/.test(tok)) return { k: "v", v: Number(toAscii(tok)) };
    if (tok === "درست" || tok === "true") return { k: "v", v: true };
    if (tok === "نادرست" || tok === "false") return { k: "v", v: false };
    if (IDENT.test(tok)) {
      if (peek() === "(") {
        at++;
        return post({ k: "c", f: tok, args: args(")") });
      }
      if (EXPR_WORDS.has(tok)) oops(line, `«${tok}» کلیدواژهٔ نواست و اینجا جای آن نیست.`);
      return post({ k: "n", n: tok });
    }
    return oops(line, `«${tok}» را در عبارت نمی‌فهمم.`);
  };
  const post = (e: Expr): Expr => {
    while (peek() === "[") { at++; const i = expr(0); expect("]", "کروشهٔ «]» بسته نشده است."); e = { k: "i", a: e, i }; }
    return e;
  };
  const expr = (min: number): Expr => {
    let left = primary();
    for (;;) {
      const raw = peek();
      if (raw === undefined) break;
      const op = ALIAS[raw] ?? raw;
      const level = LEVEL[op];
      if (!level || level <= min) break;
      at++;
      left = { k: "b", op, a: left, b: expr(level) };
    }
    return left;
  };
  const result = expr(0);
  if (at < t.length) oops(line, `بخش «${t.slice(at).join(" ")}» در عبارت اضافه یا نامفهوم است.`);
  return result;
}

const parseArgs = (src: string, line: number) => splitOuter(src, ",،").filter((s, i, all) => s || all.length > 1).map((s) => {
  if (!s) oops(line, "بین ویرگول‌ها یک مقدار لازم است.");
  return parseExpr(s, line);
});

// ───────────── خط‌ها و بلوک‌ها ─────────────
type Row = { text: string; n: number };

export function parseNava(source: string): { program?: NavaProgram; error?: string } {
  try {
    return { program: new Parser(source).program() };
  } catch (e) {
    if (e instanceof NavaError) return { error: `خط ${e.line}: ${e.message}` };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

class Parser {
  rows: Row[];
  at = 0;
  P: NavaProgram = { title: "برنامهٔ من", accent: "#c6f135", vars: [], persist: [], actions: {}, start: [], timers: [], onTouch: null, onKey: null, buttons: [], shows: [], lists: [], shapes: [], canvas: null, scene: null, images: [] };
  background = "#101410";
  ui: UI[] = [];
  globals = new Map<string, number>();
  persistLines = new Map<string, number>();
  actionLines = new Map<string, number>();
  listLines: [string, number][] = [];

  constructor(source: string) {
    this.rows = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").map((text, i) => ({ text: text.trim(), n: i + 1 }));
  }

  next(): Row | null {
    while (this.at < this.rows.length) {
      const row = this.rows[this.at++]!;
      if (row.text && !row.text.startsWith("#") && !row.text.startsWith("//")) return row;
    }
    return null;
  }

  declare(name: string, n: number) {
    if (!IDENT.test(name) || RESERVED.has(name) || BUILTIN_VARS.has(name)) oops(n, `«${name}» نام مناسبی برای متغیر نیست (کلیدواژه یا نام آماده است).`);
    if (this.globals.has(name)) oops(n, `متغیر «${name}» قبلاً در خط ${this.globals.get(name)} ساخته شده است.`);
    this.globals.set(name, n);
  }

  program(): NavaProgram {
    for (let row = this.next(); row; row = this.next()) this.top(row);
    if (!this.ui.length) oops(this.rows.length || 1, "برنامه چیزی برای نمایش ندارد. یک «عنوان»، «متن»، «دکمه» یا «بوم» اضافه کن.");
    this.check();
    return this.P;
  }

  /** یک خط در بیرونی‌ترین سطح برنامه */
  top(row: Row) {
    const { text, n } = row;
    let m: RegExpExecArray | null;
    if (LEAD_ASSIGN.test(text)) { this.P.start.push(...this.statement(row, true)); return; }
    if ((m = /^برنامه\s+(.+)$/u.exec(text))) {
      const v = quoted(m[1]!); if (v === null) oops(n, 'نام برنامه را داخل گیومه بنویس؛ مثل برنامه "شمارنده".'); this.P.title = v!; return;
    }
    if ((m = /^پس[‌]?زمینه\s+(.+)$/u.exec(text))) {
      const v = quoted(m[1]!) ?? m[1]!.trim();
      if (!/^(#[\da-f]{3,8}|[a-z]{3,20})$/i.test(v)) oops(n, "رنگ پس‌زمینه معتبر نیست؛ مثل پس‌زمینه #101410 یا black.");
      this.background = v; return;
    }
    if ((m = /^رنگ\s+(.+)$/u.exec(text))) {
      const v = quoted(m[1]!) ?? m[1]!.trim();
      if (!/^(#[\da-f]{3,8}|[a-z]{3,20})$/i.test(v)) oops(n, "رنگ باید نام رنگ انگلیسی یا کد HEX باشد؛ مثل رنگ #67f5a5.");
      this.P.accent = v; return;
    }
    if ((m = re("^(عدد|متغیر|لیست)\\s+ID(?:\\s*=\\s*(.+))?$").exec(text))) {
      this.declare(m[2]!, n);
      this.P.vars.push({ n: m[2]!, e: this.initial(m[1]!, m[3], n), line: n });
      return;
    }
    if ((m = /^ذخیره\s+(.+)$/u.exec(text))) {
      for (const name of splitOuter(m[1]!, ",،").flatMap((s) => s.split(/\s+/)).filter(Boolean)) {
        if (!IDENT.test(name)) oops(n, `«${name}» نام متغیر نیست؛ مثل: ذخیره امتیاز، کارها`);
        if (!this.P.persist.includes(name)) { this.P.persist.push(name); this.persistLines.set(name, n); }
      }
      return;
    }
    if ((m = re("^(کنش|تابع)\\s+ID(?:\\s+با\\s+([^:]+?))?\\s*(?::\\s*(.*))?$").exec(text))) {
      const name = m[2]!;
      if (RESERVED.has(name) || NAVA_FUNCTIONS.includes(name) || BUILTIN_VARS.has(name)) oops(n, `«${name}» نام مناسبی برای ${m[1]} نیست (کلیدواژه یا تابع آماده است).`);
      if (this.actionLines.has(name)) oops(n, `«${name}» قبلاً در خط ${this.actionLines.get(name)} تعریف شده است.`);
      const params = m[3] ? splitOuter(m[3], ",،").flatMap((x) => x.split(/\s+/)).filter(Boolean) : [];
      for (const p of params) if (!IDENT.test(p) || RESERVED.has(p)) oops(n, `«${p}» نام مناسبی برای ورودیِ ${m[1]} نیست.`);
      if (new Set(params).size !== params.length) oops(n, "نام ورودی‌ها تکراری است.");
      this.actionLines.set(name, n);
      this.P.actions[name] = { params, body: m[4] ? this.inline(m[4], n) : this.block(m[1]!, n) };
      return;
    }
    if ((m = /^(هر|بعد\s+از)\s+(.+?)\s+ثانیه\s*(?::\s*(.*))?$/u.exec(text))) {
      const body = m[3] ? this.inline(m[3], n) : this.block(m[1] === "هر" ? "هر … ثانیه" : "بعد از … ثانیه", n);
      this.P.timers.push({ sec: parseExpr(m[2]!, n), body, once: m[1] !== "هر", line: n });
      return;
    }
    if ((m = /^وقتی\s+(لمس|کلید)(?:\s+(?:شد|زده\s+شد))?\s*(?::\s*(.*))?$/u.exec(text))) {
      const which = m[1] === "لمس" ? "onTouch" : "onKey";
      if (this.P[which]) oops(n, `«وقتی ${m[1]}» فقط یک بار نوشته می‌شود.`);
      this.P[which] = m[2] ? this.inline(m[2], n) : this.block(`وقتی ${m[1]}`, n);
      return;
    }
    if ((m = re("^(مکعب|کره|هرم|زمین)\\s+ID(?:\\s+(.+?))?(?:\\s+در\\s+(.+))?$").exec(text))) {
      const color = m[3] ? quoted(m[3]) ?? m[3].trim() : m[1] === "زمین" ? "#1f3a2c" : this.P.accent;
      if (!/^(#[\da-f]{3,8}|[a-z]{3,20})$/i.test(color)) oops(n, `رنگ شکل را مثل "#ff85aa" یا "red" بنویس.`);
      if (this.P.shapes.some((s) => s.n === m![2])) oops(n, `شکلی به نام «${m[2]}» از قبل هست.`);
      const at = m[4] ? parseArgs(m[4], n) : undefined;
      if (at && at.length !== 3) oops(n, "جای شکل سه عدد می‌خواهد: در x، y، z");
      this.P.shapes.push({ n: m[2]!, kind: m[1]!, color, at, line: n });
      return;
    }
    const item = this.uiItem(row);
    if (item) { this.ui.push(item); return; }
    this.P.start.push(...this.statement(row, true));
  }

  initial(kind: string, raw: string | undefined, n: number): Expr {
    if (raw === undefined || !raw.trim()) return kind === "لیست" ? { k: "l", items: [] } : kind === "عدد" ? { k: "v", v: 0 } : { k: "v", v: "" };
    const e = parseExpr(raw, n);
    if (kind === "لیست" && e.k !== "l" && e.k !== "c" && e.k !== "n") oops(n, "مقدار لیست را داخل کروشه بنویس؛ مثل لیست میوه‌ها = [\"سیب\"، \"موز\"]");
    return e;
  }

  /** اجزای صفحه؛ اگر خط جزء صفحه نباشد null */
  uiItem(row: Row): UI | null {
    const { text, n } = row;
    let m: RegExpExecArray | null;
    if ((m = /^(عنوان|متن)\s+(.+)$/u.exec(text))) {
      const v = quoted(m[2]!);
      if (v === null) oops(n, `${m[1]} را داخل گیومه بنویس؛ مثل ${m[1]} "سلام".`);
      if (v!.includes("{")) return this.show(template(v!, n), undefined, n, m[1] === "عنوان" ? "title" : "copy");
      return { k: m[1] === "عنوان" ? "title" : "text", v: v! };
    }
    if ((m = /^عکس\s+(.+)$/u.exec(text))) {
      const first = leadingQuoted(m[1]!);
      if (!first) oops(n, 'نام یا نشانی عکس را داخل گیومه بنویس؛ مثل عکس "گل.png".');
      let alt = "تصویر برنامه";
      if (first![1]) {
        const am = /^توضیح\s+(.+)$/u.exec(first![1]);
        const q = am ? quoted(am[1]!) : null;
        if (q === null) oops(n, 'بعد از عکس فقط «توضیح "…"» می‌آید.');
        alt = q!;
      }
      return { k: "image", src: first![0], alt };
    }
    if ((m = re("^ورودی\\s+ID\\s+(.+)$").exec(text))) {
      const name = m[1]!;
      const lead = leadingQuoted(m[2]!);
      if (!lead) oops(n, 'راهنمای ورودی را داخل گیومه بنویس؛ مثل ورودی نام "نامت را بنویس"');
      const kinds: Record<string, "text" | "number" | "password" | "multi"> = { "": "text", عدد: "number", عددی: "number", رمز: "password", چندخطی: "multi" };
      const type = kinds[lead![1]];
      if (!type) oops(n, "نوع ورودی می‌تواند «عدد»، «رمز» یا «چندخطی» باشد.");
      this.declare(name, n);
      this.P.vars.push({ n: name, e: { k: "v", v: type === "number" ? 0 : "" }, line: n });
      return { k: "input", n: name, hint: lead![0], type: type! };
    }
    if ((m = /^نمایش\s+(.+)$/u.exec(text))) {
      const raw = m[1]!;
      const lead = leadingQuoted(raw);
      let e: Expr, when: Expr | undefined;
      if (lead && (!lead[1] || /^اگر\s/u.test(lead[1]))) {
        e = template(lead[0], n);
        if (lead[1]) when = parseExpr(lead[1].replace(/^اگر\s+/u, ""), n);
      } else {
        const cut = / اگر /u.exec(raw);
        e = parseExpr(cut ? raw.slice(0, cut.index) : raw, n);
        if (cut) when = parseExpr(raw.slice(cut.index + cut[0].length), n);
      }
      return this.show(e, when, n, "value");
    }
    if ((m = /^دکمه\s+(.+)$/u.exec(text))) {
      const lead = leadingQuoted(m[1]!);
      if (!lead) oops(n, 'متن دکمه را داخل گیومه بنویس؛ مثل دکمه "افزایش": شمارنده += ۱');
      const rest = lead![1].replace(/^وقتی\s+زده\s+شد\s*/u, "");
      let body: Stmt[];
      if (!rest) body = this.block("دکمه", n);
      else if (rest.startsWith(":")) body = rest.slice(1).trim() ? this.inline(rest.slice(1), n) : this.block("دکمه", n);
      else return oops(n, 'بعد از متن دکمه «:» و کار دکمه را بنویس؛ مثل دکمه "افزایش": شمارنده += ۱');
      this.P.buttons.push(body);
      return { k: "button", i: this.P.buttons.length - 1, label: lead![0] };
    }
    if ((m = re("^فهرست\\s+ID(\\s+با\\s+حذف)?$").exec(text))) {
      this.P.lists.push({ n: m[1]!, del: !!m[2] });
      this.listLines.push([m[1]!, n]);
      return { k: "list", i: this.P.lists.length - 1 };
    }
    if ((m = /^(بوم|صحنه)(?:\s+(.+))?$/u.exec(text))) {
      const which = m[1] === "بوم" ? "canvas" : "scene";
      if (this.P[which]) oops(n, `هر برنامه فقط یک «${m[1]}» دارد.`);
      const size = m[2] ? splitOuter(m[2], ",،").map((s) => Number(toAscii(s))) : [320, 320];
      if (size.length !== 2 || size.some((x) => !Number.isFinite(x) || x < 40 || x > 2000)) oops(n, `اندازهٔ ${m[1]} دو عدد بین ۴۰ تا ۲۰۰۰ است؛ مثل ${m[1]} ۳۲۰، ۳۲۰`);
      this.P[which] = { w: size[0]!, h: size[1]! };
      return { k: which, w: size[0]!, h: size[1]! };
    }
    if (/^ردیف\s*:?$/u.test(text)) {
      const items: UI[] = [];
      for (;;) {
        const r = this.next();
        if (!r) oops(n, "«ردیف» که اینجا باز شد «پایان» ندارد.");
        if (/^پایان(\s|$)/u.test(r!.text)) break;
        const item = this.uiItem(r!);
        if (!item || item.k === "row") oops(r!.n, "داخل «ردیف» فقط دکمه، نمایش، متن، عکس یا ورودی می‌آید.");
        items.push(item!);
      }
      if (!items.length) oops(n, "«ردیف» خالی است.");
      return { k: "row", items };
    }
    return null;
  }

  show(e: Expr, when: Expr | undefined, n: number, cls: "value" | "copy" | "title"): UI {
    this.P.shows.push({ e, when, line: n });
    return { k: "show", i: this.P.shows.length - 1, cls };
  }

  /** بدنهٔ یک بلوک تا «پایان» */
  block(name: string, openLine: number): Stmt[] {
    const res = this.until(name, openLine, false);
    return res.body;
  }

  until(name: string, openLine: number, allowElse: boolean): { body: Stmt[]; end: Row } {
    const body: Stmt[] = [];
    for (;;) {
      const row = this.next();
      if (!row) return oops(openLine, `بلوک «${name}» که در خط ${openLine} باز شد «پایان» ندارد.`);
      if (/^پایان(\s|$)/u.test(row.text)) return { body, end: row };
      if (/^وگرنه(\s|:|$)/u.test(row.text)) {
        if (allowElse) return { body, end: row };
        oops(row.n, "«وگرنه» فقط داخل بلوک «اگر» می‌آید.");
      }
      body.push(...this.statement(row, false));
    }
  }

  /** چند دستور در یک خط (بعد از «:»)، جداشده با «؛» */
  inline(src: string, n: number): Stmt[] {
    return splitOuter(src, "؛;").filter(Boolean).flatMap((text) => this.statement({ text, n }, false, true));
  }

  /** یک دستور اجرایی؛ ممکن است چند خط بعدی را هم بخواند (بلوک) */
  statement(row: Row, atTop: boolean, inlineOnly = false): Stmt[] {
    const { n } = row;
    let text = row.text;
    let m: RegExpExecArray | null;
    // سرآیند بلوک با «:» و بدنهٔ یک‌خطی
    const colon = findOuter(text, ":");
    let inlineBody: string | null = null;
    if (colon >= 0) {
      inlineBody = text.slice(colon + 1).trim();
      text = text.slice(0, colon).trim();
    }
    const body = (name: string): Stmt[] => {
      if (inlineBody) return this.inline(inlineBody, n);
      if (inlineOnly) return oops(n, `«${name}» یک‌خطی، بعد از «:» دستور می‌خواهد.`);
      return this.block(name, n);
    };
    if (LEAD_ASSIGN.test(text) && inlineBody === null) return [this.assignment(text, n)];
    const simple = (s: Stmt): Stmt[] => {
      if (inlineBody !== null) oops(n, "«:» فقط بعد از اگر، تکرار، برای، تا وقتی، دکمه، کنش، هر … ثانیه و وقتی می‌آید.");
      return [s];
    };

    if ((m = /^اگر\s+(.+)$/u.exec(text))) {
      const node: Stmt = { k: "if", line: n, br: [{ c: parseExpr(m[1]!, n), body: [] }], els: null };
      if (inlineBody) { node.br[0].body = this.inline(inlineBody, n); return [node]; }
      if (inlineOnly) oops(n, "«اگر» یک‌خطی، بعد از «:» دستور می‌خواهد.");
      let res = this.until("اگر", n, true);
      node.br[0].body = res.body;
      for (;;) {
        const endText = res.end.text.replace(/:\s*$/, "");
        if (/^پایان/u.test(endText)) break;
        const elif = /^وگرنه\s+اگر\s+(.+)$/u.exec(endText);
        if (elif) {
          const br = { c: parseExpr(elif[1]!, res.end.n), body: [] as Stmt[] };
          res = this.until("وگرنه اگر", res.end.n, true);
          br.body = res.body;
          node.br.push(br);
          continue;
        }
        if (endText !== "وگرنه") oops(res.end.n, "بعد از «وگرنه» یا «اگر …» می‌آید یا هیچ.");
        if (node.els) oops(res.end.n, "هر «اگر» فقط یک «وگرنه» دارد.");
        res = this.until("وگرنه", res.end.n, false);
        node.els = res.body;
        break;
      }
      return [node];
    }
    if ((m = re("^تکرار\\s+(.+?)(?:\\s+بار)?(?:\\s+با\\s+ID)?$").exec(text))) {
      return [{ k: "rep", line: n, n: parseExpr(m[1]!, n), v: m[2] ?? null, body: body("تکرار") }];
    }
    if ((m = re("^برای\\s+هر\\s+ID\\s+در\\s+(.+)$").exec(text))) {
      return [{ k: "each", line: n, v: m[1]!, e: parseExpr(m[2]!, n), body: body("برای هر") }];
    }
    if ((m = re("^برای\\s+ID\\s+از\\s+(.+?)\\s+تا\\s+(.+)$").exec(text))) {
      return [{ k: "for", line: n, v: m[1]!, from: parseExpr(m[2]!, n), to: parseExpr(m[3]!, n), body: body("برای") }];
    }
    if ((m = /^تا\s+وقتی(?:\s+که)?\s+(.+)$/u.exec(text))) {
      return [{ k: "while", line: n, c: parseExpr(m[1]!, n), body: body("تا وقتی") }];
    }
    if (/^(کنش|هر|بعد\s+از|وقتی|عنوان|متن|نمایش|ورودی|دکمه|عکس|فهرست|ردیف|بوم|صحنه|مکعب|کره|هرم|زمین|برنامه|رنگ|پس‌زمینه|ذخیره|تابع)(\s|$)/u.test(text)) {
      const word = text.split(/\s+/)[0];
      return oops(n, `«${word}» فقط در سطح بیرونی برنامه (نه داخل بلوک یا بعد از «:») نوشته می‌شود.`);
    }
    if (inlineBody !== null && inlineBody !== "") {
      // «:» داخل یک دستور ساده (مثلاً داخل متن بدون گیومه) معنا ندارد
      return oops(n, "«:» فقط بعد از اگر، تکرار، برای، تا وقتی، دکمه، کنش، هر … ثانیه و وقتی می‌آید.");
    }
    if ((m = re("^(عدد|متغیر|لیست)\\s+ID(?:\\s*=\\s*(.+))?$").exec(text))) {
      if (atTop) oops(n, "متغیر سراسری را بیرون از بلوک بساز."); // (در سطح بیرونی بالاتر بررسی شده)
      if (RESERVED.has(m[2]!) || BUILTIN_VARS.has(m[2]!)) oops(n, `«${m[2]}» نام مناسبی برای متغیر نیست.`);
      return simple({ k: "let", line: n, n: m[2]!, e: this.initial(m[1]!, m[3], n) });
    }
    if ((m = re("^افزودن\\s+(.+?)\\s+به\\s+(اول\\s+)?ID$").exec(text))) return simple({ k: "push", line: n, n: m[3]!, e: parseExpr(m[1]!, n), front: !!m[2] });
    if ((m = re("^حذف\\s+(اول|آخر)\\s+از\\s+ID$").exec(text))) return simple({ k: "del", line: n, n: m[2]!, which: m[1] === "اول" ? "first" : "last" });
    if ((m = re("^حذف\\s+شماره\\s+(.+?)\\s+از\\s+ID$").exec(text))) return simple({ k: "del", line: n, n: m[2]!, which: "at", e: parseExpr(m[1]!, n) });
    if ((m = re("^حذف\\s+(.+?)\\s+از\\s+ID$").exec(text))) return simple({ k: "del", line: n, n: m[2]!, which: "value", e: parseExpr(m[1]!, n) });
    if ((m = re("^خالی\\s+ID$").exec(text))) return simple({ k: "clear", line: n, n: m[1]! });
    if ((m = /^پیام\s+(.+)$/u.exec(text))) return simple({ k: "msg", line: n, e: parseExpr(m[1]!, n) });
    if ((m = /^بگو\s+(.+)$/u.exec(text))) return simple({ k: "say", line: n, e: parseExpr(m[1]!, n) });
    if ((m = /^صدا\s+(.+)$/u.exec(text))) {
      const a = parseArgs(m[1]!, n);
      if (a.length > 2) oops(n, "صدا: یک عدد (فرکانس) و یک مدت اختیاری؛ مثل صدا ۸۸۰، ۱۰۰ — یا نام فایل صوتی پیوست.");
      return simple({ k: "tone", line: n, a });
    }
    if ((m = /^آهنگ\s+(.+)$/u.exec(text))) return simple({ k: "melody", line: n, a: parseArgs(m[1]!, n) });
    if ((m = re("^بپرس\\s+ID\\s*=\\s*(.+)$").exec(text))) return simple({ k: "ask", line: n, n: m[1]!, e: parseExpr(m[2]!, n) });
    if ((m = /^پاک(?:\s+(.+))?$/u.exec(text))) return simple({ k: "draw", line: n, op: "پاک", a: m[1] ? parseArgs(m[1], n) : [] });
    if ((m = /^(دایره|مستطیل|خط|نوشته|تصویر)\s+(.+)$/u.exec(text))) {
      const a = parseArgs(m[2]!, n);
      const [lo, hi] = DRAW_ARGS[m[1]!]!;
      const hint: Record<string, string> = { دایره: "دایره x، y، شعاع، رنگ", مستطیل: "مستطیل x، y، پهنا، بلندی، رنگ", خط: "خط x1، y1، x2، y2، رنگ، ضخامت", نوشته: 'نوشته "متن"، x، y، رنگ، اندازه', تصویر: 'تصویر "عکس.png"، x، y، پهنا، بلندی' };
      if (a.length < lo || a.length > hi) oops(n, `تعداد مقدارها درست نیست؛ الگو: ${hint[m[1]!]}`);
      return simple({ k: "draw", line: n, op: m[1]!, a });
    }
    if ((m = re("^(بچرخان|جابجا|حرکت)\\s+ID\\s+(.+)$").exec(text))) {
      const a = parseArgs(m[3]!, n);
      if (a.length !== 3) oops(n, `${m[1]} سه عدد می‌خواهد؛ مثل ${m[1]} ${m[2]} ۱، ۲، ۰`);
      return simple({ k: "obj", line: n, op: m[1]!, n: m[2]!, a });
    }
    if ((m = re("^اندازه\\s+ID\\s+(.+)$").exec(text))) return simple({ k: "obj", line: n, op: "اندازه", n: m[1]!, a: [parseExpr(m[2]!, n)] });
    if ((m = /^دوربین\s+(.+)$/u.exec(text))) return simple({ k: "cam", line: n, e: parseExpr(m[1]!, n) });
    if (text === "توقف") return simple({ k: "stop", line: n });
    if (text === "ادامه") return simple({ k: "resume", line: n });
    if (text === "برگرد") return simple({ k: "ret", line: n });
    if ((m = /^نتیجه\s+(.+)$/u.exec(text))) return simple({ k: "ret", line: n, e: parseExpr(m[1]!, n) });
    if ((m = re("^اجرا\\s+ID(?:\\s+(.+))?$").exec(text))) return simple({ k: "call", line: n, n: m[1]!, a: m[2] ? parseArgs(m[2], n) : [] });
    if (findAssign(text)) return simple(this.assignment(text, n));
    if (IDENT.test(text)) return simple({ k: "call", line: n, n: text, a: [] });
    return oops(n, "این دستور را نمی‌شناسم. راهنمای نوا (NAVA-GUIDE.md) همهٔ دستورها را با مثال دارد.");
  }

  assignment(text: string, n: number): Stmt {
    const assign = findAssign(text)!;
    const lhs = text.slice(0, assign.at).trim();
    const rhs = text.slice(assign.at + assign.op.length).trim();
    if (!rhs) oops(n, `بعد از «${assign.op}» مقدار را بنویس.`);
    const target = parseExpr(lhs, n);
    const idx: Expr[] = [];
    let base: Expr = target;
    while (base.k === "i") { idx.unshift(base.i); base = base.a; }
    if (base.k !== "n") oops(n, "سمت چپ «=» باید نام یک متغیر یا خانهٔ لیست باشد؛ مثل امتیاز = ۰ یا کارها[۱] = \"نان\"");
    return { k: "set", line: n, n: (base as { n: string }).n, idx, op: assign.op, e: parseExpr(rhs, n) };
  }

  // ───────────── بررسی نام‌ها ─────────────
  check() {
    const P = this.P;
    const globals = new Set(this.globals.keys());
    const shapes = new Set(P.shapes.map((s) => s.n));
    for (const [name, line] of this.persistLines) if (!globals.has(name)) oops(line, `«${name}» برای ذخیره باید یک متغیر یا لیستِ تعریف‌شده باشد.`);
    for (const [name, line] of this.listLines) if (!globals.has(name)) oops(line, `لیست «${name}» تعریف نشده است؛ اول بنویس: لیست ${name}`);
    for (const name of Object.keys(P.actions)) if (globals.has(name)) oops(this.actionLines.get(name)!, `«${name}» هم نام متغیر است و هم نام کنش؛ یکی را عوض کن.`);
    const visible = (name: string, scopes: Set<string>[]) => globals.has(name) || BUILTIN_VARS.has(name) || scopes.some((s) => s.has(name));
    const expr = (e: Expr, scopes: Set<string>[], line: number): void => {
      switch (e.k) {
        case "n": if (!visible(e.n, scopes)) oops(line, P.actions[e.n] ? `«${e.n}» کنش است نه مقدار؛ برای اجرایش بنویس: اجرا ${e.n}` : `متغیر «${e.n}» پیش از استفاده تعریف نشده است.`); break;
        case "t": for (const p of e.parts) if (typeof p !== "string") expr(p, scopes, line); break;
        case "l": e.items.forEach((x) => expr(x, scopes, line)); break;
        case "i": expr(e.a, scopes, line); expr(e.i, scopes, line); break;
        case "u": expr(e.a, scopes, line); break;
        case "b": expr(e.a, scopes, line); expr(e.b, scopes, line); break;
        case "c":
          if (!NAVA_FUNCTIONS.includes(e.f) && !P.actions[e.f]) oops(line, `تابع «${e.f}» را نمی‌شناسم. تابع‌های آمادهٔ نوا: ${NAVA_FUNCTIONS.join("، ")}`);
          if (P.actions[e.f] && P.actions[e.f]!.params.length !== e.args.length) oops(line, `«${e.f}» ${P.actions[e.f]!.params.length} ورودی می‌خواهد، نه ${e.args.length}.`);
          e.args.forEach((x) => expr(x, scopes, line));
          if (e.f === "فایل" && e.args[0]?.k === "v") P.images.push(String(e.args[0].v)); break;
      }
    };
    const need = (name: string, scopes: Set<string>[], line: number) => {
      if (!visible(name, scopes)) oops(line, `متغیر «${name}» تعریف نشده است؛ اول بیرون از بلوک‌ها بسازش، مثل: متغیر ${name} = ۰`);
    };
    const body = (list: Stmt[], scopes: Set<string>[]): void => {
      const own = new Set<string>();
      const inner = [...scopes, own];
      for (const s of list) {
        const L = s.line;
        const E = (e: Expr) => expr(e, inner, L);
        switch (s.k) {
          case "let": E(s.e); own.add(s.n); break;
          case "set": need(s.n, inner, L); s.idx.forEach(E); E(s.e); break;
          case "if": for (const br of s.br) { E(br.c); body(br.body, inner); } if (s.els) body(s.els, inner); break;
          case "rep": E(s.n); body(s.body, s.v ? [...inner, new Set([s.v])] : inner); break;
          case "each": E(s.e); body(s.body, [...inner, new Set([s.v])]); break;
          case "for": E(s.from); E(s.to); body(s.body, [...inner, new Set([s.v])]); break;
          case "while": E(s.c); body(s.body, inner); break;
          case "push": case "del": case "clear": need(s.n, inner, L); if (s.e) E(s.e); break;
          case "msg": case "say": case "cam": E(s.e); if (s.k === "cam" && !P.scene) oops(L, "«دوربین» برای صحنهٔ سه‌بعدی است؛ اول بنویس: صحنه"); break;
          case "tone": case "melody": s.a.forEach(E); break;
          case "ask": if (!globals.has(s.n)) oops(L, `جواب «بپرس» باید در یک متغیر سراسری ریخته شود؛ بیرون از بلوک‌ها بنویس: متغیر ${s.n} = ""`); E(s.e); break;
          case "draw":
            if (!P.canvas) oops(L, "برای نقاشی اول یک «بوم» بساز؛ مثل: بوم ۳۲۰، ۳۲۰");
            s.a.forEach(E);
            if (s.op === "تصویر" && s.a[0]?.k === "v") P.images.push(String(s.a[0].v));
            break;
          case "obj":
            if (!P.scene) oops(L, `«${s.op}» برای شکل‌های سه‌بعدی است؛ اول بنویس: صحنه`);
            if (!shapes.has(s.n)) oops(L, `شکل «${s.n}» تعریف نشده است؛ مثل: مکعب ${s.n} "#67f5a5"`);
            s.a.forEach(E);
            break;
          case "call":
            if (!P.actions[s.n]) oops(L, visible(s.n, inner) ? `«${s.n}» متغیر است؛ برای تغییرش بنویس ${s.n} = …` : `دستور یا کنش «${s.n}» را نمی‌شناسم.`);
            if (P.actions[s.n]!.params.length !== s.a.length) oops(L, `«${s.n}» ${P.actions[s.n]!.params.length} ورودی می‌خواهد، نه ${s.a.length}؛ مثل: اجرا ${s.n} ${P.actions[s.n]!.params.join("، ")}`);
            s.a.forEach(E);
            break;
          case "ret": if (s.e) E(s.e); break;
        }
      }
    };
    for (const v of P.vars) expr(v.e, [], v.line);
    for (const sh of P.shapes) { sh.at?.forEach((e) => expr(e, [], sh.line)); if (!P.scene) oops(sh.line, `برای «${sh.kind}» اول یک «صحنه» بساز؛ مثل: صحنه ۳۲۰، ۳۲۰`); }
    for (const s of P.shows) { expr(s.e, [], s.line); if (s.when) expr(s.when, [], s.line); }
    body(P.start, []);
    Object.values(P.actions).forEach((a) => body(a.body, a.params.length ? [new Set(a.params)] : []));
    P.timers.forEach((t) => { expr(t.sec, [], t.line); body(t.body, []); });
    P.buttons.forEach((b) => body(b, []));
    if (P.onTouch) { if (!P.canvas && !P.scene) oops(1, "«وقتی لمس» برای «بوم» یا «صحنه» است."); body(P.onTouch, []); }
    if (P.onKey) body(P.onKey, []);
    P.images = [...new Set(P.images)];
  }
}

// ───────────── ساخت صفحه ─────────────
function uiHtml(item: UI): string {
  switch (item.k) {
    case "title": return `<h1>${html(item.v)}</h1>`;
    case "text": return `<p class="nv-copy">${html(item.v)}</p>`;
    case "image": return `<img class="nv-image" src="${html(item.src)}" alt="${html(item.alt)}">`;
    case "input": {
      const common = `class="nv-input" data-nv-input="${html(item.n)}" data-nv-type="${item.type}" placeholder="${html(item.hint)}" aria-label="${html(item.hint)}"`;
      if (item.type === "multi") return `<textarea ${common} rows="3"></textarea>`;
      if (item.type === "password") return `<input type="password" ${common}>`;
      if (item.type === "number") return `<input type="text" inputmode="decimal" ${common}>`;
      return `<input type="text" ${common}>`;
    }
    case "show": return item.cls === "title" ? `<h1 data-nv-show="${item.i}"></h1>` : `<p class="nv-${item.cls}" data-nv-show="${item.i}"></p>`;
    case "button": return `<button type="button" class="nv-button" data-nv-btn="${item.i}">${html(item.label)}</button>`;
    case "list": return `<ul class="nv-list" data-nv-list="${item.i}"></ul>`;
    case "canvas": return `<canvas id="nv-canvas" class="nv-canvas" style="aspect-ratio:${item.w}/${item.h};max-width:${item.w * 2}px" aria-label="بوم"></canvas>`;
    case "scene": return `<canvas id="nv-scene" class="nv-canvas nv-scene" style="aspect-ratio:${item.w}/${item.h};max-width:${item.w * 2}px" aria-label="صحنهٔ سه‌بعدی"></canvas>`;
    case "row": return `<div class="nv-row">${item.items.map(uiHtml).join("")}</div>`;
  }
}

const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function compileNava(source: string): NavaResult {
  let parser: Parser;
  let P: NavaProgram;
  try {
    parser = new Parser(source);
    P = parser.program();
  } catch (e) {
    if (e instanceof NavaError) return { error: `خط ${e.line}: ${e.message}` };
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const accent = P.accent, background = parser.background;
  const webHtml = `<main class="nv-app"><div class="nv-card"><div class="nv-brand">${html(P.title)}</div>\n${parser.ui.map(uiHtml).join("\n")}\n<div class="nv-error" role="alert" hidden></div></div><div class="nv-toast" role="status" hidden></div></main>`;
  const css = `:root{color-scheme:dark}*{box-sizing:border-box}[hidden]{display:none!important}html,body{margin:0;min-height:100%;background:${background};color:#edf4ed;font-family:Vazirmatn,Tahoma,sans-serif}body{min-height:100vh;background:radial-gradient(ellipse at 50% -20%,color-mix(in srgb,${accent} 15%,${background}),${background} 65%)}.nv-app{min-height:100vh;display:grid;place-items:center;padding:20px}.nv-card{width:min(100%,460px);padding:24px;border:1px solid #ffffff20;border-radius:28px;background:#171e19ef;box-shadow:0 24px 80px #0008;display:flex;flex-direction:column;gap:14px}.nv-brand{color:${accent};font-size:12px;letter-spacing:.08em}h1{font-size:26px;line-height:1.4;margin:0}.nv-copy{color:#b8c6ba;line-height:1.9;margin:0;white-space:pre-wrap}.nv-value{font-size:22px;font-weight:700;margin:2px 0;white-space:pre-wrap;line-height:1.7}.nv-input{width:100%;padding:13px 15px;border:1px solid #ffffff25;border-radius:14px;background:#0e130f;color:#fff;font:inherit;outline:none;resize:vertical}.nv-input:focus{border-color:${accent};box-shadow:0 0 0 3px color-mix(in srgb,${accent} 22%,transparent)}.nv-button{min-height:48px;padding:11px 16px;border:0;border-radius:14px;background:${accent};color:#11170e;font:inherit;font-weight:700;cursor:pointer;transition:transform .15s,filter .15s;touch-action:manipulation}.nv-button:active{transform:scale(.97);filter:brightness(.9)}.nv-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.nv-row>*{flex:1 1 0;min-width:0}.nv-image{width:100%;max-height:260px;object-fit:cover;border-radius:18px}.nv-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.nv-list li{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:#0e130f;border:1px solid #ffffff14}.nv-list li span{flex:1;overflow-wrap:anywhere}.nv-list .nv-empty{color:#7f8f82;justify-content:center}.nv-del{border:0;background:#ff6a7a22;color:#ff8f9b;border-radius:10px;width:32px;height:32px;font:inherit;cursor:pointer}.nv-canvas{display:block;width:100%;margin:0 auto;border-radius:18px;background:#05090699;border:1px solid #ffffff18;touch-action:none}.nv-scene{background:radial-gradient(circle at 50% 30%,color-mix(in srgb,${accent} 18%,#0b1220),#05070d)}.nv-error{padding:12px 14px;border-radius:14px;background:#3a1016;color:#ffb3bc;font-size:14px;line-height:1.8}.nv-toast{position:fixed;inset-inline:0;bottom:28px;margin:auto;width:max-content;max-width:86vw;padding:10px 16px;border-radius:14px;background:#000d;color:${accent};border:1px solid color-mix(in srgb,${accent} 50%,transparent);font-weight:700;box-shadow:0 10px 40px #0009}`;
  const js = `(()=>{const P=${safeJson(P)};const navaEngine=(${navaEngine.toString()});(${navaDom.toString()})(P,navaEngine);})();`;
  return { web: { html: webHtml, css, js } };
}
