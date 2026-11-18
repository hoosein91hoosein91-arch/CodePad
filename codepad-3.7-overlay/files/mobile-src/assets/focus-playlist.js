// پلی‌لیست تمرکز برای برنامه‌نویسی. فقط فهرست نام آهنگ است (فایل صوتی همراه برنامه نیست):
// اگر آهنگ در پوشهٔ موسیقی تو باشد از همان پخش می‌شود، وگرنه دکمهٔ جست‌وجو آن را در مرورگر باز می‌کند.
// عنوان‌ها از حافظه و بدون بررسی آنلاین آمده‌اند؛ ممکن است یکی در دسترس نباشد.
// «تمرکز» سلیقه‌ای است: بیشتر این‌ها ریتم ثابت و تنوع آوازی کم دارند؛ اگر حواست را پرت کرد، به بخش پایین (سینت‌ویو) برو.
export const FOCUS_PLAYLIST = {
  name: "Focus Phonk · کدنویسی",
  tips: "ریتم ثابت ۱۲۰ تا ۱۵۰ BPM، تکرار زیاد و کلام کم. صدا را متوسط نگه دار؛ فانک خیلی تهاجمی تمرکز را کم می‌کند.",
  groups: [
    {
      title: "Phonk / Drift Phonk",
      tracks: [
        { artist: "INTERWORLD", title: "METAMORPHOSIS", note: "سینمایی و ثابت؛ خوب برای شروع" },
        { artist: "Hensonn", title: "SAHARA", note: "ریتم رانندگی، بدون پرت‌کنندهٔ زیاد" },
        { artist: "DVRST", title: "Close Eyes", note: "آرام‌تر و تکراری" },
        { artist: "MoonDeity", title: "NEON BLADE", note: "تاریک و سینت‌دار" },
        { artist: "Kordhell", title: "Scopin", note: "پرانرژی؛ برای کارهای تکراری" },
        { artist: "Kordhell", title: "Live Another Day", note: "پرانرژی" },
        { artist: "Kordhell", title: "Murder In My Mind", note: "خیلی تهاجمی؛ برای باگ‌های لجباز" },
      ],
    },
    {
      title: "جایگزین‌های آرام‌تر (Darksynth / Synthwave)",
      tracks: [
        { artist: "Kavinsky", title: "Nightcall", note: "ثابت و شبانه" },
        { artist: "Perturbator", title: "Future Club", note: "ریتم ثابت" },
        { artist: "Carpenter Brut", title: "Turbo Killer", note: "پرانرژی ولی بدون کلام" },
        { artist: "GUNSHIP", title: "Tech Noir", note: "هکری و نئونی" },
        { artist: "Daft Punk", title: "Derezzed", note: "کوتاه و دیجیتال" },
      ],
    },
  ],
};

/** نام آهنگ را برای مقایسهٔ فایل محلی ساده می‌کند */
export const normalizeName = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();

/** آیا فایل محلی (نام فایل) همین آهنگ است؟ همهٔ کلمه‌های عنوان باید در نام فایل باشد. */
export function matchesTrack(fileName, track) {
  const hay = " " + normalizeName(fileName) + " ";
  const words = normalizeName(track.title).split(" ").filter((w) => w.length > 1 || /\d/.test(w));
  return words.length > 0 && words.every((w) => hay.includes(" " + w) || hay.includes(w)) && (hay.includes(normalizeName(track.artist).split(" ")[0]) || words.join("").length >= 8);
}

export const searchUrl = (track) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${track.artist} ${track.title}`);
