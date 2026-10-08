// ظاهر و تنظیمات لانچر (جیب‌کد OS) — پوستهٔ پیش‌فرض: «ترمینال نئون». همه‌چیز فقط روی همین دستگاه (localStorage) نگه داشته می‌شود.
export const PREF_KEY = "jibcode-launcher-preferences";

export const NEON_WALLPAPER = "radial-gradient(ellipse at 50% -8%,#0d5a33 0%,#03190d 38%,#010603 72%,#000 100%)";
export const WALLPAPERS = [
  { name: "ترمینال نئون", value: NEON_WALLPAPER },
  { name: "سبز نئونی", value: "linear-gradient(155deg,#071912 0%,#0b3423 48%,#07110e 100%)" },
  { name: "سایبرپانک", value: "linear-gradient(160deg,#0b0118 0%,#3a0b4f 45%,#0a1a3a 100%)" },
  { name: "شب بنفش", value: "linear-gradient(155deg,#100d22 0%,#302052 52%,#101321 100%)" },
  { name: "اقیانوس", value: "linear-gradient(155deg,#071720 0%,#0c3d4a 50%,#0c1827 100%)" },
  { name: "قرمز تیره", value: "linear-gradient(155deg,#1e0b10 0%,#51202b 52%,#151018 100%)" },
  { name: "کهربایی", value: "radial-gradient(ellipse at 50% 0%,#3a2400 0%,#120b00 50%,#000 100%)" },
  { name: "کهکشانی", value: "radial-gradient(ellipse at 18% 18%,#343765 0%,#17172d 40%,#0b101d 100%)" },
];
export const ACCENTS = ["#00ff9c", "#67f5a5", "#b5f36b", "#59d7ff", "#c5a2ff", "#ff3df2", "#ff85aa", "#ffb000"];

export type Preferences = {
  theme: string;
  wallpaper: string;
  accent: string;
  columns: number;
  iconSize: number;
  roundness: number;
  glass: boolean;
  matrix: boolean;
  scanlines: boolean;
  grid: boolean;
  mono: boolean;
  labels: boolean;
  terminal: boolean;
  hostname: string;
  devMode: boolean;
  customCss: string;
  bootScript: string;
  pages: number;
  pageWallpapers: string[];
  pageNames: string[];
};

export type ThemePreset = { id: string; name: string; wallpaper: string; accent: string; matrix: boolean; scanlines: boolean; grid: boolean; mono: boolean };
export const THEMES: ThemePreset[] = [
  { id: "neon-terminal", name: "ترمینال نئون (ماتریکس)", wallpaper: NEON_WALLPAPER, accent: "#00ff9c", matrix: true, scanlines: true, grid: true, mono: true },
  { id: "neon", name: "نئون آرام", wallpaper: WALLPAPERS[1].value, accent: "#67f5a5", matrix: false, scanlines: false, grid: false, mono: false },
  { id: "cyber", name: "سایبرپانک", wallpaper: WALLPAPERS[2].value, accent: "#ff3df2", matrix: false, scanlines: true, grid: true, mono: true },
  { id: "amber", name: "ترمینال کهربایی", wallpaper: WALLPAPERS[6].value, accent: "#ffb000", matrix: true, scanlines: true, grid: false, mono: true },
  { id: "ocean", name: "اقیانوس", wallpaper: WALLPAPERS[4].value, accent: "#59d7ff", matrix: false, scanlines: false, grid: false, mono: false },
];

export const DEFAULT_PREFS: Preferences = {
  theme: "neon-terminal",
  wallpaper: NEON_WALLPAPER,
  accent: "#00ff9c",
  columns: 4,
  iconSize: 60,
  roundness: 18,
  glass: true,
  matrix: true,
  scanlines: true,
  grid: true,
  mono: true,
  labels: true,
  terminal: true,
  hostname: "jibos",
  devMode: false,
  customCss: "",
  bootScript: "",
  pages: 1,
  pageWallpapers: [],
  pageNames: [],
};

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, d: string, max = 3_000_000) => (typeof v === "string" ? v.slice(0, max) : d);

/** تنظیمات ورودی (از حافظه یا ویرایشگر JSON) را به شکل معتبر برمی‌گرداند */
export function normalizePrefs(raw: unknown): Preferences {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_PREFS;
  const legacyPages = Array.isArray(o.pages) ? o.pages : null;
  const pages = clamp(legacyPages?.length ?? o.pages, 1, 9, d.pages);
  const legacyField = (name: string) => legacyPages?.map((page) => page && typeof page === "object" ? (page as Record<string, unknown>)[name] : "");
  const names = Array.isArray(o.pageNames) ? o.pageNames : legacyField("name") ?? [];
  const wallpapers = Array.isArray(o.pageWallpapers) ? o.pageWallpapers : legacyField("wallpaper") ?? [];
  return {
    theme: str(o.theme, d.theme, 40),
    wallpaper: str(o.wallpaper, d.wallpaper) || d.wallpaper,
    accent: /^#[0-9a-f]{3,8}$/i.test(String(o.accent)) ? String(o.accent) : d.accent,
    columns: clamp(o.columns, 3, 6, d.columns),
    iconSize: clamp(o.iconSize, 44, 84, d.iconSize),
    roundness: clamp(o.roundness, 4, 42, d.roundness),
    glass: bool(o.glass, d.glass),
    matrix: bool(o.matrix, d.matrix),
    scanlines: bool(o.scanlines, d.scanlines),
    grid: bool(o.grid, d.grid),
    mono: bool(o.mono, d.mono),
    labels: bool(o.labels, d.labels),
    terminal: bool(o.terminal, d.terminal),
    hostname: str(o.hostname, d.hostname, 24).replace(/[^\w.-]/g, "") || d.hostname,
    devMode: bool(o.devMode, d.devMode),
    customCss: str(o.customCss, d.customCss, 100_000),
    bootScript: str(o.bootScript, d.bootScript, 100_000),
    pages,
    // Keep entries for temporarily hidden pages so reducing then increasing the count loses no appearance data.
    pageWallpapers: wallpapers.slice(0, 9).map((w) => str(w, "")),
    pageNames: names.slice(0, 9).map((name, i) => str(name, `صفحهٔ ${i + 1}`)),
  };
}

export function loadPrefs(): Preferences {
  try {
    const saved = localStorage.getItem(PREF_KEY);
    return saved ? normalizePrefs(JSON.parse(saved)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

/** false یعنی حافظهٔ محلی پر است (مثلاً تصویر پس‌زمینه خیلی بزرگ بود) */
export function savePrefs(prefs: Preferences): boolean {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

export function applyPreset(prefs: Preferences, preset: ThemePreset): Preferences {
  const { id, name: _name, ...rest } = preset;
  return { ...prefs, ...rest, theme: id };
}
