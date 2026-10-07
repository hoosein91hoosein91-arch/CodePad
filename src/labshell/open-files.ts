import type { Lang } from "@/labshell/types";

// باز کردن فایل از بیرون برنامه: انتخاب‌گر فایل، «اشتراک‌گذاری ← جیب‌کد» (share target) و «باز کردن با» (file handler)

const EXT: Record<string, Lang> = {
  mix: "mix", fa: "farsi", jib: "english", bit: "binary", py: "python", js: "javascript", mjs: "javascript",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", css: "css", html: "html", htm: "html",
};

export type OpenedFile = { name: string; lang: Lang; content: string };

// پسوند ناشناخته (مثل txt) ← «ترکیبی»؛ زبان هر تکه خودکار تشخیص داده می‌شود
export function langFromName(name: string): Lang {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT[ext] ?? "mix";
}

const MAX_BYTES = 1_000_000;

export async function readOpened(files: File[]): Promise<{ opened: OpenedFile[]; skipped: string[] }> {
  const opened: OpenedFile[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      skipped.push(`${file.name} (بزرگ‌تر از ۱ مگابایت)`);
      continue;
    }
    const content = (await file.text()).replace(/\r\n?/g, "\n");
    if (content.includes("\u0000")) {
      skipped.push(`${file.name} (فایل متنی نیست)`);
      continue;
    }
    opened.push({ name: file.name || "file.txt", lang: langFromName(file.name), content });
  }
  return { opened, skipped };
}

// اگر نام تکراری بود، قبل از پسوند شماره می‌گذارد: main.py ← main (2).py
export function freshName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (taken.includes(`${stem} (${n})${ext}`)) n += 1;
  return `${stem} (${n})${ext}`;
}

// فایل‌هایی که سرویس‌ورکر از «اشتراک‌گذاری» گرفته و در کش گذاشته
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open("jibcode-share");
  const files: File[] = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response) {
      const name = decodeURIComponent(response.headers.get("x-name") ?? "") || "shared.txt";
      files.push(new File([await response.blob()], name));
    }
    await cache.delete(request);
  }
  return files;
}

type LaunchParams = { files?: { getFile: () => Promise<File> }[] };

// «باز کردن با…» در مرورگرهای رومیزی (Chrome/Edge) و ChromeOS
export function listenLaunchFiles(onFiles: (files: File[]) => void): void {
  const queue = (window as unknown as { launchQueue?: { setConsumer: (fn: (params: LaunchParams) => void) => void } }).launchQueue;
  queue?.setConsumer((params) => {
    if (!params.files?.length) return;
    void Promise.all(params.files.map((handle) => handle.getFile())).then(onFiles);
  });
}
