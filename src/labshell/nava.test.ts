import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { compileNava, NAVA_FUNCTIONS, parseNava } from "./nava.ts";
import { navaEngine } from "./nava-runtime.ts";
import { evaluateCalculator } from "./nava-calculator.ts";
import { createVoxelWorld, castVoxelRay } from "./nava-voxel.ts";
import { buildNavaKit, NAVA_PRESETS } from "./nava-kit.ts";
import { APPEARANCE_CSS, NAVA_PALETTE, parseAppearance } from "./nava-appearance.ts";
import { compactNavaSource, normalizeNavaLine, NAVA_SHORT_WORDS } from "./nava-short.ts";

// موتور نوا را بدون مرورگر اجرا می‌کند: همهٔ کارهای بیرونی (صدا، نقاشی، حافظه…) فقط ثبت می‌شوند
async function run(source: string, opts: { saved?: unknown; ask?: (p: string) => Promise<string>; random?: number; now?: () => number } = {}) {
  const parsed = parseNava(source);
  if (!parsed.program) throw new Error(parsed.error);
  const log: unknown[][] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const once: { fn: () => void; ms: number }[] = [];
  const errors: string[] = [];
  let saved: unknown = opts.saved ?? null;
  let renders = 0;
  const io = {
    now: opts.now ?? (() => 1000),
    random: () => opts.random ?? 0.5,
    setInterval: (fn: () => void, ms: number) => timers.push({ fn, ms, live: true }),
    clearInterval: (id: number) => { const t = timers[id - 1]; if (t) t.live = false; },
    setTimeout: (fn: () => void, ms: number) => once.push({ fn, ms }),
    toast: (t: string) => log.push(["toast", t]),
    tone: (f: number, ms: number) => log.push(["tone", f, ms]),
    melody: (fs: number[]) => log.push(["melody", ...fs]),
    play: (src: string) => log.push(["play", src]),
    say: (t: string) => log.push(["say", t]),
    ask: opts.ask ?? (async (p: string) => `پاسخ به ${p}`),
    load: async () => saved,
    save: async (d: unknown) => { saved = d; log.push(["save", JSON.stringify(d)]); },
    draw: (op: string, a: unknown[]) => log.push(["draw", op, ...a]),
    obj: (op: string, n: string, a: number[]) => log.push(["obj", op, n, ...a]),
    cam: (d: number) => log.push(["cam", d]),
    fileText: (name: string) => (name.startsWith("data:") ? "خط۱\nخط۲" : (() => { throw new Error("پیوست پیدا نشد"); })()),
    error: (m: string) => errors.push(m),
    render: () => { renders++; },
  };
  const api = navaEngine(parsed.program, io);
  await api.start();
  return { api, S: api.S, log, timers, once, errors, program: parsed.program, saved: () => saved, renders: () => renders };
}
const tick = async () => { await new Promise((r) => setTimeout(r, 0)); };

test("old Nava programs still compile and behave (counter, old button form, input)", async () => {
  const src = `برنامه "شمارنده"\nعنوان "آزمایش"\nعدد شمارنده = ۰\nنمایش "تعداد: {شمارنده}"\nدکمه "افزایش": شمارنده = شمارنده + ۱\nدکمه "از اول" وقتی زده شد: شمارنده = ۰\nورودی نام "نامت را بنویس"\nنمایش "سلام، {نام}"`;
  const web = compileNava(src).web;
  assert.ok(web);
  assert.match(web.html, /آزمایش/);
  assert.match(web.html, /data-nv-btn="1"/);
  const r = await run(src);
  r.api.click(0); r.api.click(0);
  assert.equal(r.S["شمارنده"], 2);
  assert.equal(r.api.text(r.program.shows[0]!.e, 4), "تعداد: ۲");
  r.api.click(1);
  assert.equal(r.S["شمارنده"], 0);
  r.api.input("نام", "حسین");
  assert.equal(r.api.text(r.program.shows[1]!.e, 8), "سلام، حسین");
});

test("conditionals: اگر / وگرنه اگر / وگرنه, inline if, و/یا/نه and = as comparison", async () => {
  const r = await run(`عدد x = ۵\nمتغیر پیام = ""\nعنوان "شرط"\nدکمه "بررسی"\n  اگر x > ۱۰\n    پیام = "بزرگ"\n  وگرنه اگر x = ۵ و نه (x < ۰)\n    پیام = "پنج"\n  وگرنه\n    پیام = "کوچک"\n  پایان\n  اگر x >= ۵ یا x == ۱۰۰: x += ۱۰\nپایان`);
  r.api.click(0);
  assert.equal(r.S["پیام"], "پنج");
  assert.equal(r.S["x"], 15);
  r.api.click(0);
  assert.equal(r.S["پیام"], "بزرگ");
});

test("lists and loops: literal, index from 1, add/remove, برای هر، برای از تا، تکرار، تا وقتی", async () => {
  const r = await run(`لیست ل = ["ب"، "ج"]\nعدد جمع‌کل = ۰\nلیست زوج‌ها\nعنوان "لیست"\nدکمه "کار"
  افزودن "الف" به اول ل
  افزودن "د" به ل
  ل[۲] = "B"
  حذف "ج" از ل
  برای هر عدد‌ها در [۱، ۲، ۳]: جمع‌کل += عدد‌ها
  برای i از ۱ تا ۶
    اگر i % ۲ = ۰: افزودن i به زوج‌ها
  پایان
  تکرار ۳ بار با k: جمع‌کل += k * ۱۰
  تا وقتی طول(زوج‌ها) > ۱: حذف آخر از زوج‌ها
  حذف شماره ۱ از ل
پایان`);
  r.api.click(0);
  assert.deepEqual(r.S["ل"], ["B", "د"]);
  assert.equal(r.S["جمع‌کل"], 66);
  assert.deepEqual(r.S["زوج‌ها"], [2]);
});

test("کنش with inputs, تابع with نتیجه, recursion and برگرد", async () => {
  const r = await run(`عدد نتیجه‌نهایی = ۰\nمتغیر سلام‌ها = ""\nعنوان "توابع"\ntabع_placeholder`.replace("tabع_placeholder", `دکمه "حساب": نتیجه‌نهایی = فاکتوریل(۵) + دوبرابر(۱)؛ اجرا خوش‌آمد "علی"
تابع فاکتوریل با n
  اگر n <= ۱: نتیجه ۱
  نتیجه n * فاکتوریل(n - ۱)
پایان
تابع دوبرابر با a: نتیجه a * ۲
کنش خوش‌آمد با اسم
  اگر اسم = "": برگرد
  سلام‌ها = سلام‌ها + "سلام " + اسم
  برگرد
  سلام‌ها = "نباید برسد"
پایان`));
  r.api.click(0);
  assert.equal(r.S["نتیجه‌نهایی"], 122);
  assert.equal(r.S["سلام‌ها"], "سلام علی");
});

test("timers: هر … ثانیه, بعد از … ثانیه, توقف and ادامه", async () => {
  const r = await run(`عدد t = ۰\nعدد یکبار = ۰\nعنوان "زمان"\nهر ۰.۵ ثانیه: t += ۱\nبعد از ۲ ثانیه: یکبار = ۱\nدکمه "ایست": توقف\nدکمه "ادامه": ادامه`);
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0]!.ms, 500);
  r.timers[0]!.fn(); r.timers[0]!.fn();
  assert.equal(r.S["t"], 2);
  assert.equal(r.once[0]!.ms, 2000);
  r.once[0]!.fn();
  assert.equal(r.S["یکبار"], 1);
  r.api.click(0);
  assert.equal(r.timers[0]!.live, false);
  assert.equal(r.api.running, false);
  r.api.click(1);
  assert.equal(r.timers.length, 2);
  assert.equal(r.api.running, true);
});

test("canvas drawing, touch and key/swipe events", async () => {
  const r = await run(`بوم ۲۰۰، ۱۰۰\nعدد n = ۲\nپاک "#000"\nدایره ۱۰، ۲۰، n * ۵، "red"\nمستطیل ۰، ۰، ۱۰، ۱۰\nخط ۰، ۰، ۵۰، ۵۰، "blue"، ۲\nنوشته "امتیاز {n}"، ۵۰، ۵۰\nتصویر "سیب.png"، ۰، ۰، ۲۰، ۲۰\nوقتی لمس: n = ایکس + ایگرگ\nوقتی کلید: اگر کلید = "بالا": n = -۱`);
  const draws = r.log.filter((x) => x[0] === "draw");
  assert.deepEqual(draws[0], ["draw", "پاک", "#000"]);
  assert.deepEqual(draws[1], ["draw", "دایره", 10, 20, 10, "red"]);
  assert.deepEqual(draws[4], ["draw", "نوشته", "امتیاز ۲", 50, 50]);
  assert.deepEqual(r.program.images, ["سیب.png"]);
  assert.deepEqual(r.program.canvas, { w: 200, h: 100 });
  r.api.touch(30.4, 12);
  assert.equal(r.S["n"], 42);
  r.api.key("بالا");
  assert.equal(r.S["n"], -1);
  assert.match(compileNava(`بوم\nدایره ۱، ۲، ۳`).web?.html ?? "", /id="nv-canvas"/);
});

test("3D scene: shapes, start position, rotation, move, size and camera", async () => {
  const src = `صحنه ۳۰۰، ۲۰۰\nمکعب جعبه "#67f5a5"\nکره توپ "red" در ۱، ۲، ۳\nهرم ه\nزمین کف\nدکمه "بچرخ": بچرخان جعبه ۱۰، ۲۰، ۰؛ حرکت توپ ۰، ۱، ۰؛ جابجا ه ۰، ۰، ۰؛ اندازه جعبه ۲؛ دوربین ۸`;
  const r = await run(src);
  assert.deepEqual(r.log[0], ["obj", "جابجا", "توپ", 1, 2, 3]);
  r.api.click(0);
  assert.deepEqual(r.log.slice(1), [["obj", "بچرخان", "جعبه", 10, 20, 0], ["obj", "حرکت", "توپ", 0, 1, 0], ["obj", "جابجا", "ه", 0, 0, 0], ["obj", "اندازه", "جعبه", 2], ["cam", 8]]);
  assert.equal(r.program.shapes.length, 4);
  const web = compileNava(src).web!;
  assert.match(web.html, /id="nv-scene"/);
  assert.match(web.js, /getContext\("webgl"/);
});

test("ذخیره restores saved values and saves only when they change", async () => {
  const src = `عدد امتیاز = ۰\nلیست کارها\nذخیره امتیاز، کارها\nعنوان "حافظه"\nدکمه "+": امتیاز += ۱\nدکمه "هیچ": پیام "x"`;
  const r = await run(src, { saved: { امتیاز: 7, کارها: ["نان"] } });
  assert.equal(r.S["امتیاز"], 7);
  assert.deepEqual(r.S["کارها"], ["نان"]);
  r.api.click(1);
  assert.equal(r.log.filter((x) => x[0] === "save").length, 0);
  r.api.click(0);
  await tick();
  assert.deepEqual(r.saved(), { امتیاز: 8, کارها: ["نان"] });
  r.api.removeAt("کارها", 0);
  await tick();
  assert.deepEqual(r.saved(), { امتیاز: 8, کارها: [] });
});

test("بپرس (AI): placeholder while waiting, then the answer or a readable error", async () => {
  const r = await run(`متغیر جواب = ""\nورودی سوال "?"\nعنوان "هوش"\nدکمه "بپرس": بپرس جواب = "خلاصه کن: " + سوال`);
  r.api.input("سوال", "نوا");
  r.api.click(0);
  assert.match(String(r.S["جواب"]), /در حال فکر/);
  await tick(); await tick();
  assert.equal(r.S["جواب"], "پاسخ به خلاصه کن: نوا");
  const bad = await run(`متغیر جواب = ""\nعنوان "هوش"\nدکمه "بپرس": بپرس جواب = "x"`, { ask: async () => { throw new Error("Gemini وصل نیست"); } });
  bad.api.click(0);
  await tick(); await tick();
  assert.equal(bad.S["جواب"], "⚠️ Gemini وصل نیست");
});

test("sound, message, speech, file text and every built-in function", async () => {
  const r = await run(`عنوان "توابع"\nمتغیر داده = فایل("data:text/plain;base64,AAAA")\nصدا ۴۴۰، ۲۰۰\nصدا "زنگ.mp3"\nآهنگ ۲۶۲، ۳۳۰\nپیام "سلام {۱ + ۲}"\nبگو "خداحافظ"`);
  assert.deepEqual(r.log.slice(0, 5), [["tone", 440, 200], ["play", "زنگ.mp3"], ["melody", 262, 330], ["toast", "سلام ۳"], ["say", "خداحافظ"]]);
  assert.equal(r.S["داده"], "خط۱\nخط۲");
  const p = await run(`عنوان "x"\nلیست ن = []`);
  const val = (src: string) => {
    const parsed = parseNava(`عنوان "x"\nنمایش ${src}`);
    if (!parsed.program) throw new Error(`${src}: ${parsed.error}`);
    return p.api.text(parsed.program.shows[0]!.e, 1);
  };
  const cases: [string, string][] = [
    ["تصادفی(۱، ۶)", "۴"], ["طول([۱، ۲، ۳])", "۳"], ["گرد(۲.۶۷، ۱)", "۲٫۷"], ["صحیح(۲.۹)", "۲"], ["قدرمطلق(-۳)", "۳"], ["جذر(۸۱)", "۹"],
    ["توان(۲، ۱۰)", "۱٬۰۲۴"], ["حداقل(۴، ۲، ۸)", "۲"], ["حداکثر([۴، ۹])", "۹"], ["جمع(۱، ۲، ۳)", "۶"], ["گرد(سینوس(۹۰))", "۱"], ["گرد(کسینوس(۰))", "۱"],
    ["فاصله(۰، ۰، ۳، ۴)", "۵"], ["عدد(\"۱۲\") + ۱", "۱۳"], ["متن(۵) + \"!\"", "۵!"], ["زمان()", "۰"], ["طول(ساعت()) > ۰", "درست"], ["طول(تاریخ()) > ۰", "درست"],
    ["شامل([[۱، ۲]]، [۱، ۲])", "درست"], ["جای([\"الف\"، \"ب\"]، \"ب\")", "۲"], ["جدا(\"الف ب  ج\")", "الف، ب، ج"], ["چسب([۱، ۲]، \"-\")", "۱-۲"], ["خطوط(\"a\\nb\")", "a، b"],
    ["برعکس([۱، ۲])", "۲، ۱"], ["مرتب([۳، ۱، ۲])", "۱، ۲، ۳"], ["بخش([۱، ۲، ۳، ۴]، ۲، ۳)", "۲، ۳"],
  ];
  const tested = new Set<string>(["فایل"]);
  for (const [src, want] of cases) {
    assert.equal(val(src), want, src);
    for (const f of NAVA_FUNCTIONS) if (src.includes(`${f}(`)) tested.add(f);
  }
  assert.deepEqual([...tested].sort(), [...NAVA_FUNCTIONS].sort(), "every built-in function has a test");
  assert.equal(val(`"۲" + ۳`), "۵", "numeric text from inputs adds as a number");
});

test("UI: rows, lists with delete, input kinds, conditional display, dynamic title", async () => {
  const src = `لیست کارها = ["الف"]\nعنوان "سلام {طول(کارها)}"\nردیف\n  دکمه "یک": کارها = []\n  دکمه "دو"\n    افزودن "ب" به کارها\n  پایان\nپایان\nفهرست کارها با حذف\nورودی سن "سن" عدد\nورودی رمزعبور "رمز" رمز\nورودی یادداشت "یادداشت" چندخطی\nنمایش "خالی!" اگر طول(کارها) = ۰`;
  const web = compileNava(src).web!;
  assert.match(web.html, /class="nv-row"><button[^>]*data-nv-btn="0">یک<\/button><button[^>]*data-nv-btn="1">دو/);
  assert.match(web.html, /<ul class="nv-list" data-nv-list="0">/);
  assert.match(web.html, /inputmode="decimal"/);
  assert.match(web.html, /type="password"/);
  assert.match(web.html, /<textarea/);
  assert.match(web.html, /<h1 data-nv-show="0">/);
  const r = await run(src);
  assert.equal(r.S["سن"], 0);
  assert.equal(r.api.truth(r.program.shows[1]!.when, 1), false);
  r.api.click(0);
  assert.equal(r.api.truth(r.program.shows[1]!.when, 1), true);
  r.api.click(1);
  assert.deepEqual(r.S["کارها"], ["ب"]);
});

test("Persian, line-aware errors at compile time", () => {
  const err = (src: string) => compileNava(src).error ?? "";
  assert.match(err(`عنوان "خوب"\nنمایش گمشده`), /^خط 2:.*تعریف نشده/);
  assert.match(err("دستور ناشناخته"), /^خط 1:/);
  assert.match(err(`عنوان "x"\nاگر ۱ > ۰\n  پیام "x"`), /^خط 2:.*«پایان» ندارد/);
  assert.match(err(`عنوان "x"\nدایره ۱، ۲، ۳`), /^خط 2:.*بوم/);
  assert.match(err(`بوم\nدایره ۱، ۲`), /^خط 2:.*الگو: دایره/);
  assert.match(err(`عنوان "x"\nعدد n = ۰\nدکمه "خراب": n = alert(1)`), /^خط 3:.*تابع «alert» را نمی‌شناسم|عبارت دکمه/);
  assert.match(err(`عنوان "x"\nدکمه "y"\n  متغیر محلی = ""\n  بپرس محلی = "سلام"\nپایان`), /^خط 4:.*سراسری/);
  assert.match(err(`عنوان "x"\nعدد n = ۰\nعدد n = ۱`), /^خط 3:.*قبلاً در خط 2/);
  assert.match(err(`عنوان "x"\nکنش ک با a\n  پیام a\nپایان\nدکمه "y": اجرا ک`), /^خط 5:.*۱ ورودی|^خط 5:.*1 ورودی/);
  assert.match(err(`عنوان "x"\nدکمه "y"\n  عنوان "z"\nپایان`), /^خط 3:.*سطح بیرونی/);
  assert.match(err(`عنوان "x"\nوگرنه`), /^خط 2:/);
  assert.match(err(`صحنه\nبچرخان گمشده ۱، ۲، ۳`), /^خط 2:.*شکل «گمشده»/);
  assert.match(err(`عنوان "x"\nعدد n = (۱ + ۲`), /^خط 2:.*پرانتز/);
  assert.match(err(""), /چیزی برای نمایش ندارد/);
});

test("runtime errors are reported with line numbers and stop timers (division by zero, endless loop, bad index)", async () => {
  const r = await run(`عدد n = ۰\nعنوان "x"\nهر ۱ ثانیه: n += ۱\nدکمه "صفر": n = ۵ / ۰`);
  r.api.click(0);
  assert.match(r.errors[0] ?? "", /^خط 4: تقسیم بر صفر/);
  assert.equal(r.timers[0]!.live, false);
  const loop = await run(`عنوان "x"\nدکمه "حلقه"\n  تا وقتی درست\n    پیام "!"\n  پایان\nپایان`);
  loop.api.click(0);
  assert.match(loop.errors[0] ?? "", /^خط 3:.*تمام نمی‌شود/);
  const idx = await run(`لیست ل = [۱]\nعنوان "x"\nدکمه "بد": ل[۵] = ۲`);
  idx.api.click(0);
  assert.match(idx.errors[0] ?? "", /^خط 3:.*شمارهٔ ۵/);
});

test("compiled page is safe: user text escaped, no user code becomes JavaScript", () => {
  const web = compileNava(`عنوان "<script>alert(1)</script>"\nمتغیر m = "</script><img onerror=alert(1)>"\nنمایش m`).web!;
  assert.match(web.html, /&lt;script&gt;/);
  assert.doesNotMatch(web.js, /<\/script/i);
  assert.doesNotMatch(web.js, /\beval\s*\(|new Function/);
  assert.match(web.js, /\\u003c\/script>/);
  assert.doesNotMatch(web.js, /innerHTML/);
});

test("all built-in Nava sample packs compile", () => {
  const dir = new URL("./packs/", import.meta.url);
  const packs = readdirSync(dir).filter((f) => f.startsWith("nava-") && f.endsWith(".jibpack"));
  assert.ok(packs.length >= 4);
  for (const f of packs) {
    const text = readFileSync(new URL(f, dir), "utf8");
    const code = text.split(/^@@@ file main\.nava\n/m)[1] ?? "";
    const lines = code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
    assert.ok(lines <= 60, `${f} stays short (${lines} lines)`);
    const res = compileNava(code);
    assert.equal(res.error, undefined, `${f}: ${res.error}`);
  }
});

test("every example in NAVA-GUIDE.md compiles, and the guide's canvas loop + function runs", async () => {
  const guide = readFileSync(new URL("../../NAVA-GUIDE.md", import.meta.url), "utf8");
  const blocks = [...guide.matchAll(/```(?:nava)?[ \t]*\n([\s\S]*?)```/g)].map((m) => m[1]!);
  assert.ok(blocks.length >= 3);
  for (const b of blocks) assert.equal(compileNava(b).error, undefined, `${b.split("\n")[0]}: ${compileNava(b).error}`);
  const paint = blocks.find((b) => b.includes("رنگ‌شماره"))!;
  const r = await run(paint);
  const circles = r.log.filter((x) => x[0] === "draw" && x[1] === "دایره");
  assert.equal(circles.length, 9);
  assert.deepEqual(circles.slice(0, 2).map((c) => c[5]), ["#ffc56b", "#59d7ff"]);
});

// ───────────── نوا ۰٫۴ (از بستهٔ کاربر): مخفف‌ها، ابزارهای آماده، کپسول ظاهر دکمه، تعریف/استفاده ─────────────
test("all abbreviated commands produce the same program as their full equivalents", () => {
  const full = `تعریف "ابزار من"
ماشین‌حساب موبایل
شمارنده
تایمر ۳
پایان
صفحه "تو باختی"
برنامه "بازی من"
عنوان "پیام بازی"
متن "تو باختی؛ دوباره امتحان کن"
رنگ #67f5a5
پس‌زمینه #101410
عدد امتیاز = ۰
متغیر پیام = "تو باختی"
متغیر آماده = درست
ورودی نام "نامت را بنویس"
نمایش "امتیاز: {امتیاز}"
دکمه "شروع: دوباره" (ru240rn64yGi65G72): بگو "تو باختی"
دکمه "اضافه": امتیاز = امتیاز + ۱
دکمه "توقف": آماده = نادرست
عکس "عکس من.png" توضیح "متن توضیح؛ تو باختی"
جهان بلوکی اندازه ۱۲ بذر ۷
بلوک "سنگ من" #aabbcc
استفاده "ابزار من"`;
  const compact = compactNavaSource(full);
  const old = compileNava(full), next = compileNava(compact);
  assert.ok(old.web, old.error); assert.ok(next.web, next.error);
  assert.deepEqual(next.web, old.web);
  assert.match(compact, /^pg "تو باختی"$/m);
  assert.match(compact, /bt "شروع: دوباره" .*: sy "تو باختی"/);
  assert.match(compact, /^vx sz ۱۲ sd ۷$/m);
  assert.match(compact, /^var آماده = tr$/m);
  assert.match(compact, /^bt "توقف": آماده = fl$/m);
});

test("compaction preserves literal bytes, identifiers, comments and CRLF", () => {
  const source = '  # صفحه tx bt sy tr fl\r\n\r\nمتغیر bt = "صفحه pg; تو باختی; \\"sy\\""\r\nعدد sy = ۰\r\nنمایش "{bt} {sy}"\r\nدکمه "bt: sy" : sy = sy + ۱\r\nعکس "pg alt.png" توضیح "تو باختی"\r\n';
  const compact = compactNavaSource(source);
  assert.match(compact, /var bt = "صفحه pg; تو باختی; \\"sy\\""/);
  assert.match(compact, /num sy = ۰/);
  assert.match(compact, /bt "bt: sy" : sy = sy \+ ۱/);
  assert.match(compact, /img "pg alt.png" alt "تو باختی"/);
  assert.ok(compact.startsWith('  # صفحه tx bt sy tr fl\r\n\r\n'));
  assert.equal(compact.match(/\r\n/g)?.length, source.match(/\r\n/g)?.length);
  assert.equal(compactNavaSource(compact), compact);
  assert.deepEqual(compileNava(compact).web, compileNava(source).web);
  assert.ok(compileNava(compact).web);
});

test("short message actions work without abbreviating what the user sees", async () => {
  const src = 'bt"شروع"(ru240rn64yGi65G72):sy"تو باختی"';
  const result = compileNava(src);
  assert.ok(result.web, result.error);
  assert.match(result.web.html, />شروع<\/span>/);
  assert.match(result.web.html, /class="nv-message" role="status"[^>]*hidden/);
  const r = await run(src);
  r.api.click(0);
  assert.deepEqual(r.log.filter((x) => x[0] === "say"), [["say", "تو باختی"]]);
  assert.ok(compileNava('bt "شروع" on sy "تو باختی"').web);
});

test("compact boolean expressions and variable names sharing command codes work", async () => {
  const src = 'num sy = ۰\nvar bt = fl\nout "{sy} {bt}"\nbt "امتیاز": sy = sy + ۱\nbt "آماده": bt = tr == tr\nbt "خاموش" on bt = fl';
  assert.ok(compileNava(src).web, compileNava(src).error);
  const r = await run(src);
  assert.equal(r.S["bt"], false);
  r.api.click(0); assert.equal(r.S["sy"], 1);
  r.api.click(1); assert.equal(r.S["bt"], true);
  r.api.click(2); assert.equal(r.S["bt"], false);
  for (const name of ["tr", "fl"]) assert.match(compileNava(`var ${name} = ۰\ntx "a"`).error ?? "", /نام مناسبی/);
  // داخل بلوک هم «bt = …» انتساب است، نه دستور دکمه
  const block = await run('var bt = tr\nhd "x"\nbt "y"\n  bt = fl\nend');
  block.api.click(0); assert.equal(block.S["bt"], false);
});

test("compact recipes keep source locations, limits and cycle checks", () => {
  assert.match(compileNava('df "خراب"\nunknown\nend\nus "خراب"').error ?? "", /خط 2:/);
  assert.match(compileNava('df "حلقه"\nus "حلقه"\nend\nus "حلقه"').error ?? "", /حلقه‌ای/);
  assert.match(compileNava('tm ۰').error ?? "", /تایمر/);
  assert.match(compileNava('vx sz ۹۹ sd ۷').error ?? "", /اندازه/);
  assert.match(compileNava('BT "شروع": sy "تو باختی"').error ?? "", /خط 1:/);
});

test("recipes can hold full Nava 2.2 blocks (اگر/تکرار/دکمه … پایان) and mix with short forms", async () => {
  const src = `df "امتیازدهی"
bt "افزایش"
  اگر امتیاز < ۳
    امتیاز += ۱
  وگرنه
    پیام "حداکثر!"
  end
end
out "امتیاز: {امتیاز}"
end
num امتیاز = ۰
pg "بازی"
us "امتیازدهی"
cnt`;
  const web = compileNava(src).web;
  assert.ok(web, compileNava(src).error);
  assert.match(web.html, /data-nv-btn="0"/);
  assert.match(web.html, /id="nava-kit-0"/);
  const r = await run(src);
  for (let i = 0; i < 4; i++) r.api.click(0);
  assert.equal(r.S["امتیاز"], 3);
  assert.deepEqual(r.log.filter((x) => x[0] === "toast"), [["toast", "حداکثر!"]]);
  assert.match(compileNava('عنوان "x"\nدکمه "y"\n  ماشین‌حساب\nپایان').error ?? "", /^خط 3:.*سطح بیرونی/);
});

test("keyword registry is unique, compact and only rewrites grammar positions", () => {
  assert.equal(new Set(NAVA_SHORT_WORDS.map((word) => word.short)).size, NAVA_SHORT_WORDS.length);
  for (const word of NAVA_SHORT_WORDS) assert.match(word.short, /^[a-z]{2,3}$/);
  assert.equal(normalizeNavaLine('pg "bt sy tr"'), 'صفحه "bt sy tr"');
  assert.equal(normalizeNavaLine('tx "var = fl; تو باختی"'), 'متن "var = fl; تو باختی"');
  assert.equal(normalizeNavaLine('متغیر x = «tr»'), 'متغیر x = «tr»');
  assert.equal(normalizeNavaLine('bt = fl'), 'bt = fl');
  assert.equal(compactNavaSource('جهان   بلوکی اندازه ۲۴ بذر ۷'), 'vx sz ۲۴ sd ۷');
  assert.equal(compactNavaSource("متن 'تو باختی bt sy'"), "tx 'تو باختی bt sy'");
  assert.equal(compactNavaSource('متن "عبارت ناتمام bt'), 'tx "عبارت ناتمام bt');
});

test("packed appearance accepts the exact requested code and stays deterministic", () => {
  const raw = "(ru5736rn728yGi65G72)";
  const first = parseAppearance(raw); assert.ok(first.value);
  assert.equal(first.value.width, 5736); assert.equal(first.value.height, 728);
  assert.equal(first.value.first, "#e66464"); assert.equal(first.value.second, "#a5a7ae");
  assert.deepEqual(first, parseAppearance(raw));
  assert.deepEqual(first, parseAppearance("(ru۵۷۳۶rn۷۲۸yGi۶۵G۷۲)"));
  const program = compileNava(`دکمه "شروع" ${raw}: بگو "آماده"`);
  assert.ok(program.web, program.error);
  assert.match(program.web.html, /data-nava-size="5736x728"/);
  assert.match(program.web.css, /width:min\(100%,max\(64px,var\(--nv-width\)\)\)/);
  assert.match(program.web.css, /aspect-ratio:var\(--nv-ratio\)/);
  assert.doesNotMatch(APPEARANCE_CSS, /gradient|color-mix|opacity|brightness/);
  assert.equal(compileNava(`دکمه "شروع" ${raw}: بگو "آماده"`).web?.html, program.web.html);
});

test("packed buttons reject malformed sizes, palettes and injected styles", () => {
  for (const code of ["(ru0rn64yGi65G72)", "(ru8193rn64yGi65G72)", "(ru240rn2049yGi65G72)", "(ru24.5rn64yGi65G72)", "(ru240rn64yGi65Z99)", "(ru240rn64yGi65Gi65)", "(ru240rn64ygi65G72)", "(ru240rn64yGi65G72;background:red)", "(rn64ru240yGi65G72)"]) {
    assert.ok(parseAppearance(code).error, code);
    assert.match(compileNava(`عنوان "سلام"\nدکمه "خوب" ${code}`).error ?? "", /خط 2:/, code);
  }
  for (const code of Object.keys(NAVA_PALETTE)) {
    assert.ok(parseAppearance(`(ru240rn64y${code}${code === "D08" ? "W90" : "D08"})`).value, code);
  }
});

test("capital-led Nava glyph source compiles with tagged numbers and optional appearance details", () => {
  const source = `Pg "Counter"
Num Total = N0
Out "Score: {Total}"
Bt "Add" (Ru160Rn56Rr): Total = Total + N1`;
  const result = compileNava(source);
  assert.ok(result.web, result.error);
  assert.match(result.web.html, /data-nava-size="160x56"/);
  assert.match(result.web.html, /data-nava-relief="true"/);
  assert.match(result.web.html, /data-nava-graphics="ultra"/);
  assert.equal(compileNava(source).web?.html, result.web.html);
  assert.ok(compileNava(`Pg "Simple"
Bt "Go" (Ru180Rn60): Sy "Ready"`).web);
  const decimal = compileNava(`Pg "Fraction"
Num Ratio = N0d5
Tx "Ready"`);
  assert.ok(decimal.web, decimal.error);
  assert.match(decimal.web.js, /0\.5/);
});

test("glyph mode rejects lower-case atoms and untagged numeric literals but preserves quoted text", () => {
  assert.match(compileNava(`Pg "Hello"
tx "English words stay readable"`).error ?? "", /با حرف بزرگ/u);
  assert.match(compileNava(`Pg "Hello"
Bt "Plus": Total = Total + 1`).error ?? "", /عدد آزاد/u);
  assert.match(compileNava(`Pg "Hello"
متن "x"`).error ?? "", /کد لاتین/u);
  assert.ok(compileNava(`Pg "Hello"
Tx "تو باختی 1"`).web);
  assert.ok(compileNava(`# note 1
Pg "Hello"
Tx "Ready"`).web);
});

test("graphics quality has exactly low and ultra presets and reaches voxel rendering", () => {
  const low = compileNava(`Pg "World"
G1
Vx Sz N12 Sd N7`);
  const ultra = compileNava(`Pg "World"
G9
Vx Sz N12 Sd N7`);
  assert.ok(low.web, low.error); assert.ok(ultra.web, ultra.error);
  assert.match(low.web.html, /data-nava-graphics="low"/);
  assert.match(ultra.web.html, /data-nava-graphics="ultra"/);
  assert.match(low.web.js, /quality":"low"/);
  assert.match(ultra.web.js, /quality":"ultra"/);
  assert.doesNotMatch(low.web.html + ultra.web.html, /data-nava-graphics="medium"/);
});

test("Neon Rift touch controls, collision, scoring and restart work without UI buttons", async () => {
  const source = readFileSync(new URL("../../examples/neon-rift.nava", import.meta.url), "utf8");
  const web = compileNava(source);
  assert.ok(web.web, web.error);
  assert.match(web.web.html, /nv-game/);
  assert.doesNotMatch(web.web.html, /<button/);
  let now = 1000;
  const r = await run(source, { now: () => now, random: 0 });
  const advance = (frames = 1) => { for (let i = 0; i < frames; i++) { now += 30; r.timers[0]!.fn(); } };
  r.api.touch(20, 300); advance(20);
  assert.ok(r.S.Px < -1.3, "left third moves the player left");
  r.api.touch(340, 300); advance(20);
  assert.ok(r.S.Px > 1.3, "right third moves the player right");
  r.S.Auto = false;
  const cross = (lane: number) => { r.S.Depth = 1.08; r.S.EnemyLane = lane; advance(); };
  cross(1); assert.equal(r.S.Lives, 2);
  cross(-1); assert.equal(r.S.Score, 1); assert.equal(r.S.Lives, 2);
  cross(1); cross(1); assert.equal(r.S.Lives, 0); assert.equal(r.S.Live, false);
  r.api.touch(180, 300); advance();
  assert.equal(r.S.Lives, 3); assert.equal(r.S.Score, 0); assert.equal(r.S.Live, true);
  assert.ok(r.S.Depth < -5); assert.deepEqual(r.errors, []);
  r.S.Auto = true;
  r.S.Px = r.S.Target = 1.4;
  r.S.Depth = 1.08; r.S.EnemyLane = 1;
  advance();
  assert.equal(r.S.Px, 0, "automatic dodge teleports to a safe lane before contact");
  assert.equal(r.S.Target, 0, "smoothing must not pull the player back into danger");
  assert.equal(r.S.Lives, 3); assert.equal(r.S.Score, 1);
});

test("one-line button includes appearance, colon-bearing label and a working message", async () => {
  const src = 'دکمه "پیام: سلام" (ru240rn64yGi65G72): بگو "<img src=x onerror=bad()>"';
  const result = compileNava(src);
  assert.ok(result.web, result.error); assert.match(result.web.html, /پیام: سلام/);
  assert.match(result.web.html, /role="status"/);
  assert.doesNotMatch(result.web.html, /<img src=x/);
  assert.doesNotMatch(result.web.js, /innerHTML/);
  const r = await run(src);
  r.api.click(0);
  assert.deepEqual(r.log.filter((x) => x[0] === "say"), [["say", "<img src=x onerror=bad()>"]]);
});

test("packed state actions and older natural button syntax remain compatible", async () => {
  const src = 'عدد n = ۰\nنمایش n\nدکمه "افزایش: یک" (ru240rn64yN24D08): n = n + ۱\nدکمه "از اول" وقتی زده شد: n = ۰\nدکمه "ظاهر تنها" (ru120rn44yB48W90)';
  assert.ok(compileNava(src).web, compileNava(src).error);
  const r = await run(src);
  r.api.click(0); assert.equal(r.S["n"], 1);
  r.api.click(2); assert.equal(r.S["n"], 1);
  r.api.click(1); assert.equal(r.S["n"], 0);
});

test("one-line pages and short high-level presets generate valid offline programs", () => {
  for (const preset of [...NAVA_PRESETS, { code: 'صفحه "سلام"' }]) {
    const result = compileNava(preset.code);
    assert.ok(result.web, result.error);
    const js = result.web.js;
    assert.doesNotThrow(() => new vm.Script(js));
    assert.doesNotMatch(result.web.js, /\beval\s*\(/);
    assert.doesNotMatch(result.web.html, /<script[^>]+src=/);
  }
  assert.ok(NAVA_PRESETS[0].code.trim().split(/\s+/).length <= 12);
});

test("calculator arithmetic includes precedence, mobile percentages and errors", () => {
  for (const [source, expected] of [["۲+۳*۴", 14], ["(۲+۳)*۴", 20], ["200+10%", 220], ["200-10%", 180], ["200*10%", 20], ["0.1+0.2", .3], ["(-5)+3", -2], [".5*2", 1], ["1e3+2", 1002]] as const) assert.equal(evaluateCalculator(source), expected, source);
  for (const source of ["1/0", "alert(1)", "1+", "(2+3", "3..4", ""]) assert.throws(() => evaluateCalculator(source), Error, source);
});

// ابزارهای آماده کد اجرایی خودشان را دارند؛ اینجا همان کدی که در صفحه قرار می‌گیرد جداگانه در vm اجرا می‌شود
const kitJs = (source: string, request: Parameters<typeof buildNavaKit>[0]) => {
  const web = compileNava(source).web;
  assert.ok(web, compileNava(source).error);
  const js = buildNavaKit(request, "nava-kit-0", []).js;
  assert.ok(web.js.includes(js), "kit runtime is embedded in the compiled page");
  return js;
};

test("generated calculator responds to keypad, history, sign and keyboard", () => {
  const js = kitJs("ماشین‌حساب موبایل", { kind: "calculator" });
  const expression = { textContent: "" }, output = { textContent: "", dataset: {} };
  const history: { rows: unknown[]; replaceChildren: () => void; append: (row: unknown) => void } = { rows: [], replaceChildren() { this.rows = []; }, append(row) { this.rows.push(row); } };
  const events: Record<string, (event: unknown) => void> = {};
  const root = { focus() {}, querySelector(selector: string) { return selector === ".nc-expression" ? expression : selector === ".nc-output" ? output : history; }, addEventListener(name: string, fn: (event: unknown) => void) { events[name] = fn; } };
  const document = { querySelectorAll: () => [], getElementById: () => root, createElement: () => ({ textContent: "" }) };
  vm.runInNewContext(js, { document, Intl });
  const press = (key: string) => events.click({ target: { closest: () => ({ dataset: { calcKey: key } }) } });
  for (const key of ["2", "0", "0", "+", "1", "0", "%", "="]) press(key);
  assert.equal(output.textContent, "۲۲۰"); assert.equal(history.rows.length, 1);
  press("AC"); press("5"); press("sign"); assert.equal(output.textContent, "-۵");
  press("sign"); assert.equal(output.textContent, "۵");
  press("AC"); for (const key of ["2", "-", "3", "sign", "="]) press(key);
  assert.equal(output.textContent, "۵");
  press("AC"); events.keydown({ key: "7", preventDefault() {} });
  assert.equal(output.textContent, "۷");
});

test("recipes expand reusable components, reject cycles and retain source line errors", () => {
  const result = compileNava('تعریف "ابزار"\nماشین‌حساب\nپایان\nاستفاده "ابزار"\nاستفاده "ابزار"');
  assert.ok(result.web); assert.match(result.web.html, /id="nava-kit-0"/); assert.match(result.web.html, /id="nava-kit-1"/);
  assert.match(compileNava('تعریف "دور"\nاستفاده "دور"\nپایان\nاستفاده "دور"').error ?? "", /حلقه‌ای/);
  assert.match(compileNava('تعریف "خراب"\nهیچ\nپایان\nاستفاده "خراب"').error ?? "", /خط 2:/);
  assert.match(compileNava('استفاده "ناشناخته"').error ?? "", /تعریف نشده/);
});

test("component resource bounds and voxel custom materials are validated", () => {
  assert.match(compileNava("جهان بلوکی اندازه ۹۹۹۹").error ?? "", /اندازه/);
  assert.match(compileNava("تایمر ۰").error ?? "", /تایمر/);
  assert.match(compileNava(Array(33).fill("ماشین‌حساب").join("\n")).error ?? "", /۳۲ ابزار/);
  const result = compileNava('جهان بلوکی\nبلوک "یاقوت" #dc477b');
  assert.ok(result.web); assert.match(result.web.js, /یاقوت/); assert.match(result.web.js, /#dc477b/);
});

test("voxel terrain is deterministic and raycasts hit editable blocks", () => {
  const size = 24, world = createVoxelWorld(size, 7);
  assert.deepEqual(world, createVoxelWorld(size, 7));
  assert.notDeepEqual(world, createVoxelWorld(size, 8));
  const hit = castVoxelRay(world, size, [12.5, 11, 12.5], [0, -1, 0], 20);
  assert.ok(hit); assert.equal(hit.id, 1); assert.ok(hit.distance > 0);
  world[(hit.y * size + hit.z) * size + hit.x] = 0;
  const lower = castVoxelRay(world, size, [12.5, 11, 12.5], [0, -1, 0], 20);
  assert.ok(lower); assert.ok(lower.y < hit.y);
});

test("timer counts elapsed time, pauses and resets", () => {
  const js = kitJs("تایمر ۲", { kind: "timer", duration: 2 });
  const output = { textContent: "" }; let now = 0;
  let tick: () => void = () => {};
  let click: (event: { target: { closest: () => { dataset: { utility: string } } } }) => void = () => {};
  const root = { querySelector: () => output, addEventListener: (_: string, fn: typeof click) => { click = fn; } };
  vm.runInNewContext(js, { document: { querySelectorAll: () => [], getElementById: () => root }, Intl, Date: { now: () => now }, requestAnimationFrame: (fn: () => void) => { tick = fn; } });
  const press = (utility: string) => click({ target: { closest: () => ({ dataset: { utility } }) } });
  press("start"); now = 1500; tick(); assert.equal(output.textContent, "00:01");
  press("pause"); now = 7000; tick(); assert.equal(output.textContent, "00:01");
  press("reset"); assert.equal(output.textContent, "00:02");
  press("start"); now = 10000; tick(); assert.equal(output.textContent, "00:00");
});

test("generated voxel runtime draws a scene and responds to camera movement", () => {
  const js = kitJs("جهان بلوکی", { kind: "voxel", size: 24, seed: 7 });
  let pixels = new Uint8ClampedArray();
  const context = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: (image: { data: Uint8ClampedArray }) => { pixels = image.data.slice(); } };
  const canvas = { width: 0, height: 0, getContext: () => context, addEventListener() {}, setPointerCapture() {} };
  let nextFrame: (time: number) => void = () => {};
  const keys: Record<string, (event: { key: string; preventDefault(): void }) => void> = {};
  const root = {
    querySelector: (selector: string) => selector === "canvas" ? canvas : selector === "select" ? { value: "1", append() {} } : { addEventListener() {} },
    querySelectorAll: () => [], focus() {}, addEventListener: (name: string, fn: (event: { key: string; preventDefault(): void }) => void) => { keys[name] = fn; },
  };
  vm.runInNewContext(js, { document: { hidden: false, getElementById: () => root, querySelectorAll: () => [], createElement: () => ({ value: "", textContent: "" }) }, window: { addEventListener() {} }, Intl, requestAnimationFrame: (fn: typeof nextFrame) => { nextFrame = fn; } });
  nextFrame(100);
  assert.equal(pixels.length, 120 * 90 * 4);
  const colors = new Set<string>(); for (let i = 0; i < pixels.length; i += 4) colors.add(Array.from(pixels.slice(i, i + 3)).join(","));
  assert.ok(colors.size > 30, "scene should contain shaded terrain and sky");
  const first = pixels.slice(); keys.keydown({ key: "a", preventDefault() {} }); nextFrame(200);
  assert.notDeepEqual(pixels, first, "left movement should change the rendered view");
});

test("packed physical lines preserve strings, inline actions, logical or and original error lines", async () => {
  const { packNavaSource } = await import("./nava-lines.ts");
  const source = 'Pg "A | B"\nNum Total = N0\nOut "Score: {Total}"\nBt "Add": Total += N1; Msg "A | B"\nIf Tr || Fl\nTotal += N2\nEnd';
  const packed = packNavaSource(source);
  assert.equal(packed.split("\n").length, 1);
  const structure = (text: string) => JSON.stringify(parseNava(text).program).replace(/"line":\d+/g, '"line":0');
  assert.equal(structure(packed), structure(source));
  const a = await run(source), b = await run(packed);
  a.api.click(0); b.api.click(0);
  assert.equal(a.S.Total, 3); assert.equal(b.S.Total, 3);
  assert.deepEqual(a.log, b.log);
  assert.ok(compileNava('Pg "A" | Cal | Cnt').web);
  assert.match(parseNava('Pg "A" | Num Xyz = N0\nScene N360,N480 | Mat Missing N0,N0,N0').error!, /^خط 2:/);
  const commented = 'Pg "A" # keep | comment\nCal\n// preserve\nCnt';
  assert.ok(compileNava(packNavaSource(commented)).web);
  assert.match(packNavaSource(commented), /# keep \| comment\nCal\n\/\/ preserve\nCnt/);
});

test("3D materials, new primitives and packed frame syntax compile and validate", () => {
  const source = 'Ap "Studio" | G9 | Scene N360,N480 | Torus Ring "#67f5a5" | Cylinder Stand | Cone Tip | Floor Ground | Mat Ring N0d2,N0d8,N1 | Scale Stand N1,N2,N1 | Tint Tip "red" | Camera N6,N18,N30 | Light N1,N2,N3,N2 | Ambient N0d2 | Fog "#070b14",N9,N25 | Orbit Tr | Frame | Rotate Ring N0,N40 * Dt,N0 | End';
  const parsed = parseNava(source);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.program?.shapes.length, 4);
  assert.equal(parsed.program?.onFrame?.[0]?.k, "obj");
  const web = compileNava(source).web!;
  assert.ok(web); new vm.Script(web.js);
  assert.match(web.js, /uniform mat3 nm/);
  assert.match(parseNava('Scene | Cube Box | Mat Box N1').error!, /Mat takes/);
  assert.match(parseNava('Scene | Cube Box | Scale Box N1,N2').error!, /Scale takes/);
});

test("Frame uses real delta, clamps background jumps and stops without duplicate loops", async () => {
  const P = parseNava('Canvas | Num Travel = N0 | Frame | Travel += Dt | End').program!;
  const queue = new Map<number, (time: number) => void>(); let nextId = 0;
  const api = navaEngine(P, { now: () => 0, render: () => {}, error: assert.fail,
    requestFrame: (fn: (time: number) => void) => { queue.set(++nextId, fn); return nextId; }, cancelFrame: (id: number) => queue.delete(id) });
  await api.start();
  const frame = (time: number) => { const [id, fn] = [...queue][0]!; queue.delete(id); fn(time); };
  frame(0); frame(16); frame(1016);
  assert.equal(api.S.Travel, .066); assert.equal(queue.size, 1);
  api.stop(); assert.equal(queue.size, 0); assert.equal(api.running, false);
});
