import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const THEME_DEFAULTS = { text: "#e7f0e4", bg: "#101410", accent: "#c6f135", image: "", dim: 80, fontSize: 16, autocomplete: true };
type Values = typeof THEME_DEFAULTS;
type ThemeState = Values & { set: (patch: Partial<Values>) => void; reset: () => void };

const safeStorage = {
  getItem: (k: string) => (typeof window === "undefined" ? null : localStorage.getItem(k)),
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* حافظه پر است؛ تصویر بزرگ ذخیره نشد */
    }
  },
  removeItem: (k: string) => localStorage.removeItem(k),
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({ ...THEME_DEFAULTS, set: (patch) => set(patch), reset: () => set({ ...THEME_DEFAULTS }) }),
    { name: "jibcode-theme", skipHydration: true, storage: createJSONStorage(() => safeStorage) },
  ),
);

export function applyTheme(t: Values) {
  const root = document.documentElement.style;
  root.setProperty("--color-paper", t.text);
  root.setProperty("--color-lime", t.accent);
  root.setProperty("--color-ink", t.image ? `color-mix(in srgb, ${t.bg} ${t.dim}%, transparent)` : t.bg);
  root.setProperty("--editor-font-size", `${t.fontSize}px`);
  document.body.style.background = t.image ? `url("${t.image}") center / cover fixed, ${t.bg}` : "";
}
