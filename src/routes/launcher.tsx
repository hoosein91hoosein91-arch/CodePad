import { compactNavaSource } from "@/labshell/nava-short";
import * as Dialog from "@radix-ui/react-dialog";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Code2, Download, Globe2, ImagePlus, LockKeyhole, Palette, Pencil, Plus, Send, Settings2, ShieldCheck, Smartphone, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { compileEnglish } from "@/labshell/english";
import { compileFarsi } from "@/labshell/farsi";
import { runBinary } from "@/labshell/binary";
import { assetUrlsFor, loadAssets } from "@/labshell/assets";
import { buildHtmlDoc, buildWebDoc, webText, withAssets } from "@/labshell/html-doc";
import { assetKey, exportAppPack, installPack, uninstall, useLauncher, type App } from "@/labshell/launcher";
import { runMix } from "@/labshell/mix";
import { compileNava } from "@/labshell/nava";
import { NAVA_AI_GUIDE, NAVA_PRESETS } from "@/labshell/nava-kit";
import { langFromName } from "@/labshell/open-files";
import { parsePack } from "@/labshell/pack";
import { runCpp, runFarsi, runJavaScript, runPython, stopRuntimes, type RunResult } from "@/labshell/runtime";
import { stageSrcDoc } from "@/labshell/stage-doc";
import { applyTheme, useTheme } from "@/labshell/theme";
import type { Lang } from "@/labshell/types";
import { openExternalBrowser, openTorBrowser } from "@/lib/termux-bridge";

export const Route = createFileRoute("/launcher")({ component: Launcher });

const KIND: Partial<Record<Lang, string>> = { python: "python", javascript: "javascript", english: "jib", farsi: "farsi", c: "c", cpp: "cpp", binary: "binary" };
const PREF_KEY = "jibcode-launcher-preferences";
const GEMINI_KEY = "jibcode-gemini-key";
const WALLPAPERS = [
  { name: "سبز نئونی", value: "linear-gradient(155deg,#071912 0%,#0b3423 48%,#07110e 100%)" },
  { name: "شب بنفش", value: "linear-gradient(155deg,#100d22 0%,#302052 52%,#101321 100%)" },
  { name: "اقیانوس", value: "linear-gradient(155deg,#071720 0%,#0c3d4a 50%,#0c1827 100%)" },
  { name: "قرمز تیره", value: "linear-gradient(155deg,#1e0b10 0%,#51202b 52%,#151018 100%)" },
  { name: "کهکشانی", value: "radial-gradient(ellipse at 18% 18%,#343765 0%,#17172d 40%,#0b101d 100%)" },
];
const ACCENTS = ["#67f5a5", "#b5f36b", "#59d7ff", "#c5a2ff", "#ff85aa", "#ffc56b"];
type LauncherPage = { name: string; wallpaper: string };
type Preferences = { wallpaper: string; accent: string; columns: number; iconSize: number; roundness: number; glass: boolean; pages: LauncherPage[] };
const DEFAULT_PREFS: Preferences = { wallpaper: WALLPAPERS[0].value, accent: "#67f5a5", columns: 4, iconSize: 62, roundness: 20, glass: true, pages: [{ name: "خانه", wallpaper: WALLPAPERS[0].value }] };

function entryOf(app: App) {
  const by = (test: (n: string, l: Lang) => boolean) => app.files.find((f) => test(f.name, langFromName(f.name)));
  return by((n) => /^main\./i.test(n)) ?? by((_, l) => l === "nava") ?? by((_, l) => l === "mix") ?? by((_, l) => l === "html") ?? by((_, l) => l !== "css");
}
type View = { kind: "busy" } | { kind: "web"; doc: string } | { kind: "page"; doc: string } | { kind: "text"; out: string; err: string };

function AppWindow({ app, onClose }: { app: App; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "busy" });
  useEffect(() => {
    let dead = false;
    const show = (v: View) => !dead && setView(v);
    (async () => {
      await loadAssets();
      const key = assetKey(app.id), entry = entryOf(app);
      if (!entry) return show({ kind: "text", out: "", err: "فایل قابل اجرا در این برنامه نیست." });
      const lang = langFromName(entry.name);
      if (lang === "html") {
        const files = app.files.map((f) => ({ id: f.name, name: f.name, lang: langFromName(f.name), content: f.content, stdin: "" }));
        const urls = await assetUrlsFor(key, files.map((f) => f.content).join("\n"));
        return show({ kind: "web", doc: buildHtmlDoc(entry.content, files, null, urls) });
      }
      if (lang === "nava") {
        const compiled = compileNava(entry.content);
        if (!compiled.web) return show({ kind: "text", out: "", err: compiled.error ?? "برنامهٔ نوا ساخته نشد." });
        const web = withAssets(compiled.web, await assetUrlsFor(key, webText(compiled.web)));
        return show({ kind: "web", doc: buildWebDoc(web, null) });
      }
      const source = lang === "mix" ? entry.content : `@@ ${KIND[lang] ?? "jib"}\n${entry.content}`;
      const result = await runMix(source, "", {
        python: (code, stdin) => runPython(code, stdin, key), javascript: runJavaScript,
        jib: async (code, stdin, farsi): Promise<RunResult> => { const c = farsi ? compileFarsi(code) : compileEnglish(code); return c.ok ? runFarsi(c.js, stdin) : { stdout: "", stderr: c.error, aborted: false }; },
        c: runCpp, cpp: runCpp,
        binary: async (code, stdin): Promise<RunResult> => { const r = runBinary(code, stdin); return r.ok ? { stdout: r.lines.join("\n"), stderr: "", aborted: false } : { stdout: "", stderr: r.error, aborted: false }; },
      });
      if (dead || result.aborted) return;
      if (result.web) { const web = withAssets(result.web, await assetUrlsFor(key, webText(result.web))); return show({ kind: "web", doc: buildWebDoc(web, null) }); }
      if (result.page) return show({ kind: "page", doc: stageSrcDoc(result.page.css ?? "", { ...result.page, title: result.page.title || app.name, text: result.page.text || "", mark: result.page.mark || "JIB", lines: [] }) });
      show({ kind: "text", out: result.stdout, err: result.stderr });
    })().catch((e) => show({ kind: "text", out: "", err: String(e) }));
    return () => { dead = true; stopRuntimes(); };
  }, [app]);
  return <div className="fixed inset-0 z-30 flex flex-col bg-[#07110e] pt-[env(safe-area-inset-top)]">
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-black/35 px-2 backdrop-blur-xl">
      <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="بازگشت به خانه" onClick={onClose}><ArrowRight className="size-5" /></button>
      <span className="truncate text-sm font-semibold">{app.name}</span><span className="ms-auto me-3 text-xs text-white/45">برنامهٔ محلی</span>
    </header>
    {view.kind === "busy" ? <p className="p-4 text-white/70">در حال اجرا…</p> : null}
    {view.kind === "web" ? <iframe title={app.name} className="min-h-0 flex-1 bg-white" sandbox="allow-scripts allow-modals allow-forms" srcDoc={view.doc} /> : null}
    {view.kind === "page" ? <iframe title={app.name} className="min-h-0 flex-1" sandbox="allow-same-origin" srcDoc={view.doc} /> : null}
    {view.kind === "text" ? <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm">{view.out}{view.err ? <span className="text-rose-400">{"\n" + view.err}</span> : null}</pre> : null}
  </div>;
}

function Sheet({ title, icon, children, open, onOpenChange, trigger }: { title: string; icon?: ReactNode; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void; trigger?: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
      <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-[430px] flex-col gap-4 overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#101a16] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl outline-none">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2">{icon}<Dialog.Title className="text-lg font-bold">{title}</Dialog.Title></div><Dialog.Close className="grid size-9 place-items-center rounded-full bg-white/8" aria-label="بستن"><X className="size-4" /></Dialog.Close></div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

async function imageData(file: File, size: number): Promise<string> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, size / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("پردازش تصویر ممکن نشد");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

function InstallDialog({ onCreated }: { onCreated: (app: App) => void }) {
  const [open, setOpen] = useState(false), [url, setUrl] = useState(""), [msg, setMsg] = useState("");
  const done = async (text: string) => { const pack = parsePack(text); if (!pack) return setMsg("این فایل بستهٔ جیب (.jibpack) نیست."); const app = await installPack(pack); onCreated(app); setMsg(`«${app.name}» نصب شد.` + (pack.problems.length ? ` مشکل: ${pack.problems.join("، ")}` : "")); };
  const field = "h-11 w-full rounded-2xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-emerald-300/60";
  return <>
    <button id="launcher-add-trigger" type="button" className="grid size-[58px] place-items-center rounded-[21px] text-[#07110e] shadow-lg shadow-emerald-400/20 transition active:scale-95" style={{ background: "var(--launcher-accent)" }} aria-label="نصب برنامه" onClick={() => { setOpen(true); setMsg(""); }}><Plus className="size-7" /></button>
    <Sheet title="افزودن برنامه" icon={<Plus className="size-5 text-emerald-300" />} open={open} onOpenChange={setOpen}>
      <p className="text-sm leading-6 text-white/60">یک پروژهٔ تازه بساز یا بستهٔ جیبِ آماده را نصب کن. پروژه‌های تازه در محیط امنِ همین لانچر اجرا می‌شوند.</p>
      <CreateAppForm onCreated={(app) => { onCreated(app); setOpen(false); }} />
      <div className="my-1 h-px bg-white/10" />
      <p className="text-sm font-semibold">نصب فایل .jibpack</p>
      <input type="file" accept=".jibpack,.txt,text/plain" className="text-xs text-white/65 file:me-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await done(await f.text()).catch((x) => setMsg(String(x))); e.target.value = ""; }} />
      <input className={field} dir="ltr" placeholder="نشانی فایل jibpack" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button type="button" className="h-11 rounded-2xl bg-white/10 text-sm font-semibold" onClick={async () => { try { setMsg("در حال دریافت فایل…"); const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); await done(await r.text()); } catch (e) { setMsg(`دریافت نشد: ${e instanceof Error ? e.message : e}`); } }}>دریافت و نصب</button>
      {msg ? <p className="text-sm text-emerald-200">{msg}</p> : null}
    </Sheet>
  </>;
}

function CreateAppForm({ onCreated }: { onCreated: (app: App) => void }) {
  const [name, setName] = useState("ماشین‌حساب"), [code, setCode] = useState(NAVA_PRESETS[0].code);
  return <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-black/15 p-3">
    <label className="text-xs text-white/60">نمونهٔ آماده<select defaultValue="calculator" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#080f0c] px-3 text-sm text-white" onChange={(e) => { const preset = NAVA_PRESETS.find((p) => p.id === e.target.value); if (preset) { setCode(preset.code); setName(preset.title); } }}>{NAVA_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.title}</option>)}</select></label>
    <label className="text-xs text-white/60">نام برنامه<input className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" value={name} onChange={(e) => setName(e.target.value)} /></label>
    <label className="text-xs text-white/60">کد نوا<textarea dir="ltr" spellCheck={false} className="mt-2 h-48 w-full resize-y rounded-xl border border-white/10 bg-[#080f0c] p-3 font-mono text-xs leading-6 text-emerald-100 outline-none" value={code} onChange={(e) => setCode(e.target.value)} /></label>
    <button type="button" className="h-10 rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-200" onClick={() => setCode(compactNavaSource(code))}>مخفف‌کردن کد؛ متن‌ها حفظ می‌شوند</button>
    <button type="button" className="h-11 rounded-xl font-bold text-[#07110e]" style={{ background: "var(--launcher-accent)" }} onClick={() => { const app: App = { id: `app-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`, name: name.trim() || "برنامهٔ تازه", icon: "✦", files: [{ name: "main.nava", content: code }], installedAt: Date.now() }; useLauncher.getState().put(app); onCreated(app); }}>ساخت برنامه</button>
  </div>;
}

function SettingsSheet({ open, onOpenChange, prefs, setPrefs, pageName, setPageName, currentPage, onRemovePage, onExport }: { open: boolean; onOpenChange: (open: boolean) => void; prefs: Preferences; setPrefs: (next: Preferences) => void; pageName: string; setPageName: (name: string) => void; currentPage: number; onRemovePage: () => void; onExport: () => void }) {
  const field = "h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none";
  const pickWallpaper = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/")) return; try { setPrefs({ ...prefs, wallpaper: await imageData(file, 1400) }); } catch { /* تصویر ناسازگار */ } event.target.value = ""; };
  return <Sheet title="شخصی‌سازی کامل" icon={<Settings2 className="size-5 text-emerald-300" />} open={open} onOpenChange={onOpenChange}>
    <section className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Palette className="size-4 text-emerald-300" />رنگ و پس‌زمینه</h3>
      <div className="grid grid-cols-5 gap-2">{WALLPAPERS.map((w) => <button key={w.name} aria-label={w.name} title={w.name} className={`h-12 rounded-xl border ${prefs.wallpaper === w.value ? "border-white ring-2 ring-emerald-300/70" : "border-white/10"}`} style={{ background: w.value }} onClick={() => setPrefs({ ...prefs, wallpaper: w.value })} />)}</div>
      <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 text-sm"><ImagePlus className="size-4" />انتخاب تصویر از گوشی<input type="file" accept="image/*" className="hidden" onChange={pickWallpaper} /></label>
      <div className="flex items-center justify-between"><span className="text-xs text-white/60">رنگ تأکیدی</span><div className="flex gap-2">{ACCENTS.map((c) => <button key={c} aria-label={`رنگ ${c}`} className={`size-7 rounded-full border ${prefs.accent === c ? "border-white ring-2 ring-white/40" : "border-white/15"}`} style={{ background: c }} onClick={() => setPrefs({ ...prefs, accent: c })} />)}</div></div>
    </section>
    <section className="space-y-3 border-t border-white/10 pt-4"><h3 className="text-sm font-bold">چیدمان صفحه</h3>
      <label className="block text-xs text-white/65">نام صفحهٔ فعلی<input className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white" value={pageName} onChange={(e) => setPageName(e.target.value)} /></label>
      <div className="flex items-center justify-between gap-3 text-xs text-white/65"><label htmlFor="cols">تعداد ستون آیکن‌ها</label><select id="cols" className={field} value={prefs.columns} onChange={(e) => setPrefs({ ...prefs, columns: Number(e.target.value) })}><option value={3}>۳ ستون</option><option value={4}>۴ ستون</option><option value={5}>۵ ستون</option></select></div>
      <label className="block text-xs text-white/65">اندازهٔ آیکن: {prefs.iconSize}px<input className="mt-2 w-full accent-emerald-300" type="range" min="52" max="76" step="2" value={prefs.iconSize} onChange={(e) => setPrefs({ ...prefs, iconSize: Number(e.target.value) })} /></label>
      <label className="block text-xs text-white/65">گردی آیکن: {prefs.roundness}px<input className="mt-2 w-full accent-emerald-300" type="range" min="12" max="30" step="2" value={prefs.roundness} onChange={(e) => setPrefs({ ...prefs, roundness: Number(e.target.value) })} /></label>
      <label className="flex items-center justify-between text-sm"><span>کارت‌های شیشه‌ای</span><input type="checkbox" className="size-4 accent-emerald-300" checked={prefs.glass} onChange={(e) => setPrefs({ ...prefs, glass: e.target.checked })} /></label>
      <div className="grid grid-cols-2 gap-2"><button type="button" className="h-10 rounded-xl bg-white/10 text-xs" onClick={onExport}>خروجی / پشتیبان JSON</button><button type="button" disabled={currentPage === 0} className="h-10 rounded-xl bg-rose-500/15 text-xs text-rose-200 disabled:opacity-35" onClick={onRemovePage}>حذف این صفحه</button></div>
    </section>
    <p className="text-xs leading-5 text-white/40">پس‌زمینه فقط روی همین دستگاه نگهداری می‌شود. فایل پشتیبان شامل برنامه‌ها و تصویرهاست؛ کلید Gemini داخلش قرار نمی‌گیرد.</p>
  </Sheet>;
}

function AppCustomizeSheet({ app, open, onOpenChange, pageCount }: { app: App | null; open: boolean; onOpenChange: (open: boolean) => void; pageCount: number }) {
  const [name, setName] = useState(app?.name ?? ""), [icon, setIcon] = useState(app?.icon ?? "✦"), [color, setColor] = useState(app?.iconColor ?? "#14271e"), [picture, setPicture] = useState(app?.iconImage ?? ""), [pageIndex, setPageIndex] = useState(app?.pageIndex ?? 0);
  useEffect(() => { if (app) { setName(app.name); setIcon(app.icon); setColor(app.iconColor ?? "#14271e"); setPicture(app.iconImage ?? ""); setPageIndex(app.pageIndex ?? 0); } }, [app]);
  if (!app) return null;
  return <Sheet title="شخصی‌سازی برنامه" icon={<Pencil className="size-5 text-emerald-300" />} open={open} onOpenChange={onOpenChange}>
    <div className="flex items-center gap-4"><div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl text-3xl" style={{ backgroundColor: color }}>{picture ? <img src={picture} alt="" className="size-full object-cover" /> : icon}</div><label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/8 px-3 py-3 text-sm"><ImagePlus className="size-4" />انتخاب عکس<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPicture(await imageData(f, 256)); e.target.value = ""; }} /></label></div>
    <label className="text-xs text-white/55">نام برنامه<input className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white" value={name} onChange={(e) => setName(e.target.value)} /></label>
    <label className="text-xs text-white/55">نماد یا ایموجی<input className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-xl text-white" value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 5))} /></label>
    {pageCount > 1 ? <label className="text-xs text-white/55">صفحهٔ برنامه<select className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#101a16] px-3 text-sm text-white" value={pageIndex} onChange={(e) => setPageIndex(Number(e.target.value))}>{Array.from({ length: pageCount }, (_, index) => <option key={index} value={index}>صفحهٔ {index + 1}</option>)}</select></label> : null}
    <label className="flex items-center justify-between text-sm text-white/70">رنگ زمینهٔ آیکن<input type="color" className="size-10 rounded-lg border-0 bg-transparent" value={color} onChange={(e) => setColor(e.target.value)} /></label>
    <button type="button" className="h-11 rounded-xl font-bold text-[#07110e]" style={{ background: "var(--launcher-accent)" }} onClick={() => { useLauncher.getState().patch(app.id, { name: name.trim() || app.name, icon: icon || "✦", iconColor: color, iconImage: picture || undefined, pageIndex }); onOpenChange(false); }}>ذخیرهٔ تغییرات</button>
  </Sheet>;
}

function AppEditorSheet({ app, open, onOpenChange }: { app: App | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [fileName, setFileName] = useState(""), [code, setCode] = useState(""), [result, setResult] = useState(""), [exporting, setExporting] = useState(false);
  useEffect(() => { if (app) { const file = app.files.find((f) => langFromName(f.name) !== "css") ?? app.files[0]; setFileName(file?.name ?? ""); setCode(file?.content ?? ""); setResult(""); } }, [app, open]);
  if (!app) return null;
  const file = app.files.find((f) => f.name === fileName);
  const scan = () => {
    const checks: [RegExp, string][] = [[/\beval\s*\(/i, "استفاده از eval پیدا شد؛ ورودیِ غیرقابل‌اعتماد را اجرا نکن."], [/\bdocument\.write\s*\(/i, "document.write می‌تواند محتوای صفحه را ناامن جایگزین کند."], [/\.innerHTML\s*=/i, "مقداردهی innerHTML را فقط با محتوای پاک‌سازی‌شده انجام بده."], [/(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}/i, "احتمال وجود کلید یا رمز ثابت در کد."], [/<script[^>]+src=["']https?:/i, "اسکریپت راه‌دور در برنامهٔ آفلاین ممکن است کار نکند و منبع آن قابل اعتماد نیست."], [/addEventListener\s*\(\s*['"]message/i, "پیام‌های postMessage باید مبدأ و داده را اعتبارسنجی کنند."]];
    const found = checks.filter(([re]) => re.test(code)).map(([, message]) => `• ${message}`);
    setResult(found.length ? `موارد پیشنهادی برای بازبینی:\n${found.join("\n")}` : "بررسی اولیه مورد مشخصی پیدا نکرد. این بررسی ساده است و جای ممیزی امنیتی کامل را نمی‌گیرد.");
  };
  return <Sheet title={`ویرایش ${app.name}`} icon={<Code2 className="size-5 text-emerald-300" />} open={open} onOpenChange={onOpenChange}>
    {app.files.length > 1 ? <select className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm" value={fileName} onChange={(e) => { setFileName(e.target.value); setCode(app.files.find((f) => f.name === e.target.value)?.content ?? ""); setResult(""); }}>{app.files.map((f) => <option key={f.name}>{f.name}</option>)}</select> : <p className="text-xs text-white/50">{fileName || "فایل کد"}</p>}
    <textarea dir="ltr" spellCheck={false} className="min-h-[45dvh] w-full resize-y rounded-2xl border border-white/10 bg-[#070e0b] p-3 font-mono text-xs leading-6 text-emerald-100 outline-none focus:border-emerald-300/50" value={code} onChange={(e) => setCode(e.target.value)} />
    <div className="grid grid-cols-3 gap-2"><button type="button" className="flex h-11 items-center justify-center gap-1 rounded-xl bg-white/10 text-xs" onClick={scan}><ShieldCheck className="size-4" />امنیت</button><button type="button" className="h-11 rounded-xl text-xs font-bold text-[#07110e]" style={{ background: "var(--launcher-accent)" }} onClick={() => { const files = app.files.map((f) => f.name === fileName ? { ...f, content: code } : f); useLauncher.getState().patch(app.id, { files }); setResult("تغییر کد ذخیره شد."); }}>ذخیره</button><button type="button" disabled={exporting} className="flex h-11 items-center justify-center gap-1 rounded-xl bg-white/10 text-xs disabled:opacity-40" onClick={async () => { setExporting(true); try { const pack = await exportAppPack({ ...app, files: app.files.map((f) => f.name === fileName ? { ...f, content: code } : f) }); const href = URL.createObjectURL(new Blob([pack], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = href; link.download = `${app.id}.jibpack`; link.click(); window.setTimeout(() => URL.revokeObjectURL(href), 1000); setResult("بستهٔ jibpack آماده شد؛ با CodePad بازش کن تا برنامه و پیوست‌ها وارد شوند."); } catch (error) { setResult(error instanceof Error ? error.message : String(error)); } finally { setExporting(false); } }}><Download className="size-3.5" />خروجی</button></div>
    {result ? <pre className="whitespace-pre-wrap rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs leading-6 text-emerald-100">{result}</pre> : null}
    <p className="text-xs leading-5 text-white/40">برنامه‌ها در قاب محدودشده اجرا می‌شوند. این ویرایشگر برنامهٔ وب می‌سازد؛ دسترسی root یا تغییر فایل‌های سیستم گوشی نمی‌دهد.</p>
  </Sheet>;
}

function GeminiSheet({ open, onOpenChange, apiKey, setApiKey }: { open: boolean; onOpenChange: (open: boolean) => void; apiKey: string; setApiKey: (key: string) => void }) {
  const [draft, setDraft] = useState(apiKey), [prompt, setPrompt] = useState("کد فعلی من را بررسی کن و پیشنهادهای بهتر شدنش را بگو."), [answer, setAnswer] = useState(""), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  useEffect(() => { setDraft(apiKey); }, [apiKey, open]);
  const ask = async (question: string) => {
    const key = draft.trim(); if (!key) { setStatus("اول کلید API را وارد و ذخیره کن."); return; }
    if (!question.trim()) return;
    setBusy(true); setStatus(""); setAnswer("");
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ model: "gemini-3.8-flash", input: NAVA_AI_GUIDE + "\n\nUser request:\n" + question.slice(0, 12000), generation_config: { max_output_tokens: 1200, thinking_level: "low" } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `پاسخ سرویس ${response.status}`);
      const texts: string[] = [];
      const collect = (value: unknown) => { if (!value || typeof value !== "object") return; if (Array.isArray(value)) { value.forEach(collect); return; } const obj = value as Record<string, unknown>; if (typeof obj.text === "string") texts.push(obj.text); for (const [k, v] of Object.entries(obj)) if (k !== "text") collect(v); };
      if (typeof data.output_text === "string") texts.push(data.output_text); else collect(data.output);
      setAnswer(texts.join("\n\n").trim() || "پاسخی در قالب متن برنگشت.");
    } catch (error) { setStatus(`اتصال انجام نشد: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };
  const save = () => { setApiKey(draft.trim()); setStatus(draft.trim() ? "اتصال ذخیره شد؛ برای آزمایش یک درخواست بفرست." : "کلید پاک شد."); };
  const field = "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm outline-none focus:border-emerald-300/50";
  return <Sheet title="دستیار Gemini" icon={<Sparkles className="size-5 text-emerald-300" />} open={open} onOpenChange={onOpenChange}>
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200/10 bg-emerald-200/5 p-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-emerald-200" /><p className="text-xs leading-5 text-white/65">کلید فقط در حافظهٔ محلی این دستگاه ذخیره می‌شود. چون لانچر مستقیم به Gemini وصل می‌شود، کلید در مرورگر رمزگذاری نمی‌شود؛ دسترسی به دستگاه را امن نگه دار. هیچ درخواست یا هزینه‌ای بدون زدن دکمهٔ ارسال انجام نمی‌شود.</p></div>
    <label className="text-xs text-white/55">کلید API<input className={`${field} mt-2 font-mono`} dir="ltr" type="password" autoComplete="off" placeholder="کلید Gemini API" value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-2"><button className="h-10 rounded-xl bg-white/10 text-sm" type="button" onClick={save}>ذخیرهٔ اتصال</button><button className="h-10 rounded-xl bg-white/5 text-sm text-rose-200" type="button" onClick={() => { setDraft(""); setApiKey(""); setStatus("کلید از این دستگاه پاک شد."); }}>پاک کردن کلید</button></div>
    <label className="text-xs text-white/55">درخواست برای Gemini<textarea className={`${field} mt-2 min-h-24 resize-y`} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
    <button disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl font-bold text-[#07110e] disabled:opacity-50" style={{ background: "var(--launcher-accent)" }} type="button" onClick={() => { setApiKey(draft.trim()); void ask(prompt); }}><Send className="size-4" />{busy ? "در حال دریافت پاسخ…" : "ارسال درخواست"}</button>
    {status ? <p className="text-xs leading-5 text-amber-200">{status}</p> : null}
    {answer ? <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-6">{answer}</div> : null}
    <p className="text-[11px] leading-5 text-white/35">درخواست‌ها طبق API رسمی Gemini ارسال می‌شوند. می‌توانی از دستیار بخواهی کد بسازد، توضیح دهد یا نکات امنیتی دفاعی را مرور کند؛ پیش از ذخیره و اجرا، پاسخ کد را خودت بازبینی کن.</p>
  </Sheet>;
}

function BrowserSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState("https://www.torproject.org/"), [status, setStatus] = useState("");
  const field = "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm outline-none focus:border-emerald-300/50";
  const visit = async (tor: boolean) => {
    try {
      setStatus(tor ? "در حال بازکردن Tor Browser…" : "در حال بازکردن مرورگر دستگاه…");
      if (tor) await openTorBrowser(url); else await openExternalBrowser(url);
      setStatus(tor ? "نشانی به Tor Browser فرستاده شد." : "نشانی در مرورگر بیرونی باز شد.");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  return <Sheet title="مرورگر و حریم خصوصی" icon={<Globe2 className="size-5 text-emerald-300" />} open={open} onOpenChange={onOpenChange}>
    <p className="text-xs leading-5 text-white/60">این بخش نشانی را به مرورگر دستگاه می‌فرستد؛ WebView لانچر، Tor یا حالت ناشناس نیست.</p>
    <label className="text-xs text-white/55">نشانی وب<input className={`${field} mt-2`} dir="ltr" inputMode="url" autoCapitalize="off" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
    <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold" onClick={() => void visit(false)}><Globe2 className="size-4" />بازکردن در مرورگر دستگاه</button>
    <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-xl font-bold text-[#07110e]" style={{ background: "var(--launcher-accent)" }} onClick={() => void visit(true)}><LockKeyhole className="size-4" />بازکردن با Tor Browser</button>
    {status ? <p className="text-xs leading-5 text-emerald-100">{status}</p> : null}
    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/55">
      <p>برای ناشناس‌ماندن وب‌گردی، Tor Browser باید جداگانه نصب و به شبکهٔ Tor وصل شده باشد. این کار IP را فقط برای ترافیک همان مرورگر تغییر می‌دهد؛ IP دستگاه و برنامه‌های دیگر تغییر نمی‌کند.</p>
      <p>افزونه‌های Chrome دسکتاپ در WebView اندروید اجرا نمی‌شوند و لانچر نمی‌تواند دستگاه را شبیه یک رایانهٔ دسکتاپ جلوه دهد. برای افزونه‌ها از مرورگر سازگار و رسمی همان دستگاه استفاده کن.</p>
    </div>
  </Sheet>;
}

function Launcher() {
  const apps = useLauncher((s) => s.apps);
  const [running, setRunning] = useState<App | null>(null), [editing, setEditing] = useState<App | null>(null), [customizing, setCustomizing] = useState<App | null>(null);
  const [edit, setEdit] = useState(false), [settingsOpen, setSettingsOpen] = useState(false), [geminiOpen, setGeminiOpen] = useState(false), [browserOpen, setBrowserOpen] = useState(false);
  const [now, setNow] = useState(() => new Date()), [apiKey, setApiKeyState] = useState("");
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [currentPage, setCurrentPage] = useState(0);
  const [search, setSearch] = useState("");
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    void Promise.resolve(useLauncher.persist.rehydrate()); void loadAssets();
    void Promise.resolve(useTheme.persist.rehydrate()).then(() => applyTheme(useTheme.getState()));
    try {
      const saved = localStorage.getItem(PREF_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setPrefs({ ...DEFAULT_PREFS, ...parsed, pages: Array.isArray(parsed.pages) && parsed.pages.length ? parsed.pages : DEFAULT_PREFS.pages });
      }
      setApiKeyState(localStorage.getItem(GEMINI_KEY) ?? "");
    } catch { /* تنظیمات قبلی خراب بود */ }
    const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { document.documentElement.style.setProperty("--launcher-accent", prefs.accent); }, [prefs.accent]);
  const persistPrefs = (next: Preferences) => { setPrefs(next); try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* فضای ذخیره محدود است */ } };
  const updatePrefs = (next: Preferences) => {
    const pages = [...(prefs.pages?.length ? prefs.pages : DEFAULT_PREFS.pages)];
    pages[currentPage] = { ...pages[currentPage], wallpaper: next.wallpaper };
    persistPrefs({ ...next, pages });
  };
  const setPageName = (name: string) => {
    const pages = [...prefs.pages]; pages[currentPage] = { ...pages[currentPage], name };
    persistPrefs({ ...prefs, pages });
  };
  const addPage = () => {
    if (prefs.pages.length >= 9) return;
    const index = prefs.pages.length;
    const pages = [...prefs.pages, { name: `صفحهٔ ${index + 1}`, wallpaper: WALLPAPERS[index % WALLPAPERS.length].value }];
    persistPrefs({ ...prefs, pages }); setCurrentPage(index); setSearch("");
  };
  const removeCurrentPage = () => {
    if (currentPage === 0 || !window.confirm(`«${prefs.pages[currentPage]?.name}» حذف شود؟ برنامه‌های این صفحه به خانه منتقل می‌شوند.`)) return;
    const pages = prefs.pages.filter((_, index) => index !== currentPage);
    useLauncher.setState((state) => ({ apps: state.apps.map((app) => { const index = app.pageIndex ?? 0; return { ...app, pageIndex: index === currentPage ? 0 : index > currentPage ? index - 1 : index }; }) }));
    persistPrefs({ ...prefs, pages }); setCurrentPage(0); setSearch("");
  };
  const exportBackup = () => {
    const data = { format: "jibcode-launcher-backup-v1", exportedAt: new Date().toISOString(), preferences: prefs, apps: useLauncher.getState().apps };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = "jibcode-launcher-backup.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  const onAppCreated = (app: App) => { const placed = { ...app, pageIndex: currentPage }; useLauncher.getState().patch(app.id, { pageIndex: currentPage }); setRunning(placed); };
  const setApiKey = (key: string) => { setApiKeyState(key); try { if (key) localStorage.setItem(GEMINI_KEY, key); else localStorage.removeItem(GEMINI_KEY); } catch { /* storage unavailable */ } };
  const pageWallpaper = prefs.pages[currentPage]?.wallpaper ?? prefs.wallpaper;
  const activePrefs = { ...prefs, wallpaper: pageWallpaper };
  const visibleApps = useMemo(() => apps.filter((a) => (a.pageIndex ?? 0) === currentPage && a.name.toLocaleLowerCase("fa").includes(search.toLocaleLowerCase("fa"))), [apps, currentPage, search]);
  const wallpaperStyle = pageWallpaper.startsWith("data:") ? { backgroundImage: `linear-gradient(180deg,rgba(5,13,10,.48),rgba(5,13,10,.76)),url("${pageWallpaper}")` } : { backgroundImage: `${pageWallpaper},radial-gradient(circle at 85% 12%,rgba(93,255,162,.16),transparent 29%)` };
  const dayLabel = now.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long" });
  return <main onTouchStart={(event) => { const touch = event.touches[0]; swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={(event) => { const start = swipeStart.current; const touch = event.changedTouches[0]; swipeStart.current = null; if (!start || !touch) return; const dx = touch.clientX - start.x, dy = touch.clientY - start.y; if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.4) { setCurrentPage((page) => Math.max(0, Math.min(prefs.pages.length - 1, page + (dx < 0 ? 1 : -1)))); setSearch(""); } }} className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden border-x border-white/10 bg-[#08130e] pt-[env(safe-area-inset-top)] text-white shadow-[0_0_100px_rgba(0,0,0,.55)]" style={{ ...wallpaperStyle, backgroundSize: "cover", backgroundPosition: "center", ["--launcher-accent"]: prefs.accent } as CSSProperties}>
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/35" />
    <div className="relative z-10 flex h-10 shrink-0 items-center justify-between px-6 text-xs font-semibold text-white/90"><span>{now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span><div className="flex items-center gap-1.5" aria-label="وضعیت دستگاه"><span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_9px_#67f5a5]" /><span className="text-[10px] text-white/70">محلی</span><Smartphone className="ms-1 size-3.5" /></div></div>
    <header className="relative z-10 flex shrink-0 items-center justify-between px-5 py-3">
      <div><p className="text-xs font-semibold tracking-wide text-white/60">{dayLabel}</p><h1 className="mt-0.5 text-xl font-bold">جیب‌کد <span className="text-[var(--launcher-accent)]">OS</span></h1></div>
      <div className="flex gap-2"><button type="button" className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-black/20 backdrop-blur-xl" aria-label="دستیار هوش مصنوعی" onClick={() => setGeminiOpen(true)}><Sparkles className="size-4" style={{ color: prefs.accent }} /></button><button type="button" className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-black/20 backdrop-blur-xl" aria-label="تنظیمات" onClick={() => setSettingsOpen(true)}><Settings2 className="size-4" /></button></div>
    </header>
    <section className={`relative z-10 mx-4 my-2 rounded-[26px] border border-white/10 p-4 shadow-xl ${prefs.glass ? "bg-black/20 backdrop-blur-xl" : "bg-black/45"}`}>
      <div className="flex items-start justify-between"><div><p className="text-[11px] text-white/55">روز خوبی برای ساختن است</p><p className="mt-1 text-3xl font-light tracking-tight">{now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</p></div><div className="grid size-11 place-items-center rounded-2xl bg-white/10"><Code2 className="size-5" style={{ color: prefs.accent }} /></div></div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-white/55"><span>کارگاه برنامه‌نویسی چندزبانه</span><span>{apps.length} برنامه</span></div>
    </section>
    <div className="relative z-10 flex shrink-0 items-center gap-2 px-5 pb-2 pt-1"><div className="min-w-0 flex-1"><h2 className="font-bold">برنامه‌های من</h2><p className="mt-0.5 text-[11px] text-white/45">برای اجرا لمس کن · برای تغییر نگه ندار، از ویرایش استفاده کن</p></div><button type="button" className={`rounded-full px-3 py-2 text-xs ${edit ? "bg-[var(--launcher-accent)] text-[#08130e]" : "bg-white/10 text-white/75"}`} onClick={() => setEdit((v) => !v)}>{edit ? "پایان ویرایش" : "ویرایش"}</button></div>
    <label className="relative z-10 mx-4 mb-2 flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 backdrop-blur-lg"><span className="text-white/45">⌕</span><input aria-label="جست‌وجوی برنامه‌ها" className="w-full bg-transparent text-sm outline-none placeholder:text-white/40" placeholder="جست‌وجوی برنامه" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="relative z-10 flex shrink-0 items-center gap-2 overflow-x-auto px-4 pb-2">{prefs.pages.map((page, index) => <button key={`${page.name}-${index}`} type="button" onClick={() => { setCurrentPage(index); setSearch(""); }} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${index === currentPage ? "font-bold text-[#08130e]" : "bg-black/25 text-white/65"}`} style={index === currentPage ? { background: prefs.accent } : undefined}>{page.name || `صفحهٔ ${index + 1}`}</button>)}<button type="button" aria-label="افزودن صفحه" title="افزودن صفحه" disabled={prefs.pages.length >= 9} className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 disabled:opacity-35" onClick={addPage}><Plus className="size-4" /></button></div>
    <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-5">
      {visibleApps.length === 0 ? <div className="mx-auto mt-4 max-w-xs rounded-3xl border border-white/10 bg-black/20 p-6 text-center backdrop-blur-xl"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/10"><Code2 className="size-6" style={{ color: prefs.accent }} /></div><h3 className="mt-3 font-bold">{search ? "برنامه‌ای پیدا نشد" : "صفحهٔ ساخت تو آماده است"}</h3><p className="mt-2 text-xs leading-6 text-white/55">یک برنامهٔ وب بساز، پروژهٔ CodePad را نصب کن، یا فایل jibpack خودت را وارد کن.</p><button className="mt-4 h-10 rounded-xl px-4 text-sm font-bold text-[#08130e]" style={{ background: prefs.accent }} onClick={() => document.getElementById("launcher-add-trigger")?.click()}>ساخت اولین برنامه</button></div> : <div className="grid gap-y-5 pt-2" style={{ gridTemplateColumns: `repeat(${prefs.columns}, minmax(0, 1fr))` }}>
        {visibleApps.map((app) => <div key={app.id} className="relative flex min-w-0 flex-col items-center gap-1.5">
          <button type="button" className={`relative grid place-items-center overflow-hidden text-2xl font-bold shadow-[0_8px_25px_rgba(0,0,0,.28)] transition active:scale-95 ${edit ? "ring-2 ring-amber-300" : "border border-white/10"}`} style={{ width: prefs.iconSize, height: prefs.iconSize, borderRadius: prefs.roundness, backgroundColor: app.iconColor ?? "rgba(8,24,16,.78)", boxShadow: `inset 0 1px 0 rgba(255,255,255,.12),0 8px 25px rgba(0,0,0,.25)` }} onClick={() => edit ? setCustomizing(app) : setRunning(app)} aria-label={`${edit ? "ویرایش" : "اجرای"} ${app.name}`}>
            {app.iconImage ? <img src={app.iconImage} alt="" className="size-full object-cover" /> : <><span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent" />{app.icon}</>}
          </button>
          <span className="max-w-full truncate text-center text-[11px] font-medium drop-shadow-md">{app.name}</span>
          {edit ? <div className="absolute -top-1 flex -translate-y-1/2 gap-1"><button className="grid size-6 place-items-center rounded-full bg-[#0e1b14] text-white shadow" aria-label="ویرایش کد" onClick={() => setEditing(app)}><Code2 className="size-3.5" /></button><button className="grid size-6 place-items-center rounded-full bg-rose-600 text-white shadow" aria-label="حذف برنامه" onClick={() => window.confirm(`«${app.name}» حذف شود؟`) && void uninstall(app.id)}><X className="size-3.5" /></button></div> : null}
        </div>)}
      </div>}
    </div>
    <footer className={`relative z-10 mx-4 mb-2 flex shrink-0 items-center justify-around rounded-[26px] border border-white/10 px-3 py-3 shadow-2xl ${prefs.glass ? "bg-black/30 backdrop-blur-2xl" : "bg-black/65"}`}>
      <a href="/" className="flex flex-col items-center gap-1 text-white/65"><Code2 className="size-5" /><span className="text-[10px]">ویرایشگر</span></a>
      <button type="button" className="flex flex-col items-center gap-1 text-white/65" onClick={() => setGeminiOpen(true)}><Sparkles className="size-5" style={{ color: prefs.accent }} /><span className="text-[10px]">هوش مصنوعی</span></button>
      <button type="button" className="flex flex-col items-center gap-1 text-white/65" onClick={() => setBrowserOpen(true)}><Globe2 className="size-5" /><span className="text-[10px]">مرورگر</span></button>
    <InstallDialog onCreated={onAppCreated} />
      <button type="button" className="flex flex-col items-center gap-1 text-white/65" onClick={() => setSettingsOpen(true)}><Palette className="size-5" /><span className="text-[10px]">ظاهر</span></button>
    </footer>
    <div className="relative z-10 mx-auto mb-[max(7px,env(safe-area-inset-bottom))] h-1 w-28 shrink-0 rounded-full bg-white/60" />
    {running ? <AppWindow app={running} onClose={() => setRunning(null)} /> : null}
    <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} prefs={activePrefs} setPrefs={updatePrefs} pageName={prefs.pages[currentPage]?.name ?? ""} setPageName={setPageName} currentPage={currentPage} onRemovePage={removeCurrentPage} onExport={exportBackup} />
    <GeminiSheet open={geminiOpen} onOpenChange={setGeminiOpen} apiKey={apiKey} setApiKey={setApiKey} />
    <BrowserSheet open={browserOpen} onOpenChange={setBrowserOpen} />
    <AppCustomizeSheet app={customizing} open={Boolean(customizing)} onOpenChange={(v) => !v && setCustomizing(null)} pageCount={prefs.pages.length} />
    <AppEditorSheet app={editing} open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} />
  </main>;
}
