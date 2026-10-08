import { Code2, Copy, Download, Play, ShieldAlert, Terminal as TermIcon, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { downloadText } from "@/labshell/download";
import { exportPack, uninstall, useLauncher, type App } from "@/labshell/launcher";
import { DEFAULT_PREFS, normalizePrefs, type Preferences } from "@/labshell/launcher-prefs";
import { codeArea, ghostBtn, primaryBtn, Sheet } from "./sheet";

// «حالت توسعه‌دهنده»: کنترل کامل خودِ لانچر از داخل برنامه.
// دسترسی سیستمی به اندروید نیست؛ فقط هر چیزی که مال لانچر است (کد، تنظیمات، برنامه‌ها) باز می‌شود.

const IMAGE_MARK = "[تصویر انتخابی — بدون تغییر می‌ماند]";

function configText(prefs: Preferences) {
  const { customCss: _c, bootScript: _b, ...rest } = prefs;
  return JSON.stringify({ ...rest, wallpaper: prefs.wallpaper.startsWith("data:") ? IMAGE_MARK : prefs.wallpaper }, null, 2);
}

export function DevSheet({ open, onOpenChange, prefs, setPrefs, runScript, onEditApp, onOpenTerminal }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: Preferences;
  setPrefs: (next: Preferences) => void;
  runScript: (code: string) => Promise<string>;
  onEditApp: (app: App) => void;
  onOpenTerminal: () => void;
}) {
  const apps = useLauncher((s) => s.apps);
  const [config, setConfig] = useState(""), [css, setCss] = useState(""), [boot, setBoot] = useState(""), [msg, setMsg] = useState(""), [out, setOut] = useState("");
  useEffect(() => {
    if (!open) return;
    setConfig(configText(prefs));
    setCss(prefs.customCss);
    setBoot(prefs.bootScript);
    setMsg("");
    // فقط وقتی برگه باز می‌شود از روی تنظیمات فعلی پر شود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applyConfig = () => {
    try {
      const parsed = JSON.parse(config) as Record<string, unknown>;
      if (parsed.wallpaper === IMAGE_MARK) parsed.wallpaper = prefs.wallpaper;
      const next = normalizePrefs({ ...parsed, customCss: prefs.customCss, bootScript: prefs.bootScript });
      setPrefs(next);
      setConfig(configText(next));
      setMsg("پیکربندی اعمال شد.");
    } catch (e) {
      setMsg(`JSON نامعتبر: ${e instanceof Error ? e.message : e}`);
    }
  };
  const backup = () => JSON.stringify({ jibos: 2, prefs, apps: useLauncher.getState().apps }, null, 1);
  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { jibos?: number; prefs?: unknown; apps?: App[] };
      if (data.jibos !== 2) throw new Error("این فایل پشتیبان جیب‌کد OS نیست");
      if (data.prefs) setPrefs(normalizePrefs(data.prefs));
      for (const a of Array.isArray(data.apps) ? data.apps : []) if (a && typeof a.name === "string" && Array.isArray(a.files)) useLauncher.getState().put({ ...a, installedAt: Date.now() });
      setMsg("پشتیبان بازگردانی شد (فایل‌های پیوستِ عکس در پشتیبان JSON نیستند؛ برای آن‌ها از خروجی .jibpack استفاده کن).");
    } catch (e) {
      setMsg(`بازگردانی نشد: ${e instanceof Error ? e.message : e}`);
    }
  };
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${label} در کلیپ‌بورد کپی شد.`);
    } catch {
      setMsg("کپی ممکن نشد.");
    }
  };

  return (
    <Sheet title="حالت توسعه‌دهنده" icon={<ShieldAlert className="size-5" style={{ color: prefs.accent }} />} open={open} onOpenChange={onOpenChange} testId="dev-sheet">
      <div className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-3 text-xs leading-6 text-amber-100/90">
        این حالت کنترل کامل «داخل لانچر» را باز می‌کند: ویرایش کد برنامه‌های نصب‌شده، پیکربندی JSON، CSS و اسکریپت راه‌اندازی، مدیریت همهٔ برنامه‌ها و فرمان‌های بیشتر برای آن‌ها. دسترسی سیستمی (root) به اندروید نمی‌دهد؛ یک برنامهٔ معمولی نمی‌تواند گوشی را روت کند.
      </div>
      <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
        <span className="font-semibold">حالت توسعه‌دهنده روشن</span>
        <input type="checkbox" aria-label="حالت توسعه‌دهنده" className="size-5" style={{ accentColor: prefs.accent }} checked={prefs.devMode} onChange={(e) => setPrefs({ ...prefs, devMode: e.target.checked })} />
      </label>
      {!prefs.devMode ? (
        <p className="text-xs leading-6 text-white/55">برای باز شدن ابزارها روشنش کن (یا در کنسول بنویس dev on، یا ۷ بار روی «نسخهٔ JibOS» در تنظیمات بزن).</p>
      ) : (
        <>
          <button type="button" className={`${ghostBtn} flex items-center justify-center gap-2`} onClick={onOpenTerminal}>
            <TermIcon className="size-4" />
            باز کردن کنسول توسعه‌دهنده
          </button>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">پیکربندی لانچر (JSON)</h3>
            <textarea aria-label="پیکربندی JSON" dir="ltr" spellCheck={false} className={`${codeArea} h-52`} value={config} onChange={(e) => setConfig(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={primaryBtn} style={{ background: prefs.accent }} onClick={applyConfig}>
                اعمال پیکربندی
              </button>
              <button type="button" className={ghostBtn} onClick={() => setConfig(configText({ ...DEFAULT_PREFS, devMode: true }))}>
                مقادیر پیش‌فرض
              </button>
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">CSS سفارشی لانچر</h3>
            <textarea aria-label="CSS سفارشی" dir="ltr" spellCheck={false} placeholder={".jibos-icon { border-radius: 50% !important; }\n.jibos-clock { letter-spacing: .2em; }"} className={`${codeArea} h-28`} value={css} onChange={(e) => setCss(e.target.value)} />
            <button type="button" className={`${ghostBtn} w-full`} onClick={() => { setPrefs({ ...prefs, customCss: css }); setMsg("CSS اعمال شد."); }}>
              اعمال CSS
            </button>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">اسکریپت راه‌اندازی لانچر (JavaScript)</h3>
            <p className="text-[11px] leading-5 text-white/50">هر بار که لانچر باز می‌شود اجرا می‌شود و به شیء <code dir="ltr">api</code> دسترسی دارد: apps()، launch(name)، prefs()، setPrefs({"{…}"})، toast(msg)، beep(hz, ms)، install(name, html)، uninstall(name)، gemini(prompt). اگر چیزی خراب شد، لانچر را با <code dir="ltr">/launcher?safe=1</code> باز کن تا CSS و اسکریپت اجرا نشوند.</p>
            <textarea aria-label="اسکریپت راه‌اندازی" dir="ltr" spellCheck={false} placeholder={'api.toast("خوش آمدی، " + api.prefs().hostname);\napi.beep(660, 120);'} className={`${codeArea} h-28`} value={boot} onChange={(e) => setBoot(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={ghostBtn} onClick={() => { setPrefs({ ...prefs, bootScript: boot }); setMsg("اسکریپت ذخیره شد؛ از دفعهٔ بعد خودکار اجرا می‌شود."); }}>
                ذخیره
              </button>
              <button type="button" className={`${ghostBtn} flex items-center justify-center gap-2`} onClick={async () => setOut(await runScript(boot))}>
                <Play className="size-4" />
                اجرای الان
              </button>
            </div>
            {out ? <pre dir="ltr" data-testid="dev-script-out" className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-black/60 p-2 font-mono text-[11px] text-white/80">{out}</pre> : null}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">همهٔ برنامه‌ها ({apps.length})</h3>
            {apps.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2 text-sm">
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/10">{a.iconImage ? <img src={a.iconImage} alt="" className="size-full object-cover" /> : a.icon}</span>
                <span className="min-w-0 flex-1 truncate">{a.name}<span className="ms-2 text-[10px] text-white/40">{a.files.length} فایل</span></span>
                <button type="button" aria-label={`ویرایش کد ${a.name}`} className="grid size-8 place-items-center rounded-lg bg-white/10" onClick={() => onEditApp(a)}><Code2 className="size-4" /></button>
                <button type="button" aria-label={`خروجی ${a.name}`} className="grid size-8 place-items-center rounded-lg bg-white/10" onClick={async () => downloadText(`${a.name}.jibpack`, await exportPack(a))}><Download className="size-4" /></button>
                <button type="button" aria-label={`کپی بستهٔ ${a.name}`} className="grid size-8 place-items-center rounded-lg bg-white/10" onClick={async () => copy(await exportPack(a), `بستهٔ «${a.name}»`)}><Copy className="size-4" /></button>
                <button type="button" aria-label={`حذف ${a.name}`} className="grid size-8 place-items-center rounded-lg bg-rose-600/80" onClick={() => window.confirm(`«${a.name}» حذف شود؟`) && void uninstall(a.id)}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">پشتیبان کامل لانچر</h3>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={`${ghostBtn} flex items-center justify-center gap-1`} onClick={() => downloadText("jibos-backup.json", backup(), "application/json")}><Download className="size-4" />فایل</button>
              <button type="button" className={`${ghostBtn} flex items-center justify-center gap-1`} onClick={() => copy(backup(), "پشتیبان")}><Copy className="size-4" />کپی</button>
              <label className={`${ghostBtn} flex cursor-pointer items-center justify-center gap-1`}><Upload className="size-4" />بازگردانی<input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ""; }} /></label>
            </div>
            <button type="button" className={`${ghostBtn} w-full text-rose-200`} onClick={() => window.confirm("همهٔ تنظیمات ظاهری لانچر به حالت اول برگردد؟") && setPrefs({ ...DEFAULT_PREFS, devMode: true })}>بازنشانی تنظیمات لانچر</button>
          </section>
        </>
      )}
      {msg ? <p className="text-xs leading-5" style={{ color: prefs.accent }}>{msg}</p> : null}
    </Sheet>
  );
}
