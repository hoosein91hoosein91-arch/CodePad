export type FarsiPage = {
  title: string;
  text: string;
  mark: string;
  css: string;
};

export type CompileResult = { ok: true; js: string } | { ok: false; error: string };

export const FARSI_KEYWORDS = [
  "اگر",
  "وگرنه",
  "برای",
  "از",
  "تا",
  "بشکن",
  "ادامه",
  "تابع",
  "برگردان",
  "متغیر",
  "چاپ",
  "بخوان",
  "صفحه",
  "سبک",
  "و",
  "یا",
  "نه",
  "درست",
  "نادرست",
  "هیچ",
  "برابر",
  "نابرابر",
  "بزرگتر",
  "کوچکتر",
  "دستکم",
  "حداکثر",
] as const;

const KEYWORD_SET = new Set<string>(FARSI_KEYWORDS);

const CMP: Record<string, string> = {
  برابر: "===",
  نابرابر: "!==",
  بزرگتر: ">",
  کوچکتر: "<",
  دستکم: ">=",
  حداکثر: "<=",
};

const PAGE_KEYS: Record<string, "title" | "text" | "mark" | "background" | "color" | "accent" | "size" | "radius" | "padding" | "font"> = {
  عنوان: "title",
  متن: "text",
  نشان: "mark",
  پسزمینه: "background",
  رنگ: "color",
  تاکید: "accent",
  تأکید: "accent",
  اندازه: "size",
  گردی: "radius",
  حاشیه: "padding",
  قلم: "font",
};

const STMT_START = new Set(["متغیر", "اگر", "برای", "تا", "بشکن", "ادامه", "تابع", "برگردان", "چاپ", "صفحه", "سبک", "وگرنه", "__برگه"]);

export const FARSI_BAR: { label: string; insert: string }[] = [
  { label: "متغیر", insert: "متغیر " },
  { label: "اگر", insert: "اگر " },
  { label: "وگرنه", insert: "وگرنه " },
  { label: "چاپ", insert: 'چاپ("")' },
  { label: "تابع", insert: "تابع " },
  { label: "برای", insert: "برای " },
  { label: "برگردان", insert: "برگردان " },
  { label: "بخوان", insert: "بخوان()" },
  { label: "برابر", insert: " برابر " },
  { label: "صفحه", insert: "صفحه {\n  عنوان: عنوان\n  متن: توضیح\n}\n" },
];

type Token =
  | { kind: "id"; value: string; line: number }
  | { kind: "str"; value: string; line: number }
  | { kind: "num"; value: string; line: number }
  | { kind: "op"; value: string; line: number }
  | { kind: "eof"; value: ""; line: number };

function isWordChar(ch: string): boolean {
  return /[\u0600-\u06FF\u200cA-Za-z0-9_]/.test(ch);
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function safeCss(value: string): string {
  return value.replace(/[{}<>;]/g, "").trim();
}

function compilePage(body: string): string {
  const fields: Partial<Record<(typeof PAGE_KEYS)[string], string>> = {};
  const raw: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^\s:]+)\s*:\s*(.*)$/);
    const key = match?.[1]?.replace(/\u200c/g, "");
    const mapped = key ? PAGE_KEYS[key] : undefined;
    if (match && mapped) {
      fields[mapped] = stripQuotes(match[2].trim());
      continue;
    }
    raw.push(trimmed);
  }
  const css: string[] = [];
  if (fields.background) css.push(`body{background:${safeCss(fields.background)}}`);
  if (fields.color) css.push(`body,.lead{color:${safeCss(fields.color)}}`);
  if (fields.font) css.push(`body{font-family:${safeCss(fields.font)},Vazirmatn,Tahoma,sans-serif}`);
  if (fields.size) css.push(`h1{font-size:${safeCss(fields.size)}}`);
  if (fields.radius) css.push(`.card{border-radius:${safeCss(fields.radius)}}`);
  if (fields.padding) css.push(`.card{padding:${safeCss(fields.padding)}}`);
  if (fields.accent) css.push(`.mark,.foot,.out li{color:${safeCss(fields.accent)}}`);
  if (raw.length) css.push(raw.join("\n"));
  return JSON.stringify({
    title: fields.title ?? "",
    text: fields.text ?? "",
    mark: fields.mark ?? "",
    css: css.join("\n"),
  });
}

function extractBlocks(source: string): { code: string; pages: string[]; machines: string[] } {
  const pages: string[] = [];
  const machines: string[] = [];
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < source.length && source[j] !== quote) {
        if (source[j] === "\\") j += 1;
        j += 1;
      }
      out += source.slice(i, Math.min(source.length, j + 1));
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    const prev = i > 0 ? source[i - 1] : "";
    if (!isWordChar(prev) && isWordChar(ch)) {
      let j = i + 1;
      while (j < source.length && isWordChar(source[j])) j += 1;
      const word = source.slice(i, j);
      if (word === "صفحه" || word === "سبک" || word === "ماشین") {
        let k = j;
        while (k < source.length && /\s/.test(source[k])) k += 1;
        if (source[k] === "{") {
          const close = matchBrace(source, k);
          const body = source.slice(k + 1, close);
          const block = source.slice(i, close + 1);
          const breaks = Math.max(0, block.split("\n").length - 1);
          if (word === "ماشین") {
            machines.push(body);
            out += `__موتور(${machines.length - 1})` + "\n".repeat(breaks);
          } else {
            pages.push(compilePage(body));
            out += `__برگه(${pages.length - 1})` + "\n".repeat(breaks);
          }
          i = close + 1;
          continue;
        }
      }
    }
    out += ch;
    i += 1;
  }
  return { code: out, pages, machines };
}

function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`line ${lineAt(source, openIndex)}: block was not closed`);
}

function foldOutsideStrings(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < source.length && source[j] !== quote) {
        if (source[j] === "\\") j += 1;
        j += 1;
      }
      out += source.slice(i, Math.min(source.length, j + 1));
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    const digit = "۰۱۲۳۴۵۶۷۸۹".indexOf(ch);
    out += digit >= 0 ? String(digit) : ch;
    i += 1;
  }
  return out;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") {
      line += 1;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== quote) {
        if (source[j] === "\\") {
          const next = source[j + 1];
          if (next === "n") value += "\n";
          else if (next === "t") value += "\t";
          else value += next ?? "";
          j += 2;
          continue;
        }
        if (source[j] === "\n") line += 1;
        value += source[j];
        j += 1;
      }
      if (source[j] !== quote) throw new Error(`line ${line}: string was not closed`);
      tokens.push({ kind: "str", value, line });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j])) j += 1;
      tokens.push({ kind: "num", value: source.slice(i, j), line });
      i = j;
      continue;
    }
    if (isWordChar(ch)) {
      let j = i + 1;
      while (j < source.length && isWordChar(source[j])) j += 1;
      tokens.push({ kind: "id", value: source.slice(i, j), line });
      i = j;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === "==" || two === "!=" || two === "<=" || two === ">=") {
      tokens.push({ kind: "op", value: two, line });
      i += 2;
      continue;
    }
    if ("(){}[],:+-*/%=<>!".includes(ch) || ch === "،") {
      tokens.push({ kind: "op", value: ch === "،" ? "," : ch, line });
      i += 1;
      continue;
    }
    throw new Error(`line ${line}: character “${ch}” is not part of Jib`);
  }
  tokens.push({ kind: "eof", value: "", line });
  return tokens;
}

class Parser {
  private index = 0;
  private tokens: Token[];
  private pages: string[];
  private machines: string[];

  constructor(tokens: Token[], pages: string[], machines: string[]) {
    this.tokens = tokens;
    this.pages = pages;
    this.machines = machines;
  }

  compile(): string {
    const parts: string[] = [];
    while (this.peek().kind !== "eof") parts.push(this.parseStmt());
    return parts.join("\n");
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { kind: "eof", value: "", line: 1 };
  }

  private next(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private eatId(name: string): boolean {
    if (this.peek().kind === "id" && this.peek().value === name) {
      this.next();
      return true;
    }
    return false;
  }

  private expectOp(value: string) {
    const token = this.peek();
    if (token.kind === "op" && token.value === value) {
      this.next();
      return;
    }
    throw new Error(`line ${token.line}: “${value}” is required here`);
  }

  private endStmt() {
    while (this.peek().kind === "op" && this.peek().value === ";") this.next();
  }

  private parseStmt(): string {
    const token = this.peek();
    if (token.kind === "op" && token.value === "}") throw new Error(`line ${token.line}: extra }`);
    let code = "";
    if (token.kind === "id" && token.value === "__برگه") code = this.parseSheet();
    else if (this.isIndexAssign()) code = this.parseIndexAssign();
    else if (token.kind === "id" && token.value === "متغیر") code = this.parseLet();
    else if (token.kind === "id" && token.value === "اگر") code = this.parseIf();
    else if (token.kind === "id" && token.value === "برای") code = this.parseFor();
    else if (token.kind === "id" && token.value === "تا") code = this.parseWhile();
    else if (token.kind === "id" && token.value === "بشکن") code = this.parseBreak();
    else if (token.kind === "id" && token.value === "ادامه") code = this.parseContinue();
    else if (token.kind === "id" && token.value === "تابع") code = this.parseFn();
    else if (token.kind === "id" && token.value === "برگردان") code = this.parseReturn();
    else if (token.kind === "id" && token.value === "چاپ") code = this.parsePrint();
    else if (token.kind === "id" && token.value === "وگرنه") throw new Error(`line ${token.line}: else without if`);
    else if (this.isAssign()) code = this.parseAssign();
    else code = `${this.parseExpr()};`;
    this.endStmt();
    return code;
  }

  private isIndexAssign(): boolean {
    if (this.peek().kind !== "id" || KEYWORD_SET.has(this.peek().value)) return false;
    let cursor = this.index + 1;
    if (this.tokens[cursor]?.kind !== "op" || this.tokens[cursor]?.value !== "[") return false;
    let depth = 0;
    for (; cursor < this.tokens.length; cursor += 1) {
      const token = this.tokens[cursor];
      if (!token) break;
      if (token.kind === "op" && token.value === "[") depth += 1;
      else if (token.kind === "op" && token.value === "]") {
        depth -= 1;
        if (depth === 0) {
          const next = this.tokens[cursor + 1];
          return next?.kind === "op" && next.value === "=";
        }
      }
    }
    return false;
  }

  private parseIndexAssign(): string {
    const name = this.next();
    this.expectOp("[");
    const index = this.parseExpr();
    this.expectOp("]");
    this.expectOp("=");
    return `${name.value}[${index}] = ${this.parseExpr()};`;
  }

  private withIndex(value: string): string {
    let out = value;
    while (this.peek().kind === "op" && this.peek().value === "[") {
      this.next();
      const index = this.parseExpr();
      this.expectOp("]");
      out = `${out}[${index}]`;
    }
    return out;
  }

  private isAssign(): boolean {
    const name = this.tokens[this.index];
    const op = this.tokens[this.index + 1];
    return name?.kind === "id" && !KEYWORD_SET.has(name.value) && op?.kind === "op" && op.value === "=";
  }

  private parseSheet(): string {
    this.next();
    this.expectOp("(");
    const index = this.peek();
    if (index.kind !== "num") throw new Error(`line ${index.line}: page block was lost`);
    this.next();
    this.expectOp(")");
    const payload = this.pages[Number(index.value)] ?? "{}";
    return `__صفحه(${payload});`;
  }

  private parseLet(): string {
    const start = this.next();
    const name = this.next();
    if (name.kind !== "id" || KEYWORD_SET.has(name.value)) {
      throw new Error(`line ${start.line}: let needs a name`);
    }
    this.expectOp("=");
    return `let ${name.value} = ${this.parseExpr()};`;
  }

  private parseAssign(): string {
    const name = this.next();
    if (name.kind !== "id") throw new Error(`line ${name.line}: bad name`);
    this.expectOp("=");
    return `${name.value} = ${this.parseExpr()};`;
  }

  private parseIf(): string {
    this.next();
    let code = `if (${this.parseExpr()}) ${this.parseBlock()}`;
    while (this.eatId("وگرنه")) {
      if (this.eatId("اگر")) code += ` else if (${this.parseExpr()}) ${this.parseBlock()}`;
      else {
        code += ` else ${this.parseBlock()}`;
        break;
      }
    }
    return code;
  }

  private parseFor(): string {
    const start = this.next();
    const name = this.next();
    if (name.kind !== "id" || KEYWORD_SET.has(name.value)) {
      throw new Error(`line ${start.line}: for needs a counter name`);
    }
    if (!this.eatId("از")) throw new Error(`line ${name.line}: write for ${name.value} from ... to ...`);
    const from = this.parseExpr();
    if (!this.eatId("تا")) throw new Error(`line ${this.peek().line}: “to” is required`);
    const to = this.parseExpr();
    const body = this.parseBlock();
    return `for (let ${name.value} = (${from}); ${name.value} <= (${to}); ${name.value} = ${name.value} + 1) ${body}`;
  }

  private parseWhile(): string {
    this.next();
    return `while (${this.parseExpr()}) ${this.parseBlock()}`;
  }

  private parseBreak(): string {
    this.next();
    return "break;";
  }

  private parseContinue(): string {
    this.next();
    return "continue;";
  }

  private parseFn(): string {
    const start = this.next();
    const name = this.next();
    if (name.kind !== "id" || KEYWORD_SET.has(name.value)) {
      throw new Error(`line ${start.line}: fn needs a name`);
    }
    this.expectOp("(");
    const params: string[] = [];
    if (!(this.peek().kind === "op" && this.peek().value === ")")) {
      while (true) {
        const param = this.next();
        if (param.kind !== "id" || KEYWORD_SET.has(param.value)) {
          throw new Error(`line ${param.line}: bad parameter name`);
        }
        params.push(param.value);
        if (this.peek().kind === "op" && this.peek().value === ",") {
          this.next();
          continue;
        }
        break;
      }
    }
    this.expectOp(")");
    return `function ${name.value}(${params.join(", ")}) ${this.parseBlock()}`;
  }

  private parseReturn(): string {
    this.next();
    const next = this.peek();
    if (
      next.kind === "eof" ||
      (next.kind === "op" && (next.value === "}" || next.value === ";")) ||
      (next.kind === "id" && STMT_START.has(next.value))
    ) {
      return "return;";
    }
    return `return ${this.parseExpr()};`;
  }

  private parsePrint(): string {
    this.next();
    return `__چاپ(${this.parseArgs()});`;
  }

  private parseArgs(): string {
    this.expectOp("(");
    const args: string[] = [];
    if (!(this.peek().kind === "op" && this.peek().value === ")")) {
      while (true) {
        args.push(this.parseExpr());
        if (this.peek().kind === "op" && this.peek().value === ",") {
          this.next();
          continue;
        }
        break;
      }
    }
    this.expectOp(")");
    return args.join(", ");
  }

  private parseBlock(): string {
    this.expectOp("{");
    const parts: string[] = [];
    while (!(this.peek().kind === "op" && this.peek().value === "}")) {
      if (this.peek().kind === "eof") throw new Error(`line ${this.peek().line}: block was not closed`);
      parts.push(this.parseStmt());
    }
    this.next();
    return `{\n${parts.join("\n")}\n}`;
  }

  private parseExpr(): string {
    return this.parseOr();
  }

  private parseOr(): string {
    let left = this.parseAnd();
    while (this.peek().kind === "id" && this.peek().value === "یا") {
      this.next();
      left = `(${left} || ${this.parseAnd()})`;
    }
    return left;
  }

  private parseAnd(): string {
    let left = this.parseNot();
    while (this.peek().kind === "id" && this.peek().value === "و") {
      this.next();
      left = `(${left} && ${this.parseNot()})`;
    }
    return left;
  }

  private parseNot(): string {
    if ((this.peek().kind === "id" && this.peek().value === "نه") || (this.peek().kind === "op" && this.peek().value === "!")) {
      this.next();
      return `!(${this.parseNot()})`;
    }
    return this.parseCmp();
  }

  private parseCmp(): string {
    let left = this.parseAdd();
    while (true) {
      const token = this.peek();
      if (token.kind === "op" && ["==", "!=", "<", ">", "<=", ">="].includes(token.value)) {
        this.next();
        const op = token.value === "==" ? "===" : token.value === "!=" ? "!==" : token.value;
        left = `(${left} ${op} ${this.parseAdd()})`;
        continue;
      }
      if (token.kind === "id" && token.value in CMP) {
        this.next();
        left = `(${left} ${CMP[token.value]} ${this.parseAdd()})`;
        continue;
      }
      return left;
    }
  }

  private parseAdd(): string {
    let left = this.parseMul();
    while (this.peek().kind === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.next().value;
      left = `(${left} ${op} ${this.parseMul()})`;
    }
    return left;
  }

  private parseMul(): string {
    let left = this.parseUnary();
    while (this.peek().kind === "op" && (this.peek().value === "*" || this.peek().value === "/" || this.peek().value === "%")) {
      const op = this.next().value;
      left = `(${left} ${op} ${this.parseUnary()})`;
    }
    return left;
  }

  private parseUnary(): string {
    if (this.peek().kind === "op" && this.peek().value === "-") {
      this.next();
      return `-(${this.parseUnary()})`;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): string {
    const token = this.peek();
    if (token.kind === "num") {
      this.next();
      return this.withIndex(token.value);
    }
    if (token.kind === "str") {
      this.next();
      return this.withIndex(JSON.stringify(token.value));
    }
    if (token.kind === "op" && token.value === "(") {
      this.next();
      const inner = this.parseExpr();
      this.expectOp(")");
      return this.withIndex(`(${inner})`);
    }
    if (token.kind === "op" && token.value === "[") {
      this.next();
      const items: string[] = [];
      if (!(this.peek().kind === "op" && this.peek().value === "]")) {
        while (true) {
          items.push(this.parseExpr());
          if (this.peek().kind === "op" && this.peek().value === ",") {
            this.next();
            continue;
          }
          break;
        }
      }
      this.expectOp("]");
      return this.withIndex(`[${items.join(", ")}]`);
    }
    if (token.kind === "id") {
      this.next();
      if (token.value === "__موتور") {
        this.expectOp("(");
        const index = this.peek();
        if (index.kind !== "num") throw new Error(`line ${index.line}: machine block was lost`);
        this.next();
        this.expectOp(")");
        const source = this.machines[Number(index.value)] ?? "";
        return this.withIndex(`__machine(${JSON.stringify(source)})`);
      }
      if (token.value === "درست") return "true";
      if (token.value === "نادرست") return "false";
      if (token.value === "هیچ") return "null";
      const call = this.peek().kind === "op" && this.peek().value === "(";
      if (call) {
        const args = this.parseArgs();
        if (token.value === "بخوان") return this.withIndex(`__بخوان(${args})`);
        if (token.value === "len") return this.withIndex(`__len(${args})`);
        if (token.value === "push") return this.withIndex(`__push(${args})`);
        if (KEYWORD_SET.has(token.value)) throw new Error(`line ${token.line}: “${token.value}” does not belong here`);
        return this.withIndex(`${token.value}(${args})`);
      }
      if (KEYWORD_SET.has(token.value)) throw new Error(`line ${token.line}: “${token.value}” does not belong here`);
      return this.withIndex(token.value);
    }
    throw new Error(`line ${token.line}: expression was not understood`);
  }
}

export function compileFarsi(source: string): CompileResult {
  try {
    const extracted = extractBlocks(source);
    const folded = foldOutsideStrings(extracted.code);
    const js = new Parser(tokenize(folded), extracted.pages, extracted.machines).compile();
    return { ok: true, js };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Jib could not read this program" };
  }
}
