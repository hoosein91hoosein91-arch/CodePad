import { ImagePlus, Palette, Settings2, ShieldAlert, Sparkles } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { ACCENTS, applyPreset, THEMES, WALLPAPERS, type Preferences } from "@/labshell/launcher-prefs";
import { imageData } from "@/labshell/image";
import { field, ghostBtn, Sheet } from "./sheet";

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      <span>
        {label}
        {hint ? <span className="block text-[11px] text-white/40">{hint}</span> : null}
      </span>
      <input type="checkbox" aria-label={label} className="size-5 shrink-0" style={{ accentColor: "var(--launcher-accent)" }} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsSheet({ open, onOpenChange, prefs, setPrefs, version, onOpenDev, onOpenGemini, geminiConnected }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: Preferences;
  setPrefs: (next: Preferences) => boolean;
  version: string;
  onOpenDev: () => void;
  onOpenGemini: () => void;
  geminiConnected: boolean;
}) {
  const [msg, setMsg] = useState("");
  const taps = useRef(0);
  const set = (patch: Partial<Preferences>) => {
    if (!setPrefs({ ...prefs, ...patch })) setMsg("حافظهٔ محلی پر است؛ تصویر کوچک‌تری انتخاب کن.");
  };
  const pickWallpaper = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      set({ wallpaper: await imageData(file, 1400) });
      setMsg("پس‌زمینه تنظیم شد.");
    } catch {
      setMsg("این تصویر خوانده نشد.");
    }
  };
  const tapVersion = () => {
    taps.current += 1;
    if (taps.current >= 7) {
      taps.current = 0;
      set({ devMode: true });
      setMsg("حالت توسعه‌دهنده روشن شد.");
    } else if (taps.current >= 4) setMsg(`${7 - taps.current} ضربهٔ دیگر تا حالت توسعه‌دهنده…`);
  };
  return (
    <Sheet title="شخصی‌سازی" icon={<Settings2 className="size-5" style={{ color: prefs.accent }} />} open={open} onOpenChange={onOpenChange} testId="settings-sheet">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Palette className="size-4" style={{ color: prefs.accent }} />پوسته</h3>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <button key={t.id} type="button" aria-label={`پوستهٔ ${t.name}`} className={`relative h-16 overflow-hidden rounded-xl border text-start text-xs font-semibold ${prefs.theme === t.id ? "ring-2" : "border-white/10"}`} style={{ background: t.wallpaper, borderColor: prefs.theme === t.id ? t.accent : undefined, ["--tw-ring-color" as string]: t.accent }} onClick={() => set(applyPreset(prefs, t))}>
              <span className="absolute bottom-2 start-2" style={{ color: t.accent, textShadow: `0 0 10px ${t.accent}` }}>{t.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2 border-t border-white/10 pt-4">
        <h3 className="text-sm font-bold">پس‌زمینهٔ گوشی</h3>
        <div className="grid grid-cols-4 gap-2">
          {WALLPAPERS.map((w) => (
            <button key={w.name} type="button" aria-label={`پس‌زمینهٔ ${w.name}`} title={w.name} className={`h-14 rounded-xl border ${prefs.wallpaper === w.value ? "border-white ring-2 ring-white/40" : "border-white/10"}`} style={{ background: w.value }} onClick={() => set({ wallpaper: w.value })} />
          ))}
        </div>
        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 bg-white/5 text-sm">
          <ImagePlus className="size-4" />
          انتخاب عکس از گوشی به‌عنوان پس‌زمینه
          <input type="file" accept="image/*" aria-label="عکس پس‌زمینه" className="hidden" onChange={pickWallpaper} />
        </label>
        {prefs.wallpaper.startsWith("data:") ? <img src={prefs.wallpaper} alt="پس‌زمینهٔ فعلی" className="h-24 w-full rounded-xl object-cover opacity-80" /> : null}
      </section>
      <section className="space-y-2 border-t border-white/10 pt-4">
        <h3 className="text-sm font-bold">رنگ تأکیدی</h3>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map((c) => (
            <button key={c} type="button" aria-label={`رنگ ${c}`} className={`size-8 rounded-full border ${prefs.accent === c ? "border-white ring-2 ring-white/50" : "border-white/15"}`} style={{ background: c, boxShadow: `0 0 12px ${c}66` }} onClick={() => set({ accent: c })} />
          ))}
          <input type="color" aria-label="رنگ دلخواه" className="size-8 rounded-full border-0 bg-transparent" value={prefs.accent.length === 7 ? prefs.accent : "#00ff9c"} onChange={(e) => set({ accent: e.target.value })} />
        </div>
      </section>
      <section className="space-y-2 border-t border-white/10 pt-4">
        <h3 className="text-sm font-bold">جلوه‌ها و چیدمان</h3>
        <Toggle label="باران ماتریکس" hint="پشت صفحهٔ خانه؛ وقتی برنامه باز است متوقف می‌شود" checked={prefs.matrix} onChange={(v) => set({ matrix: v })} />
        <Toggle label="خطوط اسکن (CRT)" checked={prefs.scanlines} onChange={(v) => set({ scanlines: v })} />
        <Toggle label="شبکهٔ نئونی" checked={prefs.grid} onChange={(v) => set({ grid: v })} />
        <Toggle label="فونت ترمینالی (monospace)" checked={prefs.mono} onChange={(v) => set({ mono: v })} />
        <Toggle label="کارت‌های شیشه‌ای" checked={prefs.glass} onChange={(v) => set({ glass: v })} />
        <Toggle label="نام زیر آیکن‌ها" checked={prefs.labels} onChange={(v) => set({ labels: v })} />
        <Toggle label="دکمهٔ کنسول در داک" checked={prefs.terminal} onChange={(v) => set({ terminal: v })} />
        <div className="flex items-center justify-between gap-3 text-xs text-white/70">
          <label htmlFor="jibos-cols">تعداد ستون</label>
          <select id="jibos-cols" className={`${field} w-28`} value={prefs.columns} onChange={(e) => set({ columns: Number(e.target.value) })}>
            {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} ستون</option>)}
          </select>
        </div>
        <label className="block text-xs text-white/70">اندازهٔ آیکن: {prefs.iconSize}px<input className="mt-2 w-full" style={{ accentColor: prefs.accent }} type="range" min="44" max="84" step="2" value={prefs.iconSize} onChange={(e) => set({ iconSize: Number(e.target.value) })} /></label>
        <label className="block text-xs text-white/70">گردی آیکن: {prefs.roundness}px<input className="mt-2 w-full" style={{ accentColor: prefs.accent }} type="range" min="4" max="42" step="2" value={prefs.roundness} onChange={(e) => set({ roundness: Number(e.target.value) })} /></label>
        <label className="block text-xs text-white/70">نام دستگاه (در کنسول)<input className={`${field} mt-2 font-mono`} dir="ltr" value={prefs.hostname} onChange={(e) => set({ hostname: e.target.value.replace(/[^\w.-]/g, "").slice(0, 24) || "jibos" })} /></label>
      </section>
      <section className="grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
        <button type="button" className={`${ghostBtn} flex items-center justify-center gap-2`} onClick={onOpenGemini}><Sparkles className="size-4" style={{ color: prefs.accent }} />{geminiConnected ? "Gemini وصل است" : "اتصال Gemini"}</button>
        <button type="button" className={`${ghostBtn} flex items-center justify-center gap-2`} onClick={onOpenDev}><ShieldAlert className="size-4" />حالت توسعه‌دهنده</button>
      </section>
      <button type="button" className="font-mono text-[11px] text-white/35" onClick={tapVersion}>JibOS {version} · ۷ بار بزن</button>
      {msg ? <p className="text-xs" style={{ color: prefs.accent }}>{msg}</p> : null}
      <p className="text-[11px] leading-5 text-white/35">همهٔ تنظیمات و عکس‌ها فقط روی همین دستگاه نگه داشته می‌شوند.</p>
    </Sheet>
  );
}
