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
      if (Array.isArray(vars.messages)) list.push(...vars.messages.map((m) => ({ role: m.role, content: String(m.content) })));
      else list.push({ role: "user", content: vars.prompt });
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
export function buildRequest(cfg, prompt, system = "", messages = null) {
  if (!isCustomReady(cfg)) throw new Error("آدرس سرور هوش مصنوعی درست نیست؛ باید با http:// یا https:// شروع شود.");
  const vars = { prompt: String(prompt).slice(0, 30000), system: String(system ?? ""), model: String(cfg.model ?? "").trim(), key: String(cfg.key ?? "").trim(), messages };
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
  const { url, init } = buildRequest(cfg, prompt, opts.system, opts.messages ?? null);
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

// ───────────────────────── ایجنت متنی (برای مدلی که function calling ندارد) ─────────────────────────
// قرارداد (برای آموزش مدل خودت): در هر نوبت مدل یا یک/چند بلوک
//   <tool_call>{"name":"termux_command","args":{"command":"ls"}}</tool_call>
// می‌نویسد، یا بدون هیچ tool_call پاسخ نهایی را می‌دهد. نتیجهٔ ابزار به‌صورت پیام user
//   <tool_result name="termux_command">{...json...}</tool_result>
// برمی‌گردد. شکل‌های رایج دیگر هم پذیرفته می‌شوند (بلوک ```json با name/args، یا {"tool":..,"arguments":..}).

const CALL_TAG = /<tool_call>([\s\S]*?)<\/tool_call>/gi;

function asCall(v) {
  if (!isObj(v)) return null;
  const name = v.name ?? v.tool ?? v.function ?? (isObj(v.function) ? v.function.name : undefined);
  const nameStr = typeof name === "string" ? name : isObj(v.function) && typeof v.function.name === "string" ? v.function.name : "";
  if (!nameStr) return null;
  let args = v.args ?? v.arguments ?? v.parameters ?? v.input ?? (isObj(v.function) ? v.function.arguments : undefined) ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  return { name: nameStr, args: isObj(args) ? args : {} };
}

/** فراخوانی‌های ابزار را از متن مدل بیرون می‌کشد؛ متن بدون آن‌ها «پاسخ» است. */
export function parseToolCalls(text) {
  const calls = [];
  let rest = String(text ?? "");
  for (const m of rest.matchAll(CALL_TAG)) {
    try {
      const c = asCall(JSON.parse(m[1].trim()));
      if (c) calls.push(c);
    } catch {
      /* JSON خراب؛ نادیده */
    }
  }
  if (calls.length) return { calls, text: rest.replace(CALL_TAG, "").trim() };
  const fenced = rest.match(/^\s*```(?:json|tool_call)?\s*\n([\s\S]*?)```\s*$/i);
  const bare = fenced ? fenced[1] : /^\s*\{[\s\S]*\}\s*$/.test(rest) ? rest : "";
  if (bare) {
    try {
      const c = asCall(JSON.parse(bare.trim()));
      if (c) return { calls: [c], text: "" };
    } catch {
      /* یک بلوک کد عادی است، نه ابزار */
    }
  }
  return { calls: [], text: rest.trim() };
}

const SCHEMA_TYPE = { STRING: "string", INTEGER: "integer", NUMBER: "number", BOOLEAN: "boolean", OBJECT: "object", ARRAY: "array" };

/** توضیح فشردهٔ ابزارها (با طرح Gemini یا JSON-schema) برای پرامپت سیستم */
export function renderTools(declarations) {
  return declarations
    .map((d) => {
      const props = d.parameters?.properties ?? {};
      const req = new Set(d.parameters?.required ?? []);
      const params = Object.entries(props).map(([k, v]) => `${k}${req.has(k) ? "" : "?"}: ${SCHEMA_TYPE[String(v?.type).toUpperCase()] ?? String(v?.type ?? "string").toLowerCase()}`);
      return `- ${d.name}(${params.join(", ")}) — ${d.description}`;
    })
    .join("\n");
}

export const TEXT_AGENT_PROTOCOL = [
  "TOOL PROTOCOL: to use a tool, reply with one or more blocks of exactly this form and nothing else:",
  '<tool_call>{"name":"TOOL_NAME","args":{"param":"value"}}</tool_call>',
  'The host runs the tool and answers with <tool_result name="TOOL_NAME">JSON</tool_result>. You may then call another tool.',
  "When the task is finished, reply with the final answer as plain text and NO <tool_call>. Never invent tool results.",
].join("\n");

/**
 * حلقهٔ ایجنت برای ارائه‌دهندهٔ سفارشی.
 * deps: { tools (اعلان‌ها)، system، execute(name,args)، onEvent، titles، signal، maxRounds، maxActions، fetcher }
 */
export async function runTextAgent(cfg, request, deps) {
  const maxRounds = Math.min(deps.maxRounds ?? 12, 12);
  const maxActions = deps.maxActions ?? 24;
  const system = `${deps.system}\n\nAVAILABLE TOOLS:\n${renderTools(deps.tools)}\n\n${TEXT_AGENT_PROTOCOL}`;
  const messages = [{ role: "user", content: request }];
  const known = new Set(deps.tools.map((t) => t.name));
  let actions = 0;
  for (let round = 0; round < maxRounds; round++) {
    deps.signal?.throwIfAborted();
    deps.onEvent?.({ kind: "step", text: `مرحلهٔ ${round + 1} · دریافت تصمیم مدل` });
    const transcript = messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
    const reply = await askCustom(cfg, transcript, { system, messages, signal: deps.signal, fetcher: deps.fetcher });
    const { calls, text } = parseToolCalls(reply);
    if (!calls.length) {
      if (!text) throw new Error("پاسخ مدل خالی بود.");
      return text;
    }
    messages.push({ role: "assistant", content: reply });
    const results = [];
    for (const call of calls.slice(0, 4)) {
      deps.signal?.throwIfAborted();
      if (++actions > maxActions) throw new Error(`حد ${maxActions} اقدام رسید؛ گزارش را بررسی کن و ادامه را در یک درخواست تازه بنویس.`);
      deps.onEvent?.({ kind: "action", text: `${deps.titles?.[call.name] ?? call.name}${typeof call.args.name === "string" ? ` · ${call.args.name}` : ""}` });
      let payload;
      if (!known.has(call.name)) {
        payload = { ok: false, error: `ابزار ناشناخته: ${call.name}. فقط از فهرست ابزارها استفاده کن.` };
        deps.onEvent?.({ kind: "result", ok: false, text: payload.error });
      } else {
        try {
          const out = await deps.execute(call.name, call.args);
          payload = { ok: true, result: out };
          const o = out && typeof out === "object" ? out : {};
          deps.onEvent?.({ kind: "result", ok: !o.stderr && !o.aborted, text: JSON.stringify(out).slice(0, 16000) });
        } catch (e) {
          deps.signal?.throwIfAborted();
          const msg = e instanceof Error ? e.message : String(e);
          payload = { ok: false, error: msg };
          deps.onEvent?.({ kind: "result", ok: false, text: msg });
        }
      }
      results.push(`<tool_result name="${call.name}">${JSON.stringify(payload).slice(0, 16000)}</tool_result>`);
    }
    messages.push({ role: "user", content: results.join("\n") });
  }
  throw new Error(`حد ${maxRounds} مرحله رسید؛ پیش‌نویس نگه داشته شد. برای ادامه درخواست تازه بنویس.`);
}
