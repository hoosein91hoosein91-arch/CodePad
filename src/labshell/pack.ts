// «بستهٔ جیب» (.jibpack): یک فایل متنی سبک که هم کد دارد و هم عکس و فایل‌های پیوست.
// وقتی در برنامه باز شود، یک پروژهٔ تازه ساخته می‌شود: فایل‌های کد داخل پروژه، عکس‌ها و فایل‌ها پیوست.
//
//   @@@ jibpack 1 مار و سیب          ← خط اول: نشانه، نسخه، و نام پروژه (اختیاری)
//   @@@ file snake.mix               ← فایل کد؛ تا خط @@@ بعدی همه‌اش محتوای فایل است
//   ...کد...
//   @@@ asset apple.png              ← پیوست؛ محتوا base64 است (می‌تواند چند خط باشد)
//   iVBORw0KGgo...
//
// خطی که با @@@ شروع شود در متن رزرو است (در کد عادی پیش نمی‌آید).
import { cleanAssetName, mimeFor } from "@/labshell/asset-refs";

export type PackFile = { name: string; content: string };
export type PackAsset = { name: string; bytes: Uint8Array<ArrayBuffer> };
export type Pack = { name: string; files: PackFile[]; assets: PackAsset[]; problems: string[] };

const MAGIC = /^\s*@@@\s*jibpack\b[ \t]*(\d+)?[ \t]*(.*)$/i;
const SECTION = /^@@@\s*(file|asset)\s+(.+?)\s*$/i;

export function isPackText(text: string): boolean {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim());
  return !!first && MAGIC.test(first);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text.replace(/\s+/g, "");
  if (clean && !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
  try {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function parsePack(source: string): Pack | null {
  const rows = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const start = rows.findIndex((row) => row.trim());
  const head = start >= 0 ? rows[start].match(MAGIC) : null;
  if (!head) return null;
  const pack: Pack = { name: head[2].trim() || "Pack", files: [], assets: [], problems: [] };
  let kind: "file" | "asset" | null = null;
  let name = "";
  let body: string[] = [];
  const flush = () => {
    if (!kind) return;
    if (kind === "file") {
      pack.files.push({ name: cleanAssetName(name), content: body.join("\n").replace(/\n+$/, "") + "\n" });
    } else {
      const bytes = fromBase64(body.join(""));
      if (bytes) pack.assets.push({ name: cleanAssetName(name), bytes });
      else pack.problems.push(`${name} (base64 خراب است)`);
    }
    kind = null;
    body = [];
  };
  for (const row of rows.slice(start + 1)) {
    const section = row.match(SECTION);
    if (section) {
      flush();
      kind = section[1].toLowerCase() as "file" | "asset";
      name = section[2];
    } else if (kind) body.push(row);
  }
  flush();
  return pack;
}

export function assetFile(asset: PackAsset): File {
  return new File([asset.bytes], asset.name, { type: mimeFor(asset.name, "") });
}
