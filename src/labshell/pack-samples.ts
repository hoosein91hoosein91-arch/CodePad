// نمونه‌های آمادهٔ برنامه که «بستهٔ جیب» (.jibpack) هستند: کد + عکس‌های پیوست در یک فایل.
// از منوی «پروژهٔ تازه» در ویرایشگر باز می‌شوند (پروژهٔ تازه با پیوست‌هایش ساخته می‌شود)
// و در لانچر از بخش «نمونه‌های آماده» مستقیم به‌صورت برنامه نصب می‌شوند.
import snakeImages from "@/labshell/packs/snake-images.jibpack?raw";
import securityHash from "@/labshell/packs/security-hash.jibpack?raw";
import securityEncoding from "@/labshell/packs/security-encoding.jibpack?raw";
import securityClassic from "@/labshell/packs/security-classic.jibpack?raw";
import securityXor from "@/labshell/packs/security-xor.jibpack?raw";
import securityPassword from "@/labshell/packs/security-password.jibpack?raw";
import securityNmap from "@/labshell/packs/security-nmap.jibpack?raw";
import securityPortscan from "@/labshell/packs/security-portscan.jibpack?raw";
import soundPiano from "@/labshell/packs/sound-piano.jibpack?raw";
import navaTodo from "@/labshell/packs/nava-todo.jibpack?raw";
import navaClicker from "@/labshell/packs/nava-clicker.jibpack?raw";
import navaSnake from "@/labshell/packs/nava-snake.jibpack?raw";
import navaCube from "@/labshell/packs/nava-cube3d.jibpack?raw";
import navaAi from "@/labshell/packs/nava-ai.jibpack?raw";
import navaKits from "@/labshell/packs/nava-kits.jibpack?raw";
import navaVoxel from "@/labshell/packs/nava-voxel.jibpack?raw";

export type PackSample = { id: string; title: string; detail: string; text: string; group: "nava" | "fun" | "security" };

export const PACK_SAMPLES: PackSample[] = [
  { id: "nava-todo", group: "nava", title: "نوا: کارهای من", detail: "فهرست کارها با ذخیرهٔ خودکار، کنش و شرط — ۳۵ خط نوا", text: navaTodo },
  { id: "nava-clicker", group: "nava", title: "نوا: معدن طلا (بازی کلیکی)", detail: "زمان‌سنج، تابع قیمت، ارتقا و ذخیرهٔ پیشرفت — ۴۱ خط", text: navaClicker },
  { id: "nava-snake", group: "nava", title: "نوا: مار (بازی روی بوم)", detail: "بوم، لیست مختصات، کلید/کشیدن انگشت، صدا و رکورد — ۵۲ خط", text: navaSnake },
  { id: "nava-cube3d", group: "nava", title: "نوا: صحنهٔ سه‌بعدی", detail: "WebGL: مکعب، کره، هرم، چرخش و دوربین — ۲۷ خط", text: navaCube },
  { id: "nava-ai", group: "nava", title: "نوا: دستیار هوشمند (Gemini)", detail: "«بپرس» با کلید Gemini خودت — ۱۷ خط", text: navaAi },
  { id: "nava-kits", group: "nava", title: "نوا: ابزارهای آماده (مخفف)", detail: "cal ماشین‌حساب، tm تایمر، cnt شمارنده، دکمهٔ کپسولی و df/us — ۲۱ خط", text: navaKits },
  { id: "nava-voxel", group: "nava", title: "نوا: دنیای بلوکی سه‌بعدی", detail: "vx: پرواز، ساخت‌وساز و بلوک سفارشی — ۶ خط", text: navaVoxel },
  { id: "snake-images", group: "fun", title: "مار و سیب (با عکس)", detail: "بازی با عکس‌های پیوست: apple.png، head.png، body.png، grass.png", text: snakeImages },
  { id: "sound-piano", group: "fun", title: "پیانوی نئون (صدا)", detail: "صدا با Web Audio، پخش فایل صوتی پیوست و ذخیره با jibos", text: soundPiano },
  { id: "security-hash", group: "security", title: "امنیت: آزمایشگاه هش", detail: "پایتون: md5/sha1/sha256، اثر بهمنی، PBKDF2 با نمک، HMAC", text: securityHash },
  { id: "security-encoding", group: "security", title: "امنیت: Base64 و Hex", detail: "پایتون: کدگذاری و برگشت؛ چرا کدگذاری رمزنگاری نیست", text: securityEncoding },
  { id: "security-classic", group: "security", title: "امنیت: رمز سزار و ویژنر", detail: "پایتون: رمز کلاسیک، امتحان همهٔ کلیدها، تحلیل فراوانی", text: securityClassic },
  { id: "security-xor", group: "security", title: "امنیت: رمز XOR", detail: "پایتون: XOR، حملهٔ متن معلوم، خطر کلید تکراری", text: securityXor },
  { id: "security-password", group: "security", title: "امنیت: سنجش قدرت رمز عبور", detail: "صفحهٔ وب: آنتروپی، زمان حدس، ساخت رمز تصادفی امن", text: securityPassword },
  { id: "security-nmap", group: "security", title: "امنیت: اسکن پورت (nmap، آموزشی)", detail: "پایتون: مفهوم اسکن پورت + شبیه‌سازی آفلاین؛ بدون شبکهٔ واقعی", text: securityNmap },
  { id: "security-portscan", group: "security", title: "امنیت: دمو اسکن پورت (تعاملی)", detail: "صفحهٔ وب: اسکن شبیه‌سازی‌شده روی دادهٔ ساختگی با نوار پیشرفت", text: securityPortscan },
];
