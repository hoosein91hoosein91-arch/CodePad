// نمونه‌های آمادهٔ برنامه که «بستهٔ جیب» (.jibpack) هستند: کد + عکس‌های پیوست در یک فایل.
// از منوی «پروژهٔ تازه» باز می‌شوند؛ مثل باز کردن یک فایل .jibpack، پروژهٔ تازه با پیوست‌هایش ساخته می‌شود.
import snakeImages from "@/labshell/packs/snake-images.jibpack?raw";

export type PackSample = { id: string; title: string; detail: string; text: string };

export const PACK_SAMPLES: PackSample[] = [
  {
    id: "snake-images",
    title: "مار و سیب (با عکس)",
    detail: "بازی با عکس‌های پیوست: apple.png، head.png، body.png، grass.png",
    text: snakeImages,
  },
];
