/** Compact, Latin-only surface syntax for Nava. Existing Persian and lowercase forms remain valid. */
export const NAVA_GLYPH_WORDS: Record<string, string> = {
  Pg: "pg", Ap: "ap", Hd: "hd", Tx: "tx", Fg: "fg", Bg: "bg", Num: "num", Var: "var",
  In: "in", Out: "out", Bt: "bt", Btn: "bt",
  Img: "img", Alt: "alt", Sy: "sy", On: "on", Cal: "cal", Mb: "mb", Cnt: "cnt",
  Tm: "tm", Vx: "vx", Sz: "sz", Sd: "sd", Bl: "bl", Df: "df", End: "end", Us: "us",
  Tr: "tr", Fl: "fl", If: "اگر", Else: "وگرنه", EndIf: "پایان", Repeat: "تکرار",
  For: "برای", Each: "برای هر", While: "تا وقتی", Act: "کنش", Do: "اجرا", Fn: "تابع",
  Ret: "نتیجه", Return: "برگرد", Row: "ردیف", Show: "نمایش", Every: "هر", After: "بعد از",
  Touch: "وقتی لمس", Key: "وقتی کلید", Push: "افزودن", Del: "حذف", Clear: "خالی",
  List: "فهرست", Store: "ذخیره", Msg: "پیام", Tone: "صدا", Melody: "آهنگ",
  Speak: "بگو", Ask: "بپرس", Canvas: "بوم", Scene: "صحنه", Cube: "مکعب",
  Ball: "کره", Pyramid: "هرم", Floor: "زمین", Rotate: "بچرخان", Move: "حرکت",
  Shift: "جابجا", Scale: "اندازه", Camera: "دوربین", ClearCanvas: "پاک",
  Circle: "دایره", Rect: "مستطیل", Line: "خط", DrawText: "نوشته", DrawImage: "تصویر",
  Rand: "تصادفی", Len: "طول", Round: "گرد", Int: "صحیح", Abs: "قدرمطلق",
  Sqrt: "جذر", Pow: "توان", Min: "حداقل", Max: "حداکثر", Sum: "جمع", Sin: "سینوس",
  Cos: "کسینوس", Dist: "فاصله", ToNum: "عدد", ToText: "متن", Time: "زمان",
  Clock: "ساعت", Date: "تاریخ", Has: "شامل", At: "جای", Split: "جدا", Join: "چسب",
  Lines: "خطوط", Reverse: "برعکس", Sort: "مرتب", Slice: "بخش", File: "فایل",
  G1: "کیفیت پایین", G9: "کیفیت خیلی‌بالا",
  Sc: "صحنه", Cu: "مکعب", Sp: "کره", Rg: "حلقه", Cy: "استوانه", Cn: "مخروط",
  Mt: "متریال", Rt: "بچرخان", Mv: "حرکت", Ps: "جابجا", Sl: "اندازه", Cm: "دوربین", Ob: "مدار", Fr: "فریم", Fz: "مه", Lt: "نور", Am: "محیط",
  Arr: "لیست", Pw: "رمز", Multi: "چندخطی",
  Torus: "حلقه", Cylinder: "استوانه", Cone: "مخروط", Mat: "متریال", Tint: "رنگشکل",
  Fog: "مه", Light: "نور", Ambient: "محیط", Orbit: "مدار", Frame: "فریم", Dt: "دلتا",
  With: "با", From: "از", To: "تا", Into: "به", First: "اول", Last: "آخر", Index: "شماره", Times: "بار", Stop: "توقف", Resume: "ادامه", And: "و", Or: "یا", Not: "نه",
  Sec: "ثانیه", X: "ایکس", Y: "ایگرگ", K: "کلید", Pos: "در", Game: "حالت بازی",
};

const glyphKeys = Object.keys(NAVA_GLYPH_WORDS).sort((a, b) => b.length - a.length);
const glyphPattern = new RegExp(`\\b(?:${glyphKeys.join("|")})\\b`, "g");
const containsGlyph = new RegExp(`(?:^|[^A-Za-z0-9_])(?:${glyphKeys.join("|")})(?=$|[^A-Za-z0-9_])`);

/** Replace tokens only in code, leaving quoted UI text and comments byte-for-byte unchanged. */
function mapCode(source: string, convert: (code: string) => string): string {
  return source.split(/(\r\n|\r|\n)/).map((line, index) => {
    if (index % 2) return line;
    let result = "", code = "", literal = "", quote = "", escaped = false;
    const flush = () => { result += convert(code); code = ""; };
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (quote) {
        literal += ch;
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) { quote = ""; result += literal.replace(/\{([^{}]+)\}/g, (_, expr) => "{" + convert(expr) + "}"); literal = ""; }
        continue;
      }
      if (ch === '"' || ch === "'") { flush(); quote = ch; literal = ch; continue; }
      if (ch === "«") { flush(); quote = "»"; literal = ch; continue; }
      if (ch === "#" && !/^#[\da-f]{3,8}\b/i.test(line.slice(i))) { flush(); result += line.slice(i); break; }
      if (ch === "/" && line[i + 1] === "/") { flush(); result += line.slice(i); break; }
      code += ch;
    }
    flush();
    return result + literal;
  }).join("");
}

function visibleCode(source: string): string {
  return source.split(/(\r\n|\r|\n)/).map((line, index) => {
    if (index % 2) return line;
    // Appearance capsules have their own tagged-number and palette grammar.
    // Keep their contents out of the bare-number / Persian-token checks.
    line = line.replace(/\((?:ru|Ru)\d+(?:rn|Rn)\d+(?:[yY][A-Z][a-z]?\d{2}[A-Z][a-z]?\d{2})?(?:Rr)?\)/g, (value) => " ".repeat(value.length));
    let result = "", quote = "", escaped = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (quote) {
        result += " ";
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; result += " "; continue; }
      if (ch === "«") { quote = "»"; result += " "; continue; }
      if (ch === "#" && !/^#[\da-f]{3,8}\b/i.test(line.slice(i))) { result += " ".repeat(line.length - i); break; }
      if (ch === "/" && line[i + 1] === "/") { result += " ".repeat(line.length - i); break; }
      if (ch === "#" && /^#[\da-f]{3,8}\b/i.test(line.slice(i))) { const color = /^#[\da-f]{3,8}\b/i.exec(line.slice(i))![0]; result += " ".repeat(color.length); i += color.length - 1; continue; }
      result += ch;
    }
    return result;
  }).join("");
}

export function isNavaGlyphSource(source: string): boolean {
  return visibleCode(source).split(/\r\n|\r|\n/).some((line) => containsGlyph.test(line));
}

/** Convert capital-led glyph atoms to the stable Nava parser vocabulary. */
export function normalizeNavaGlyph(source: string): { source: string; error?: string } {
  if (!isNavaGlyphSource(source)) return { source };
  const lines = source.split(/\r\n|\r|\n/);
  const code = visibleCode(source);
  const persian = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;
const bareNumber = /(^|[^A-Za-z0-9_])[0-9۰-۹]+(?:[.٫][0-9۰-۹]+)?/;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const clean = code.split(/\r\n|\r|\n/)[i] ?? "";
    if (!clean.trim() || /^\s*(?:#(?![\da-f]{3,8}\b)|\/\/)/i.test(raw)) continue;
    if (persian.test(clean)) return { source, error: `خط ${i + 1}: در کد لاتین نوا، متن و نام‌های نمایشی را داخل گیومه بگذار؛ واژه‌های دستوری فارسی پذیرفته نیستند.` };
    const lowerAtom = /(?:^|[^A-Za-z0-9_])([a-z][A-Za-z0-9_]*)/.exec(clean)?.[1];
    if (lowerAtom) {
      return { source, error: `خط ${i + 1}: هر واژهٔ کد نوا باید با حرف بزرگ آغاز شود؛ «${lowerAtom}» را به شکل «${lowerAtom[0]!.toUpperCase()}${lowerAtom.slice(1)}» بنویس.` };
    }
    // Any numeric literal must carry its explicit N tag. Dimensions and colors
    // in a button capsule are handled by parseAppearance, not this scanner.
    const number = bareNumber.exec(clean);
    if (number) return { source, error: `خط ${i + 1}: عدد آزاد «${number[0].trim()}» مجاز نیست؛ آن را با برچسب N بنویس، مثل N${number[0].trim()} یا N0d5.` };
  }
  const normalized = mapCode(source, (codeLine) => codeLine
    .replace(glyphPattern, (token) => NAVA_GLYPH_WORDS[token]!)
    .replace(/(?<![A-Za-z])N(\d+)d(\d+)\b/g, "$1.$2")
    .replace(/(?<![A-Za-z])N(\d+)\b/g, "$1"));
  return { source: normalized };
}
