import { NAVA_BOOLEAN_NAMES } from "./nava-short.ts";
import { buildNavaKit, kitCommand, type KitRequest } from "./nava-kit.ts";
import { expandNava } from "./nava-modules.ts";
import { APPEARANCE_CSS, appearanceAttributes, parseAppearance, type ButtonAppearance } from "./nava-appearance.ts";
/** Nava compiles short commands into an offline component library. */
export type NavaWeb = { html: string; css: string; js: string };
export type NavaResult = { web?: NavaWeb; error?: string };

type Expr = { kind: "value"; value: string | number | boolean } | { kind: "name"; name: string } | { kind: "unary"; op: string; child: Expr } | { kind: "binary"; op: string; left: Expr; right: Expr };
type ButtonAction = { kind: "assign"; name: string; expr: Expr } | { kind: "say"; text: string } | { kind: "none" };
type DisplayPart = { text: string } | { name: string };
type Element =
  | { kind: "kit"; request: KitRequest }
  | { kind: "title"; value: string }
  | { kind: "text"; value: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "input"; name: string; hint: string }
  | { kind: "display"; parts: DisplayPart[] }
  | { kind: "button"; label: string; action: ButtonAction; appearance?: ButtonAppearance };

const IDENT = /^[\p{L}_][\p{L}\p{N}_\u200c]*$/u;
const DIGITS: Record<string, string> = { "۰":"0", "۱":"1", "۲":"2", "۳":"3", "۴":"4", "۵":"5", "۶":"6", "۷":"7", "۸":"8", "۹":"9" };
const asciiDigits = (text: string) => text.replace(/[۰-۹]/g, (d) => DIGITS[d] ?? d);
const ENTITIES: Record<string, string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
const html = (value: string) => value.replace(/[&<>"']/g, (c) => ENTITIES[c]);

function quoted(raw: string): string | null {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) as string; } catch { return null; }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/\\(['\\])/g, "$1");
  return null;
}

function tokens(source: string): string[] | null {
  const out: string[] = [];
  const re = /\s+|(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|[۰-۹0-9]+(?:\.[۰-۹0-9]+)?|[\p{L}_][\p{L}\p{N}_\u200c]*|==|!=|<=|>=|[()+\-*/%<>]/gu;
  let at = 0;
  while (at < source.length) {
    re.lastIndex = at;
    const match = re.exec(source);
    if (!match || match.index !== at) return null;
    at = re.lastIndex;
    if (!/^\s+$/.test(match[0])) out.push(match[0]);
  }
  return out;
}

function parseExpr(source: string): Expr | null {
  const parts = tokens(source);
  if (!parts?.length) return null;
  let at = 0;
  const precedence: Record<string, number> = { "==": 1, "!=": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3, "%": 3 };
  const primary = (): Expr | null => {
    const token = parts[at++];
    if (token === "(" ) {
      const inner = expression(0);
      if (parts[at++] !== ")") return null;
      return inner;
    }
    if (token === "-" || token === "+") {
      const child = primary();
      return child ? { kind: "unary", op: token, child } : null;
    }
    if (token === undefined) return null;
    const str = quoted(token);
    if (str !== null) return { kind: "value", value: str };
    if (/^[۰-۹0-9]/.test(token)) {
      const number = Number(asciiDigits(token));
      return Number.isFinite(number) ? { kind: "value", value: number } : null;
    }
    if (token === "درست" || token === "true") return { kind: "value", value: true };
    if (token === "نادرست" || token === "false") return { kind: "value", value: false };
    return IDENT.test(token) ? { kind: "name", name: token } : null;
  };
  const expression = (min: number): Expr | null => {
    let left = primary();
    if (!left) return null;
    while (at < parts.length) {
      const op = parts[at]!;
      const level = precedence[op] ?? 0;
      if (level <= min) break;
      at++;
      const right = expression(level);
      if (!right) return null;
      left = { kind: "binary", op, left, right };
    }
    return left;
  };
  const result = expression(0);
  return result && at === parts.length ? result : null;
}

function displayParts(raw: string): DisplayPart[] | null {
  const value = quoted(raw);
  if (value !== null) {
    const parts: ({ text: string } | { name: string })[] = [];
    const re = /\{([^{}]+)\}/g;
    let last = 0;
    for (const match of value.matchAll(re)) {
      const index = match.index ?? 0;
      if (index > last) parts.push({ text: value.slice(last, index) });
      const name = match[1]!.trim();
      if (!IDENT.test(name)) return null;
      parts.push({ name });
      last = index + match[0].length;
    }
    if (last < value.length || !parts.length) parts.push({ text: value.slice(last) });
    return parts;
  }
  return IDENT.test(raw.trim()) ? [{ name: raw.trim() }] : null;
}

function error(line: number, message: string): NavaResult { return { error: `خط ${line}: ${message}` }; }

export function compileNava(source: string): NavaResult {
  let title = "برنامهٔ من";
  let background = "#101410";
  let accent = "#c6f135";
  const state: Record<string, string | number | boolean> = Object.create(null) as Record<string, string | number | boolean>;
  const elements: Element[] = [];
  const materials: { name: string; color: string }[] = [];
  let componentCount = 0, voxelCount = 0;
  const expanded = expandNava(source);
  if (expanded.error) return { error: expanded.error };
  const rows = expanded.lines;
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]!.text;
    const n = rows[i]!.line;
    if (!line || line.startsWith("#")) continue;
    const kit = kitCommand(line);
    if (kit?.error) return error(n, kit.error);
    if (kit?.request) {
      componentCount++;
      if (kit.request.kind === "voxel") voxelCount++;
      if (componentCount > 32 || voxelCount > 2) return error(n, "در هر صفحه حداکثر ۳۲ ابزار آماده و دو دنیای بلوکی قرار بده.");
      elements.push({ kind: "kit", request: kit.request }); continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^صفحه\s+(.+)$/.exec(line))) {
      const value = quoted(m[1]!); if (value === null) return error(n, 'نمونه: pg "برنامهٔ من"');
      title = value; elements.push({ kind: "title", value }); continue;
    }
    if ((m = /^بلوک\s+"([^"\n]+)"\s+(#[\da-f]{6})$/i.exec(line))) {
      if (materials.length >= 32 || materials.some((item) => item.name === m![1])) return error(n, "بیش از ۳۲ بلوک سفارشی یا نام تکراری مجاز نیست.");
      materials.push({ name: m[1], color: m[2] }); continue;
    }
    if ((m = /^برنامه\s+(.+)$/.exec(line))) {
      const value = quoted(m[1]!); if (value === null) return error(n, 'نام برنامه را داخل گیومه بنویس؛ مثل ap "شمارنده".'); title = value; continue;
    }
    if ((m = /^پس‌زمینه\s+(.+)$/.exec(line)) || (m = /^پسزمینه\s+(.+)$/.exec(line))) {
      const value = quoted(m[1]!) ?? m[1]!.trim();
      if (!/^(#[\da-f]{3,8}|black|white|transparent|[a-z]{3,20})$/i.test(value)) return error(n, "رنگ پس‌زمینه معتبر نیست.");
      background = value; continue;
    }
    if ((m = /^رنگ\s+(.+)$/.exec(line))) {
      const value = quoted(m[1]!) ?? m[1]!.trim();
      if (!/^(#[\da-f]{3,8}|[a-z]{3,20})$/i.test(value)) return error(n, "رنگ باید نام رنگ یا کد HEX باشد.");
      accent = value; continue;
    }
    if ((m = /^عنوان\s+(.+)$/.exec(line))) {
      const value = quoted(m[1]!); if (value === null) return error(n, 'عنوان را داخل گیومه بنویس؛ مثل hd "سلام".'); elements.push({ kind: "title", value }); continue;
    }
    if ((m = /^متن\s+(.+)$/.exec(line))) {
      const value = quoted(m[1]!); if (value === null) return error(n, 'متن را داخل گیومه بنویس؛ مثل tx "خوش آمدی".'); elements.push({ kind: "text", value }); continue;
    }
    if ((m = /^عکس\s+(.+?)(?:\s+توضیح\s+(.+))?$/.exec(line))) {
      const src = quoted(m[1]!); const alt = m[2] ? quoted(m[2]) : "تصویر برنامه";
      if (src === null || alt === null) return error(n, 'نشانی عکس را داخل گیومه بنویس؛ مثل img "flower.png".');
      elements.push({ kind: "image", src, alt }); continue;
    }
    if ((m = /^عدد\s+([\p{L}_][\p{L}\p{N}_\u200c]*)\s*=\s*(.+)$/u.exec(line)) || (m = /^متغیر\s+([\p{L}_][\p{L}\p{N}_\u200c]*)\s*=\s*(.+)$/u.exec(line))) {
      const name = m[1]!;
      if (!IDENT.test(name) || ["__proto__", "constructor", "prototype", ...NAVA_BOOLEAN_NAMES].includes(name) || name in state) return error(n, `نام متغیر «${name}» نامعتبر یا تکراری است.`);
      const value = quoted(m[2]!);
      if (value !== null) state[name] = value;
      else if (/^(?:درست|نادرست|true|false)$/.test(m[2]!.trim())) state[name] = /^(?:درست|true)$/.test(m[2]!.trim());
      else if (/^-?[۰-۹0-9]+(?:\.[۰-۹0-9]+)?$/.test(m[2]!.trim())) {
        const value = Number(asciiDigits(m[2]!.trim()));
        if (!Number.isFinite(value)) return error(n, "عدد اولیه بیش از حد بزرگ است.");
        state[name] = value;
      }
      else return error(n, "مقدار اولیه باید عدد یا متن داخل گیومه باشد.");
      continue;
    }
    if ((m = /^ورودی\s+([\p{L}_][\p{L}\p{N}_\u200c]*)\s+(.+)$/u.exec(line))) {
      const name = m[1]!; const hint = quoted(m[2]!);
      if (!IDENT.test(name) || ["__proto__", "constructor", "prototype", ...NAVA_BOOLEAN_NAMES].includes(name) || name in state) return error(n, `نام متغیر «${name}» نامعتبر یا تکراری است.`);
      if (hint === null) return error(n, 'راهنمای ورودی را داخل گیومه بنویس.');
      state[name] = ""; elements.push({ kind: "input", name, hint }); continue;
    }
    if ((m = /^نمایش\s+(.+)$/.exec(line))) {
      const parts = displayParts(m[1]!); if (!parts) return error(n, "برای نمایش، نام متغیر یا متن داخل گیومه بنویس.");
      for (const part of parts) if ("name" in part && !(part.name in state)) return error(n, `متغیر «${part.name}» پیش از استفاده تعریف نشده است.`);
      elements.push({ kind: "display", parts }); continue;
    }
    if (line.startsWith("دکمه")) {
      // Parse the quoted label first so colons inside labels are not separators.
      m = /^دکمه\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*(\([^)]*\))?\s*(?:(?::|وقتی\s+زده\s+شد\s*:?)\s*(.+))?$/.exec(line);
      if (!m) return error(n, 'نمونه: bt "سلام" (ru240rn64yGi65G72): sy "سلام!"');
      const label = quoted(m[1]!);
      if (label === null) return error(n, "متن دکمه معتبر نیست.");
      let appearance: ButtonAppearance | undefined;
      if (m[2]) {
        const parsed = parseAppearance(m[2]);
        if (!parsed.value) return error(n, parsed.error!);
        appearance = parsed.value;
      }
      const rawAction = m[3];
      let action: ButtonAction = { kind: "none" };
      if (rawAction) {
        const say = /^بگو\s+(.+)$/.exec(rawAction);
        if (say) {
          const text = quoted(say[1]!);
          if (text === null) return error(n, 'پیام را داخل گیومه بنویس؛ مثل sy "سلام!"');
          action = { kind: "say", text };
        } else {
          const assignment = /^([\p{L}_][\p{L}\p{N}_\u200c]*)\s*=\s*(.+)$/u.exec(rawAction);
          if (!assignment) return error(n, 'فرمان دکمه: sy "سلام" یا شمارنده = شمارنده + ۱');
          const name = assignment[1]!; const expr = parseExpr(assignment[2]!);
          if (!(name in state)) return error(n, `متغیر «${name}» را قبل از دکمه تعریف کن.`);
          if (!expr) return error(n, "عبارت دکمه را ساده نگه دار: عدد، متن، متغیر و عملگرهای + − × ÷");
          const missing: string[] = [];
          const visit = (node: Expr) => { if (node.kind === "name" && !(node.name in state)) missing.push(node.name); else if (node.kind === "unary") visit(node.child); else if (node.kind === "binary") { visit(node.left); visit(node.right); } };
          visit(expr); if (missing.length) return error(n, `متغیر «${missing[0]}» تعریف نشده است.`);
          action = { kind: "assign", name, expr };
        }
      }
      elements.push({ kind: "button", label, action, appearance }); continue;
    }
    return error(n, "این دستور را نمی‌شناسم. از pg، cal، cnt، tm، vx یا دیگر مخفف‌های نوا استفاده کن.");
  }
  if (!elements.length) return { error: "برنامه چیزی برای نمایش ندارد. یک عنوان، متن یا دکمه اضافه کن." };

  let buttonIndex = 0;
  const kitParts: { html: string; css: string; js: string }[] = [];
  const content = elements.map((item) => {
    if (item.kind === "kit") {
      const part = buildNavaKit(item.request, `nava-kit-${kitParts.length}`, materials);
      kitParts.push(part); return part.html;
    }
    if (item.kind === "title") return `<h1>${html(item.value)}</h1>`;
    if (item.kind === "text") return `<p class="nv-copy">${html(item.value)}</p>`;
    if (item.kind === "image") return `<img class="nv-image" src="${html(item.src)}" alt="${html(item.alt)}">`;
    if (item.kind === "input") return `<input class="nv-input" data-nava-input="${html(item.name)}" placeholder="${html(item.hint)}" aria-label="${html(item.hint)}">`;
    if (item.kind === "display") {
      const value = item.parts.map((part) => "text" in part ? html(part.text) : `<span data-nava-bind="${html(part.name)}"></span>`).join("");
      return `<p class="nv-value">${value}</p>`;
    }
    return `<button type="button" class="nv-button${item.appearance ? " nv-packed" : ""}" data-nava-button="${buttonIndex++}" ${item.appearance ? appearanceAttributes(item.appearance) : ""}><span class="nv-button-label">${html(item.label)}</span></button>`;
  }).join("\n");
  const message = elements.some((item) => item.kind === "button" && item.action.kind === "say") ? '<p class="nv-message" data-nava-message role="status" aria-live="polite" aria-atomic="true" hidden></p>' : "";
  const webHtml = `<main class="nv-app"><div class="nv-card"><div class="nv-brand">${html(title)}</div>${content}${message}</div></main>`;
  const css = `:root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:${background};color:#edf4ed;font-family:Vazirmatn,Tahoma,sans-serif}body{min-height:100vh;background:radial-gradient(ellipse at 50% -20%,color-mix(in srgb,${accent} 15%,${background}),${background} 65%)}.nv-app{min-height:100vh;display:grid;place-items:center;padding:24px}.nv-card{width:min(100%,440px);padding:28px;border:1px solid #ffffff20;border-radius:28px;background:#171e19eF;box-shadow:0 24px 80px #0008;display:flex;flex-direction:column;gap:16px}.nv-brand{color:${accent};font-size:12px;letter-spacing:.08em}h1{font-size:28px;line-height:1.35;margin:0}.nv-copy{color:#b8c6ba;line-height:1.9;margin:0}.nv-value{font-size:24px;font-weight:700;margin:4px 0}.nv-input{width:100%;padding:14px 16px;border:1px solid #ffffff25;border-radius:14px;background:#0e130f;color:#fff;font:inherit;outline:none}.nv-input:focus{border-color:${accent};box-shadow:0 0 0 3px color-mix(in srgb,${accent} 22%,transparent)}.nv-button{min-height:48px;padding:12px 18px;border:0;border-radius:14px;background:${accent};color:#11170e;font:inherit;font-weight:700;cursor:pointer;transition:transform .15s,filter .15s}.nv-button:active{transform:scale(.98);filter:brightness(.92)}.nv-image{width:100%;max-height:260px;object-fit:cover;border-radius:18px}`;
  const js = `(()=>{const state=${JSON.stringify(state)};const actions=${JSON.stringify(elements.filter((item): item is Extract<Element,{kind:"button"}> => item.kind === "button").map((item) => item.action))};const calc=(e)=>{if(e.kind==="value")return e.value;if(e.kind==="name")return state[e.name];if(e.kind==="unary"){const v=Number(calc(e.child));return e.op==="-"?-v:v}const a=calc(e.left),b=calc(e.right);switch(e.op){case "+":return typeof a==="string"||typeof b==="string"?String(a??"")+String(b??""):Number(a)+Number(b);case "-":return Number(a)-Number(b);case "*":return Number(a)*Number(b);case "/":return Number(a)/Number(b);case "%":return Number(a)%Number(b);case "==":return a===b;case "!=":return a!==b;case "<":return a<b;case ">":return a>b;case "<=":return a<=b;case ">=":return a>=b;default:return ""}};const show=(v)=>typeof v==="number"?new Intl.NumberFormat("fa-IR").format(v):String(v??"");const render=()=>{document.querySelectorAll("[data-nava-bind]").forEach((el)=>{const key=el.getAttribute("data-nava-bind");el.textContent=show(state[key])})};document.querySelectorAll("[data-nava-input]").forEach((el)=>el.addEventListener("input",()=>{state[el.getAttribute("data-nava-input")]=el.value;render()}));document.querySelectorAll("[data-nava-button]").forEach((el)=>el.addEventListener("click",()=>{const index=Number(el.getAttribute("data-nava-button"));const action=actions[index];if(action?.kind==="assign"){state[action.name]=calc(action.expr);render()}else if(action?.kind==="say"){const output=document.querySelector("[data-nava-message]");if(output){output.textContent=action.text;output.hidden=false}}}));render()})();`;
  return { web: { html: webHtml, css: `:root{--nava-accent:${accent}}\n${css}\n${APPEARANCE_CSS}\n${[...new Set(kitParts.map((part) => part.css))].join("\n")}`, js: js + "\n" + kitParts.map((part) => part.js).join("\n") } };
}
