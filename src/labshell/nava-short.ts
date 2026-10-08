/** One registry for compiler aliases, completion, conversion and AI documentation. */
export const NAVA_SHORT_WORDS = [
  { short: "pg", long: "صفحه", role: "command", meaning: "صفحه" },
  { short: "ap", long: "برنامه", role: "command", meaning: "نام برنامه" },
  { short: "hd", long: "عنوان", role: "command", meaning: "عنوان" },
  { short: "tx", long: "متن", role: "command", meaning: "متن" },
  { short: "fg", long: "رنگ", role: "command", meaning: "رنگ اصلی" },
  { short: "bg", long: "پس‌زمینه", role: "command", meaning: "پس‌زمینه", aliases: ["پسزمینه"] },
  { short: "num", long: "عدد", role: "command", meaning: "متغیر عددی" },
  { short: "var", long: "متغیر", role: "command", meaning: "متغیر" },
  { short: "in", long: "ورودی", role: "command", meaning: "ورودی" },
  { short: "out", long: "نمایش", role: "command", meaning: "نمایش مقدار" },
  { short: "bt", long: "دکمه", role: "command", meaning: "دکمه" },
  { short: "img", long: "عکس", role: "command", meaning: "عکس" },
  { short: "alt", long: "توضیح", role: "option", meaning: "توضیح عکس" },
  { short: "sy", long: "بگو", role: "action", meaning: "نمایش پیام کلیک" },
  { short: "on", long: "وقتی زده شد", role: "separator", meaning: "فرمان کلیک؛ به‌جای :" },
  { short: "cal", long: "ماشین‌حساب", role: "command", meaning: "ماشین‌حساب", aliases: ["ماشین حساب", "ماشینحساب", "calculator", "ماشین-حساب"] },
  { short: "mb", long: "موبایل", role: "option", meaning: "قالب موبایل", aliases: ["mobile"] },
  { short: "cnt", long: "شمارنده", role: "command", meaning: "شمارنده", aliases: ["counter"] },
  { short: "tm", long: "تایمر", role: "command", meaning: "تایمر", aliases: ["timer"] },
  { short: "vx", long: "جهان بلوکی", role: "command", meaning: "جهان بلوکی", aliases: ["voxel"] },
  { short: "sz", long: "اندازه", role: "option", meaning: "اندازهٔ جهان" },
  { short: "sd", long: "بذر", role: "option", meaning: "بذر جهان" },
  { short: "bl", long: "بلوک", role: "command", meaning: "بلوک سفارشی" },
  { short: "df", long: "تعریف", role: "command", meaning: "تعریف بسته" },
  { short: "end", long: "پایان", role: "command", meaning: "پایان بسته" },
  { short: "us", long: "استفاده", role: "command", meaning: "استفاده از بسته" },
  { short: "tr", long: "درست", role: "literal", meaning: "مقدار درست", aliases: ["true"] },
  { short: "fl", long: "نادرست", role: "literal", meaning: "مقدار نادرست", aliases: ["false"] },
] as const;

type Direction = "long" | "short";
type Word = { short: string; long: string; role: string; aliases?: readonly string[] };
const words: readonly Word[] = NAVA_SHORT_WORDS;
const commandWords = words.filter((word) => word.role === "command");
const literalWords = words.filter((word) => word.role === "literal");
export const NAVA_BOOLEAN_NAMES = literalWords.flatMap((word) => [word.short, word.long, ...(word.aliases ?? [])]);
const wordFor = (short: string) => words.find((word) => word.short === short)!;

function head(source: string, entries: readonly Word[], direction: Direction) {
  for (const word of entries) {
    for (const name of [word.long, word.short, ...(word.aliases ?? [])]) {
      const pattern = name.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
      const match = new RegExp("^" + pattern + "(?=$|[\\s\"':])").exec(source);
      if (match) {
        const rest = source.slice(match[0].length);
        return { word, text: word[direction] + (rest && !/^\s|^:/.test(rest) ? " " : "") + rest, rest };
      }
    }
  }
  return null;
}

/** Rewrite only unquoted lexical words in an explicitly known grammar position. */
function rewriteWords(source: string, entries: readonly Word[], direction: Direction): string {
  return source.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|"[^\n]*$|'[^\n]*$|[\p{L}_][\p{L}\p{N}_\u200c]*/gu, (token) => {
    if (token.startsWith('"') || token.startsWith("'")) return token;
    const found = entries.find((word) => word.long === token || word.short === token || word.aliases?.includes(token));
    return found ? found[direction] : token;
  });
}

function assignment(source: string, direction: Direction): string {
  const equals = source.indexOf("=");
  if (equals < 0) return source;
  return source.slice(0, equals + 1) + rewriteWords(source.slice(equals + 1), literalWords, direction);
}

function rewriteLine(raw: string, direction: Direction): string {
  const indent = /^\s*/.exec(raw)![0];
  const source = raw.slice(indent.length);
  if (!source || source.startsWith("#")) return raw;
  const command = head(source, commandWords, direction);
  if (!command) return raw;
  let rest = command.rest;
  switch (command.word.short) {
    case "cal": rest = rewriteWords(rest, [wordFor("mb")], direction); break;
    case "vx": rest = rewriteWords(rest, [wordFor("sz"), wordFor("sd")], direction); break;
    case "img": rest = rewriteWords(rest, [wordFor("alt")], direction); break;
    case "num": case "var": rest = assignment(rest, direction); break;
    case "bt": {
      // The label and appearance capsule are opaque; only the following action is rewritten.
      const match = /^(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*(?:\([^)]*\)\s*)?)(:|on\b\s*:?|وقتی\s+زده\s+شد\s*:?)(\s*)(.*)$/.exec(rest);
      if (!match) break;
      const separator = match[2].startsWith(":") ? ":" : direction === "long" ? "وقتی زده شد:" : "on";
      const isAssignment = /^[\p{L}_][\p{L}\p{N}_\u200c]*\s*=/u.test(match[4]);
      const action = isAssignment ? assignment(match[4], direction) : head(match[4], [wordFor("sy")], direction)?.text ?? match[4];
      rest = match[1] + separator + (match[3] || " ") + action;
      break;
    }
  }
  return indent + command.word[direction] + (rest && !/^\s|^:/.test(rest) ? " " : "") + rest;
}

export const normalizeNavaLine = (line: string) => rewriteLine(line, "long");

/** Preserve strings, identifiers, comments, blank lines and line endings. */
export function compactNavaSource(source: string): string {
  return source.split(/(\r\n|\r|\n)/).map((line, i) => i % 2 ? line : rewriteLine(line, "short")).join("");
}
