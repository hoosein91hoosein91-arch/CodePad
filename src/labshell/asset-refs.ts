// پیوست‌ها (عکس و فایل‌های دیگر): توابع خالص برای پیدا کردن و جایگزین کردن نام فایل‌ها در کد.
// هر جا نام پیوست، تنها داخل نقل‌قول یا url(...) آمده باشد ("photo.png"، 'photo.png'، url(photo.png))،
// با آدرس data: همان فایل عوض می‌شود تا صفحه بدون شبکه آن را بخواند.

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  json: "application/json", csv: "text/csv", txt: "text/plain", md: "text/markdown", xml: "application/xml",
  pdf: "application/pdf", zip: "application/zip",
};

export function mimeFor(name: string, given: string): string {
  if (given) return given;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

// نام امن برای پیوست: بدون مسیر (فقط نام فایل)
export function cleanAssetName(raw: string): string {
  const base = raw.split(/[\\/]/).pop()?.trim() ?? "";
  return !base || base === "." || base === ".." ? "file" : base;
}

// کدام نام‌ها در متن آمده‌اند؟ (فقط همین‌ها داخل صفحه گذاشته می‌شوند)
export function mentioned(text: string, names: string[]): string[] {
  return names.filter((name) => name && text.includes(name));
}

export function rewriteRefs(text: string, urls: Map<string, string>): string {
  if (!urls.size) return text;
  const names = [...urls.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const pattern = new RegExp(`(?<=["'(])(?:\\./)?(${names.join("|")})(?=["')?#])`, "g");
  return text.replace(pattern, (_all, name: string) => urls.get(name) ?? name);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// کمکی‌های داخل صفحه: assetText("data.csv") / assetBytes("data.bin") — آرگومان همان رشته‌ای است که نام فایل بود
export const PAGE_HELPERS = `<script>(function(){function b(u){var s=String(u),i=s.indexOf(","),r=atob(s.slice(i+1)),a=new Uint8Array(r.length);for(var k=0;k<r.length;k++)a[k]=r.charCodeAt(k);return a}window.assetBytes=b;window.assetText=function(u){return new TextDecoder().decode(b(u))}})();</script>`;
