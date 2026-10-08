import { Copy, LockKeyhole, PackagePlus, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { appPrompt, askGemini, DEFAULT_GEMINI_MODEL, extractCode, GEMINI_MODELS, maskKey, type GeminiSettings } from "@/labshell/gemini";
import { field, ghostBtn, primaryBtn, Sheet } from "./sheet";

export function GeminiSheet({ open, onOpenChange, settings, setSettings, accent, onInstallHtml }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: GeminiSettings;
  setSettings: (s: GeminiSettings) => void;
  accent: string;
  onInstallHtml: (name: string, html: string) => void;
}) {
  const [draft, setDraft] = useState(""), [model, setModel] = useState(settings.model || DEFAULT_GEMINI_MODEL);
  const [prompt, setPrompt] = useState(""), [answer, setAnswer] = useState(""), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const abort = useRef<AbortController | null>(null);
  const connected = !!settings.key;
  useEffect(() => {
    if (open) {
      setDraft("");
      setModel(settings.model || DEFAULT_GEMINI_MODEL);
    } else abort.current?.abort();
  }, [open, settings.model]);

  const save = () => {
    const key = draft.trim() || settings.key;
    if (!key) return setStatus("کلید را وارد کن (از aistudio.google.com ← Get API key).");
    setSettings({ key, model });
    setDraft("");
    setStatus("ذخیره شد. Gemini روی این دستگاه وصل می‌ماند تا وقتی کلید را پاک کنی.");
  };
  const ask = async (mode: "chat" | "app") => {
    if (!prompt.trim()) return setStatus("اول درخواستت را بنویس.");
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setStatus("");
    setAnswer("");
    try {
      const text = await askGemini(settings, mode === "app" ? appPrompt(prompt) : prompt, { signal: ctrl.signal });
      if (mode === "app") {
        const html = extractCode(text, "html");
        if (!html) {
          setAnswer(text);
          return setStatus("پاسخ فایل HTML نداشت؛ درخواست را دقیق‌تر بنویس.");
        }
        const name = prompt.trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 28) || "برنامهٔ Gemini";
        onInstallHtml(name, html);
        setStatus(`برنامهٔ «${name}» ساخته و در لانچر نصب شد.`);
        setAnswer(html);
      } else setAnswer(text);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="اتصال Gemini" icon={<Sparkles className="size-5" style={{ color: accent }} />} open={open} onOpenChange={onOpenChange} testId="gemini-sheet">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-3 text-sm" data-testid="gemini-status">
        <span className={`size-2.5 rounded-full ${connected ? "" : "bg-white/25"}`} style={connected ? { background: accent, boxShadow: `0 0 10px ${accent}` } : undefined} />
        {connected ? <span>وصل است · کلید <code dir="ltr" className="font-mono">{maskKey(settings.key)}</code> · {settings.model}</span> : <span className="text-white/60">وصل نیست — یک بار کلید API خودت را وارد کن.</span>}
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" style={{ color: accent }} />
        <p className="text-xs leading-5 text-white/60">کلید فقط در حافظهٔ محلی همین گوشی ذخیره می‌شود و مستقیم به سرور Google فرستاده می‌شود؛ نه در کد برنامه است و نه جای دیگری. چون رمزگذاری نمی‌شود، گوشی را امن نگه دار. هیچ درخواستی بدون زدن دکمه فرستاده نمی‌شود.</p>
      </div>
      <label className="text-xs text-white/60">کلید Gemini API
        <input className={`${field} mt-2 font-mono`} dir="ltr" type="password" autoComplete="off" aria-label="کلید Gemini API" placeholder={connected ? maskKey(settings.key) : "AIza…"} value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <label className="text-xs text-white/60">مدل
        <select className={`${field} mt-2 font-mono`} dir="ltr" aria-label="مدل Gemini" value={model} onChange={(e) => setModel(e.target.value)}>
          {GEMINI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={primaryBtn} style={{ background: accent }} onClick={save}>ذخیرهٔ اتصال</button>
        <button type="button" className={`${ghostBtn} text-rose-200`} onClick={() => { setSettings({ key: "", model }); setDraft(""); setStatus("کلید از این دستگاه پاک شد."); }}>قطع اتصال</button>
      </div>
      <div className="h-px bg-white/10" />
      <label className="text-xs text-white/60">درخواست
        <textarea className={`${field} mt-2 min-h-24 resize-y`} aria-label="درخواست Gemini" placeholder="مثلاً: یک تابع پایتون بنویس که عدد اول بودن را بررسی کند — یا برای «ساخت برنامه»: یک ساعت شمارش معکوس نئونی" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} className={`${primaryBtn} flex items-center justify-center gap-2`} style={{ background: accent }} onClick={() => void ask("chat")}><Send className="size-4" />{busy ? "در حال دریافت…" : "پرسیدن"}</button>
        <button type="button" disabled={busy} className={`${ghostBtn} flex h-11 items-center justify-center gap-2`} onClick={() => void ask("app")}><PackagePlus className="size-4" />ساخت برنامه</button>
      </div>
      {status ? <p className="text-xs leading-5 text-amber-200" data-testid="gemini-message">{status}</p> : null}
      {answer ? (
        <div className="relative">
          <pre dir="auto" className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/50 p-3 text-[13px] leading-6">{answer}</pre>
          <button type="button" aria-label="کپی پاسخ" className="absolute end-2 top-2 grid size-8 place-items-center rounded-lg bg-white/10" onClick={() => void navigator.clipboard?.writeText(answer)}><Copy className="size-4" /></button>
        </div>
      ) : null}
      <p className="text-[11px] leading-5 text-white/35">Gemini فقط وقتی کاری می‌کند که خودت دکمه را بزنی؛ پاسخ کد را پیش از اجرا بازبینی کن. اینترنت لازم است و هزینه/سهمیه طبق حساب Google خودت است.</p>
    </Sheet>
  );
}
