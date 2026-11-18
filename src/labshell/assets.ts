// پیوست‌های پروژه: عکس و هر فایل دیگر (بدون محدودیت اندازه یا نوع).
// فایل‌ها در IndexedDB نگه داشته می‌شوند (نه localStorage)، پس حجم زیاد هم جا می‌شود.
// فهرست (فقط نام و اندازه) در یک store کوچک است تا منو بی‌درنگ به‌روز شود.
import { create } from "zustand";
import { cleanAssetName, mentioned, mimeFor } from "@/labshell/asset-refs";

export type AssetMeta = { projectId: string; name: string; type: string; size: number; stamp: string };

type Row = AssetMeta & { key: string; blob: Blob };

const DB_NAME = "jibcode-assets";
const STORE = "files";

export const useAssets = create<{ items: AssetMeta[]; loaded: boolean }>(() => ({ items: [], loaded: false }));

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("projectId", "projectId");
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => {
        dbPromise = null;
        reject(open.error ?? new Error("IndexedDB failed"));
      };
    });
  }
  return dbPromise;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed"));
  });
}

const keyOf = (projectId: string, name: string) => `${projectId}\u0000${name}`;
const metaOf = ({ projectId, name, type, size, stamp }: Row): AssetMeta => ({ projectId, name, type, size, stamp });

// وقتی برنامه باز شد، فهرست پیوست‌ها را از IndexedDB می‌خواند
export async function loadAssets(): Promise<void> {
  try {
    const rows = (await wrap((await db()).transaction(STORE).objectStore(STORE).getAll())) as Row[];
    useAssets.setState({ items: rows.map(metaOf), loaded: true });
  } catch {
    useAssets.setState({ loaded: true });
  }
}

export function assetsOf(projectId: string): AssetMeta[] {
  return useAssets.getState().items.filter((item) => item.projectId === projectId);
}

// فایل‌ها را به پروژه اضافه می‌کند. نام تکراری = جایگزین می‌شود (تا ارجاع‌های داخل کد خراب نشوند)
export async function addAssets(projectId: string, files: File[]): Promise<{ added: string[]; replaced: string[]; failed: string[] }> {
  const added: string[] = [];
  const replaced: string[] = [];
  const failed: string[] = [];
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* درخواست ذخیرهٔ پایدار اختیاری است */
  }
  for (const file of files) {
    const name = cleanAssetName(file.name);
    try {
      const row: Row = {
        key: keyOf(projectId, name),
        projectId,
        name,
        type: mimeFor(name, file.type),
        size: file.size,
        stamp: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        blob: file,
      };
      await wrap((await db()).transaction(STORE, "readwrite").objectStore(STORE).put(row));
      urlCache.delete(row.key);
      const existed = useAssets.getState().items.some((item) => item.projectId === projectId && item.name === name);
      (existed ? replaced : added).push(name);
      useAssets.setState((state) => ({
        items: [...state.items.filter((item) => !(item.projectId === projectId && item.name === name)), metaOf(row)],
      }));
    } catch {
      failed.push(`${file.name} (جای کافی نبود یا ذخیره نشد)`);
    }
  }
  return { added, replaced, failed };
}

export async function removeAsset(projectId: string, name: string): Promise<void> {
  try {
    await wrap((await db()).transaction(STORE, "readwrite").objectStore(STORE).delete(keyOf(projectId, name)));
  } catch {
    /* اگر حذف نشد، فهرست را هم دست نمی‌زنیم */
    return;
  }
  urlCache.delete(keyOf(projectId, name));
  useAssets.setState((state) => ({ items: state.items.filter((item) => !(item.projectId === projectId && item.name === name)) }));
}

export async function removeProjectAssets(projectId: string): Promise<void> {
  for (const item of assetsOf(projectId)) await removeAsset(projectId, item.name);
}

export async function readAssetBlob(projectId: string, name: string): Promise<Blob | null> {
  try {
    const row = (await wrap((await db()).transaction(STORE).objectStore(STORE).get(keyOf(projectId, name)))) as Row | undefined;
    return row?.blob ?? null;
  } catch {
    return null;
  }
}

// ── آدرس data: برای گذاشتن داخل صفحه ──
const urlCache = new Map<string, { stamp: string; url: string }>();

function dataUrlOf(blob: Blob, type: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      // اگر مرورگر نوع را نداد، همان نوعی که حدس زدیم
      resolve(text.startsWith("data:;") ? `data:${type};${text.slice(5)}` : text.replace(/^data:application\/octet-stream;/, `data:${type};`));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

// برای هر پیوستِ پروژه که اسمش در متن آمده، آدرس data: را برمی‌گرداند
export async function assetUrlsFor(projectId: string, text: string): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const metas = assetsOf(projectId);
  for (const name of mentioned(text, metas.map((item) => item.name))) {
    const meta = metas.find((item) => item.name === name);
    if (!meta) continue;
    const key = keyOf(projectId, name);
    const cached = urlCache.get(key);
    if (cached && cached.stamp === meta.stamp) {
      urls.set(name, cached.url);
      continue;
    }
    const blob = await readAssetBlob(projectId, name);
    if (!blob) continue;
    const url = await dataUrlOf(blob, meta.type);
    // فایل‌های خیلی بزرگ را در حافظه نگه نمی‌داریم
    if (url.length < 8_000_000) urlCache.set(key, { stamp: meta.stamp, url });
    urls.set(name, url);
  }
  return urls;
}
