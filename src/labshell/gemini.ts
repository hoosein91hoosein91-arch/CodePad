// اتصال به Google Gemini با کلیدِ خودِ کاربر.
// کلید هیچ‌وقت در کد یا مخزن نیست؛ کاربر یک بار در لانچر واردش می‌کند و فقط در localStorage همین دستگاه می‌ماند
// (پس بعد از بستن و باز کردن برنامه هم «وصل» است تا وقتی خودش پاکش کند).
// درخواست: REST رسمی generateContent روی generativelanguage.googleapis.com (کلید در سرآیند x-goog-api-key).

export const GEMINI_KEY = "jibcode-gemini-key";
export const GEMINI_MODEL_KEY = "jibcode-gemini-model";
export const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0];
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiSettings = { key: string; model: string };

export function loadGemini(): GeminiSettings {
  try {
    return { key: localStorage.getItem(GEMINI_KEY) ?? "", model: localStorage.getItem(GEMINI_MODEL_KEY) || DEFAULT_GEMINI_MODEL };
  } catch {
    return { key: "", model: DEFAULT_GEMINI_MODEL };
  }
}

export function saveGemini(settings: GeminiSettings): void {
  try {
    const key = settings.key.trim();
    if (key) localStorage.setItem(GEMINI_KEY, key);
    else localStorage.removeItem(GEMINI_KEY);
    localStorage.setItem(GEMINI_MODEL_KEY, settings.model.trim() || DEFAULT_GEMINI_MODEL);
  } catch {
    /* حافظهٔ محلی در دسترس نیست */
  }
}

/** نمایش امنِ کلید (فقط چهار حرف آخر) */
export const maskKey = (key: string) => (key ? `••••${key.slice(-4)}` : "");

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** متن پاسخ generateContent: candidates[0].content.parts[].text (بدون بخش‌های «فکر») */
export function generateText(data: unknown): string {
  const first = asObj(asArr(asObj(data)?.candidates)[0]);
  return asArr(asObj(first?.content)?.parts)
    .map((p) => asObj(p))
    .filter((p): p is Json => !!p && typeof p.text === "string" && p.thought !== true)
    .map((p) => p.text as string)
    .join("")
    .trim();
}

function errorOf(data: unknown, status: number): string {
  const e = asObj(asObj(data)?.error);
  const msg = typeof e?.message === "string" ? e.message : "";
  if (status === 400 && /api key/i.test(msg)) return "کلید API نامعتبر است. کلید را در تنظیمات Gemini بررسی کن.";
  if (status === 403) return `دسترسی رد شد (403). کلید یا محدودیت‌های پروژهٔ Google را بررسی کن. ${msg}`.trim();
  if (status === 429) return "سهمیهٔ درخواست تمام شده (429). کمی بعد دوباره امتحان کن.";
  return msg || `پاسخ سرویس ${status}`;
}

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** بدنهٔ درخواست generateContent (جدا شده تا در آزمون خودکار بررسی شود) */
export function geminiRequest(settings: GeminiSettings, prompt: string, system?: string): { url: string; init: RequestInit } {
  const model = settings.model.trim() || DEFAULT_GEMINI_MODEL;
  const body: Json = { contents: [{ role: "user", parts: [{ text: prompt.slice(0, 30000) }] }] };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return {
    url: `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    init: { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": settings.key.trim() }, body: JSON.stringify(body) },
  };
}

export const GEMINI_SYSTEM =
  "You are the built-in assistant of CodePad (JibCode), an offline Persian coding workshop for Android phones. Answer in the user's language (usually Persian). Be concise. When you write code, put it in one fenced code block. Apps run in a sandboxed iframe with no network and no external scripts.";

/** یک پرسش به Gemini؛ متن پاسخ را برمی‌گرداند یا خطای قابل‌فهم پرتاب می‌کند. */
export async function askGemini(settings: GeminiSettings, prompt: string, opts: { signal?: AbortSignal; fetcher?: Fetcher; system?: string } = {}): Promise<string> {
  if (!settings.key.trim()) throw new Error("Gemini وصل نیست: اول کلید API خودت را در «اتصال Gemini» وارد و ذخیره کن.");
  if (!prompt.trim()) throw new Error("متن درخواست خالی است.");
  const go: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const { url, init } = geminiRequest(settings, prompt, opts.system ?? GEMINI_SYSTEM);
  let res: Response;
  try {
    res = await go(url, { ...init, signal: opts.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error("به اینترنت یا سرور Gemini وصل نشد. اتصال گوشی را بررسی کن.");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* پاسخ JSON نبود */
  }
  if (!res.ok) throw new Error(errorOf(data, res.status));
  const text = generateText(data);
  if (text) return text;
  const block = asObj(asObj(data)?.promptFeedback)?.blockReason;
  return block ? `Gemini به این درخواست پاسخ نداد (${String(block)}).` : "پاسخی در قالب متن برنگشت.";
}

/** دستور ساخت برنامه: Gemini باید فقط یک فایل HTML کامل و مستقل بدهد. */
export function appPrompt(description: string): string {
  return [
    "Build a small mobile web app that will run inside a sandboxed iframe on an Android phone launcher (JibCode OS).",
    "Return ONLY one complete, self-contained HTML file inside a single ```html code block. Inline all CSS and JavaScript. No external scripts, no frameworks, no network requests.",
    'Use a responsive, touch-friendly, dark neon design. Use lang="fa" dir="rtl" when the request is in Persian.',
    "Optional launcher API (check `window.jibos` exists first): jibos.beep(freq, ms), jibos.melody([freqs], ms), jibos.play(url), jibos.toast(text), await jibos.storage.get(key), jibos.storage.set(key, value).",
    "App request:",
    description.trim(),
  ].join("\n");
}

/** دستور اصلاح کد یک برنامه */
export function fixPrompt(fileName: string, code: string, wish: string): string {
  return [
    `Improve this file (${fileName}) of a small app that runs in a sandboxed webview. Request: ${wish.trim() || "fix bugs and improve it"}.`,
    "Return ONLY the full updated file in one fenced code block.",
    "```",
    code.slice(0, 24000),
    "```",
  ].join("\n");
}

/** اولین بلوک کد (ترجیحاً html) یا یک سند HTML کامل را از پاسخ بیرون می‌کشد. */
export function extractCode(text: string, prefer = "html"): string | null {
  const blocks = [...text.matchAll(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), code: m[2].replace(/\s+$/, "") }));
  const hit = blocks.find((b) => b.lang === prefer) ?? blocks[0];
  if (hit?.code.trim()) return hit.code + "\n";
  const doc = text.match(/<!doctype html[\s\S]*<\/html>/i) ?? text.match(/<html[\s\S]*<\/html>/i);
  return doc ? doc[0] + "\n" : null;
}
