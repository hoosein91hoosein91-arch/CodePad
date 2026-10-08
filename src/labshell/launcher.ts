// لانچر: برنامه‌های نصب‌شده (هر برنامه = یک بستهٔ جیب). کدها اینجا، عکس‌ها و فایل‌های پیوست در IndexedDB.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { addAssets, assetsOf, loadAssets, readAssetBlob, removeProjectAssets } from "@/labshell/assets";
import { assetFile, type Pack } from "@/labshell/pack";
import type { Project } from "@/labshell/types";
import { dropAppStore } from "@/labshell/jibos";
import { appPage, readLauncherBackup } from "@/labshell/launcher-compat";

export type App = { id: string; name: string; icon: string; iconImage?: string; iconColor?: string; files: { name: string; content: string }[]; installedAt: number; page?: number; pageIndex?: number };
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
      patch: (id, changes) => set((s) => ({ apps: s.apps.map((a) => a.id === id ? { ...a, ...changes, ...(changes.page !== undefined || changes.pageIndex !== undefined ? { page: changes.page ?? changes.pageIndex, pageIndex: changes.page ?? changes.pageIndex } : {}) } : a) })),
      drop: (id) => set((s) => ({ apps: s.apps.filter((a) => a.id !== id) })),
    }),
    { name: "jibcode-launcher", skipHydration: true, storage: createJSONStorage(() => storage),
      merge: (saved, current) => {
        const data = saved as { apps?: App[] } | null;
        return { ...current, ...(data ?? {}), apps: Array.isArray(data?.apps) ? data.apps.map((a) => ({ ...a, page: appPage(a) })) : current.apps };
      },
    },
  ),
);

const iconOf = (name: string) => name.match(/\p{Extended_Pictographic}/u)?.[0] ?? (name.trim()[0] ?? "?");

async function install(name: string, files: App["files"], assets: File[]): Promise<App> {
  const old = useLauncher.getState().apps.find((a) => a.name === name);
  if (old) await removeProjectAssets(assetKey(old.id)); // نصب دوباره = به‌روزرسانی
  // نصب دوباره ظاهرِ شخصی‌سازی‌شدهٔ آیکن را نگه می‌دارد
  const app: App = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name, icon: old?.icon ?? iconOf(name), iconImage: old?.iconImage, iconColor: old?.iconColor, files, installedAt: Date.now(), page: old?.page ?? 0 };
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
  const app: App = { id: old?.id ?? `app-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`, name, icon: icon || old?.icon || iconOf(name), iconImage: old?.iconImage, iconColor: old?.iconColor, files: [{ name: "index.html", content: html }], installedAt: Date.now(), page: old?.page ?? 0 };
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
  const out = [`@@@ jibpack 1 ${app.name.replace(/[\r\n]/g, " ").trim() || "CodePad app"}`];
  for (const f of app.files) {
    if (!f.name || /[\r\n]/.test(f.name) || f.content.split(/\r\n?|\n/).some((line) => line.startsWith("@@@"))) {
      throw new Error("یکی از فایل‌ها شامل خطی است که قالب jibpack رزرو کرده؛ آن خط را تغییر بده و دوباره خروجی بگیر.");
    }
    out.push(`@@@ file ${f.name}`, f.content.replace(/\r\n?/g, "\n").replace(/\n+$/, ""));
  }
  for (const meta of assetsOf(assetKey(app.id))) {
    const blob = await readAssetBlob(assetKey(app.id), meta.name);
    if (!blob) continue;
    const b64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
    out.push(`@@@ asset ${meta.name}`, ...(b64.match(/.{1,76}/g) ?? []));
  }
  return out.join("\n") + "\n";
}

/** Compatibility with the original launcher export API. */
export const exportAppPack = exportPack;

// ── پشتیبان‌گیری/بازگردانی کل لانچر (برنامه‌ها + ظاهر) در یک فایل ─────────────
function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export type Backup = {
  jibosBackup: 1;
  exportedAt: number;
  prefs: unknown;
  apps: { name: string; icon: string; iconImage?: string; iconColor?: string; page?: number; files: { name: string; content: string }[]; assets: { name: string; type: string; b64: string }[] }[];
};

/** کل لانچر را به یک فایل JSON (.jibos) تبدیل می‌کند؛ عکس‌های پیوست هم داخل آن base64 می‌شوند */
export async function exportBackup(prefs: unknown): Promise<string> {
  await loadAssets();
  const apps: Backup["apps"] = [];
  for (const app of useLauncher.getState().apps) {
    const assets: Backup["apps"][number]["assets"] = [];
    for (const meta of assetsOf(assetKey(app.id))) {
      const blob = await readAssetBlob(assetKey(app.id), meta.name);
      if (!blob) continue;
      assets.push({ name: meta.name, type: blob.type, b64: toBase64(new Uint8Array(await blob.arrayBuffer())) });
    }
    apps.push({ name: app.name, icon: app.icon, iconImage: app.iconImage, iconColor: app.iconColor, page: appPage(app), files: app.files, assets });
  }
  const backup: Backup = { jibosBackup: 1, exportedAt: Date.now(), prefs, apps };
  return JSON.stringify(backup, null, 2);
}

/** فایل پشتیبان را می‌خواند و برنامه‌ها را دوباره نصب می‌کند؛ prefs را برمی‌گرداند تا صفحهٔ لانچر اعمال کند */
export async function importBackup(text: string): Promise<{ installed: number; prefs: unknown }> {
  const data = readLauncherBackup(text);
  await loadAssets();
  let installed = 0;
  // Decode every attachment first: a malformed backup must not partially replace installed programs.
  const prepared = data.apps.map((a) => ({ a, files: a.assets.map((as) => new File([fromBase64(as.b64)], as.name, { type: as.type || "application/octet-stream" })) }));
  for (const { a, files } of prepared) {
    const app = await install(a.name, a.files, files);
    useLauncher.getState().patch(app.id, { icon: a.icon, iconImage: a.iconImage, iconColor: a.iconColor, page: a.page ?? 0 });
    installed++;
  }
  return { installed, prefs: data.prefs };
}
