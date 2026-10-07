import { compileFarsi, type CompileResult } from "@/labshell/farsi";

const WORDS: Record<string, string> = {
  let: "متغیر",
  if: "اگر",
  else: "وگرنه",
  for: "برای",
  from: "از",
  to: "تا",
  while: "تا",
  break: "بشکن",
  continue: "ادامه",
  fn: "تابع",
  return: "برگردان",
  print: "چاپ",
  read: "بخوان",
  page: "صفحه",
  style: "سبک",
  machine: "ماشین",
  and: "و",
  or: "یا",
  not: "نه",
  true: "درست",
  false: "نادرست",
  null: "هیچ",
  eq: "برابر",
  neq: "نابرابر",
  gt: "بزرگتر",
  lt: "کوچکتر",
  gte: "دستکم",
  lte: "حداکثر",
};

const PAGE: Record<string, string> = {
  title: "عنوان",
  text: "متن",
  mark: "نشان",
  background: "پسزمینه",
  color: "رنگ",
  accent: "تاکید",
  size: "اندازه",
  radius: "گردی",
  padding: "حاشیه",
  font: "قلم",
};

export const ENGLISH_KEYWORDS = Object.keys(WORDS);

export const ENGLISH_BAR: { label: string; insert: string }[] = [
  { label: "let", insert: "let " },
  { label: "if", insert: "if " },
  { label: "else", insert: "else " },
  { label: "print", insert: 'print("")' },
  { label: "while", insert: "while " },
  { label: "break", insert: "break\n" },
  { label: "fn", insert: "fn " },
  { label: "for", insert: "for " },
  { label: "return", insert: "return " },
  { label: "read", insert: "read()" },
  { label: "machine", insert: "machine {\n  0001 0001\n  1111 0000\n}\n" },
  { label: "page", insert: "page {\n  title: Calculator\n  text: note\n}\n" },
];

export function englishToFarsi(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
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
    if (ch === ":") {
      out += ch;
      i += 1;
      while (i < source.length && source[i] !== "\n") {
        out += source[i];
        i += 1;
      }
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z]/.test(source[j] ?? "")) j += 1;
      const word = source.slice(i, j);
      const rest = source.slice(j);
      const two = /^(\s+)(if)\b/.exec(rest);
      if (word === "else" && two) {
        out += "وگرنه اگر";
        i = j + two[0].length;
        continue;
      }
      if (word in WORDS) {
        out += WORDS[word];
        i = j;
        continue;
      }
      if (word in PAGE && /^\s*:/.test(rest)) {
        out += PAGE[word];
        i = j;
        continue;
      }
      out += word;
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function compileEnglish(source: string): CompileResult {
  return compileFarsi(englishToFarsi(source));
}
