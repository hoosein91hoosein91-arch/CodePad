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

// فایل متنیِ کد تا این اندازه داخل پروژه باز می‌شود (پروژه‌ها در localStorage ذخیره می‌شوند)؛ بزرگ‌تر یا غیرمتنی ← پیوست
const MAX_CODE_BYTES = 1_000_000;

const MEDIA_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg", "heic",
  "mp3", "wav", "ogg", "m4a", "aac", "flac", "mp4", "webm", "mov", "mkv",
  "woff", "woff2", "ttf", "otf", "pdf", "zip", "gz", "tar", "7z", "rar", "db", "sqlite", "xlsx", "docx", "pptx",
]);

async function looksBinary(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  return head.includes(0);
}

export type OpenResult = { opened: OpenedFile[]; assets: File[] };

// دکمهٔ «باز کردن فایل»: کد (متنی و ≤ ۱ مگابایت) به فایل پروژه تبدیل می‌شود؛ عکس و هر چیز دیگر پیوست می‌شود. چیزی رد نمی‌شود.
export async function readOpened(files: File[]): Promise<OpenResult> {
  const opened: OpenedFile[] = [];
  const assets: File[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const media = file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.startsWith("video/") || MEDIA_EXT.has(ext);
    if (media || file.size > MAX_CODE_BYTES || (await looksBinary(file))) {
      assets.push(file);
      continue;
    }
    const content = (await file.text()).replace(/\r\n?/g, "\n");
    opened.push({ name: file.name || "file.txt", lang: langFromName(file.name), content });
  }
  return { opened, assets };
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
