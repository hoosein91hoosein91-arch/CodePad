// اتصال CodePad به هوش مصنوعی سفارشیِ خود کاربر (سرور خودش، هر قالب JSON).
// این فایل به DOM وابسته نیست تا با `node --test` آزمون شود (scripts/ai-provider.test.mjs).
//
// کاربر فقط چهار چیز را می‌گوید:
//   url          آدرس کامل endpoint (مثلاً http://192.168.1.20:8000/v1/chat/completions)
//   headers      سرآیندها به‌صورت JSON؛ {{key}} با کلید جایگزین می‌شود (کلید اختیاری است)
//   body         قالب JSON بدنهٔ درخواست؛ {{prompt}} {{system}} {{model}} {{key}} و {{messages}} جایگزین می‌شوند
//   responsePath مسیر متن در پاسخ JSON، مثلاً choices.0.message.content (خالی = تشخیص خودکار)

export const CUSTOM_AI_KEY = "codepad-ai-custom";
export const AI_PROVIDER_KEY = "codepad-ai-provider";

/** قالب‌های آماده؛ فقط فیلدها را پر می‌کنند و کاربر می‌تواند هر کدام را عوض کند. */
export const AI_PRESETS = {
  openai: {
    label: "سازگار با OpenAI (llama.cpp، vLLM، Ollama، LM Studio…)",
    url: "http://192.168.1.10:8000/v1/chat/completions",
    headers: '{"Content-Type":"application/json","Authorization":"Bearer {{key}}"}',
    body: '{"model":"{{model}}","messages":"{{messages}}","stream":false}',
    responsePath: "choices.0.message.content",
  },
  ollama: {
    label: "Ollama (API بومی)",
    url: "http://192.168.1.10:11434/api/chat",
    headers: '{"Content-Type":"application/json"}',
    body: '{"model":"{{model}}","messages":"{{messages}}","stream":false}',
    responsePath: "message.content",
  },
  simple: {
    label: "ساده: {prompt} ← {response}",
    url: "http://192.168.1.10:8000/generate",
    headers: '{"Content-Type":"application/json"}',
    body: '{"prompt":"{{prompt}}","system":"{{system}}"}',
    responsePath: "",
  },
};

export const EMPTY_CUSTOM_AI = Object.freeze({ url: "", model: "", key: "", headers: AI_PRESETS.openai.headers, body: AI_PRESETS.openai.body, responsePath: AI_PRESETS.openai.responsePath, timeoutSec: 120 });

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function loadCustomAI(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(CUSTOM_AI_KEY) || "null");
    if (isObj(raw)) return { ...EMPTY_CUSTOM_AI, ...raw };
  } catch {
    /* حافظه یا JSON خراب */
  }
  return { ...EMPTY_CUSTOM_AI };
}

export function saveCustomAI(cfg, storage = globalThis.localStorage) {
  try {
    storage.setItem(CUSTOM_AI_KEY, JSON.stringify({ ...EMPTY_CUSTOM_AI, ...cfg }));
  } catch {
    /* حافظهٔ محلی در دسترس نیست */
  }
}

export function loadProvider(storage = globalThis.localStorage) {
  try {
    return storage.getItem(AI_PROVIDER_KEY) === "custom" ? "custom" : "gemini";
  } catch {
    return "gemini";
  }
}

export function saveProvider(provider, storage = globalThis.localStorage) {
  try {
    storage.setItem(AI_PROVIDER_KEY, provider === "custom" ? "custom" : "gemini");
  } catch {
    /* حافظهٔ محلی در دسترس نیست */
  }
}

/** آدرس معتبر http(s) دارد؟ (کلید اختیاری است: سرور خودی ممکن است کلید نخواهد) */
export function isCustomReady(cfg) {
  if (!cfg || typeof cfg.url !== "string") return false;
  try {
    const u = new URL(cfg.url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** آیا تنظیمات فعلی (Gemini یا سفارشی) آمادهٔ استفاده است؟ */
export function aiReady(settings) {
  if (!settings) return false;
  return settings.provider === "custom" ? isCustomReady(settings.custom) : !!String(settings.key ?? "").trim();
}

export function aiLabel(settings) {
  if (settings?.provider === "custom") {
    try {
      return new URL(settings.custom.url).host;
    } catch {
      return "سرور خودم";
    }
  }
  return "Gemini";
}

function interpolate(text, vars) {
  return text.replace(/\{\{(prompt|system|model|key)\}\}/g, (_, name) => vars[name] ?? "");
}

function substitute(node, vars) {
  if (typeof node === "string") {
    if (node === "{{messages}}") {
      const list = [];
      if (vars.system) list.push({ role: "system", content: vars.system });
      list.push({ role: "user", content: vars.prompt });
      return list;
    }
    return interpolate(node, vars);
  }
  if (Array.isArray(node)) return node.map((x) => substitute(x, vars));
  if (isObj(node)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, substitute(v, vars)]));
  return node;
}

function parseJsonField(label, text) {
  try {
    const v = JSON.parse(text);
    if (!isObj(v)) throw new Error("not object");
    return v;
  } catch {
    throw new Error(`${label} باید یک شیٔ JSON معتبر باشد (مثلاً {"a":"b"}).`);
  }
}

/** درخواست آمادهٔ fetch را از تنظیمات می‌سازد (جدا شده برای آزمون) */
export function buildRequest(cfg, prompt, system = "") {
  if (!isCustomReady(cfg)) throw new Error("آدرس سرور هوش مصنوعی درست نیست؛ باید با http:// یا https:// شروع شود.");
  const vars = { prompt: String(prompt).slice(0, 30000), system: String(system ?? ""), model: String(cfg.model ?? "").trim(), key: String(cfg.key ?? "").trim() };
  const headerTpl = parseJsonField("سرآیندها", cfg.headers?.trim() || "{}");
  const headers = {};
  for (const [name, value] of Object.entries(substitute(headerTpl, vars))) {
    const v = String(value);
    // سرآیند Authorization با کلید خالی (مثلاً «Bearer ») فرستاده نمی‌شود
    if (/^(authorization|x-api-key|api-key)$/i.test(name) && !vars.key && /\{\{key\}\}/.test(String(headerTpl[name]))) continue;
    headers[name] = v;
  }
  const body = substitute(parseJsonField("قالب بدنه", cfg.body?.trim() || '{"prompt":"{{prompt}}"}'), vars);
  return { url: cfg.url.trim(), init: { method: "POST", headers, body: JSON.stringify(body) } };
}

/** مقدار یک مسیر مثل choices.0.message.content یا data[0].text */
export function pickPath(data, path) {
  const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").map((p) => p.trim()).filter(Boolean);
  let cur = data;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

const AUTO_PATHS = ["choices.0.message.content", "choices.0.text", "message.content", "response", "text", "output", "result", "answer", "generated_text", "content", "data"];

function toText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((x) => (typeof x === "string" ? x : isObj(x) && typeof x.text === "string" ? x.text : "")).join("");
  return "";
}

/** متن پاسخ سرور؛ مسیر خالی = جست‌وجوی خودکار در کلیدهای رایج */
export function extractAnswer(data, path = "") {
  if (typeof data === "string") return data.trim();
  const tried = path.trim() ? [path.trim()] : AUTO_PATHS;
  for (const p of tried) {
    const text = toText(pickPath(data, p)).trim();
    if (text) return text;
  }
  if (path.trim()) throw new Error(`در پاسخ سرور مسیر «${path.trim()}» پیدا نشد. مسیر پاسخ را در تنظیمات اصلاح کن.`);
  throw new Error("متن پاسخ در JSON سرور پیدا نشد؛ «مسیر پاسخ» را در تنظیمات مشخص کن.");
}

/** بخش «فکر» مدل‌های استدلالی را از پاسخ حذف می‌کند */
export const stripThinking = (text) => text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || text.trim();

/** یک پرسش به سرور خود کاربر؛ متن پاسخ یا خطای فارسی و قابل‌فهم */
export async function askCustom(cfg, prompt, opts = {}) {
  if (!String(prompt ?? "").trim()) throw new Error("متن درخواست خالی است.");
  const { url, init } = buildRequest(cfg, prompt, opts.system);
  const go = opts.fetcher ?? ((u, i) => fetch(u, i));
  const ctl = new AbortController();
  const timeoutMs = Math.max(5, Math.min(600, Number(cfg.timeoutSec) || 120)) * 1000;
  const timer = setTimeout(() => ctl.abort(new Error("timeout")), timeoutMs);
  const onAbort = () => ctl.abort(opts.signal.reason);
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  if (opts.signal?.aborted) onAbort();
  let res;
  try {
    res = await go(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    if (ctl.signal.aborted) throw new Error(`سرور هوش مصنوعی در ${Math.round(timeoutMs / 1000)} ثانیه پاسخ نداد.`);
    throw new Error("به سرور هوش مصنوعی وصل نشد. آدرس، روشن بودن سرور، هم‌شبکه بودن گوشی و اجازهٔ CORS سرور (Access-Control-Allow-Origin) را بررسی کن. اگر آدرس http است، گوشی باید اجازهٔ http بدهد.");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
  const raw = await res.text();
  let data = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* پاسخ متن ساده است */
  }
  if (!res.ok) {
    const detail = isObj(data) ? toText(pickPath(data, "error.message")) || toText(pickPath(data, "error")) || toText(pickPath(data, "detail")) || toText(pickPath(data, "message")) : String(data);
    throw new Error(`سرور هوش مصنوعی خطا داد (${res.status}). ${String(detail || raw).slice(0, 300)}`.trim());
  }
  return stripThinking(extractAnswer(data, cfg.responsePath ?? ""));
}
