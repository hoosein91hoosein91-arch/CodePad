import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { compileNava, NAVA_FUNCTIONS, parseNava } from "./nava.ts";
import { navaEngine } from "./nava-runtime.ts";

// موتور نوا را بدون مرورگر اجرا می‌کند: همهٔ کارهای بیرونی (صدا، نقاشی، حافظه…) فقط ثبت می‌شوند
async function run(source: string, opts: { saved?: unknown; ask?: (p: string) => Promise<string>; random?: number } = {}) {
  const parsed = parseNava(source);
  if (!parsed.program) throw new Error(parsed.error);
  const log: unknown[][] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const once: { fn: () => void; ms: number }[] = [];
  const errors: string[] = [];
  let saved: unknown = opts.saved ?? null;
  let renders = 0;
  const io = {
    now: () => 1000,
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
  assert.match(err(`عنوان "x"\nعدد n = ۰\nدکمه "خراب": n = alert(1)`), /^خط 3:.*تابع «alert» را نمی‌شناسم/);
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
  const blocks = [...guide.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]!);
  assert.ok(blocks.length >= 3);
  for (const b of blocks) assert.equal(compileNava(b).error, undefined, `${b.split("\n")[0]}: ${compileNava(b).error}`);
  const paint = blocks.find((b) => b.includes("رنگ‌شماره"))!;
  const r = await run(paint);
  const circles = r.log.filter((x) => x[0] === "draw" && x[1] === "دایره");
  assert.equal(circles.length, 9);
  assert.deepEqual(circles.slice(0, 2).map((c) => c[5]), ["#ffc56b", "#59d7ff"]);
});
