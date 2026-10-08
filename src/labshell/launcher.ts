// لانچر: برنامه‌های نصب‌شده (هر برنامه = یک بستهٔ جیب). کدها اینجا، عکس‌ها و فایل‌های پیوست در IndexedDB.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { addAssets, assetsOf, loadAssets, readAssetBlob, removeProjectAssets } from "@/labshell/assets";
import { assetFile, type Pack } from "@/labshell/pack";
import type { Project } from "@/labshell/types";
import { dropAppStore } from "@/labshell/jibos";

export type App = { id: string; name: string; icon: string; iconImage?: string; iconColor?: string; files: { name: string; content: string }[]; installedAt: number };
export const assetKey = (id: string) => `launcher-${id}`;

const storage = {
  getItem: (k: string) => (typeof window === "undefined" ? null : localStorage.getItem(k)),
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* حافظه پر است */
    }
  },
  removeItem: (k: string) => localStorage.removeItem(k),
};

export const useLauncher = create<{ apps: App[]; put: (app: App) => void; patch: (id: string, changes: Partial<App>) => void; drop: (id: string) => void }>()(
  persist(
    (set) => ({
      apps: [],
      put: (app) => set((s) => ({ apps: [...s.apps.filter((a) => a.name !== app.name), app] })),
      patch: (id, changes) => set((s) => ({ apps: s.apps.map((a) => a.id === id ? { ...a, ...changes } : a) })),
      drop: (id) => set((s) => ({ apps: s.apps.filter((a) => a.id !== id) })),
    }),
    { name: "jibcode-launcher", skipHydration: true, storage: createJSONStorage(() => storage) },
  ),
);

const iconOf = (name: string) => name.match(/\p{Extended_Pictographic}/u)?.[0] ?? (name.trim()[0] ?? "?");

async function install(name: string, files: App["files"], assets: File[]): Promise<App> {
  const old = useLauncher.getState().apps.find((a) => a.name === name);
  if (old) await removeProjectAssets(assetKey(old.id)); // نصب دوباره = به‌روزرسانی
  // نصب دوباره ظاهرِ شخصی‌سازی‌شدهٔ آیکن را نگه می‌دارد
  const app: App = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name, icon: old?.icon ?? iconOf(name), iconImage: old?.iconImage, iconColor: old?.iconColor, files, installedAt: Date.now() };
  await loadAssets();
  if (assets.length) await addAssets(assetKey(app.id), assets);
  useLauncher.getState().put(app);
  return app;
}

export function installPack(pack: Pack): Promise<App> {
  return install(pack.name, pack.files, pack.assets.map(assetFile));
}

export async function installProject(project: Project): Promise<App> {
  await loadAssets();
  const files: File[] = [];
  for (const meta of assetsOf(project.id)) {
    const blob = await readAssetBlob(project.id, meta.name);
    if (blob) files.push(new File([blob], meta.name, { type: blob.type }));
  }
  return install(project.name, project.files.map((f) => ({ name: f.name, content: f.content })), files);
}

export async function uninstall(id: string): Promise<void> {
  const app = useLauncher.getState().apps.find((a) => a.id === id);
  if (app) dropAppStore(app.name);
  await removeProjectAssets(assetKey(id));
  useLauncher.getState().drop(id);
}

/** برنامهٔ تک‌فایلی HTML (مثلاً ساخته‌شده با Gemini یا در خود لانچر) */
export function installHtml(name: string, html: string, icon?: string): App {
  const old = useLauncher.getState().apps.find((a) => a.name === name);
  const app: App = { id: old?.id ?? `app-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`, name, icon: icon || old?.icon || iconOf(name), iconImage: old?.iconImage, iconColor: old?.iconColor, files: [{ name: "index.html", content: html }], installedAt: Date.now() };
  useLauncher.getState().put(app);
  return app;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** برنامه را دوباره به «بستهٔ جیب» (.jibpack) تبدیل می‌کند؛ پیوست‌ها هم داخل بسته می‌روند */
export async function exportPack(app: App): Promise<string> {
  await loadAssets();
  const out = [`@@@ jibpack 1 ${app.name}`];
  for (const f of app.files) out.push(`@@@ file ${f.name}`, f.content.replace(/\r\n?/g, "\n").replace(/\n+$/, ""));
  for (const meta of assetsOf(assetKey(app.id))) {
    const blob = await readAssetBlob(assetKey(app.id), meta.name);
    if (!blob) continue;
    const b64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
    out.push(`@@@ asset ${meta.name}`, ...(b64.match(/.{1,76}/g) ?? []));
  }
  return out.join("\n") + "\n";
}
