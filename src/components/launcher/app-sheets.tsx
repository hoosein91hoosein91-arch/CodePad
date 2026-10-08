import { Code2, ImagePlus, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { askGemini, extractCode, fixPrompt, type GeminiSettings } from "@/labshell/gemini";
import { installPack, useLauncher, type App } from "@/labshell/launcher";
import { langFromName } from "@/labshell/open-files";
import { parsePack } from "@/labshell/pack";
import { PACK_SAMPLES } from "@/labshell/pack-samples";
import { codeArea, field, ghostBtn, primaryBtn, Sheet } from "./sheet";
import { imageData } from "@/labshell/image";

const ICON_COLORS = ["#03140b", "#0b2a1a", "#10131f", "#1d0b2e", "#2a0b14", "#2a1d05", "#06222a", "#000000"];

/** ظاهر یک برنامه: عکس یا ایموجی آیکن، رنگ زمینه، نام */
export function AppCustomizeSheet({ app, onOpenChange, accent, devMode, onEditCode, onRemove }: { app: App | null; onOpenChange: (open: boolean) => void; accent: string; devMode: boolean; onEditCode: (app: App) => void; onRemove: (app: App) => void }) {
  const [name, setName] = useState(""), [icon, setIcon] = useState("✦"), [color, setColor] = useState(ICON_COLORS[0]), [picture, setPicture] = useState("");
  useEffect(() => {
    if (app) {
      setName(app.name);
      setIcon(app.icon);
      setColor(app.iconColor ?? ICON_COLORS[0]);
      setPicture(app.iconImage ?? "");
    }
  }, [app]);
  if (!app) return null;
  return (
    <Sheet title="شخصی‌سازی برنامه" icon={<Pencil className="size-5" style={{ color: accent }} />} open={!!app} onOpenChange={onOpenChange} testId="customize-sheet">
      <div className="flex items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[22px] border text-3xl" style={{ backgroundColor: color, borderColor: `${accent}55`, boxShadow: `0 0 22px ${accent}33` }}>
          {picture ? <img src={picture} alt="" className="size-full object-cover" /> : icon}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm">
            <ImagePlus className="size-4" />
            انتخاب عکس آیکن
            <input type="file" accept="image/*" aria-label="عکس آیکن" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPicture(await imageData(f, 256)); }} />
          </label>
          {picture ? <button type="button" className="text-xs text-white/50" onClick={() => setPicture("")}>حذف عکس (برگشت به ایموجی)</button> : null}
        </div>
      </div>
      <label className="text-xs text-white/55">نام برنامه<input className={`${field} mt-2`} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-xs text-white/55">نماد یا ایموجی<input className={`${field} mt-2 text-xl`} value={icon} onChange={(e) => setIcon([...e.target.value].slice(0, 3).join(""))} /></label>
      <div className="flex flex-wrap items-center gap-2">
        {ICON_COLORS.map((c) => <button key={c} type="button" aria-label={`زمینهٔ ${c}`} className={`size-8 rounded-lg border ${color === c ? "border-white" : "border-white/15"}`} style={{ background: c }} onClick={() => setColor(c)} />)}
        <input type="color" aria-label="رنگ زمینهٔ آیکن" className="size-8 rounded-lg border-0 bg-transparent" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <button type="button" className={primaryBtn} style={{ background: accent }} onClick={() => { useLauncher.getState().patch(app.id, { name: name.trim() || app.name, icon: icon || "✦", iconColor: color, iconImage: picture || undefined }); onOpenChange(false); }}>ذخیرهٔ تغییرات</button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={`${ghostBtn} flex items-center justify-center gap-2 disabled:opacity-40`} disabled={!devMode} title={devMode ? "" : "حالت توسعه‌دهنده لازم است"} onClick={() => onEditCode(app)}><Code2 className="size-4" />ویرایش کد</button>
        <button type="button" className={`${ghostBtn} flex items-center justify-center gap-2 text-rose-200`} onClick={() => onRemove(app)}><Trash2 className="size-4" />حذف برنامه</button>
      </div>
      {!devMode ? <p className="text-[11px] text-white/40">برای ویرایش کد برنامه از داخل لانچر، «حالت توسعه‌دهنده» را در شخصی‌سازی روشن کن.</p> : null}
    </Sheet>
  );
}

/** ویرایش کد برنامهٔ نصب‌شده (فقط حالت توسعه‌دهنده) */
export function AppEditorSheet({ app, onOpenChange, accent, gemini }: { app: App | null; onOpenChange: (open: boolean) => void; accent: string; gemini: GeminiSettings }) {
  const [fileName, setFileName] = useState(""), [code, setCode] = useState(""), [result, setResult] = useState(""), [newFile, setNewFile] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (app) {
      const file = app.files.find((f) => langFromName(f.name) !== "css") ?? app.files[0];
      setFileName(file?.name ?? "");
      setCode(file?.content ?? "");
      setResult("");
    }
  }, [app]);
  if (!app) return null;
  const live = useLauncher.getState().apps.find((a) => a.id === app.id) ?? app;
  const scan = () => {
    const checks: [RegExp, string][] = [
      [/\beval\s*\(/i, "eval پیدا شد؛ ورودی غیرقابل‌اعتماد را اجرا نکن."],
      [/\bdocument\.write\s*\(/i, "document.write صفحه را ناامن جایگزین می‌کند."],
      [/\.innerHTML\s*=/i, "innerHTML را فقط با محتوای پاک‌سازی‌شده مقدار بده (خطر XSS)."],
      [/(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}/i, "احتمال کلید یا رمز ثابت داخل کد."],
      [/<script[^>]+src=["']https?:/i, "اسکریپت راه‌دور در برنامهٔ آفلاین کار نمی‌کند و منبعش قابل اعتماد نیست."],
      [/addEventListener\s*\(\s*['"]message/i, "در گیرندهٔ postMessage مبدأ و داده را بررسی کن."],
      [/\bhashlib\.md5\b|\bmd5\(/i, "MD5 برای امنیت شکسته است؛ SHA-256 یا بالاتر."],
    ];
    const found = checks.filter(([re]) => re.test(code)).map(([, m]) => `• ${m}`);
    setResult(found.length ? `موارد پیشنهادی برای بازبینی:\n${found.join("\n")}` : "بررسی ساده مورد مشخصی پیدا نکرد (جای ممیزی کامل را نمی‌گیرد).");
  };
  const save = () => {
    const files = live.files.some((f) => f.name === fileName) ? live.files.map((f) => (f.name === fileName ? { ...f, content: code } : f)) : [...live.files, { name: fileName, content: code }];
    useLauncher.getState().patch(app.id, { files });
    setResult("ذخیره شد. برنامه را دوباره باز کن تا تغییر را ببینی.");
  };
  const improve = async () => {
    setBusy(true);
    setResult("");
    try {
      const text = await askGemini(gemini, fixPrompt(fileName, code, "fix bugs, keep behaviour, make it nicer on a phone"));
      const next = extractCode(text, langFromName(fileName) === "html" ? "html" : "");
      if (next) {
        setCode(next);
        setResult("Gemini نسخهٔ تازه را در ویرایشگر گذاشت؛ بازبینی کن و «ذخیره» را بزن.");
      } else setResult(text);
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={`کد ${app.name}`} icon={<Code2 className="size-5" style={{ color: accent }} />} open={!!app} onOpenChange={onOpenChange} testId="editor-sheet">
      <div className="flex gap-2">
        <select aria-label="فایل" className={`${field} font-mono`} dir="ltr" value={fileName} onChange={(e) => { setFileName(e.target.value); setCode(live.files.find((f) => f.name === e.target.value)?.content ?? ""); setResult(""); }}>
          {live.files.map((f) => <option key={f.name}>{f.name}</option>)}
          {live.files.some((f) => f.name === fileName) ? null : <option>{fileName}</option>}
        </select>
      </div>
      <div className="flex gap-2">
        <input className={`${field} font-mono`} dir="ltr" placeholder="new-file.css" value={newFile} onChange={(e) => setNewFile(e.target.value)} />
        <button type="button" aria-label="فایل تازه" className={`${ghostBtn} shrink-0`} onClick={() => { const n = newFile.trim(); if (!n) return; setFileName(n); setCode(""); setNewFile(""); }}><Plus className="size-4" /></button>
      </div>
      <textarea aria-label="کد برنامه" dir="ltr" spellCheck={false} className={`${codeArea} min-h-[42dvh]`} value={code} onChange={(e) => setCode(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={`${ghostBtn} flex items-center justify-center gap-1`} onClick={scan}><ShieldCheck className="size-4" />بررسی</button>
        <button type="button" disabled={busy || !gemini.key} title={gemini.key ? "" : "اول Gemini را وصل کن"} className={`${ghostBtn} flex items-center justify-center gap-1 disabled:opacity-40`} onClick={() => void improve()}><Sparkles className="size-4" />{busy ? "…" : "Gemini"}</button>
        <button type="button" className={primaryBtn} style={{ background: accent }} onClick={save}>ذخیره</button>
      </div>
      {result ? <pre dir="auto" className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-xs leading-6" style={{ color: accent }}>{result}</pre> : null}
    </Sheet>
  );
}

const STARTER = `<!doctype html>
<html lang="fa" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;min-height:100vh;background:#000;color:#00ff9c;font-family:ui-monospace,monospace;display:grid;place-items:center;text-align:center}
button{background:#00ff9c;color:#001a0c;border:0;border-radius:14px;padding:12px 18px;font:inherit;font-weight:700}
</style>
<h1>&gt; hello_world<span id="c">_</span></h1>
<button onclick="window.jibos ? jibos.beep(880,120) : 0; this.textContent='اجرا شد ✓'">آزمایش صدا</button>
<script>setInterval(()=>c.style.opacity=c.style.opacity==='0'?1:0,500)</script>
</html>`;

/** افزودن برنامه: ساخت سریع HTML، نصب .jibpack (فایل یا نشانی) و نمونه‌های آماده */
export function InstallSheet({ open, onOpenChange, accent, onInstalled }: { open: boolean; onOpenChange: (open: boolean) => void; accent: string; onInstalled: (app: App, run: boolean) => void }) {
  const [name, setName] = useState("برنامهٔ تازه"), [code, setCode] = useState(STARTER), [url, setUrl] = useState(""), [msg, setMsg] = useState("");
  useEffect(() => { if (open) setMsg(""); }, [open]);
  const fromText = async (text: string, run: boolean) => {
    const pack = parsePack(text);
    if (!pack) return setMsg("این فایل بستهٔ جیب (.jibpack) نیست.");
    const app = await installPack(pack);
    setMsg(`«${app.name}» نصب شد.` + (pack.problems.length ? ` مشکل: ${pack.problems.join("، ")}` : ""));
    onInstalled(app, run);
  };
  return (
    <Sheet title="افزودن برنامه" icon={<Plus className="size-5" style={{ color: accent }} />} open={open} onOpenChange={onOpenChange} testId="install-sheet">
      <section className="space-y-2">
        <h3 className="text-sm font-bold">نمونه‌های آماده</h3>
        <div className="grid gap-2">
          {PACK_SAMPLES.map((s) => (
            <button key={s.id} type="button" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 text-start" onClick={() => void fromText(s.text, false).catch((e) => setMsg(String(e)))}>
              <span className="grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold" style={{ background: s.group === "security" ? `${accent}22` : "#ffffff14", color: accent }}>{s.group === "security" ? "SEC" : "APP"}</span>
              <span className="min-w-0"><span className="block text-sm">{s.title}</span><span className="block truncate text-[11px] text-white/45">{s.detail}</span></span>
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2 border-t border-white/10 pt-4">
        <h3 className="text-sm font-bold">ساخت سریع برنامهٔ HTML</h3>
        <input className={field} aria-label="نام برنامهٔ تازه" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea dir="ltr" spellCheck={false} aria-label="کد برنامهٔ تازه" className={`${codeArea} h-40`} value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="button" className={`${primaryBtn} w-full`} style={{ background: accent }} onClick={() => { const app: App = { id: `app-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`, name: name.trim() || "برنامهٔ تازه", icon: "✦", files: [{ name: "index.html", content: code }], installedAt: Date.now() }; useLauncher.getState().put(app); onInstalled(app, true); }}>ساخت و اجرا</button>
        <p className="text-[11px] text-white/40">برای برنامه‌های چندزبانه (پایتون، mix، عکس‌ها) در ویرایشگر پروژه بساز و با دکمهٔ «لانچر» نصبش کن.</p>
      </section>
      <section className="space-y-2 border-t border-white/10 pt-4">
        <h3 className="text-sm font-bold">نصب فایل .jibpack</h3>
        <input type="file" accept=".jibpack,.txt,text/plain" aria-label="فایل jibpack" className="text-xs text-white/65 file:me-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await fromText(await f.text(), true).catch((x) => setMsg(String(x))); }} />
        <input className={field} dir="ltr" placeholder="https://…/app.jibpack" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className={`${ghostBtn} w-full`} onClick={async () => { try { setMsg("در حال دانلود…"); const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); await fromText(await r.text(), true); } catch (e) { setMsg(`دانلود نشد (${e instanceof Error ? e.message : e}). اگر سایت اجازه نمی‌دهد، فایل را دانلود و از «انتخاب فایل» نصب کن.`); } }}>دانلود و نصب</button>
      </section>
      {msg ? <p className="text-sm" style={{ color: accent }}>{msg}</p> : null}
    </Sheet>
  );
}
