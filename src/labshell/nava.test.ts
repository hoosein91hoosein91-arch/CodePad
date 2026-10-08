import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { compileNava } from "./nava.ts";
import { evaluateCalculator } from "./nava-calculator.ts";
import { createVoxelWorld, castVoxelRay } from "./nava-voxel.ts";
import { NAVA_PRESETS } from "./nava-kit.ts";
import { APPEARANCE_CSS, NAVA_PALETTE, parseAppearance } from "./nava-appearance.ts";
import { compactNavaSource, normalizeNavaLine, NAVA_SHORT_WORDS } from "./nava-short.ts";

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
  const source = '  # صفحه tx bt sy tr fl\r\n\r\nمتغیر bt = "صفحه pg; تو باختی; \\\"sy\\\""\r\nعدد sy = ۰\r\nنمایش "{bt} {sy}"\r\nدکمه "bt: sy" : sy = sy + ۱\r\nعکس "pg alt.png" توضیح "تو باختی"\r\n';
  const compact = compactNavaSource(source);
  assert.match(compact, /var bt = "صفحه pg; تو باختی; \\\"sy\\\""/);
  assert.match(compact, /num sy = ۰/);
  assert.match(compact, /bt "bt: sy" : sy = sy \+ ۱/);
  assert.match(compact, /img "pg alt.png" alt "تو باختی"/);
  assert.ok(compact.startsWith('  # صفحه tx bt sy tr fl\r\n\r\n'));
  assert.equal(compact.match(/\r\n/g)?.length, source.match(/\r\n/g)?.length);
  assert.equal(compactNavaSource(compact), compact);
  assert.deepEqual(compileNava(compact).web, compileNava(source).web);
  assert.ok(compileNava(compact).web);
});

test("short message actions work without abbreviating what the user sees", () => {
  const result = compileNava('bt"شروع"(ru240rn64yGi65G72):sy"تو باختی"');
  assert.ok(result.web, result.error);
  const output = { textContent: "", hidden: true }; let click = () => {};
  const button = { getAttribute: () => "0", addEventListener: (_: string, fn: () => void) => { click = fn; } };
  vm.runInNewContext(result.web.js, { document: { querySelectorAll: (s: string) => s === "[data-nava-button]" ? [button] : [], querySelector: () => output }, Intl });
  click(); assert.equal(output.textContent, "تو باختی"); assert.equal(output.hidden, false);
  assert.match(result.web.html, />شروع<\/span>/);
  assert.ok(compileNava('bt "شروع" on sy "تو باختی"').web);
});

test("compact boolean expressions and variable names sharing command codes work", () => {
  const result = compileNava('num sy = ۰\nvar bt = fl\nout "{sy} {bt}"\nbt "امتیاز": sy = sy + ۱\nbt "آماده": bt = tr == tr\nbt "خاموش" on bt = fl');
  assert.ok(result.web, result.error);
  const values = ["sy", "bt"].map((name) => ({ textContent: "", getAttribute: () => name }));
  const listeners: (() => void)[] = [];
  const buttons = [0, 1, 2].map((i) => ({ getAttribute: () => String(i), addEventListener: (_: string, fn: () => void) => { listeners[i] = fn; } }));
  vm.runInNewContext(result.web.js, { document: { querySelectorAll: (s: string) => s === "[data-nava-bind]" ? values : s === "[data-nava-button]" ? buttons : [] }, Intl });
  listeners[0](); assert.equal(values[0].textContent, "۱");
  listeners[1](); assert.equal(values[1].textContent, "true");
  listeners[2](); assert.equal(values[1].textContent, "false");
  for (const name of ["tr", "fl"]) assert.match(compileNava(`var ${name} = ۰\ntx "a"`).error ?? "", /نامعتبر/);
});

test("compact recipes keep source locations, limits and cycle checks", () => {
  assert.match(compileNava('df "خراب"\nunknown\nend\nus "خراب"').error ?? "", /خط 2:/);
  assert.match(compileNava('df "حلقه"\nus "حلقه"\nend\nus "حلقه"').error ?? "", /حلقه‌ای/);
  assert.match(compileNava('tm ۰').error ?? "", /تایمر/);
  assert.match(compileNava('vx sz ۹۹ sd ۷').error ?? "", /اندازه/);
  assert.match(compileNava('BT "شروع": sy "تو باختی"').error ?? "", /خط 1:/);
});

test("keyword registry is unique, compact and only rewrites grammar positions", () => {
  assert.equal(new Set(NAVA_SHORT_WORDS.map((word) => word.short)).size, NAVA_SHORT_WORDS.length);
  for (const word of NAVA_SHORT_WORDS) assert.match(word.short, /^[a-z]{2,3}$/);
  assert.equal(normalizeNavaLine('pg "bt sy tr"'), 'صفحه "bt sy tr"');
  assert.equal(normalizeNavaLine('tx "var = fl; تو باختی"'), 'متن "var = fl; تو باختی"');
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

test("one-line button includes appearance, colon-bearing label and a working message", () => {
  const result = compileNava('دکمه "پیام: سلام" (ru240rn64yGi65G72): بگو "<img src=x onerror=bad()>"');
  assert.ok(result.web, result.error); assert.match(result.web.html, /پیام: سلام/);
  assert.match(result.web.html, /role="status"/);
  const output = { textContent: "", hidden: true };
  let click = () => {};
  const button = { getAttribute: () => "0", addEventListener: (_: string, fn: () => void) => { click = fn; } };
  const document = { querySelectorAll: (s: string) => s === "[data-nava-button]" ? [button] : [], querySelector: () => output };
  vm.runInNewContext(result.web.js, { document, Intl });
  assert.equal(output.hidden, true); click();
  assert.equal(output.textContent, "<img src=x onerror=bad()>"); assert.equal(output.hidden, false);
  assert.doesNotMatch(result.web.js, /innerHTML/);
});

test("packed state actions and older natural button syntax remain compatible", () => {
  const result = compileNava('عدد n = ۰\nنمایش n\nدکمه "افزایش: یک" (ru240rn64yN24D08): n = n + ۱\nدکمه "از اول" وقتی زده شد: n = ۰\nدکمه "ظاهر تنها" (ru120rn44yB48W90)');
  assert.ok(result.web, result.error);
  const output = { textContent: "", getAttribute: () => "n" };
  const listeners: (() => void)[] = [];
  const buttons = [0, 1, 2].map((i) => ({ getAttribute: () => String(i), addEventListener: (_: string, fn: () => void) => { listeners[i] = fn; } }));
  const document = { querySelectorAll: (s: string) => s === "[data-nava-bind]" ? [output] : s === "[data-nava-button]" ? buttons : [] };
  vm.runInNewContext(result.web.js, { document, Intl });
  listeners[0](); assert.equal(output.textContent, "۱");
  listeners[2](); assert.equal(output.textContent, "۱");
  listeners[1](); assert.equal(output.textContent, "۰");
});

test("Nava compiles a short Persian app and its controls work", () => {
  const result = compileNava(`برنامه "شمارنده"\nعنوان "آزمایش"\nعدد شمارنده = ۰\nنمایش "تعداد: {شمارنده}"\nدکمه "افزایش": شمارنده = شمارنده + ۱\nدکمه "از اول": شمارنده = ۰`);
  assert.ok(result.web);
  assert.match(result.web.html, /آزمایش/);

  const bound = { textContent: "", getAttribute: () => "شمارنده" };
  const listeners: Record<string, (event?: { target: { value: string } }) => void> = {};
  const makeButton = (index: string) => ({ getAttribute: () => index, addEventListener: (name: string, fn: (event?: { target: { value: string } }) => void) => { listeners[`button:${index}:${name}`] = fn; } });
  const document = { querySelectorAll: (selector: string) => selector === "[data-nava-bind]" ? [bound] : selector === "[data-nava-input]" ? [] : [makeButton("0"), makeButton("1")] };
  vm.runInNewContext(result.web.js, { document, Intl });
  assert.match(bound.textContent, /۰/);
  listeners["button:0:click"]?.();
  assert.match(bound.textContent, /۱/);
  listeners["button:1:click"]?.();
  assert.match(bound.textContent, /۰/);
});

test("Nava inputs update displayed state", () => {
  const result = compileNava(`ورودی نام "نامت را بنویس"\nنمایش "سلام، {نام}"`);
  assert.ok(result.web);
  const bound = { textContent: "", getAttribute: () => "نام" };
  const inputHandlers: ((event: { target: { value: string } }) => void)[] = [];
  const input: { value: string; getAttribute: () => string; addEventListener: (_: string, fn: (event: { target: { value: string } }) => void) => void } = {
    value: "", getAttribute: () => "نام", addEventListener: (_: string, fn: (event: { target: { value: string } }) => void) => inputHandlers.push(fn),
  };
  const document = { querySelectorAll: (selector: string) => selector === "[data-nava-bind]" ? [bound] : selector === "[data-nava-input]" ? [input] : [] };
  vm.runInNewContext(result.web.js, { document, Intl });
  input.value = "حسین";
  inputHandlers[0]?.({ target: { value: "حسین" } });
  assert.equal(bound.textContent, "حسین");
});

test("Nava reports line-aware errors for unknown commands and variables", () => {
  assert.match(compileNava("عنوان \"خوب\"\nنمایش گمشده").error ?? "", /خط 2:.*تعریف نشده/);
  assert.match(compileNava("دستور ناشناخته").error ?? "", /خط 1:/);
});

test("Nava escapes user text and rejects malformed expressions", () => {
  const safe = compileNava(`عنوان "<script>alert(1)</script>"`);
  assert.ok(safe.web);
  assert.match(safe.web.html, /&lt;script&gt;/);
  const invalid = compileNava(`عدد n = ۰\nدکمه "خراب": n = alert(1)`);
  assert.match(invalid.error ?? "", /عبارت دکمه/);
});

test("one-line pages and short high-level presets generate valid offline programs", () => {
  for (const preset of [...NAVA_PRESETS, { code: 'صفحه "سلام"' }]) {
    const result = compileNava(preset.code);
    assert.ok(result.web, result.error);
    assert.doesNotThrow(() => new vm.Script(result.web.js));
    assert.doesNotMatch(result.web.js, /\beval\s*\(/);
    assert.doesNotMatch(result.web.html, /<script[^>]+src=/);
  }
  assert.ok(NAVA_PRESETS[0].code.trim().split(/\s+/).length <= 12);
});

test("calculator arithmetic includes precedence, mobile percentages and errors", () => {
  for (const [source, expected] of [["۲+۳*۴", 14], ["(۲+۳)*۴", 20], ["200+10%", 220], ["200-10%", 180], ["200*10%", 20], ["0.1+0.2", .3], ["(-5)+3", -2], [".5*2", 1], ["1e3+2", 1002]] as const) assert.equal(evaluateCalculator(source), expected, source);
  for (const source of ["1/0", "alert(1)", "1+", "(2+3", "3..4", ""]) assert.throws(() => evaluateCalculator(source), undefined, source);
});

test("generated calculator responds to keypad, history, sign and keyboard", () => {
  const result = compileNava("ماشین‌حساب موبایل"); assert.ok(result.web);
  const expression = { textContent: "" }, output = { textContent: "", dataset: {} };
  const history: { rows: unknown[]; replaceChildren: () => void; append: (row: unknown) => void } = { rows: [], replaceChildren() { this.rows = []; }, append(row) { this.rows.push(row); } };
  const events: Record<string, (event: unknown) => void> = {};
  const root = { focus() {}, querySelector(selector: string) { return selector === ".nc-expression" ? expression : selector === ".nc-output" ? output : history; }, addEventListener(name: string, fn: (event: unknown) => void) { events[name] = fn; } };
  const document = { querySelectorAll: () => [], getElementById: () => root, createElement: () => ({ textContent: "" }) };
  vm.runInNewContext(result.web.js, { document, Intl });
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
  const result = compileNava("تایمر ۲"); assert.ok(result.web);
  const output = { textContent: "" }; let now = 0;
  let tick: () => void = () => {};
  let click: (event: { target: { closest: () => { dataset: { utility: string } } } }) => void = () => {};
  const root = { querySelector: () => output, addEventListener: (_: string, fn: typeof click) => { click = fn; } };
  vm.runInNewContext(result.web.js, { document: { querySelectorAll: () => [], getElementById: () => root }, Intl, Date: { now: () => now }, requestAnimationFrame: (fn: () => void) => { tick = fn; } });
  const press = (utility: string) => click({ target: { closest: () => ({ dataset: { utility } }) } });
  press("start"); now = 1500; tick(); assert.equal(output.textContent, "00:01");
  press("pause"); now = 7000; tick(); assert.equal(output.textContent, "00:01");
  press("reset"); assert.equal(output.textContent, "00:02");
  press("start"); now = 10000; tick(); assert.equal(output.textContent, "00:00");
});

test("generated voxel runtime draws a scene and responds to camera movement", () => {
  const result = compileNava("جهان بلوکی"); assert.ok(result.web);
  let pixels = new Uint8ClampedArray();
  const context = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: (image: { data: Uint8ClampedArray }) => { pixels = image.data.slice(); } };
  const canvas = { width: 0, height: 0, getContext: () => context, addEventListener() {}, setPointerCapture() {} };
  let nextFrame: (time: number) => void = () => {};
  const keys: Record<string, (event: { key: string; preventDefault(): void }) => void> = {};
  const root = {
    querySelector: (selector: string) => selector === "canvas" ? canvas : selector === "select" ? { value: "1", append() {} } : { addEventListener() {} },
    querySelectorAll: () => [], focus() {}, addEventListener: (name: string, fn: (event: { key: string; preventDefault(): void }) => void) => { keys[name] = fn; },
  };
  vm.runInNewContext(result.web.js, { document: { hidden: false, getElementById: () => root, querySelectorAll: () => [], createElement: () => ({ value: "", textContent: "" }) }, window: { addEventListener() {} }, Intl, requestAnimationFrame: (fn: typeof nextFrame) => { nextFrame = fn; } });
  nextFrame(100);
  assert.equal(pixels.length, 120 * 90 * 4);
  const colors = new Set<string>(); for (let i = 0; i < pixels.length; i += 4) colors.add(Array.from(pixels.slice(i, i + 3)).join(","));
  assert.ok(colors.size > 30, "scene should contain shaded terrain and sky");
  const first = pixels.slice(); keys.keydown({ key: "a", preventDefault() {} }); nextFrame(200);
  assert.notDeepEqual(pixels, first, "left movement should change the rendered view");
});
