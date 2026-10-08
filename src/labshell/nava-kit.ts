import { NAVA_GLYPH_WORDS } from "./nava-glyph.ts";
import { NAVA_SHORT_WORDS } from "./nava-short.ts";
import { calculatorKit } from "./nava-calculator.ts";
import { voxelKit } from "./nava-voxel.ts";

export type KitKind = "calculator" | "counter" | "timer" | "voxel";
export type KitRequest = { kind: KitKind; duration?: number; size?: number; seed?: number };
export const NAVA_KITS = [
  { id: "calculator", command: "cal", aliases: ["ماشین‌حساب", "ماشین حساب", "ماشینحساب", "calculator"], example: "Cal Mb", description: "ماشین‌حساب آفلاین با محاسبات، پرانتز، درصد، تاریخچه و صفحه‌کلید" },
  { id: "counter", command: "cnt", aliases: ["شمارنده", "counter"], example: "Cnt", description: "شمارندهٔ آماده با افزایش، کاهش و بازنشانی" },
  { id: "timer", command: "tm", aliases: ["تایمر", "timer"], example: "Tm N60", description: "تایمر ثانیه‌ای با شروع، مکث و بازنشانی" },
  { id: "voxel", command: "vx", aliases: ["جهان بلوکی", "voxel"], example: "Vx Sz N24 Sd N7", description: "نمونهٔ سه‌بعدی آفلاین با پرواز، ساخت‌وساز، بلوک سفارشی و خروجی JSON" },
] as const;

export const NAVA_PRESETS = [
  { id: "calculator", title: "ماشین‌حساب", code: 'Pg "Calculator" | Fg #67f5a5 | Cal Mb\n' },
  { id: "voxel", title: "دنیای بلوکی", code: 'Pg "My world" | Vx Sz N24 Sd N7 | Bl "Ruby" #dc477b\n' },
  { id: "timer", title: "تایمر", code: 'Pg "One minute" | Tm N60\n' },
  { id: "packed-button", title: "دکمهٔ فشرده", code: 'Bt "شروع" (Ru240Rn64): Sy "تو باختی"\n' },
  { id: "counter", title: "شمارنده", code: 'Pg "Score" | Cnt\n' },
  { id: "studio3d", title: "استودیو سه‌بعدی", code: 'Ap "Nava Studio" | G9 | Sc N360,N480 | Sp Orb "#47f2cb" | Rg Ring "#b0a9ff" | Floor Base "#182331" | Ps Base N0,-N1d2,N0 | Sl Orb N0d6 | Mt Orb N0d14,N0d65,N0d6 | Rt Ring N65,N0,N0 | Mt Ring N0d16,N0d7,N0d15 | Cm N6,N18,N0 | Ob Tr | Fz "#070b14",N9,N28 | Fr | Rt Ring N0,N22 * Dt,N9 * Dt | End\n' },
];

/** The full core language of CodePad 2.2+ (all Persian keywords; blocks close with پایان or end). */
export const NAVA_CORE_SYNTAX = "Core language (Persian keywords, also valid next to the short forms; blocks without a one-line ':' body close with پایان or end): lists لیست کارها = [\"a\"، \"b\"], index from 1 کارها[۱]; x += ۱; conditions اگر x > ۱۰ … وگرنه اگر … وگرنه … پایان (و، یا، نه، = or == compare); loops تکرار ۳, برای هر x در کارها, برای i از ۱ تا ۱۰, تا وقتی شرط; actions کنش نام با a، b … پایان and اجرا نام ۱، ۲; functions تابع نام با a … نتیجه a * ۲ … پایان; timers هر ۰.۵ ثانیه: … and بعد از ۲ ثانیه: …, توقف, ادامه; events وقتی لمس (ایکس، ایگرگ), وقتی کلید (کلید); list ops افزودن x به کارها, حذف آخر از کارها, خالی کارها, فهرست کارها با حذف; persistence ذخیره امتیاز، کارها; layout ردیف … پایان; inputs ورودی سن \"سن\" عدد|رمز|چندخطی; conditional display نمایش \"…\" اگر شرط; 2D canvas بوم ۳۲۰، ۳۲۰ with پاک، دایره x، y، r، رنگ، مستطیل، خط، نوشته، تصویر; light WebGL 3D صحنه ۳۰۰، ۲۴۰ with مکعب/کره/هرم/زمین name \"#hex\" در x، y، z, بچرخان/جابجا name dx، dy، dz, اندازه name s, دوربین d; sound صدا ۸۸۰، ۱۰۰, آهنگ ۵۲۳، ۶۵۹; پیام \"toast\"; بگو \"spoken + shown message\"; AI بپرس جواب = سوال (Gemini, needs the user's key and internet). Built-in functions: تصادفی، طول، گرد، صحیح، قدرمطلق، جذر، توان، حداقل، حداکثر، جمع، سینوس، کسینوس، فاصله، عدد، متن، زمان، ساعت، تاریخ، شامل، جای، جدا، چسب، خطوط، برعکس، مرتب، بخش، فایل. Honest limits: no AAA 3D, no on-device AI training, no network except بپرس.";

export const NAVA_AI_GUIDE = `Write only executable Latin Nava Studio code. Every command and identifier starts uppercase. Quoted UI text may use any language and must be preserved exactly. Never produce Persian code tokens, lowercase commands, HTML, JavaScript or invented commands. Numbers require N: N12, -N3, N0d5. Separate instructions with newlines or a single | outside quotes/brackets; logical OR remains ||. Inline button/action bodies separate statements with ; and finish on the next |. Multiline blocks close with End; entire blocks may be packed: Fr | Rt Orb N0,N30 * Dt,N0 | End. Use only this command registry: ${Object.keys(NAVA_GLYPH_WORDS).join(", ")}. Variables: Num Score = N0; Var Reply = ""; Arr Items = ["a","b"]. Flow: If Score > N5 | Score += N1 | Else | Score = N0 | End. Each Item Pos Items ... End; For I From N1 To N10 ... End; Act Run With A,B ... End; Fn Twice With A | Ret A * N2 | End. Push "x" Into Items; Del Last From Items; Clear Items; List Items With Del. Inputs: In Name "Name"; In Age "Age" Num. Display: Out "Score: {Score}"; Bt "Add" (Ru180Rn56Rr): Score += N1; Tone N660,N60. Persistence Store Score. AI Ask Reply = "question" requires user Gemini connection. Built-ins: Rand,Len,Round,Int,Abs,Sqrt,Pow,Min,Max,Sum,Sin,Cos,Dist,ToNum,ToText,Time,Clock,Date,Has,At,Split,Join,Lines,Reverse,Sort,Slice,File. 3D: Sc N360,N480; Cu/Sp/Pyramid/Floor/Rg/Cy/Cn Name "#hex" Pos x,y,z; Ps Name x,y,z absolute position; Mv Name dx,dy,dz; Rt Name dx,dy,dz in degrees; Sl Name s or x,y,z; Mt Name roughness,metal,emission (0.08..1,0..1,0..4); Tint Name "#hex"; Cm distance or distance,pitch,yaw; Ob Tr enables drag/pinch/wheel and disables scene Touch events; Fz "#hex",near,far; Lt x,y,z,intensity; Am strength. Fr ... End animates using Dt seconds capped at .05. G1 light graphics (DPR 1, low segments), G9 detailed graphics (DPR up to 2, smooth surfaces, specular/rim light, tone mapping and approximate soft floor contact shadows for up to 8 shapes). Use deliberate geometry and readable palettes. Three-dimensional work remains WebGL primitives, not a full physics engine, model importer or AAA game engine. Game removes card chrome for games. Preserve old code only when explicitly editing a legacy file. Built-in tools: Cal Mb, Cnt, Tm N60, Vx Sz N24 Sd N7. Buttons: (Ru180Rn56), optional YGi65G72 or YN24D08 side-by-side solid colors, optional Rr relief. Available palette: Gi65,G72,B48,V36,N24,D08,W90,O52. Use short lines or packed code as requested, and never claim a guaranteed beautiful result for every arbitrary program.`;

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

export function buildNavaKit(request: KitRequest, id: string, materials: { name: string; color: string }[], quality: "low" | "ultra" = "ultra") {
  if (request.kind === "calculator") return calculatorKit(id);
  if (request.kind === "voxel") return voxelKit(id, request.size ?? 24, request.seed ?? 7, materials, quality);
  const timer = request.kind === "timer";
  return {
    html: `<section id="${id}" class="nv-utility"><output aria-live="polite">۰</output><div>${(timer ? [["start", "شروع"], ["pause", "مکث"], ["reset", "از اول"]] : [["sub", "−"], ["add", "+"], ["reset", "از اول"]]).map(([key, label]) => `<button type="button" data-utility="${key}">${label}</button>`).join("")}</div></section>`,
    css: `.nv-utility output{display:block;text-align:center;font:64px monospace;padding:32px 0;color:var(--nava-accent,#c6f135);direction:ltr}.nv-utility>div{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.nv-utility button{min-height:48px;border:1px solid #ffffff20;background:#27302b;color:white;border-radius:14px;font:inherit;cursor:pointer}`,
    js: `(${mountUtility.toString()})(${JSON.stringify(id)},${JSON.stringify(request.kind)},${request.duration ?? 60});`,
  };
}
