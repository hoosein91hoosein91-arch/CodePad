// لانچر: برنامه‌های نصب‌شده (هر برنامه = یک بستهٔ جیب). کدها اینجا، عکس‌ها و فایل‌های پیوست در IndexedDB.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { addAssets, assetsOf, loadAssets, readAssetBlob, removeProjectAssets } from "@/labshell/assets";
import { assetFile, type Pack } from "@/labshell/pack";
import type { Project } from "@/labshell/types";

export type App = { id: string; name: string; icon: string; iconImage?: string; iconColor?: string; pageIndex?: number; files: { name: string; content: string }[]; installedAt: number };
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
  const app: App = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name, icon: iconOf(name), files, installedAt: Date.now() };
  await loadAssets();
  if (assets.length) await addAssets(assetKey(app.id), assets);
  useLauncher.getState().put(app);
  return app;
}

export function installPack(pack: Pack): Promise<App> {
  return install(pack.name, pack.files, pack.assets.map(assetFile));
}

export async function exportAppPack(app: App): Promise<string> {
  await loadAssets();
  const sections: string[] = [`@@@ jibpack 1 ${app.name.replace(/[\r\n]/g, " ").trim() || "CodePad app"}`];
  for (const file of app.files) {
    if (!file.name || /[\r\n]/.test(file.name) || file.content.split(/\r?\n/).some((line) => line.startsWith("@@@"))) {
      throw new Error("یکی از فایل‌ها شامل خطی است که قالب jibpack رزرو کرده؛ آن خط را تغییر بده و دوباره خروجی بگیر.");
    }
    sections.push(`@@@ file ${file.name}\n${file.content.replace(/\n*$/, "\n")}`);
  }
  for (const meta of assetsOf(assetKey(app.id))) {
    const blob = await readAssetBlob(assetKey(app.id), meta.name);
    if (!blob) continue;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error("خواندن پیوست ناموفق بود.")); reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1).replace(/\s+/g, "");
    sections.push(`@@@ asset ${meta.name}\n${base64.match(/.{1,76}/g)?.join("\n") ?? ""}`);
  }
  return `${sections.join("\n")}\n`;
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
  await removeProjectAssets(assetKey(id));
  useLauncher.getState().drop(id);
}
