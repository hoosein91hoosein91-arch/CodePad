# CodePad 2.10.0 — Continuous Python

The current Android release is built from **CodePad-2.10.0-source.zip** attached to release **v2.10.0**. The verified source archive is stored in this repository as two ordered parts to fit browser upload limits. Root `src/` is the preserved older React source; it is **not** the 2.10 mobile build entry.

The complete release preserves the delivered 2.9 editor and launcher, Gemini agent, pip installation, APK and Windows export tools, and adds continuous streaming Python, an Android foreground runtime with a Stop notification, and static Nava model import. Module-worker startup in the Android runtime was fixed before publication.

Download the installable APK and full editable source from [release v2.10.0](https://github.com/hoosein91hoosein91-arch/CodePad/releases/tag/v2.10.0).

This debug APK uses `com.hoosein.codepad.continuous`, installs beside old CodePad builds, and does not automatically migrate their projects. Export/import a project or launcher backup to move your data. Physical-device behavior has not been tested.

To restore the complete source after cloning:

```sh
cat CodePad-2.10.0-source.zip.part1 CodePad-2.10.0-source.zip.part2 > CodePad-2.10.0-source.zip
sha256sum CodePad-2.10.0-source.zip
# f2c5855d2ce126b2235f1071049583bd5197b27e319101696a0936fae1c5a216
unzip CodePad-2.10.0-source.zip
cd CodePad-2.10.0
npm ci
npm run build:mobile
```

The release workflow verifies the hash, runs source/launcher/TypeScript and real Python browser tests, generates Android, builds the APK and verifies its signature/version before publishing. See the complete source README for supported model formats and background-execution limits.

---

## Legacy source history

# CodePad (جیب‌کد)

**2.5.1 / Fullscreen**: Android system bars appear temporarily on edge swipe. Launcher tools stay hidden until the top handle is tapped or dragged down, without resizing the running game.
**2.5.0 / Nava Studio 0.6**: Latin starter/completions, multiple instructions per line with `|`, frame animations, seven WebGL primitives, materials, fog, lighting, pinch/drag camera, and correct active-file installation in the launcher. Existing languages and legacy Nava remain supported.

An offline, multi-language coding workshop for phones. It runs Python (Pyodide), JavaScript, C/C++, the Jib teaching language (English and Farsi keywords), an 8-bit binary machine, HTML and CSS, plus **mix files** that combine several languages in one file and can render a live HTML/canvas page.

- **Writing code for CodePad (for AI assistants and humans): see [AI_GUIDE.md](AI_GUIDE.md).** It covers the languages, the mix-file format (`@@` blocks, `shared`), attachments (upload any file — images, CSV/JSON/text, binary, audio, fonts — and use it in code by its file name), `.jibpack` packs (code + images in one file; built-in sample «مار و سیب (با عکس)»), the launcher (run projects as apps), limitations and worked examples.
- **v2.0.0 — JibOS launcher:** neon-terminal theme with matrix rain, phone wallpapers (built-in or your own photo), per-app icon images, accent colours and layout options; **Connect Gemini** with your own API key (saved only on the device, stays connected); `window.jibos` for installed apps (sound, toast, persistent storage); an in-app **developer mode** (edit installed apps, launcher JSON/CSS/boot script, console) — this is not Android root; and offline security & cryptography samples (hashing, Base64/Hex, Caesar/Vigenère, XOR, password strength). Details and honest limits: [AI_GUIDE.md §2.11 and §4.5](AI_GUIDE.md).
- **v2.1.0 — terminal, private browser, multi-page home:** a Termux-style **console** that is a simulated POSIX shell over a virtual in-app filesystem (`ls`/`cd`/`cat`/`grep`/`echo >` + the crypto/security helpers), with an **educational simulated** `nmap`/port-scan and an optional hand-off to the real Termux app on Android; a built-in **private (incognito) browser** that keeps no history/cookies; a **multi-page, swipeable home screen** with add-page, per-page wallpaper, and **export/backup** of the launcher and all apps to one `.jibos` file; and two more educational net-security samples. Honest limits (no real IP hiding/VPN, no Chrome-PC extensions, no real device control/anti-hack, no real network scanning): [AI_GUIDE.md §2.12 and §4.5](AI_GUIDE.md).
- **v2.2.0 — Nava (نوا):** a tiny Persian-first language (`.nava`) that turns one short command per line into a full phone app: variables, lists, conditionals, loops, functions, timers, touch/keys, 2D canvas, lightweight WebGL 3D shapes, sound, persistent storage, attachments by file name, and `بپرس` (Gemini, with your own key and per-app permission). Persian, line-numbered errors; no `eval`. Five built-in samples (todo, clicker, snake, 3D, AI). Reference and honest limits (no AAA 3D, no on-device AI training): [NAVA-GUIDE.md](NAVA-GUIDE.md), [AI_GUIDE.md §2.13](AI_GUIDE.md).
- **v2.4.0 — Nava 0.5 (the owner's v2.3.0 Nava 0.4 work merged into the full app — launcher, JibOS, Gemini, terminal, browser and the whole v2.2.0 Nava language all kept):** every Nava keyword now has a 2–3-letter short form (`pg`, `bt`, `out`, `num`, …; a **«مخفف‌کردن کد»** button converts code, keeping all text), one-line ready-made components (`cal` calculator, `cnt` counter, `tm` timer, `vx` small voxel world with custom blocks `bl`), one-line button capsules `bt "شروع" (ru240rn64yGi65G72): sy "…"`, and reusable recipes `df "name"` … `end` / `us "name"` — all on top of the full v2.2.0 language. Machine-readable spec for AI: [NAVA-AI-SPEC.json](NAVA-AI-SPEC.json); standalone examples: `examples/nava/`. Details: [NAVA-GUIDE.md §5.5](NAVA-GUIDE.md), [AI_GUIDE.md §2.13.1](AI_GUIDE.md).
- Download the Android APK: https://github.com/hoosein91hoosein91-arch/CodePad/releases/download/v2.4.0/CodePad.apk (all versions: https://github.com/hoosein91hoosein91-arch/CodePad/releases/latest) (debug build: allow unknown sources, and uninstall the old version before installing a new one).
- Build: `npm install`, `npm run build:mobile`; the Android APK is built by `.github/workflows/android.yml`.


## ادغام با سورس قبلی لانچر — ۲۰۲۶/۱۰/۰۸

سورس ۲.۴.۰ با آخرین لانچر به‌روزشده ادغام شده است. نام صفحه‌ها، تنظیمات و پشتیبان‌های قبلی پشتیبانی می‌شوند؛ مخفف‌های نوا، اتصال Termux و خروجی ویرایشگر حفظ شده‌اند. هیچ مسیر ورودی حذف نشده است. نسخهٔ کامل و دست‌نخوردهٔ هر دو ZIP در `merge-originals/` قرار دارد. گزارش و محدودیت‌های آزمون را در [MERGE-REPORT.md](MERGE-REPORT.md) بخوانید. این بسته سورس است و APK ساخته‌شده ندارد.

آزمون‌های مرتبط: `npm run test:launcher`.
