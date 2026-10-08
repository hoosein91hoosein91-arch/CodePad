import { LANG_META, type LabFile, type Lang, type Project, type TemplateKind } from "@/labshell/types";

const FARSI = `# دماسنج — خود کد فارسی است
# متغیر، اگر، چاپ، تابع، برای، بخوان، صفحه

متغیر خام = بخوان()
متغیر دما = خام
اگر خام برابر "" {
  دما = ۳۶.۶
}

متغیر فارنهایت = دما * ۹ / ۵ + ۳۲
چاپ("سلسیوس:", دما)
چاپ("فارنهایت:", فارنهایت)

اگر دما دستکم ۳۷.۵ {
  چاپ("وضعیت: تب")
} وگرنه اگر دما کوچکتر ۳۵ {
  چاپ("وضعیت: پایین")
} وگرنه {
  چاپ("وضعیت: عادی")
}

تابع جمع(تعداد) {
  متغیر کل = ۰
  برای شماره از ۱ تا تعداد {
    کل = کل + شماره
  }
  برگردان کل
}

چاپ("جمع یک تا دوازده:", جمع(۱۲))

صفحه {
  عنوان: دماسنج جیبی
  متن: منطق و ظاهر، هر دو با واژه‌های فارسی
  نشان: فا
  پس‌زمینه: #101410
  رنگ: #e7f0e4
  تاکید: #c6f135
  اندازه: 1.45rem
  گردی: 1.25rem
}
`;

const PYTHON = `# Pocket thermometer
# An empty line means 36.6
raw = input().strip()
celsius = float(raw) if raw else 36.6
fahrenheit = celsius * 9 / 5 + 32
print(f"celsius: {celsius:g}")
print(f"fahrenheit: {fahrenheit:.1f}")
if celsius >= 37.5:
    print("status: fever")
elif celsius < 35:
    print("status: low")
else:
    print("status: normal")
`;

const JAVASCRIPT = `const bench = [
  { lang: "Python", ok: true },
  { lang: "JavaScript", ok: true },
  { lang: "C", ok: true },
  { lang: "C++", ok: true },
  { lang: "CSS", ok: true },
];

bench.forEach((item, index) => {
  const mark = item.ok ? "ready" : "off";
  console.log(index + 1 + ". " + item.lang + " — " + mark);
});

console.log("together:", bench.map((item) => item.lang).join(" + "));
`;

const C = `#include <stdio.h>

int sum_to(int n) {
  int i;
  int total;
  total = 0;
  for (i = 1; i <= n; i++) {
    total = total + i;
  }
  return total;
}

int main() {
  int n;
  int got;
  got = scanf("%d", &n);
  if (got != 1) {
    n = 10;
  }
  printf("sum 1..%d = %d\\n", n, sum_to(n));
  return 0;
}
`;

const CPP = `#include <iostream>
using namespace std;

int clamp(int value, int low, int high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

int main() {
  int temps[5];
  temps[0] = 36;
  temps[1] = 37;
  temps[2] = 39;
  temps[3] = 35;
  temps[4] = 38;
  int sum = 0;
  for (int i = 0; i < 5; i++) {
    int shown = clamp(temps[i], 35, 40);
    sum = sum + shown;
    cout << "day " << (i + 1) << ": " << shown << endl;
  }
  cout << "average: " << (sum / 5) << endl;
  return 0;
}
`;

const HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>صفحهٔ من</title>
  <style>
    body { font-family: Tahoma, sans-serif; background: #101410; color: #e7f0e4; margin: 0; padding: 1rem; }
    button { background: #c6f135; border: 0; border-radius: 999px; padding: 0.6rem 1.2rem; font-size: 1rem; }
    #count { font-size: 2rem; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>سلام دنیا</h1>
  <p id="count">۰</p>
  <button id="add">یکی اضافه کن</button>
  <script>
    let n = 0;
    document.getElementById("add").addEventListener("click", () => {
      n += 1;
      document.getElementById("count").textContent = n.toLocaleString("fa-IR");
      console.log("شمارنده:", n);
    });
  </script>
</body>
</html>
`;

const NAVA = `# نوا؛ هر خط یک دستور ساده است — «اجرا» را بزن
برنامه "شمارندهٔ من"
رنگ #c6f135
عنوان "سلام! 👋"
متن "با چند خط کوتاه یک برنامهٔ واقعی بساز. راهنما: NAVA-GUIDE.md"
عدد شمارنده = ۰
ذخیره شمارنده
نمایش "تعداد کلیک: {شمارنده}"
نمایش "🎉 به ده رسیدی!" اگر شمارنده >= ۱۰
ردیف
  دکمه "یکی اضافه کن": شمارنده += ۱؛ صدا ۶۶۰، ۶۰
  دکمه "از اول": شمارنده = ۰
پایان
`;

const CSS = `body {
  margin: 0;
  min-height: 100%;
  background: #101410;
  color: #e7f0e4;
  font-family: Vazirmatn, Tahoma, sans-serif;
}

.card {
  margin: 1rem;
  padding: 1.25rem;
  border: 1px solid #314038;
  border-radius: 1.25rem;
  background: #1a211c;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.mark {
  color: #c6f135;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  letter-spacing: 0.08em;
}

.brand {
  color: #8d9b90;
  font-size: 0.85rem;
}

h1 {
  margin: 0;
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1.35;
}

.lead {
  margin: 0.75rem 0 0;
  color: #8d9b90;
  line-height: 1.6;
}

.langs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1.25rem 0 0;
  padding: 0;
  list-style: none;
}

.langs li {
  border: 1px solid #314038;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  color: #c6f135;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.8rem;
}

.meter {
  height: 0.45rem;
  margin-top: 1.25rem;
  overflow: hidden;
  border-radius: 999px;
  background: #243028;
}

.meter span {
  display: block;
  width: 72%;
  height: 100%;
  background: #c6f135;
}

.foot {
  margin: 0.9rem 0 0;
  color: #ff6a3d;
  font-size: 0.85rem;
}
`;

const ENGLISH = `# Jib calculator — numbers, a list, a function, and the 0/1 machine
let a = read()
let b = read()

fn calc(x, y, op) {
  if op eq "+" { return x + y }
  if op eq "-" { return x - y }
  if op eq "*" { return x * y }
  if op eq "/" { return x / y }
  return 0
}

let sum = calc(a, b, "+")
let product = calc(a, b, "*")
print("sum:", sum)
print("product:", product)

let nums = [a, b, sum]
let total = 0
let i = 0
while i lt 3 {
  total = total + nums[i]
  i = i + 1
}
print("list total:", total)

let lamps = machine {
  0001 0000
  0010 0111
  0101 0000
  1111 0000
}
print("register:", lamps)

page {
  title: Calculator
  text: One language for the program and the 8 lamps
  mark: JIB
  background: #101410
  color: #e7f0e4
  accent: #c6f135
}
`;

const BINARY = `# Jib machine — each order is 8 bits
# 1001 read   0010 add   0101 print
# 0110 skip if equal   1000 jump   1111 halt
1001 0000
0010 0001
0101 0000
0110 0101
1000 0001
1111 0000
`;

const MIX = `# برنامهٔ ترکیبی: هر بلوک به یک زبان است و به ترتیب اجرا می‌شود.
# پایتون و جاوااسکریپت از طریق متغیر مشترک shared به هم داده می‌دهند.

@@ جاوااسکریپت
shared.nums = [3, 8, 5, 12]
console.log("جاوااسکریپت لیست را ساخت:", shared.nums.join(" "))

@@ پایتون
total = sum(shared["nums"])
shared["total"] = total
print("پایتون جمع را حساب کرد:", total)

@@ جاوااسکریپت
shared.avg = shared.total / shared.nums.length
console.log("جاوااسکریپت میانگین را حساب کرد:", shared.avg)

@@ ماشین
0001 0101
0010 0011
0101 0000
1111 0000

@@ جیب: print("جیب هم در همین فایل اجرا شد")
`;

export const SAMPLES: Record<Lang, { name: string; stdin: string; content: string }> = {
  nava: { name: "شروع.nava", stdin: "", content: NAVA },
  mix: { name: "ترکیبی.mix", stdin: "", content: MIX },
  farsi: { name: "دماسنج.فا", stdin: "38.2", content: FARSI },
  english: { name: "calculator.jib", stdin: "12\n30", content: ENGLISH },
  binary: { name: "machine.bit", stdin: "", content: BINARY },
  python: { name: "main.py", stdin: "38.2", content: PYTHON },
  javascript: { name: "main.js", stdin: "", content: JAVASCRIPT },
  c: { name: "main.c", stdin: "12", content: C },
  cpp: { name: "main.cpp", stdin: "", content: CPP },
  css: { name: "theme.css", stdin: "", content: CSS },
  html: { name: "index.html", stdin: "", content: HTML },
};

function fileFrom(lang: Lang, id: string): LabFile {
  const sample = SAMPLES[lang];
  return {
    id,
    name: sample.name,
    lang,
    content: sample.content,
    stdin: sample.stdin,
  };
}

export const SEED_PROJECT: Project = {
  id: "proj-nava",
  name: "شروع با نوا",
  activeFileId: "file-nava",
  files: [fileFrom("nava", "file-nava")],
};

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function createProject(kind: TemplateKind, takenNames: string[]): Project {
  const title = kind === "mix" ? "آزمایشگاه کامل" : LANG_META[kind].label;
  const langs: Lang[] = kind === "mix" ? ["mix", "farsi", "english", "binary"] : [kind];
  const files = langs.map((lang) => fileFrom(lang, uid("file")));
  return {
    id: uid("proj"),
    name: uniqueName(title, takenNames),
    files,
    activeFileId: files[0]?.id ?? "",
  };
}

export function createFile(lang: Lang, takenNames: string[]): LabFile {
  const sample = SAMPLES[lang];
  const ext = LANG_META[lang].ext;
  const stem = sample.name.replace(new RegExp(`\\.${ext}$`), "");
  let name = sample.name;
  let n = 2;
  while (takenNames.includes(name)) {
    name = `${stem}-${n}.${ext}`;
    n += 1;
  }
  return {
    id: uid("file"),
    name,
    lang,
    content: sample.content,
    stdin: sample.stdin,
  };
}

export const TEMPLATE_CHOICES: { kind: TemplateKind; title: string; detail: string }[] = [
  { kind: "nava", title: "نوا", detail: "زبان سادهٔ فارسی: شرط، حلقه، کنش، زمان‌سنج، بوم، سه‌بعدی، ذخیره و هوش مصنوعی" },
  { kind: "mix", title: "آزمایشگاه کامل", detail: "فایل ترکیبی، جیب، جیب فارسی و ماشین" },
  { kind: "english", title: "جیب", detail: "برنامه، لیست و ماشین ۰ و ۱" },
  { kind: "binary", title: "ماشین ۰ و ۱", detail: "دستورهای هشت‌بیتی و لامپ‌ها" },
  { kind: "farsi", title: "جیب فارسی", detail: "همان زبان با واژه‌های فارسی" },
  { kind: "python", title: "پایتون", detail: "پایتون واقعی" },
  { kind: "javascript", title: "جاوااسکریپت", detail: "کنسول جاوااسکریپت" },
  { kind: "c", title: "سی", detail: "printf، حلقه و تابع" },
  { kind: "cpp", title: "سی‌پلاس‌پلاس", detail: "cin و cout" },
  { kind: "css", title: "سی‌اس‌اس", detail: "پیش‌نمایش زنده" },
  { kind: "html", title: "صفحهٔ وب", detail: "اچ‌تی‌ام‌ال، سی‌اس‌اس و جاوااسکریپت با پیش‌نمایش زنده" },
];
