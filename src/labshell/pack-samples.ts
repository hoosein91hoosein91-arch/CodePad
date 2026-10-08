// نمونه‌های آمادهٔ برنامه که «بستهٔ جیب» (.jibpack) هستند: کد + عکس‌های پیوست در یک فایل.
// از منوی «پروژهٔ تازه» در ویرایشگر باز می‌شوند (پروژهٔ تازه با پیوست‌هایش ساخته می‌شود)
// و در لانچر از بخش «نمونه‌های آماده» مستقیم به‌صورت برنامه نصب می‌شوند.
import snakeImages from "@/labshell/packs/snake-images.jibpack?raw";
import securityHash from "@/labshell/packs/security-hash.jibpack?raw";
import securityEncoding from "@/labshell/packs/security-encoding.jibpack?raw";
import securityClassic from "@/labshell/packs/security-classic.jibpack?raw";
import securityXor from "@/labshell/packs/security-xor.jibpack?raw";
import securityPassword from "@/labshell/packs/security-password.jibpack?raw";
import soundPiano from "@/labshell/packs/sound-piano.jibpack?raw";

export type PackSample = { id: string; title: string; detail: string; text: string; group: "fun" | "security" };

export const PACK_SAMPLES: PackSample[] = [
  { id: "snake-images", group: "fun", title: "مار و سیب (با عکس)", detail: "بازی با عکس‌های پیوست: apple.png، head.png، body.png، grass.png", text: snakeImages },
  { id: "sound-piano", group: "fun", title: "پیانوی نئون (صدا)", detail: "صدا با Web Audio، پخش فایل صوتی پیوست و ذخیره با jibos", text: soundPiano },
  { id: "security-hash", group: "security", title: "امنیت: آزمایشگاه هش", detail: "پایتون: md5/sha1/sha256، اثر بهمنی، PBKDF2 با نمک، HMAC", text: securityHash },
  { id: "security-encoding", group: "security", title: "امنیت: Base64 و Hex", detail: "پایتون: کدگذاری و برگشت؛ چرا کدگذاری رمزنگاری نیست", text: securityEncoding },
  { id: "security-classic", group: "security", title: "امنیت: رمز سزار و ویژنر", detail: "پایتون: رمز کلاسیک، امتحان همهٔ کلیدها، تحلیل فراوانی", text: securityClassic },
  { id: "security-xor", group: "security", title: "امنیت: رمز XOR", detail: "پایتون: XOR، حملهٔ متن معلوم، خطر کلید تکراری", text: securityXor },
  { id: "security-password", group: "security", title: "امنیت: سنجش قدرت رمز عبور", detail: "صفحهٔ وب: آنتروپی، زمان حدس، ساخت رمز تصادفی امن", text: securityPassword },
];
