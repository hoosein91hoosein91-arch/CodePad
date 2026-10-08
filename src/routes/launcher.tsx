import { createFileRoute, Link } from "@tanstack/react-router";
import { Code2, Globe, ImagePlus, Palette, Plus, Search, SquareTerminal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AppCustomizeSheet, AppEditorSheet, InstallSheet } from "@/components/launcher/app-sheets";
import { AppWindow, type BridgeHost } from "@/components/launcher/app-window";
import { Browser } from "@/components/launcher/browser";
import { DevSheet } from "@/components/launcher/dev-sheet";
import { GeminiSheet } from "@/components/launcher/gemini-sheet";
import { MatrixRain } from "@/components/launcher/matrix-rain";
import { SettingsSheet } from "@/components/launcher/settings-sheet";
import { Terminal, type LauncherApi } from "@/components/launcher/terminal";
import { loadAssets } from "@/labshell/assets";
import { downloadText } from "@/labshell/download";
import { askGemini, loadGemini, saveGemini, type GeminiSettings } from "@/labshell/gemini";
import { exportBackup, importBackup, installHtml, uninstall, useLauncher, type App } from "@/labshell/launcher";
import { loadPrefs, normalizePrefs, savePrefs, type Preferences } from "@/labshell/launcher-prefs";
import { imageData } from "@/labshell/image";
import { applyTheme, useTheme } from "@/labshell/theme";

export const Route = createFileRoute("/launcher")({ component: Launcher });

const JIBOS_VERSION = "2.1.0";

let audio: AudioContext | null = null;
function beep(freq = 880, ms = 140) {
  try {
    const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!A) return;
    audio ??= new A();
    if (audio.state === "suspended") void audio.resume();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g);
    g.connect(audio.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.03);
  } catch {
    /* صدا در دسترس نیست */
  }
}

function useBattery() {
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; addEventListener: (e: string, f: () => void) => void }> };
    let alive = true;
    void nav.getBattery?.().then((b) => {
      const up = () => alive && setLevel(Math.round(b.level * 100));
      up();
      b.addEventListener("levelchange", up);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return level;
}

function AppIcon({ app, prefs, edit, onOpen, onLong }: { app: App; prefs: Preferences; edit: boolean; onOpen: () => void; onLong: () => void }) {
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  const start = () => {
    longFired.current = false;
    timer.current = window.setTimeout(() => { longFired.current = true; onLong(); }, 520);
  };
  const cancel = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  return (
    <div className="relative flex min-w-0 flex-col items-center gap-1.5">
      <button
        type="button"
        data-testid="app-icon"
        className={`jibos-icon relative grid place-items-center overflow-hidden text-2xl font-bold transition active:scale-90 ${edit ? "jibos-wiggle" : ""}`}
        style={{ width: prefs.iconSize, height: prefs.iconSize, borderRadius: prefs.roundness, backgroundColor: app.iconColor ?? "rgba(2,16,9,.82)", border: `1px solid ${prefs.accent}40`, boxShadow: `0 0 0 1px rgba(0,0,0,.4), 0 6px 18px rgba(0,0,0,.45), 0 0 16px ${prefs.accent}26, inset 0 1px 0 rgba(255,255,255,.1)` }}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (!longFired.current) onOpen(); }}
        aria-label={`${edit ? "شخصی‌سازی" : "اجرای"} ${app.name}`}
      >
        {app.iconImage ? <img src={app.iconImage} alt="" className="size-full object-cover" draggable={false} /> : <><span className="absolute inset-0 bg-gradient-to-br from-white/12 to-transparent" /><span className="relative" style={{ textShadow: `0 0 12px ${prefs.accent}88` }}>{app.icon}</span></>}
      </button>
      {prefs.labels ? <span className="max-w-full truncate text-center text-[11px] font-medium text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,.9)]">{app.name}</span> : null}
    </div>
  );
}

function Launcher() {
  const apps = useLauncher((s) => s.apps);
  const [prefs, setPrefsState] = useState<Preferences>(() => normalizePrefs({}));
  const [gemini, setGeminiState] = useState<GeminiSettings>({ key: "", model: "" });
  const [running, setRunning] = useState<App | null>(null);
  const [customizing, setCustomizing] = useState<App | null>(null);
  const [editing, setEditing] = useState<App | null>(null);
  const [edit, setEdit] = useState(false);
  const [sheet, setSheet] = useState<null | "settings" | "gemini" | "install" | "dev">(null);
  const [terminal, setTerminal] = useState(false);
  const [browser, setBrowser] = useState<null | { url?: string }>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(0);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pageWallpaperInput = useRef<HTMLInputElement>(null);
  const battery = useBattery();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const safe = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("safe");

  useEffect(() => {
    void Promise.resolve(useLauncher.persist.rehydrate());
    void loadAssets();
    void Promise.resolve(useTheme.persist.rehydrate()).then(() => applyTheme(useTheme.getState()));
    setPrefsState(loadPrefs());
    setGeminiState(loadGemini());
    setReady(true);
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const setPrefs = useCallback((next: Preferences) => {
    const clean = normalizePrefs(next);
    setPrefsState(clean);
    return savePrefs(clean);
  }, []);
  const patchPrefs = useCallback((patch: Partial<Preferences>) => setPrefs({ ...prefsRef.current, ...patch }), [setPrefs]);
  const setGemini = (s: GeminiSettings) => { saveGemini(s); setGeminiState(loadGemini()); };
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? "" : t)), 2600);
  }, []);
  const launch = useCallback((name: string) => {
    const app = useLauncher.getState().apps.find((a) => a.name === name || a.name.includes(name));
    if (!app) return false;
    setTerminal(false);
    setRunning(app);
    return true;
  }, []);

  const api: LauncherApi = useMemo(() => ({
    version: JIBOS_VERSION,
    apps: () => useLauncher.getState().apps,
    launch,
    prefs: () => prefsRef.current,
    setPrefs: (patch) => void patchPrefs(patch),
    toast: showToast,
    beep,
    install: (name, html, icon) => installHtml(name, html, icon),
    uninstall: async (name) => { const a = useLauncher.getState().apps.find((x) => x.name === name); if (!a) return false; await uninstall(a.id); return true; },
    gemini: (prompt) => askGemini(loadGemini(), prompt),
    openBrowser: (url) => { setTerminal(false); setBrowser({ url }); },
  }), [launch, patchPrefs, showToast]);

  const runScript = useCallback(async (code: string) => {
    try {
      const fn = new Function("api", `"use strict"; return (async () => {\n${code}\n})()`) as (a: LauncherApi) => Promise<unknown>;
      const v = await fn(api);
      return v === undefined ? "✓ اجرا شد" : typeof v === "string" ? v : JSON.stringify(v, null, 2);
    } catch (e) {
      return `خطا: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, [api]);

  // اسکریپت راه‌اندازی (فقط حالت توسعه‌دهنده، و نه در ?safe=1)
  const booted = useRef(false);
  useEffect(() => {
    if (!ready || booted.current || safe || !prefs.devMode || !prefs.bootScript.trim()) return;
    booted.current = true;
    void runScript(prefs.bootScript).then((r) => r.startsWith("خطا") && showToast(`اسکریپت راه‌اندازی: ${r}`));
  }, [ready, safe, prefs.devMode, prefs.bootScript, runScript, showToast]);

  const host: BridgeHost = {
    version: JIBOS_VERSION,
    devMode: prefs.devMode,
    theme: prefs.theme,
    toast: showToast,
    apps: () => useLauncher.getState().apps.map((a) => a.name),
    launch,
    setWallpaper: (v) => { if (/^(data:image\/|linear-gradient|radial-gradient|#)/.test(v)) patchPrefs({ wallpaper: v }); else throw new Error("پس‌زمینه باید data:image یا gradient باشد"); },
    setAccent: (c) => void patchPrefs({ accent: c }),
  };

  const searching = search.trim().length > 0;
  const matches = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("fa");
    return [...apps].sort((a, b) => a.installedAt - b.installedAt).filter((a) => !q || a.name.toLocaleLowerCase("fa").includes(q));
  }, [apps, search]);
  const sorted = useMemo(() => [...apps].sort((a, b) => a.installedAt - b.installedAt), [apps]);
  const pageList = useMemo(() => Array.from({ length: Math.max(1, prefs.pages) }, (_, i) => i), [prefs.pages]);
  const appsOnPage = useCallback((pi: number) => sorted.filter((a) => Math.min(prefs.pages - 1, a.page ?? 0) === pi), [sorted, prefs.pages]);

  // نگه‌داشتن صفحهٔ فعلی در محدودهٔ معتبر
  useEffect(() => { if (page > prefs.pages - 1) setPage(Math.max(0, prefs.pages - 1)); }, [prefs.pages, page]);

  const goToPage = useCallback((pi: number) => {
    setPage(pi);
    const el = pagesRef.current;
    if (el) el.scrollTo({ left: pi * el.clientWidth, behavior: "smooth" });
  }, []);
  const onPagesScroll = useCallback(() => {
    const el = pagesRef.current;
    if (!el) return;
    const pi = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setPage((p) => (p === pi ? p : pi));
  }, []);
  const addPage = useCallback(() => {
    const n = Math.min(8, prefs.pages + 1);
    patchPrefs({ pages: n });
    window.setTimeout(() => goToPage(n - 1), 60);
  }, [prefs.pages, patchPrefs, goToPage]);

  const doExport = useCallback(async () => {
    try {
      const text = await exportBackup(prefsRef.current);
      downloadText(`jibos-backup-${new Date().toISOString().slice(0, 10)}.jibos`, text, "application/json");
      showToast("فایل پشتیبان ساخته شد.");
    } catch (e) {
      showToast(`پشتیبان نشد: ${e instanceof Error ? e.message : e}`);
    }
  }, [showToast]);
  const doImport = useCallback(async (file: File) => {
    try {
      const { installed, prefs: imported } = await importBackup(await file.text());
      if (imported) setPrefs(imported as Preferences);
      showToast(`${installed.toLocaleString("fa-IR")} برنامه بازگردانی شد.`);
    } catch (e) {
      showToast(`بازگردانی نشد: ${e instanceof Error ? e.message : e}`);
    }
  }, [setPrefs, showToast]);

  const pickPageWallpaper = useCallback(async (file: File) => {
    try {
      const data = await imageData(file, 1400);
      const next = [...prefsRef.current.pageWallpapers];
      next[page] = data;
      if (!patchPrefs({ pageWallpapers: next })) showToast("حافظه پر است؛ تصویر کوچک‌تری انتخاب کن.");
      else showToast(`پس‌زمینهٔ صفحهٔ ${page + 1} تنظیم شد.`);
    } catch {
      showToast("این تصویر خوانده نشد.");
    }
  }, [page, patchPrefs, showToast]);
  const clearPageWallpaper = useCallback(() => {
    const next = [...prefsRef.current.pageWallpapers];
    next[page] = "";
    patchPrefs({ pageWallpapers: next });
    showToast(`پس‌زمینهٔ صفحهٔ ${page + 1} به حالت سراسری برگشت.`);
  }, [page, patchPrefs, showToast]);

  const activeWallpaper = (prefs.pageWallpapers[page] || prefs.wallpaper) || prefs.wallpaper;
  const isImage = activeWallpaper.startsWith("data:");
  const accent = prefs.accent;
  const style = {
    "--launcher-accent": accent,
    backgroundImage: isImage ? `linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.7)),url("${activeWallpaper}")` : activeWallpaper,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as CSSProperties;
  const time = now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  const glass = prefs.glass ? "bg-black/35 backdrop-blur-xl" : "bg-black/75";

  const renderGrid = (list: App[], emptyHint: boolean) =>
    list.length === 0 ? (
      <div className={`jibos-pop mx-auto mt-2 max-w-xs rounded-3xl border p-6 text-center ${glass}`} style={{ borderColor: `${accent}33` }} data-testid="empty-state">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border font-mono text-xl" style={{ borderColor: `${accent}55`, color: accent, boxShadow: `0 0 24px ${accent}44` }}>&gt;_</div>
        <h3 className="mt-3 font-bold">{searching ? "برنامه‌ای پیدا نشد" : "این صفحه خالی است"}</h3>
        <p className="mt-2 text-xs leading-6 text-white/60">{searching ? "نام دیگری را جست‌وجو کن." : "یک نمونهٔ آماده نصب کن، با Gemini برنامه بساز، یا برنامه‌ها را از حالت ویرایش به این صفحه بیاور."}</p>
        {emptyHint && !searching ? <button type="button" className="mt-4 h-10 rounded-xl px-4 text-sm font-bold text-black" style={{ background: accent }} onClick={() => setSheet("install")}>افزودن اولین برنامه</button> : null}
      </div>
    ) : (
      <div className="grid gap-y-5 pt-1" style={{ gridTemplateColumns: `repeat(${prefs.columns}, minmax(0, 1fr))` }}>
        {list.map((app) => (
          <AppIcon key={app.id} app={app} prefs={prefs} edit={edit} onOpen={() => (edit ? setCustomizing(app) : setRunning(app))} onLong={() => { setEdit(true); setCustomizing(app); }} />
        ))}
      </div>
    );

  return (
    <main data-testid="launcher" data-theme={prefs.theme} className={`jibos relative mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-black pt-[env(safe-area-inset-top)] text-white`} style={style}>
      {prefs.customCss && prefs.devMode && !safe ? <style>{prefs.customCss}</style> : null}
      {prefs.matrix ? <MatrixRain color={accent} paused={!!running || terminal || !!browser} opacity={isImage ? 0.28 : 0.42} /> : null}
      {prefs.grid ? <div className="jibos-grid pointer-events-none absolute inset-0" /> : null}
      {prefs.scanlines ? <div className="jibos-scan pointer-events-none absolute inset-0 z-20" /> : null}

      <div className="relative z-10 flex h-8 shrink-0 items-center justify-between px-5 font-mono text-[11px] text-white/85">
        <span>{time}</span>
        <span className="flex items-center gap-2">
          {prefs.devMode ? <span className="rounded px-1.5 py-px text-[9px] font-bold text-black" style={{ background: accent }}>DEV</span> : null}
          <span className="tracking-widest" style={{ color: accent }}>▂▄▆█</span>
          {battery !== null ? <span>{battery.toLocaleString("fa-IR")}٪</span> : null}
        </span>
      </div>

      <section className="jibos-clock relative z-10 shrink-0 px-6 pb-3 pt-4 text-center">
        <p className="font-mono text-[11px] tracking-[.3em] text-white/55" dir="ltr">{prefs.hostname}@jibos:~$ <span className="jibos-caret" /></p>
        <p className={`jibos-glow mt-1 text-6xl font-light tracking-tight ${prefs.mono ? "font-mono" : ""}`} style={{ color: accent }}>{time}</p>
        <p className="mt-1 text-xs text-white/70">{now.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long" })}</p>
      </section>

      <div className="relative z-10 mx-4 mb-3 flex shrink-0 items-center gap-2">
        <label className={`flex h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl border px-3 ${glass}`} style={{ borderColor: `${accent}33` }}>
          <Search className="size-4 text-white/50" />
          <input aria-label="جست‌وجوی برنامه‌ها" className="w-full bg-transparent text-sm outline-none placeholder:text-white/40" placeholder="جست‌وجو…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search ? <button type="button" aria-label="پاک کردن جست‌وجو" onClick={() => setSearch("")}><X className="size-4 text-white/50" /></button> : null}
        </label>
        <button type="button" className={`h-10 shrink-0 rounded-2xl px-3 text-xs ${edit ? "font-bold text-black" : `border text-white/80 ${glass}`}`} style={edit ? { background: accent } : { borderColor: `${accent}33` }} onClick={() => setEdit((v) => !v)}>{edit ? "تمام" : "ویرایش"}</button>
      </div>

      {searching ? (
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-4">{renderGrid(matches, false)}</div>
      ) : (
        <div ref={pagesRef} data-testid="pages" dir="ltr" onScroll={onPagesScroll} className="jibos-pages relative z-10 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
          {pageList.map((pi) => (
            <div key={pi} data-testid="page" data-page={pi} dir="rtl" className="h-full w-full shrink-0 snap-center overflow-y-auto px-4 pb-4">
              {renderGrid(appsOnPage(pi), pi === 0)}
            </div>
          ))}
        </div>
      )}

      {!searching ? (
        <div className="relative z-10 flex shrink-0 items-center justify-center gap-2 py-1.5">
          {edit ? (
            <>
              <button type="button" className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/70" onClick={() => pageWallpaperInput.current?.click()} data-testid="page-wallpaper"><ImagePlus className="inline size-3" /> پس‌زمینهٔ صفحه</button>
              {prefs.pageWallpapers[page] ? <button type="button" className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/70" onClick={clearPageWallpaper}>سراسری</button> : null}
              <input ref={pageWallpaperInput} type="file" accept="image/*" aria-label="عکس پس‌زمینهٔ صفحه" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickPageWallpaper(f); }} />
            </>
          ) : null}
          {pageList.map((pi) => (
            <button key={pi} type="button" data-testid="page-dot" aria-label={`صفحهٔ ${pi + 1}`} className="size-2 rounded-full transition" style={{ background: pi === page ? accent : "rgba(255,255,255,.3)", boxShadow: pi === page ? `0 0 8px ${accent}` : undefined }} onClick={() => goToPage(pi)} />
          ))}
          {edit && prefs.pages < 8 ? <button type="button" data-testid="add-page" aria-label="افزودن صفحه" className="grid size-5 place-items-center rounded-full border text-[11px]" style={{ borderColor: `${accent}66`, color: accent }} onClick={addPage}>+</button> : null}
        </div>
      ) : null}

      <nav className={`relative z-10 mx-3 mb-2 flex shrink-0 items-center justify-around rounded-[26px] border px-2 py-2.5 ${glass}`} style={{ borderColor: `${accent}33`, boxShadow: `0 0 30px ${accent}14` }} aria-label="داک">
        <Link to="/" className="flex w-12 flex-col items-center gap-1 text-white/75"><Code2 className="size-5" /><span className="text-[10px]">ویرایشگر</span></Link>
        <button type="button" className="flex w-12 flex-col items-center gap-1 text-white/75" onClick={() => setBrowser({})} data-testid="dock-browser"><Globe className="size-5" style={{ color: accent }} /><span className="text-[10px]">مرورگر</span></button>
        <button type="button" aria-label="افزودن برنامه" className="grid size-14 place-items-center rounded-[20px] text-black transition active:scale-95" style={{ background: accent, boxShadow: `0 0 24px ${accent}88` }} onClick={() => setSheet("install")}><Plus className="size-7" /></button>
        {prefs.terminal ? <button type="button" className="flex w-12 flex-col items-center gap-1 text-white/75" onClick={() => setTerminal(true)} data-testid="dock-terminal"><SquareTerminal className="size-5" /><span className="text-[10px]">کنسول</span></button> : <button type="button" className="flex w-12 flex-col items-center gap-1 text-white/75" onClick={() => setSheet("gemini")}><Palette className="size-5" /><span className="text-[10px]">Gemini</span></button>}
        <button type="button" className="flex w-12 flex-col items-center gap-1 text-white/75" onClick={() => setSheet("settings")}><Palette className="size-5" /><span className="text-[10px]">ظاهر</span></button>
      </nav>
      <div className="relative z-10 mx-auto mb-[max(6px,env(safe-area-inset-bottom))] h-1 w-28 shrink-0 rounded-full" style={{ background: `${accent}99` }} />

      {toast ? <div role="status" className="jibos-pop fixed inset-x-0 bottom-28 z-[60] mx-auto w-max max-w-[86vw] rounded-2xl border bg-black/90 px-4 py-2 text-sm" style={{ borderColor: `${accent}66`, color: accent }}>{toast}</div> : null}

      {running ? <AppWindow key={running.id + running.installedAt} app={running} host={host} accent={accent} onClose={() => setRunning(null)} /> : null}
      {terminal ? <Terminal api={api} hostname={prefs.hostname} devMode={prefs.devMode} setDevMode={(on) => void patchPrefs({ devMode: on })} onClose={() => setTerminal(false)} accent={accent} /> : null}
      {browser ? <Browser initialUrl={browser.url} accent={accent} onClose={() => setBrowser(null)} /> : null}

      <SettingsSheet open={sheet === "settings"} onOpenChange={(o) => setSheet(o ? "settings" : null)} prefs={prefs} setPrefs={setPrefs} version={JIBOS_VERSION} onOpenDev={() => setSheet("dev")} onOpenGemini={() => setSheet("gemini")} geminiConnected={!!gemini.key} onExport={() => void doExport()} onImport={(f) => void doImport(f)} />
      <GeminiSheet open={sheet === "gemini"} onOpenChange={(o) => setSheet(o ? "gemini" : null)} settings={gemini} setSettings={setGemini} accent={accent} onInstallHtml={(name, html) => { installHtml(name, html, "✨"); showToast(`«${name}» نصب شد`); }} />
      <InstallSheet open={sheet === "install"} onOpenChange={(o) => setSheet(o ? "install" : null)} accent={accent} onInstalled={(app, run) => { showToast(`«${app.name}» نصب شد`); if (run) { setSheet(null); setRunning(app); } }} />
      <DevSheet open={sheet === "dev"} onOpenChange={(o) => setSheet(o ? "dev" : null)} prefs={prefs} setPrefs={(p) => void setPrefs(p)} runScript={runScript} onEditApp={(a) => { setSheet(null); setEditing(a); }} onOpenTerminal={() => { setSheet(null); setTerminal(true); }} />
      <AppCustomizeSheet app={customizing} onOpenChange={(o) => !o && setCustomizing(null)} accent={accent} devMode={prefs.devMode} pages={prefs.pages} onEditCode={(a) => { setCustomizing(null); setEditing(a); }} onRemove={(a) => { if (window.confirm(`«${a.name}» حذف شود؟`)) { void uninstall(a.id); setCustomizing(null); } }} />
      <AppEditorSheet app={prefs.devMode ? editing : null} onOpenChange={(o) => !o && setEditing(null)} accent={accent} gemini={gemini} />
    </main>
  );
}
