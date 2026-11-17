// تحلیل فایل مشکوک؛ کاملاً آفلاین و فقط خواندنی: فایل هرگز اجرا نمی‌شود، فقط بایت‌هایش بررسی می‌شوند.

/** MD5 خالص (WebCrypto آن را ندارد). */
export function md5(bytes) {
  const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const len = bytes.length, total = (((len + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(total); buf.set(bytes); buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, (len << 3) >>> 0, true); dv.setUint32(total - 4, Math.floor(len / 2 ** 29) >>> 0, true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    const M = new Uint32Array(16); for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0; A = D; D = C; C = B;
      const s = S[(i >> 4) * 4 + (i % 4)]; B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16), o = new DataView(out.buffer);
  o.setUint32(0, a0, true); o.setUint32(4, b0, true); o.setUint32(8, c0, true); o.setUint32(12, d0, true);
  return [...out].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function digest(bytes, algo) {
  const h = await crypto.subtle.digest(algo, bytes);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** آنتروپی شانون (۰ تا ۸ بیت بر بایت). بالای ~7.5 یعنی فشرده/رمزنگاری‌شده. */
export function entropy(bytes) {
  if (!bytes.length) return 0;
  const c = new Array(256).fill(0); for (const b of bytes) c[b]++;
  let e = 0; for (const n of c) if (n) { const p = n / bytes.length; e -= p * Math.log2(p); }
  return e;
}

export function extractStrings(bytes, min = 6, limit = 200) {
  const out = []; let cur = "";
  for (let i = 0; i < bytes.length && out.length < limit; i++) {
    const b = bytes[i];
    if (b >= 32 && b < 127) cur += String.fromCharCode(b);
    else { if (cur.length >= min) out.push(cur); cur = ""; }
  }
  if (cur.length >= min && out.length < limit) out.push(cur);
  return out;
}

export function hexdump(bytes, max = 256) {
  const lines = [];
  for (let i = 0; i < Math.min(bytes.length, max); i += 16) {
    const row = bytes.slice(i, i + 16);
    const hex = [...row].map((b) => b.toString(16).padStart(2, "0")).join(" ").padEnd(47);
    const asc = [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    lines.push(i.toString(16).padStart(8, "0") + "  " + hex + "  |" + asc + "|");
  }
  return lines.join("\n");
}

const SIGNATURES = [
  [[0x4d, 0x5a], "exe", "Windows executable (PE/MZ)", "high"],
  [[0x7f, 0x45, 0x4c, 0x46], "elf", "Linux/Android executable (ELF)", "high"],
  [[0xcf, 0xfa, 0xed, 0xfe], "macho", "macOS executable (Mach-O)", "high"],
  [[0x50, 0x4b, 0x03, 0x04], "zip", "ZIP / APK / DOCX / JAR", "info"],
  [[0x25, 0x50, 0x44, 0x46], "pdf", "PDF", "medium"],
  [[0x89, 0x50, 0x4e, 0x47], "png", "PNG image", "info"],
  [[0xff, 0xd8, 0xff], "jpg", "JPEG image", "info"],
  [[0x47, 0x49, 0x46, 0x38], "gif", "GIF image", "info"],
  [[0x1f, 0x8b], "gz", "gzip", "info"],
  [[0x52, 0x61, 0x72, 0x21], "rar", "RAR archive", "info"],
  [[0x37, 0x7a, 0xbc, 0xaf], "7z", "7-Zip archive", "info"],
  [[0xd0, 0xcf, 0x11, 0xe0], "ole", "Office قدیمی (ماکرو ممکن است)", "medium"],
  [[0x23, 0x21], "script", "اسکریپت (#!)", "medium"],
  [[0x64, 0x65, 0x78, 0x0a], "dex", "Android DEX", "medium"],
];
const DANGEROUS_EXT = /\.(exe|dll|scr|bat|cmd|ps1|vbs|js|jse|wsf|msi|jar|apk|com|lnk|hta|sh|py)$/i;

export function sniff(bytes, name = "") {
  for (const [sig, kind, desc, risk] of SIGNATURES) if (sig.every((b, i) => bytes[i] === b)) return { kind, desc, risk };
  const head = String.fromCharCode(...bytes.slice(0, 200));
  if (/^\s*<(!doctype html|html|\?xml|svg)/i.test(head)) return { kind: "html", desc: "HTML/SVG/XML (می‌تواند اسکریپت داشته باشد)", risk: "medium" };
  if (bytes.length && [...bytes.slice(0, 512)].every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 0xc2)) return { kind: "text", desc: "متن", risk: "info" };
  return { kind: "unknown", desc: "نوع ناشناخته", risk: "info" };
}

/** فهرست ZIP از «دایرکتوری مرکزی»؛ بدون باز کردن/اجرای محتوا. */
export function zipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let n = 0; n < count && p + 46 <= bytes.length && n < 5000; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const name = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(p + 46, p + 46 + nlen));
    entries.push({ name, csize, usize, encrypted: !!(flags & 1) });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

export function zipWarnings(entries) {
  const w = [];
  const bad = entries.filter((e) => /(^|[\\/])\.\.([\\/]|$)/.test(e.name) || /^([a-z]:)?[\\/]/i.test(e.name));
  if (bad.length) w.push({ level: "high", text: `${bad.length} مسیر خطرناک (../ یا مسیر مطلق) — حملهٔ Zip Slip: ${bad.slice(0, 2).map((e) => e.name).join("، ")}` });
  const total = entries.reduce((a, e) => a + e.usize, 0), packed = entries.reduce((a, e) => a + e.csize, 0);
  if (packed > 0 && total / packed > 100 && total > 50 * 1024 * 1024) w.push({ level: "high", text: `نسبت فشرده‌سازی غیرعادی (${Math.round(total / packed)}×)؛ احتمال بمب ZIP` });
  const exec = entries.filter((e) => DANGEROUS_EXT.test(e.name));
  if (exec.length) w.push({ level: "medium", text: `${exec.length} فایل اجرایی/اسکریپت داخل بسته: ${exec.slice(0, 3).map((e) => e.name).join("، ")}` });
  if (entries.some((e) => e.encrypted)) w.push({ level: "info", text: "بعضی فایل‌ها رمزدارند؛ محتوایشان قابل بررسی نیست." });
  if (entries.some((e) => e.name.endsWith("AndroidManifest.xml"))) w.push({ level: "info", text: "این بسته APK اندروید است؛ مجوزها را قبل از نصب بررسی کن." });
  return w;
}

const SUSPICIOUS_STRINGS = [
  [/powershell(\.exe)?\s+-(enc|e|nop|w\s+hidden)/i, "PowerShell رمزگذاری‌شده/مخفی"],
  [/cmd(\.exe)?\s*\/c/i, "اجرای فرمان cmd"],
  [/https?:\/\/[^\s"']+\.(exe|dll|ps1|bat|sh)\b/i, "لینک دانلود فایل اجرایی"],
  [/\b(eval|exec|fromCharCode|atob)\s*\(/, "تابع‌های رایج مبهم‌سازی (eval/exec/atob)"],
  [/(CreateRemoteThread|VirtualAllocEx|WriteProcessMemory|LoadLibrary|GetProcAddress)/, "فراخوانی‌های API تزریق/بارگذاری"],
  [/\b(nc|ncat|netcat)\b.*\s-e\s/i, "reverse shell با netcat"],
  [/(AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)/, "کلید/رمز فاش‌شده (کلید AWS یا کلید خصوصی)"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/, "آدرس IP:پورت (ارتباط با سرور)"],
];

export async function analyze(bytes, name = "file") {
  const type = sniff(bytes, name);
  const strings = extractStrings(bytes);
  const e = entropy(bytes.length > 4 * 1024 * 1024 ? bytes.subarray(0, 4 * 1024 * 1024) : bytes);
  const findings = [];
  if (type.risk === "high") findings.push({ level: "high", text: `${type.desc}؛ فقط در محیط ایزوله باز کن.` });
  if (DANGEROUS_EXT.test(name)) findings.push({ level: "medium", text: "پسوند اجرایی/اسکریپت: " + (name.match(DANGEROUS_EXT)?.[0] || "") });
  const dbl = name.match(/\.(pdf|docx?|xlsx?|jpg|png|txt)\.(exe|scr|bat|cmd|js|vbs|lnk)$/i);
  if (dbl) findings.push({ level: "high", text: `پسوند دوگانه (${dbl[0]}): ترفند رایج برای فریب کاربر.` });
  if (e > 7.5 && bytes.length > 2048 && !["zip", "gz", "png", "jpg", "rar", "7z", "pdf"].includes(type.kind)) findings.push({ level: "medium", text: `آنتروپی بالا (${e.toFixed(2)}/8): احتمال بسته‌بندی/رمزنگاری (packer).` });
  if (type.kind === "exe" && bytes.length > 0x40) { const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const pe = dv.getUint32(0x3c, true); if (pe + 4 < bytes.length && dv.getUint32(pe, true) !== 0x4550) findings.push({ level: "medium", text: "سربرگ PE ناسازگار است (فایل دستکاری‌شده یا خراب)." }); }
  const text = strings.join("\n");
  for (const [re, label] of SUSPICIOUS_STRINGS) if (re.test(text)) findings.push({ level: "medium", text: "رشتهٔ مشکوک: " + label });
  let zip = null;
  if (type.kind === "zip") { zip = zipEntries(bytes); if (zip) findings.push(...zipWarnings(zip)); }
  const [sha256, sha1] = await Promise.all([digest(bytes, "SHA-256"), digest(bytes, "SHA-1")]);
  return { name, size: bytes.length, type, entropy: e, md5: md5(bytes), sha1, sha256, strings: strings.slice(0, 60), hexdump: hexdump(bytes, 256), zip, findings };
}
