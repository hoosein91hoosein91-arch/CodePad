import { NAVA_SHORT_WORDS } from "./nava-short.ts";
import { calculatorKit } from "./nava-calculator.ts";
import { voxelKit } from "./nava-voxel.ts";

export type KitKind = "calculator" | "counter" | "timer" | "voxel";
export type KitRequest = { kind: KitKind; duration?: number; size?: number; seed?: number };
export const NAVA_KITS = [
  { id: "calculator", command: "cal", aliases: ["ماشین‌حساب", "ماشین حساب", "ماشینحساب", "calculator"], example: "cal mb", description: "ماشین‌حساب آفلاین با محاسبات، پرانتز، درصد، تاریخچه و صفحه‌کلید" },
  { id: "counter", command: "cnt", aliases: ["شمارنده", "counter"], example: "cnt", description: "شمارندهٔ آماده با افزایش، کاهش و بازنشانی" },
  { id: "timer", command: "tm", aliases: ["تایمر", "timer"], example: "tm ۶۰", description: "تایمر ثانیه‌ای با شروع، مکث و بازنشانی" },
  { id: "voxel", command: "vx", aliases: ["جهان بلوکی", "voxel"], example: "vx sz ۲۴ sd ۷", description: "نمونهٔ سه‌بعدی آفلاین با پرواز، ساخت‌وساز، بلوک سفارشی و خروجی JSON" },
] as const;

export const NAVA_PRESETS = [
  { id: "calculator", title: "ماشین‌حساب", code: 'pg "ماشین‌حساب"\nfg #67f5a5\ncal mb\n' },
  { id: "voxel", title: "دنیای بلوکی", code: 'pg "دنیای من"\nvx sz ۲۴ sd ۷\nbl "یاقوت" #dc477b\n' },
  { id: "timer", title: "تایمر", code: 'pg "یک دقیقه"\ntm ۶۰\n' },
  { id: "packed-button", title: "دکمهٔ فشرده", code: 'bt "شروع" (ru240rn64yGi65G72): sy "تو باختی"\n' },
  { id: "counter", title: "شمارنده", code: 'pg "امتیاز من"\ncnt\n' },
];

/** The full core language of CodePad 2.2+ (all Persian keywords; blocks close with پایان or end). */
export const NAVA_CORE_SYNTAX = "Core language (Persian keywords, also valid next to the short forms; blocks without a one-line ':' body close with پایان or end): lists لیست کارها = [\"a\"، \"b\"], index from 1 کارها[۱]; x += ۱; conditions اگر x > ۱۰ … وگرنه اگر … وگرنه … پایان (و، یا، نه، = or == compare); loops تکرار ۳, برای هر x در کارها, برای i از ۱ تا ۱۰, تا وقتی شرط; actions کنش نام با a، b … پایان and اجرا نام ۱، ۲; functions تابع نام با a … نتیجه a * ۲ … پایان; timers هر ۰.۵ ثانیه: … and بعد از ۲ ثانیه: …, توقف, ادامه; events وقتی لمس (ایکس، ایگرگ), وقتی کلید (کلید); list ops افزودن x به کارها, حذف آخر از کارها, خالی کارها, فهرست کارها با حذف; persistence ذخیره امتیاز، کارها; layout ردیف … پایان; inputs ورودی سن \"سن\" عدد|رمز|چندخطی; conditional display نمایش \"…\" اگر شرط; 2D canvas بوم ۳۲۰، ۳۲۰ with پاک، دایره x، y، r، رنگ، مستطیل، خط، نوشته، تصویر; light WebGL 3D صحنه ۳۰۰، ۲۴۰ with مکعب/کره/هرم/زمین name \"#hex\" در x، y، z, بچرخان/جابجا name dx، dy، dz, اندازه name s, دوربین d; sound صدا ۸۸۰، ۱۰۰, آهنگ ۵۲۳، ۶۵۹; پیام \"toast\"; بگو \"spoken + shown message\"; AI بپرس جواب = سوال (Gemini, needs the user's key and internet). Built-in functions: تصادفی، طول، گرد، صحیح، قدرمطلق، جذر، توان، حداقل، حداکثر، جمع، سینوس، کسینوس، فاصله، عدد، متن، زمان، ساعت، تاریخ، شامل، جای، جدا، چسب، خطوط، برعکس، مرتب، بخش، فایل. Honest limits: no AAA 3D, no on-device AI training, no network except بپرس.";

export const NAVA_AI_GUIDE = `You are helping write Nava 0.5 programs in CodePad. Write abbreviated keywords by default where a short form exists. The complete implemented keyword registry is: ${NAVA_SHORT_WORDS.map((word) => word.short + "=" + word.long).join("; ")}. Each instruction is on its own line; no @@, HTML or JavaScript. Preserve every quoted literal exactly, including visible messages, button labels, image paths, recipe names and interpolation placeholders. Preserve user variable names; do not abbreviate identifiers. Keywords are case-sensitive. Existing Persian and English component aliases still work. Do not invent commands. Boolean literals tr/fl are reserved identifiers. High-level components: ${NAVA_KITS.map((k) => k.example + " = " + k.description).join("; ")}. Other syntax: pg "title", ap "name", hd "text", tx "text", fg #67f5a5, bg #101410, num n = 0, var message = "text", var ready = tr, in name "hint", out "Count: {n}", bt "Add": n = n + 1, img "asset.png" alt "description". Message button: bt "Start" (ru240rn64yGi65G72): sy "تو باختی". Use a colon or on as the click separator. The capsule is optional: ru=horizontal pixels 1..8192, rn=vertical pixels 1..2048, y=deterministic solid two-color details. Sizes scale to available width; minimum target width 64px and minimum touch height 44px. Palette is case-sensitive: Gi65=#e66464, G72=#a5a7ae, B48=#5ca8f8, V36=#b29af5, N24=#67f5a5, D08=#20262d, W90=#f1f3f5, O52=#ffbd66. Choose two different codes, no color blending. Button actions: any Nava statements — one line after the colon (several separated by ؛) such as n = n + 1 or sy "message", or a block on the following lines closed with end; with a capsule and no action the button is appearance-only. Add voxel materials: bl "Ruby" #de3555. Named recipes: df "name", instructions, end; invoke with us "name". Minimal calculator: cal. Worlds are bounded creative demos, not Minecraft. Do not claim full Minecraft mods, infinite worlds, multiplayer, native APK compilation, arbitrary 100000 commands or unavailable libraries. Reply with actual abbreviated Nava source when code is requested. ${NAVA_CORE_SYNTAX}`;

const number = (s: string) => Number(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
export function kitCommand(line: string): { request?: KitRequest; error?: string } | null {
  if (/^(?:ماشین[‌ -]?حساب|calculator)(?:\s+(?:موبایل|mobile))?$/.test(line)) return { request: { kind: "calculator" } };
  if (/^(?:شمارنده|counter)$/.test(line)) return { request: { kind: "counter" } };
  let match = /^(?:تایمر|timer)(?:\s+([0-9۰-۹]+))?$/.exec(line);
  if (match) {
    const duration = match[1] ? number(match[1]) : 60;
    return duration >= 1 && duration <= 86400 ? { request: { kind: "timer", duration } } : { error: "تایمر باید بین ۱ تا ۸۶۴۰۰ ثانیه باشد." };
  }
  match = /^(?:جهان\s+بلوکی|voxel)(?:\s+اندازه\s+([0-9۰-۹]+))?(?:\s+بذر\s+([0-9۰-۹]+))?$/.exec(line);
  if (match) {
    const size = match[1] ? number(match[1]) : 24, seed = match[2] ? number(match[2]) : 7;
    return size >= 12 && size <= 48 && Number.isSafeInteger(seed) && seed <= 4294967295 ? { request: { kind: "voxel", size, seed } } : { error: "اندازهٔ جهان بین ۱۲ و ۴۸ و بذر بین ۰ و ۴۲۹۴۹۶۷۲۹۵ باشد." };
  }
  return null;
}

function mountUtility(id: string, kind: string, duration: number) {
  const root = document.getElementById(id)!;
  const output = root.querySelector<HTMLElement>("output")!;
  let count = 0, remaining = duration * 1000, deadline = 0, running = false;
  const render = () => {
    if (kind === "counter") output.textContent = new Intl.NumberFormat("fa-IR").format(count);
    else { const seconds = Math.ceil(Math.max(0, remaining) / 1000); output.textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0"); }
  };
  root.addEventListener("click", (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>("[data-utility]")?.dataset.utility;
    if (kind === "counter") { if (key === "add") count++; if (key === "sub") count--; if (key === "reset") count = 0; }
    else {
      if (key === "start" && remaining > 0) { deadline = Date.now() + remaining; running = true; }
      if (key === "pause") { if (running) remaining = Math.max(0, deadline - Date.now()); running = false; }
      if (key === "reset") { running = false; remaining = duration * 1000; }
    }
    render();
  });
  if (kind === "timer") {
    const update = () => { if (running) { remaining = Math.max(0, deadline - Date.now()); if (remaining === 0) running = false; render(); } requestAnimationFrame(update); };
    requestAnimationFrame(update);
  }
  render();
}

export function buildNavaKit(request: KitRequest, id: string, materials: { name: string; color: string }[]) {
  if (request.kind === "calculator") return calculatorKit(id);
  if (request.kind === "voxel") return voxelKit(id, request.size ?? 24, request.seed ?? 7, materials);
  const timer = request.kind === "timer";
  return {
    html: `<section id="${id}" class="nv-utility"><output aria-live="polite">۰</output><div>${(timer ? [["start", "شروع"], ["pause", "مکث"], ["reset", "از اول"]] : [["sub", "−"], ["add", "+"], ["reset", "از اول"]]).map(([key, label]) => `<button type="button" data-utility="${key}">${label}</button>`).join("")}</div></section>`,
    css: `.nv-utility output{display:block;text-align:center;font:64px monospace;padding:32px 0;color:var(--nava-accent,#c6f135);direction:ltr}.nv-utility>div{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.nv-utility button{min-height:48px;border:1px solid #ffffff20;background:#27302b;color:white;border-radius:14px;font:inherit;cursor:pointer}`,
    js: `(${mountUtility.toString()})(${JSON.stringify(id)},${JSON.stringify(request.kind)},${request.duration ?? 60});`,
  };
}
