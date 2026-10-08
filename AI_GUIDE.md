# CodePad (جیب‌کد) — Guide for AI assistants

This file is for an AI assistant (or a human) **writing programs that run inside the CodePad app**.
Everything here comes from the source on `main` (CodePad v2.1.0: **attachments** §2.8 since v1.7.0, **packs** §2.9 since v1.8.0, **launcher** §2.10 since v1.9.0, **JibOS launcher upgrade** §2.11 since v2.0.0, and **v2.1.0 additions** §2.12 — terminal shell over a virtual filesystem, private browser, multi-page home + export, net-security samples, Termux hand-off: `src/labshell/*`, `src/lib/termux-bridge.ts`, `src/components/launcher/*`) and from tests run in headless Chrome at phone size.
Attachments exist only in v1.7.0 and later. In older APKs (v1.6.0 and earlier), file names in code are not replaced, and nothing in §2.8 works. Packs (`.jibpack`, §2.9) and the built-in image snake sample need v1.8.0 or later. The launcher (§2.10) needs v1.9.0 or later. Everything in §2.11 (Gemini, `window.jibos`, developer mode, wallpapers, custom icons, security samples) needs v2.0.0 or later. Everything in §2.12 (terminal shell/virtual filesystem, private browser, multi-page home + export, simulated nmap/port-scan samples, Termux hand-off) needs v2.1.0 or later.
If the code changes, re-check the files listed in [§9 Where things live](#9-where-things-live).

> **The three rules that matter most**
> 1. In a mix file, **put an explicit `@@ <language>` line above every block.** Use only the names in [§3.2](#32-accepted-block-names-aliases). `@@ bin` is **not** one of them; use `@@ binary`.
> 2. A page (`.html`, or the HTML/CSS/JS blocks of a mix file) runs **offline, inside a sandbox**. Remote `<script src="https://…">`, `fetch`, `localStorage` and `eval` do not work there. Write everything inline.
> 3. Python reaches a page **only through the `shared` object** (JSON). Python cannot touch the DOM.
> 4. Images and other files the user uploads are **attachments** (§2.8). Refer to them by their exact, flat file name (`"photo.png"`, never `"images/photo.png"`). Never invent attachment names: ask the user for the names, or have the code list them (§2.8).

---

## 1. What CodePad is

- **CodePad / جیب‌کد** is an offline, multi-language coding workshop for phones. It is a React + Vite web app, packaged for Android with Capacitor (`appId com.hoosein.codepad`).
- The UI is in Persian (RTL). Here are the main controls:

  | Control | Label in the app |
  |---|---|
  | Run | **اجرا** (shows **توقف** "Stop" while running) |
  | Output tab | **خروجی** |
  | Page tab | **صفحه** (named **ماشین** for binary files) |
  | Input box (stdin) | **ورودی** |
  | Copy / clear | **کپی** / **پاک‌کردن** |
  | Fullscreen panel | **تمام‌صفحه‌کردن پنل** |
  | Save page as standalone HTML | **ذخیره به‌صورت صفحهٔ مستقل (HTML)** |
  | Open file | **باز کردن فایل** |
  | Attach image / file (menu → section **عکس‌ها و فایل‌های پیوست**) | **افزودن عکس یا فایل** |

- Work is organised into **projects** that contain **files**. A file's language comes from its extension.
- Code files and projects are saved in the device's `localStorage` (key `jibcode-en`). **Attachments** (images and other uploaded files, §2.8) are saved in IndexedDB, so they have no fixed size limit. There is no account and no cloud sync.
- Everything runs on the device. Python (Pyodide) is bundled with the app, so no network connection is needed to run code.
- Output is shown **when the program finishes**. It is not streamed line by line.

## 2. Languages

| Language | Internal id | File extension(s) | Engine | Input (stdin) | Time limit |
|---|---|---|---|---|---|
| Mix (several languages in one file) | `mix` | `.mix` (and any unknown extension, e.g. `.txt`) | per block, see §3 | per block | per block |
| Python | `python` | `.py` | Pyodide (CPython 3.14 compiled to WebAssembly) in a Web Worker | `input()` opens a popup; or pre-fill the **ورودی** box | 25 s |
| JavaScript (console) | `javascript` | `.js`, `.mjs` | Web Worker, `"use strict"`, **no DOM** | none | 2.5 s |
| C | `c` | `.c`, `.h` | JSCPP (a small C/C++ interpreter written in JS) | **ورودی** box only (`scanf`) | 2.5 s |
| C++ | `cpp` | `.cpp`, `.cc`, `.hpp` | JSCPP | **ورودی** box only (`cin`) | 2.5 s |
| Jib (English keywords) | `english` | `.jib` | compiled to JS, run in a worker | `read()` opens a popup; or pre-fill **ورودی** | 2.5 s |
| Jib Farsi (جیب فارسی) | `farsi` | `.fa` | same compiler, Persian keywords | `بخوان()` opens a popup; or pre-fill **ورودی** | 2.5 s |
| Binary machine (ماشین ۰ و ۱) | `binary` | `.bit` | 8-bit teaching machine | one number from **ورودی** | 300 steps |
| CSS | `css` | `.css` | live preview on a fixed demo card | – | – |
| HTML | `html` | `.html`, `.htm` | sandboxed iframe in the **صفحه** tab | – | – |

Opening files from outside: you can use the open-file button, Android "Share → CodePad", or "Open with". Nothing is rejected any more. The rules are:
- **Text files ≤ 1 MB** open as **code files**. Unknown extensions (e.g. `.txt`) open as **mix**, and auto-detection decides the language of each chunk.
- **Everything else becomes an attachment** (§2.8): images, audio, video, fonts, PDFs, archives, any binary file, and any text file **larger than 1 MB**. There is no size or type limit for attachments.
- To force a small text file (a `.csv`, a `.json`, even a `.py` used as data) to be an attachment instead of code, add it with **افزودن عکس یا فایل** in the menu.
- **A pack file (`.jibpack`, §2.9)** opens as a **new project**: its code becomes project files and its images/files become attachments (v1.8.0+).

### 2.1 Python (`.py`)
- This is real CPython, but **only the standard library**. Pyodide's extra packages (numpy, pandas, matplotlib…) are **not installed**, and `micropip` cannot fetch them offline. `import numpy` → `ModuleNotFoundError`.
- The first run takes a few seconds while Python boots. The app shows "پایتون در حال راه‌اندازی است…" ("Python is starting…").
- There is no GUI from Python: no `tkinter`, no `turtle` window, no DOM. For graphics, use a mix file. Python computes values, puts them in `shared`, and an HTML/JS block draws them (see §5.2).
- **Attachments are ordinary files in Python's working directory**: `open("data.csv", encoding="utf-8")`, `open("photo.png", "rb")`, `os.listdir(".")` (§2.8).
- `time.sleep()` in a loop does **not** animate anything, because output only appears when the run ends.
- `input()` and how re-running works are covered in §4.4.

### 2.2 JavaScript (`.js`)
- This is a console only. Your code runs inside `new Function(...)` in a Web Worker, so there is **no `document`/`window`**. If the code mentions them, the app warns: "این اجرا کنسول است نه صفحه…" ("this is a console, not a page…").
- `console.log/info` → output. `console.warn/error` → error lines. If the code body returns a value, it is printed.
- **Only synchronous output is kept.** Logs from `setTimeout`, promises or `async` callbacks are lost, because the worker reports as soon as the synchronous code ends. Top-level `await` is not allowed.
- For anything visual, use an `.html` file or a mix file with an `@@ html` block.

### 2.3 C / C++ (`.c`, `.cpp`)
- JSCPP interprets a **subset** of C/C++. Plain C (`stdio.h`, `printf`, `scanf`, functions, arrays, loops) and simple C++ (`iostream`, `cin`, `cout`, `using namespace std`) work, as in the built-in samples.
- Advanced C++ may fail with "This text is not supported by the pocket interpreter". Examples: STL containers, templates, heavy class use. Keep programs small and old-school.
- There is no interactive prompt: `scanf`/`cin` read only from the **ورودی** box. Check the return value of `scanf` and fall back to a default, as the sample does.

### 2.4 Jib / Jib Farsi (`.jib`, `.fa`)
CodePad's own teaching language. It has the same grammar in two scripts:

| English | Farsi | Meaning |
|---|---|---|
| `let x = 1` | `متغیر x = 1` | declare (required before first use) |
| `if … { } else if … { } else { }` | `اگر … { } وگرنه اگر … { } وگرنه { }` | condition |
| `for i from 1 to 10 { }` | `برای i از 1 تا 10 { }` | counting loop (inclusive) |
| `while cond { }` | `تا cond { }` | while loop |
| `break` / `continue` | `بشکن` / `ادامه` | loop control |
| `fn name(a, b) { return a + b }` | `تابع name(a, b) { برگردان a + b }` | function |
| `print(a, b)` | `چاپ(a, b)` | print (values joined by a space) |
| `read()` | `بخوان()` | read one input line (numbers become numbers) |
| `and` `or` `not` | `و` `یا` `نه` | logic |
| `true` `false` `null` | `درست` `نادرست` `هیچ` | literals |
| `eq` `neq` `gt` `lt` `gte` `lte` | `برابر` `نابرابر` `بزرگتر` `کوچکتر` `دستکم` `حداکثر` | comparisons |
| `[1, 2]`, `xs[i]`, `len(xs)`, `push(xs, v)` | same (`len`/`push` are written in English in both) | lists |
| `machine { 0001 0011 … }` | `ماشین { … }` | run an embedded binary program; returns register A |
| `page { title: … text: … }` | `صفحه { عنوان: … متن: … }` | styles the result card in the **صفحه** tab |

Other details:
- Comments start with `#`.
- Persian digits (۰–۹) are accepted.
- Page keys:
  - English: `title text mark background color accent size radius padding font`
  - Farsi: `عنوان متن نشان پس‌زمینه رنگ تاکید اندازه گردی حاشیه قلم`

### 2.5 Binary machine (`.bit`)
- Each instruction is **exactly 8 bits**: 4-bit opcode + 4-bit operand (0–15). Spaces are ignored and `#` starts a comment.
- There is one register, A (8-bit, wraps at 256).
- `jump n` goes to **instruction number n** (counted from 0, comments and blank lines not counted), not to a file line.

| Bits | Name | Effect |
|---|---|---|
| `0001 n` | load | A = n |
| `0010 n` | add | A = (A + n) mod 256 |
| `0011 n` | sub | A = (A − n) mod 256 |
| `0101 0000` | print | prints `A = bits`, e.g. `3 = 00000011` |
| `0110 n` | skip if equal | if A == n, skip the next instruction |
| `0111 n` | skip if smaller | if A < n, skip the next instruction |
| `1000 n` | jump | go to instruction n |
| `1001 0000` | read | A = the number in **ورودی** (empty = 0; decimal or bits) |
| `1010 n` | and | A = A AND n |
| `1111 0000` | halt | stop |

- More than 300 steps → "The loop did not stop".
- The **ماشین** tab shows 8 lamps for the bits of A, plus PC, step count and the last instruction.

### 2.6 CSS (`.css`)
The preview is a fixed demo card, not your own HTML. Its classes are:
- `.card` (with `.top`, `.mark`, `.brand` inside)
- `h1`, `.lead`
- `.langs` / `.out` lists, `.foot`

To style your own markup, use an `.html` file. Either put the CSS inline, or link it with `<link rel="stylesheet" href="style.css">`; that works when `style.css` is a file in the **same project** (see §2.7).

### 2.7 HTML (`.html`)
- The page renders live in the **صفحه** tab. It rebuilds about 0.4 s after each edit, and **اجرا** reloads it.
- `console.log/warn/error` and uncaught errors from the page show up in the output panel.
- `<link href="x.css">` and `<script src="x.js"></script>` that point to **files in the same project** (matched by file name) are inlined automatically. References to anything else stay as they are and are blocked by the sandbox (§4.2).
- **ذخیره به‌صورت صفحهٔ مستقل (HTML)** downloads the page as a standalone file, without the sandbox CSP. CDN scripts work in that exported file when it is opened in a normal browser, but not inside CodePad.

### 2.8 Attachments (images and files)
The user can upload **any file** into the active project: images, CSV/JSON/text data, audio, video, fonts, PDFs. There is **no size limit and no type limit**. Files are stored on the device (IndexedDB), per project.

**How the user adds them**
- Menu (☰) → section **عکس‌ها و فایل‌های پیوست** → **افزودن عکس یا فایل**. Several files at once.
- The open-file button, Android "Share → CodePad" and "Open with" send images, binary files and text files > 1 MB there automatically (§2).
- The same menu section lists them (with a thumbnail for images), deletes them (trash button), and inserts a file's name into the code when its row is tapped.
- Terminal commands: `ls` lists attachments after the code files, `rm <name>` deletes one.
- Uploading a file with a name that already exists **replaces** it (so references in code keep working). Deleting a project deletes its attachments.

**Naming rules for code you write**
- A name is the plain file name, case-sensitive, with its extension: `photo.png`, `data.csv`, `my song.mp3`. There are **no folders**: write `"photo.png"`, not `"images/photo.png"` or `"./assets/photo.png"`.
- You cannot know which files the user has. **Ask for the names**, or write code that adapts (`os.listdir(".")` in Python lists them).

**Any file type works, like adding files to a project in PyCharm.** CodePad does not care about the extension: it stores the bytes and uses the plain file name. Unknown extensions (`.xyz`, `.dat`, no extension) work too; they are typed `application/octet-stream`. This was tested with `.png`, `.csv`, `.json`, `.txt` with a Persian name and a space, `.bin`, and `.xyz`.

| Kind of file | In a page (HTML / CSS / page JS) | In Python |
|---|---|---|
| Image (`png jpg gif webp svg avif bmp ico`…) | `<img src="photo.png">`, `url(photo.png)` in CSS, `new Image(); img.src = "photo.png"` → canvas `drawImage` | `open("photo.png", "rb").read()` (raw bytes; no decoder, no Pillow) |
| Text / data (`csv json txt md xml tsv yaml` …, any text) | `assetText("data.csv")` → string; `JSON.parse(assetText("info.json"))` | `open("data.csv", encoding="utf-8")`, `csv`, `json.load(open("info.json"))` |
| Binary (`bin dat zip db pdf` …, any extension) | `assetBytes("model.bin")` → `Uint8Array` | `open("model.bin", "rb").read()`; `zipfile` and `struct` from the standard library |
| Audio / video (`mp3 wav ogg m4a mp4 webm mov`) | `<audio controls src="song.mp3">`, `<video controls src="clip.mp4">`, `new Audio("beep.wav")` | bytes only |
| Font (`woff2 woff ttf otf`) | `@font-face { src: url("my-font.woff2"); }` | bytes only |

**Using them in a page (`.html`, or the HTML/CSS/JS blocks of a mix file)**
- Write the name wherever a URL goes. CodePad replaces it with the file itself (a `data:` URL) before the page runs:
  ```html
  <img src="photo.png">
  <audio controls src="song.mp3"></audio>
  <video controls src="clip.mp4"></video>
  <style>
    body { background: url(photo.png) center / cover; }
    @font-face { font-family: Mine; src: url("my-font.woff2"); }
  </style>
  <script>
    const img = new Image(); img.src = "photo.png";           // also works for canvas drawImage
    const text  = assetText("data.csv");                        // the file's text (UTF-8)
    const bytes = assetBytes("data.bin");                       // a Uint8Array
  </script>
  ```
- The replacement only happens when the name is **the whole string**: inside quotes (`"photo.png"`, `'photo.png'`, also `"./photo.png"`) or inside `url(photo.png)`. Backtick strings (`` `photo.png` ``) are **not** replaced, so use normal quotes. A name built at run time (`"photo" + n + ".png"`), or one hidden inside a longer string (`"images/photo.png"`), is **not** replaced. Write each name out in full, or keep a literal list (`const pics = ["a.png", "b.png"]`).
- `assetText(...)` and `assetBytes(...)` take that same literal string (which has already become a `data:` URL). Use them, not `fetch`, to read a file's contents: `fetch` is blocked in pages (§4.2).
- The replacement also applies to the `shared` object in a mix file: if Python puts `shared["pic"] = "photo.png"`, the page receives `shared.pic` as the image's `data:` URL.
- Only attachments whose name appears in the page's HTML/CSS/JS (or in `shared`) are embedded. Linked `style.css` / `script.js` files from the same project count too.
- **ذخیره به‌صورت صفحهٔ مستقل (HTML)** embeds the files in the exported page, so it works offline in any browser.
- Very large files (tens of MB, e.g. video) make the page slow to build. Prefer small images and short clips when you have a choice.

**Using them in Python (`.py`, or `@@ python` blocks)**
- Every attachment of the active project is a file in Python's working directory:
  ```python
  import csv
  rows = list(csv.DictReader(open("data.csv", encoding="utf-8")))
  size = len(open("photo.png", "rb").read())
  print(len(rows), "rows,", size, "bytes")
  ```
- Names with spaces or Persian letters work (`open("داده ها.csv")`).
- Python **cannot** see the project's code files this way (only attachments), and anything it writes is lost when the app restarts. To show an image from Python, put its **name** in `shared` and draw it in a page block (§5.4).
- There is no standard-library image decoder, so Python can read the bytes (`rb`) but not decode a PNG/JPEG into pixels (no Pillow). Let the page decode and draw images.

**Not available**
- JavaScript console files (`.js`), C/C++, Jib, Jib Farsi and the binary machine **cannot read attachments**. To use an attachment from JavaScript, put the code in an HTML page or an `@@ js` block that mentions `document` (§3.5).
- A plain `.css` file previews on a fixed demo card; to see a background image, use an HTML page.


### 2.9 Packs (`.jibpack`): code and images in one light file
A pack is **one text file** that carries code files and attachments together. When the user opens it (open-file button, Share → CodePad, Open with), CodePad creates a **new project** named after the pack, puts the code files in it, stores the images and files as attachments of that project, and says so in the output panel. The user then only presses **اجرا**. Use a pack whenever you hand the user a program that needs images or data files: one file to download instead of several uploads.

Format (plain text, UTF-8):
```
@@@ jibpack 1 My project name
@@@ file snake.mix
...the code of snake.mix, exactly as in the app...
@@@ file helper.py
...more code...
@@@ asset apple.png
iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAA...
...base64, may be split over many lines...
```
- The first non-empty line is `@@@ jibpack <version> <project name>` (the version is `1`; the name is optional).
- `@@@ file NAME` starts a code file: everything up to the next `@@@` line is its content. The file's language comes from its extension (§2). The **first file** is the one that opens.
- `@@@ asset NAME` starts an attachment: the following lines are its **base64** (whitespace and line breaks are ignored). Any file type works; there is no size limit, but a pack is text, so it grows by about a third: keep images small (e.g. 64×64 sprites, a few KB each).
- A line that starts with `@@@` is reserved by the format. Do not write one inside code.
- Names are flat (no folders), like attachments (§2.8). If the user already has a project open, the pack never touches it: it always creates a new project, so file names cannot collide.
- A pack whose base64 is damaged still opens; the broken assets are listed as errors in the output panel.
- Pack files use the extension `.jibpack`. A file with another extension (other than image/media/archive extensions) is also treated as a pack if its first non-empty line is `@@@ jibpack`.

How to produce one:
- With the helper script (Node): put the code files and images in a folder, then run `node scripts/make-pack.mjs <folder> "Project name" > game.jibpack`. Code files (`mix fa jib bit py js mjs c h cpp cc hpp css html htm`) become `@@@ file` sections and every other file becomes an `@@@ asset`.
- By hand: write the `@@@ file` sections as text and paste each image as base64 (`base64 -w 76 image.png`).
- Always check the result: the first line is the header, and every image header is `@@@ asset name.ext`.

**Built-in example (v1.8.0+):** menu (☰) → **پروژهٔ تازه** → **مار و سیب (با عکس)** opens the snake-and-apple game as a pack. You get a new project «مار و سیب» with `snake.mix` and four 64×64 sprite attachments (`apple.png`, `head.png`, `body.png`, `grass.png`). Press **اجرا** and the game draws with the images. It works offline, and the images can be replaced by uploading files with the same names.
- How it works: Python puts the image **names** in `shared["images"]`, and the page JS loads them with `new Image()`. CodePad replaces the names with the images themselves (§2.8). If an image is missing, the game falls back to plain shapes.
- The pack file itself is in the repository at `src/labshell/packs/snake-images.jibpack` (about 27 KB). Use it as a template for your own packs.


### 2.10 Launcher (v1.9.0+): run projects as apps
The launcher is a home screen at `/launcher`. It shows a clock, a grid of installed apps and a **+** button.
- **Installing:**
  - From the editor: toolbar button **لانچر** (four squares) → **نصب پروژهٔ فعال در لانچر**. This copies the active project's code files and attachments into an app. Installing again with the same project name **updates** that app.
  - From the launcher: **+** (**افزودن برنامه**) → a built-in sample, a quick single-file HTML app, a `.jibpack` file (§2.9), or a download URL. The download only works if the site allows cross-origin requests; otherwise download the file and pick it.
- **Running:** tap an icon. The app runs fullscreen with the normal CodePad engine, and the back button in its header (or the Android back button) returns home. Since v2.0.0, **ویرایش** (or a long press on an icon) opens the app's personalization sheet (icon image, emoji, colour, name, delete) — see §2.11.
- **Which file runs (the entry file):**
  1. a file named `main.*`
  2. otherwise the first `.mix`
  3. otherwise the first `.html`
  4. otherwise the first non-CSS file

  To control this, name the entry file `main.mix` / `main.html` / `main.py`.
- **What the user sees:**
  - A page (HTML, or a mix file with `@@ html`) fills the screen.
  - A Jib program with `page { }` shows its card, with the printed lines on it.
  - Anything else shows its text output.
  - There is no output panel, so a page's `console.log` is not visible in the launcher.
- **Data:** app code is stored in `localStorage` (key `jibcode-launcher`). App attachments live in IndexedDB, separate from the editor project, so editing the project later does not change the installed app until you install it again.
- **Sandbox:** pages run in the same sandboxed iframe as in the editor, but without the editor's CSP. Still write offline, self-contained code (§4.2) so the app also works in the editor.

### 2.11 JibOS launcher upgrade (v2.0.0+): theme, personalization, Gemini, `window.jibos`, developer mode
The launcher (§2.10) became **JibOS**, a phone-style home screen. Everything below runs inside the app's Android WebView; nothing touches the Android system itself.

**Look and personalization** (dock → **ظاهر**; all saved on the device in `localStorage`, key `jibcode-launcher-preferences`)
- Default theme **ترمینال نئون (ماتریکس)**: near-black background, neon-green accent, glowing monospace clock, a light "matrix rain" canvas (throttled to ~18 fps, paused while an app or the console is open, a still frame when the system asks for reduced motion), optional CRT scanlines and a neon grid.
- Theme presets: ترمینال نئون، نئون آرام، سایبرپانک، ترمینال کهربایی، اقیانوس. Each one sets wallpaper + accent + effects; every setting can still be changed one by one.
- **Wallpaper:** 8 built-in gradients, or **any photo from the phone** (it is resized to max 1400 px and stored as a JPEG `data:` URL). If `localStorage` is full, a message asks for a smaller image.
- **Accent colour:** 8 presets or any colour (colour picker). Columns (3–6), icon size, icon roundness, glass cards, labels under icons, console button in the dock, and the host name shown in the console.
- **Per-app icons:** tap **ویرایش** (or long-press an icon) → pick an **image** for the icon (resized to 256 px), or an emoji/symbol, a background colour and a new name. Re-installing an app with the same name keeps its custom icon.
- Status bar with clock, battery level (when the WebView exposes the Battery API) and a **DEV** badge when developer mode is on; search box; empty-state card; open/close animations; toasts.

**Built-in sample apps** (+ → **نمونه‌های آماده**; also in the editor menu under **پروژهٔ تازه**) — all offline:
| Sample | Type | What it teaches |
|---|---|---|
| امنیت: آزمایشگاه هش | `main.py` | md5 / sha1 / sha256 / sha512, avalanche effect, PBKDF2-SHA256 with salt (hand-written with `hmac`, checked against the RFC test vector), HMAC |
| امنیت: Base64 و Hex | `main.py` | base64, URL-safe base64, hex, binascii, URL percent-encoding, bits — and why encoding is not encryption |
| امنیت: رمز سزار و ویژنر | `main.py` | Caesar and Vigenère ciphers, trying all 25 Caesar keys, frequency analysis |
| امنیت: رمز XOR | `main.py` | XOR cipher, known-plaintext key recovery, why key reuse breaks it, one-time pad |
| امنیت: سنجش قدرت رمز عبور | `index.html` | entropy estimate, time-to-guess, common-password list, secure generator with `crypto.getRandomValues` |
| پیانوی نئون (صدا) | `index.html` | Web Audio tones/melody, playing an attached `sound.mp3`, saving a score with `jibos.storage` |
| مار و سیب (با عکس) | `snake.mix` + 4 PNGs | the image snake game (§2.9) |

Pyodide in CodePad has **no OpenSSL**: `hashlib.md5/sha1/sha256/sha512/blake2`, `hmac` and `secrets` work, but `hashlib.pbkdf2_hmac`, `hashlib.scrypt` and `ssl` do **not** (the hash sample shows how to build PBKDF2 from `hmac`). Anything that needs real network or OS access — port scanning, packet capture, Wi-Fi tools, reading other apps — is **out of scope**: an Android app's WebView cannot do it.

**Connect Gemini** (dock → **Gemini**, or **ظاهر** → **اتصال Gemini**)
- The user pastes **their own** Google Gemini API key once (from Google AI Studio) and taps **ذخیرهٔ اتصال**. The key is stored only in this device's `localStorage` (`jibcode-gemini-key`, model in `jibcode-gemini-model`) and survives app restarts, so it "stays connected" until **قطع اتصال**. No key is in the source code or the repo. The key is not encrypted on the device; only its last 4 characters are shown.
- Calls go straight from the phone to the official REST endpoint `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` with header `x-goog-api-key` (never in the URL). Default model `gemini-3.8-flash`; also selectable: `gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`. CORS from the app's `https://localhost` origin is allowed by Google.
- **پرسیدن** = ask a question / generate code. **ساخت برنامه** = Gemini writes one self-contained HTML file which is installed as a launcher app. In developer mode the code editor of an installed app also has a **Gemini** button that rewrites the current file (you review and save).
- Errors are explained in Persian: missing key, invalid key (400), denied (403), quota (429), no internet.
- **Limits:** needs internet and a valid key; usage/billing is on the user's Google account. Gemini only acts when the user presses a button — there is no background agent that does things on its own.

**`window.jibos` — API for apps installed in the launcher** (HTML pages and mix pages run in the launcher; not in the editor's **صفحه** tab, so always check `if (window.jibos)`)
| Call | Needs developer mode | What it does |
|---|---|---|
| `jibos.beep(freq, ms, type, vol)` → Promise | no | a tone with Web Audio, inside the app's own frame |
| `jibos.melody([freqs], ms, type)` | no | plays notes one after another (`0` = rest) |
| `jibos.play(src)` | no | `new Audio(src).play()` — e.g. an attachment `"sound.mp3"` |
| `jibos.toast(text)` | no | shows a toast on the launcher |
| `jibos.info()` | no | `{app, version, devMode, theme, online}` |
| `jibos.storage.get(k)` / `.set(k, v)` / `.remove(k)` / `.keys()` | no | **persistent per-app storage** (JSON, max 200 000 characters per app, removed on uninstall). Use this instead of `localStorage`, which does not work in the sandboxed frame |
| `jibos.vibrate(ms or pattern)` | no | `navigator.vibrate` on the launcher; returns `false` when the WebView does not allow it (often on Android without the VIBRATE permission) |
| `jibos.speak(text, lang)` | no | `speechSynthesis`; returns `false` where the WebView has no speech synthesis (common on Android) |
| `jibos.clipboard(text)` | **yes** | copy text |
| `jibos.apps()` / `jibos.launch(name)` | **yes** | list / open installed apps |
| `jibos.setWallpaper(gradient or data:image…)` / `jibos.setAccent("#00ff9c")` | **yes** | change the launcher look |

All calls except `beep/melody/play` are async and go through `postMessage` with a random per-window token; the launcher answers only its own frame. A developer-mode call made while developer mode is off rejects with an error.
Audio: Web Audio and `<audio>` work inside installed apps after a tap (autoplay rules). Background audio after leaving the app, microphone, camera, Bluetooth, notifications and widgets are **not** available.

**Developer mode** (**ظاهر** → **حالت توسعه‌دهنده**, or tap **JibOS 2.1.0** seven times, or `dev on` in the console)
- This is **in-app** control only. It is **not** Android root and cannot root the phone; no normal app can.
- Unlocks: editing any installed app's files (and adding files) from the launcher; a launcher configuration editor (JSON); custom CSS for the launcher; a JavaScript **boot script** that runs when the launcher opens with an `api` object (`apps()`, `launch(name)`, `prefs()`, `setPrefs({…})`, `toast(msg)`, `beep(hz, ms)`, `install(name, html)`, `uninstall(name)`, `gemini(prompt)`); the list of all apps with export to `.jibpack`, copy and delete; full JSON backup/restore (attachments are not in the JSON — export a `.jibpack` for those); reset; the developer-only `window.jibos` calls; and the console's `js` command.
- Escape hatch: open `/launcher?safe=1` to skip custom CSS and the boot script.

**Console** (dock → **کنسول**): since v2.1.0 this is a **simulated POSIX shell over a virtual in-app filesystem** plus the crypto/security helpers and an optional Termux hand-off — see §2.12. It still runs **no** native binary itself.

### 2.12 v2.1.0 additions: terminal shell, private browser, multi-page home, net-security samples
All of this runs inside the app's Android WebView. Honest limits are spelled out below and in §4.5.

**Terminal / Termux-style console** (dock → **کنسول**) — now a **simulated POSIX shell over a virtual, in-app filesystem** (`src/labshell/vfs.ts`):
- Navigation & files: `pwd`, `cd <path>`, `ls [path]`, `tree`, `cat`, `head [n]`, `grep <pattern> <file>`, `wc`, `touch`, `mkdir`, `rm`, and `echo text > file` / `>> file`.
- The virtual tree has `/apps/<AppName>/<files>` (installed launcher apps + their attachments, **read-only**) and `/home/user` (a **writable scratch** area that lives only for the session and is cleared on close). It is **not** the Android filesystem.
- Still present: `apps`, `open <app>`, `theme`, `accent`, `matrix`, `hash/b64/unb64/hex/unhex/xor/rot13/caesar`, `entropy`, `passgen`, `net`, `neofetch`, `whoami`, `dev on|off`, `date`, `beep`, `gemini <q>`, `js <expr>` (dev mode), `browser [url]`.
- `nmap <host>` / `scan <host>`: an **educational, simulated** port scan over deterministic mock data (`src/labshell/netsim.ts`). It is clearly labelled; **no packet is ever sent and no socket is opened** — a WebView has no raw TCP/UDP.
- `termux <command>`: an **optional hand-off** to the **real Termux app** (`src/lib/termux-bridge.ts`, native `TermuxBridgePlugin`). It only works in the installed Android build, when Termux is installed and the user has granted `com.termux.permission.RUN_COMMAND`, and only after the user types the command. On the web/preview it errors out. This is CodePad asking another app to run a command; CodePad itself still runs no native binaries. `nmap` through this bridge is restricted on the native side to private-range `nmap -sn` discovery and `pkg install nmap`.

**Private / secure browser** (dock → **مرورگر**, or `browser` in the console) — `src/components/launcher/browser.tsx`:
- An in-app **incognito tab**: a sandboxed `<iframe>` with `referrerPolicy="no-referrer"`; it keeps no history and clears when closed.
- Honest, shown-in-app limits (also §4.5): it **cannot hide your real IP** (that needs a real VPN/Tor), it **cannot run Chrome-PC extensions** (the Android WebView engine has no extension support), and it **does not pretend to be a PC**. Many sites refuse to load in an iframe (`X-Frame-Options`); when that happens there is an **“open externally”** button that opens the page in the system browser / Tor Browser (via the Termux bridge’s `openExternal`/`openTorBrowser` on native, or `window.open` on web).

**Multi-page, phone-like home** — `src/routes/launcher.tsx`, `src/labshell/launcher-prefs.ts`:
- **Multiple home pages** with real horizontal **swipe/paging** (CSS scroll-snap) and page **dots**. **ویرایش** mode shows an **add-page** button (`+`, up to 8 pages) and a **per-page wallpaper** button; without a per-page image a page uses the global wallpaper.
- Apps are assigned to a page in their personalization sheet (**صفحهٔ خانه**). `prefs.pages` and `prefs.pageWallpapers` are stored on the device like the rest of the prefs; `app.page` is stored with each app.
- **Export / backup**: **ظاهر → خروجی پشتیبان** writes a single `.jibos` JSON file with the prefs and **every app including its attachments** (base64). **بازگردانی** reinstalls everything from such a file (`exportBackup` / `importBackup` in `src/labshell/launcher.ts`).

**New educational security samples** (+ → **نمونه‌های آماده**):
| Sample | Type | What it teaches |
|---|---|---|
| امنیت: اسکن پورت (nmap، آموزشی) | `main.py` | what a port scan is (open/closed/filtered, SYN/connect/host-discovery), plus an **offline simulation** over mock data — no real traffic |
| امنیت: دمو اسکن پورت (تعاملی) | `index.html` | an interactive **simulated** scan with a progress bar over deterministic mock data |

---

## 3. Mix files (`.mix`) — full format

A mix file contains blocks in different languages. **Blocks run top to bottom, one after another.** Then the HTML/CSS/page-JS blocks are combined into one page (§3.5).

### 3.1 Block headers
```
@@ python
print("hello")

@@ c
#include <stdio.h>
int main() { printf("hi\n"); return 0; }
```
- A header is any line matching `^\s*@@\s*NAME` (optionally `: code`).
  - `NAME` is case-insensitive.
  - A space inside the name is treated as `_`.
- **A named block runs until the next `@@` line.** Blank lines do *not* end a named block, and nothing inside it is re-detected.
- One-line form: `@@ python: print(1)` makes a block containing just `print(1)`. The next line starts fresh.
- Lines starting with `#` before the first block are ignored. That is useful for a file header comment.
- Any other text before the first `@@` becomes an auto-detected block (§3.3).
- **Unknown names** (e.g. `@@ bin`, `@@ golang`) do **not** raise an error. The block silently falls back to **auto-detection**: the output title shows "· تشخیص خودکار" ("auto-detected") and the content may be split and guessed wrongly.

### 3.2 Accepted block names (aliases)
Copied from `ALIASES` in `src/labshell/mix.ts`:

| Kind | Accepted names after `@@` |
|---|---|
| python | `py`, `python`, `پایتون` |
| javascript | `js`, `javascript`, `جاوااسکریپت`, `جاوا_اسکریپت` (or `جاوا اسکریپت`), `جاوا` |
| jib (English Jib) | `jib`, `جیب` |
| farsi (Jib Farsi) | `fa`, `farsi`, `فارسی` |
| c | `c`, `سی` |
| cpp | `cpp`, `c++`, `سی‌پلاس`, `سی_پلاس`, `سی‌پلاس‌پلاس` |
| binary | `bit`, `binary`, `machine`, `ماشین`, `صفرویک`, `صفر_و_یک` (or `صفر و یک`) |
| css | `css`, `سی‌اس‌اس`, `استایل` |
| html | `html`, `htm`, `اچ‌تی‌ام‌ال`, `وب`, `صفحه‌وب`, `اچ_تی_ام_ال` |

**Not accepted** (these fall back to auto-detection): `bin`, `shell`, `bash`, `ts`, `typescript`, `jsx`, `java`, `py3`, `python3`, `node`, `scss`, and anything else not in the table.
Persian names containing a ZWNJ (‌) must be typed with the ZWNJ. Prefer the ASCII names.

### 3.3 Auto-detection (no `@@`, or an unknown name)
Auto-detection is convenient but fragile. **AI assistants should always write explicit headers.** For reference, here is how it works:

1. **Splitting into chunks.** The text is split into chunks at blank lines, but only where:
   - bracket depth `{([` is 0,
   - HTML tags are balanced (for chunks starting with `<`), and
   - the next line is not indented and does not start with `else|elif|except|finally|catch`.
2. **Classifying each chunk.** Each chunk is classified by `classify()`. Lines that start with `#` or `//` are ignored for this. The first rule that matches wins:
   1. only `0`, `1` and whitespace → **binary**
   2. starts with `<tag` / `<!doctype`, or contains `</div|body|html|p|span|section|script|style|canvas|button>` → **html**
   3. a `#include` line → **c**, or **cpp** if it contains `iostream`, `std::`, `cout`, `class` or `using namespace`
   4. a line like `int|void|float|double|char name(...) {` → **c**, or **cpp** if it has `std::`, `cout` or `cin`
   5. `@media`, `@keyframes`, `@font-face`, `:root {` → **css**
   6. `selector { prop: value;` with no `let|fn|function|const|var` and not a Jib `page {` → **css**
   7. a line starting with `def `, `class `, `import `, `from X import`, `elif`, or `if/for/while/else/try/except/with …:` → **python**
   8. any Persian letter **outside** `"…"` / `'…'` strings → **farsi** (Jib Farsi)
   9. `fn`, `for x from`, `page {` → **jib**
   10. `const`, `var`, `function`, `console.`, `document.`, `window.`, `=>`, `new X(`, or `let x = …;` → **javascript**
   11. otherwise → **weak** guess (jib)
3. **Merging.** A weak chunk is glued onto the previous block, and consecutive chunks of the same kind are merged.

Known pitfalls of auto-detection:
- Simple Python with no `def`/`if`/`for`/`import` line (e.g. `x = 1` / `print(x)`) is classified as **Jib**, not Python.
- A JS chunk with a Persian comment or Persian text inside a template literal (`` `…` ``) is classified as **farsi**.
- A JS chunk containing a string like `"</div>"` is classified as **html**.
- With `@@ bin` + pure 0/1 lines, auto-detection happens to pick binary. But if any other code follows after a blank line, it is glued on and the block fails.

### 3.4 `shared` — passing data between blocks and to the page
- **Python block**: a dict named `shared` exists before your code runs. After the block, it is serialised with `json.dumps(shared, default=str)` and passed on.
- **JavaScript block (worker)**: `const shared = {...}` exists. You can mutate it (`shared.x = 1`), but you cannot reassign it. After the block, it is serialised with `JSON.stringify`.
- Each Python/JS block **replaces** `shared` with its final value. Later blocks see the accumulated object.
- **C, C++, Jib, Jib Farsi and binary blocks cannot read or write `shared`.** They only print.
- Values must be JSON-compatible: numbers, strings, booleans, null, lists, dicts. Python sets, objects and dates turn into strings via `default=str`.
- After all blocks have run, the final `shared` is printed in the output under `── داده مشترک ──` ("shared data").
- **To the page:** if the file has at least one `@@ html` block, the final `shared` is injected as `<script>window.shared = {...}</script>`. It goes at the very start of `<head>`, so both inline `<script>` tags inside the HTML block and the page JS block can read `shared.foo` / `window.shared.foo`.
- The page **cannot send data back** to Python. Page scripts run after all blocks have finished.
- Every block reads the same **ورودی** text from its first line. Answers typed into an `input()` popup only apply to that one block.
- If a block fails (error output), the run **stops at that block**. The page, if any, is still built with the `shared` collected so far.

### 3.5 How HTML, CSS and JS blocks become the page (**صفحه** tab)
When the file contains **at least one `@@ html` block**:

| Block | What happens |
|---|---|
| `@@ html` | its content is appended to the page body. Several html blocks are concatenated in order. |
| `@@ css` | collected into one `<style>` in `<head>` |
| `@@ js` | goes **into the page** only if the code contains one of these words: `document`, `window`, `canvas`, `getElementById`, `querySelector`, `addEventListener`, `requestAnimationFrame`, `localStorage`. All such blocks are concatenated into **one** `<script>` placed just before `</body>`. |
| `@@ js` without those words | runs in the **worker** (no DOM) instead, and can change `shared` |
| python / c / jib / binary | run normally; their output goes to the output panel |

Additional rules:
- If the HTML block is just a fragment, CodePad wraps it in `<!doctype html><html lang="fa" dir="rtl">` with UTF-8 and a mobile viewport. If it is a full `<html>` document, CodePad injects `<style>` before `</head>` and the script before `</body>`.
- After the run, the app switches to the **صفحه** tab. The page's `console.*` output and errors appear in the output panel.
- With **no** html block, an `@@ css` block styles the Jib `page { }` result card instead, and DOM JS blocks run in the worker and fail.
- Tip: make sure every page-JS block mentions `document` (or `window` or `canvas`), otherwise it will not run in the page.

---

## 4. Limitations and things that do NOT work

### 4.1 Mix-file format
- `@@ bin` is **not** a valid name. Use `@@ binary` (or `@@ bit`, `@@ machine`). Other unknown names (`@@ ts`, `@@ bash`…) also fall back to auto-detection.
- **A block runs until the next `@@` line.** HTML written under an `@@ css` block without its own `@@ html` line is treated as CSS and is never rendered, and the same goes for any language. Give every block its own header.
- A line starting with `@@` anywhere in the file is always a header, even inside a string or code.
- Python and JS share data only via `shared` (JSON). C, C++, Jib and binary blocks cannot use it.

### 4.2 Pages (HTML files and mix pages) run in a sandbox
The iframe has `sandbox="allow-scripts allow-modals allow-forms"` (no `allow-same-origin`) and this CSP:
```
default-src 'none'; img-src data: blob: https:; media-src data: blob: https:;
font-src data: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline'
```
Consequences (the first three were checked in headless Chrome):
- **Remote/CDN `<script src="https://…">` is blocked.** jQuery, Three.js, p5.js, confetti etc. from a CDN do not load. Inline the library code or write it yourself.
- **`fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` are blocked.** There is no network access from the page. Uploaded files (§2.8) are the exception only in the sense that CodePad embeds them: use `<img src="photo.png">` or `assetText("data.csv")`, not `fetch("data.csv")`.
- **`localStorage`, `sessionStorage`, cookies and IndexedDB throw `SecurityError`.** Nothing persists between runs. Wrap any use in `try/catch`, or don't use it.
- `eval()`, `new Function()`, `setTimeout("string")`, `<script src="blob:…">` and Web Workers from blob URLs are blocked, because the CSP has no `'unsafe-eval'` and no `blob:` for scripts.
- `window.open`, popups and navigating the top window are not allowed.
- **Allowed:**
  - inline `<script>` and inline `on…=""` handlers
  - `<canvas>` 2D/WebGL
  - `setInterval`, `requestAnimationFrame`
  - pointer/touch/keyboard events
  - `alert`/`confirm`/`prompt`, forms
  - **remote images, media, fonts and stylesheets over https** (e.g. Google Fonts CSS), when the phone is online
  - `data:` and `blob:` images
  - the user's attachments, embedded as `data:` URLs (§2.8): images, audio, video, fonts and CSS backgrounds

### 4.3 Page lifecycle
- **Switching between the خروجی (Output) and صفحه (Page) tabs restarts the page.** The iframe is re-created, so a running game or animation starts over and its state is lost. To watch a game, stay on **صفحه** and use the fullscreen button.
- Editing an `.html` file reloads its page after about 0.4 s. A mix page only updates when you press **اجرا** again.

### 4.4 Input and re-running
- In Python and Jib, `input()` / `read()` / `بخوان()` show a popup when no answer is available. Under the hood, the program is **stopped and run again from the start** with all answers so far, once for every answer.
  - The output panel shows only the final run, so prints appear once, with each prompt echoed together with its answer (`name? Ali`).
  - But **all code before the `input()` really runs again**. Random numbers and times are re-rolled, slow work repeats, and the 25 s (Python) / 2.5 s (Jib) limit applies to each full run.
  - Avoid expensive work or randomness before asking for input. Alternatively, ask the user to fill the **ورودی** box: one line per answer, read in order, with no popups.
- Pressing Cancel on the popup ends the run without showing its output.
- **Python tracebacks** include two internal Pyodide frames (`/lib/python314.zip/_pyodide/_base.py …`) before your own frame.
  - Your line appears as `File "<exec>", line N`. In a mix block it is `"<mix>"`, with N counted from the block's first line.
  - Tracebacks are cut to 18 lines.
  - The input mechanism uses an internal `_NeedInput` exception. CodePad detects it even if your code wraps `input()` in a bare `except:`, so that pattern still works.
- C/C++ and the binary machine never show a popup. They read only the **ورودی** box. JavaScript has no input at all.
- A mix run shows nothing until **all** its blocks have finished.

### 4.5 Launcher (JibOS) limits — what is not possible and what ships instead
| Asked for | Possible? | What CodePad does instead |
|---|---|---|
| Root the phone / "rooted launcher" | **No** — an app cannot gain Android root | **Developer mode**: full control of the launcher, its apps and settings, inside the app (§2.11) |
| Real hacking tools (port scans, sniffing, Wi-Fi attacks) | **No** — a WebView has no raw sockets or system access, and it would not be appropriate | Offline, educational **security & cryptography samples** (§2.11) |
| Hide my real IP / look like I'm on a PC / change fingerprint | **No** — an app cannot spoof your IP or device at the system level; that needs a real VPN/Tor | A private **incognito tab** (no history/cookies, cleared on close) + an **open-externally** button to a real browser/Tor; the honest limit is shown in-app (§2.12) |
| Run Chrome-PC extensions inside the browser | **No** — the Android WebView engine has no extension API | A simple private-browsing tab; for extensions use desktop Chrome (§2.12) |
| Real `nmap` / port scanning / network control from the app | **No** — a WebView has no raw TCP/UDP sockets | An **educational simulated** `nmap`/scan over mock data (console + two samples); an optional hand-off to the **real Termux** app on native Android, restricted to private-range `nmap -sn` (§2.12) |
| Anti-hack / anti-remote-control / device protection | **No** — blocking device takeover is an OS/root job, not a normal app's | Nothing claims to do this; the editor has an offline static **code review** (`بررسی`) that flags risky patterns only |
| Run real Linux/Termux binaries or packages in the console | **No** — the console is a simulated shell in the WebView | A POSIX-ish shell over a **virtual** filesystem; `termux <cmd>` can hand a command to the real Termux app on native (§2.12) |
| Gemini doing things "without being asked" | Not built — every request is a button press | One-time key, always connected; ask / build an app / improve a file on demand |
| Be a real Android home-screen launcher | **No** — CodePad is a normal app | A phone-style home screen inside CodePad |
| Background music, notifications, widgets, multi-window | No | Audio while the app is open; toasts |
| `localStorage` inside an installed app | No (sandboxed frame) | `jibos.storage` |
| Vibration / text-to-speech | Depends on the device WebView | `jibos.vibrate` / `jibos.speak` return `false` when unavailable |

### 4.6 Runtime limits
- Time limits: Python 25 s; JavaScript, C/C++ and Jib 2.5 s; binary 300 steps. An infinite loop is stopped with a timeout message, and the **توقف** button stops a run.
- There is no real file system for programs. Python's `open()` works on Pyodide's temporary in-memory file system; files a program writes are not saved. Programs **can** read the user's attachments (§2.8): Python through `open("name")`, pages through the file name in a URL or `assetText("name")`. Programs cannot read the project's code files, except HTML `<link>`/`<script src>` inlining (§2.7).
- There is no network for programs: no pip, no HTTP requests from Python, no fetch from pages.
- Python: standard library only. JS console: synchronous output only. C/C++: JSCPP subset.
- Code files opened from outside are limited to 1 MB of text; anything larger or non-text is stored as an attachment instead (§2.8), which has no size limit.

---

## 5. Worked examples (tested in CodePad v1.7.0)

### 5.1 A simple HTML page (`index.html`)
```html
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: Tahoma, sans-serif; background: #101410; color: #e7f0e4; margin: 0; padding: 1rem; }
    button { background: #c6f135; border: 0; border-radius: 999px; padding: 0.6rem 1.2rem; font-size: 1rem; }
    #count { font-size: 2rem; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>سلام دنیا</h1>
  <p id="count">۰</p>
  <button id="add">یکی اضافه کن</button>
  <script>
    let n = 0;
    document.getElementById("add").addEventListener("click", () => {
      n += 1;
      document.getElementById("count").textContent = n.toLocaleString("fa-IR");
      console.log("شمارنده:", n);
    });
  </script>
</body>
</html>
```
Run it with **اجرا**. Tapping the button updates the number, and `console.log` lines appear in the output panel.

### 5.2 A minimal mix file: Python → page
```
@@ python
shared["title"] = "سلام از پایتون"
shared["nums"] = [3, 8, 5, 12]
print("sum:", sum(shared["nums"]))

@@ html
<h2 id="t"></h2>
<ul id="list"></ul>

@@ css
body { font-family: Tahoma, sans-serif; background: #101410; color: #e7f0e4; }

@@ js
document.getElementById("t").textContent = shared.title;
for (const n of shared.nums) {
  const li = document.createElement("li");
  li.textContent = n;
  document.getElementById("list").appendChild(li);
}
```

### 5.3 Full example: Snake game (Python sets the size, speed and colours; canvas + d-pad)
This file was tested at phone size (390×800). Results:
- Python prints `پایتون: سرعت اول 140 میلی‌ثانیه` ("Python: first speed 140 ms").
- C prints `C: snake is ready`.
- Jib Farsi prints `جیب فارسی: هدف بازی 20 سیب` ("Jib Farsi: game goal 20 apples").
- Binary prints `3 = 00000011`.
- The page reads `shared.cells = 20`, `shared.speed = 140` and `shared.colors`.
- The snake moves with `setInterval`, the d-pad buttons turn it, eating an apple raises the score, and the game speeds up every 5 apples.

To play it, press **اجرا**, open **صفحه** (use fullscreen), then tap an arrow to start. Keyboard arrows/WASD also work.

```
# بازی مار و سیب — فایل ترکیبی CodePad
# پایتون اندازه، سرعت و رنگ‌ها را در shared می‌گذارد؛ اسکریپت صفحه همان‌ها را می‌خواند.

@@ python
# پایتون: سرعت و رنگ‌ها را حساب می‌کند و در shared می‌گذارد
def speed_for(level):
    return max(60, 160 - level * 20)
shared["cells"] = 20
shared["speed"] = speed_for(1)
shared["colors"] = {"head": "#bbf7d0", "body": "#4ade80", "apple": "#f87171"}
print("پایتون: سرعت اول", shared["speed"], "میلی‌ثانیه")

@@ c
// سی: یک سلام کوچک
#include <stdio.h>
int main() {
  printf("C: snake is ready\n");
  return 0;
}

@@ farsi
# جیب فارسی: هدف بازی را حساب می‌کند
متغیر هدف = 5 * 4
چاپ("جیب فارسی: هدف بازی", هدف, "سیب")

@@ binary
# ماشین صفر و یک: تعداد جان‌ها (۳) را چاپ می‌کند
0001 0011
0101 0000
1111 0000

@@ html
<div class="game">
  <div class="bar">
    <span>امتیاز: <b id="score">0</b></span>
    <span id="speed"></span>
  </div>
  <canvas id="board" width="400" height="400"></canvas>
  <p id="msg">برای شروع یک جهت را بزن</p>
  <div class="dpad">
    <button class="up" data-dir="up" aria-label="بالا">▲</button>
    <button class="left" data-dir="left" aria-label="چپ">◀</button>
    <button class="down" data-dir="down" aria-label="پایین">▼</button>
    <button class="right" data-dir="right" aria-label="راست">▶</button>
  </div>
</div>

@@ css
body {
  margin: 0;
  background: #101410;
  color: #e7f0e4;
  font-family: Vazirmatn, Tahoma, sans-serif;
  touch-action: manipulation;
  user-select: none;
}
.game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
}
.bar {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 360px;
  font-size: 15px;
}
#board {
  width: 100%;
  max-width: 360px;
  aspect-ratio: 1;
  border-radius: 12px;
  border: 2px solid #314038;
  background: #0b0f0b;
}
#msg {
  margin: 0;
  min-height: 1.4em;
  color: #c6f135;
  font-size: 14px;
  text-align: center;
}
.dpad {
  display: grid;
  grid-template-columns: repeat(3, 64px);
  grid-template-rows: repeat(2, 56px);
  gap: 6px;
  direction: ltr;
}
.dpad button {
  border: 0;
  border-radius: 14px;
  background: #1f2a22;
  color: #e7f0e4;
  font-size: 24px;
}
.dpad button:active {
  background: #c6f135;
  color: #101410;
}
.dpad .up { grid-column: 2; grid-row: 1; }
.dpad .left { grid-column: 1; grid-row: 2; }
.dpad .down { grid-column: 2; grid-row: 2; }
.dpad .right { grid-column: 3; grid-row: 2; }

@@ js
// جاوااسکریپت: حلقهٔ بازی روی بوم؛ اندازه، سرعت و رنگ‌ها از shared (پایتون) می‌آیند
const N = shared.cells;
const colors = shared.colors;
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const size = canvas.width / N;
const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
let snake, dir, nextDir, apple, score, speed, timer = null;

function reset() {
  snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
  dir = DIRS.right;
  nextDir = dir;
  score = 0;
  speed = shared.speed;
  placeApple();
  document.getElementById("score").textContent = score;
  document.getElementById("speed").textContent = "سرعت: " + speed + " ms";
  draw();
}

function placeApple() {
  do {
    apple = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
  } while (snake.some((p) => p.x === apple.x && p.y === apple.y));
}

function draw() {
  ctx.fillStyle = "#0b0f0b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.apple;
  ctx.beginPath();
  ctx.arc((apple.x + 0.5) * size, (apple.y + 0.5) * size, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
  snake.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? colors.head : colors.body;
    ctx.fillRect(p.x * size + 1, p.y * size + 1, size - 2, size - 2);
  });
}

function step() {
  dir = nextDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  const hit = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || snake.some((p) => p.x === head.x && p.y === head.y);
  if (hit) {
    clearInterval(timer);
    timer = null;
    console.log("بازی تمام شد. امتیاز:", score);
    document.getElementById("msg").textContent = "باختی! امتیاز " + score + " — برای بازی دوباره یک جهت را بزن";
    reset();
    return;
  }
  snake.unshift(head);
  if (head.x === apple.x && head.y === apple.y) {
    score += 1;
    document.getElementById("score").textContent = score;
    if (score % 5 === 0) {
      speed = Math.max(60, speed - 20);
      document.getElementById("speed").textContent = "سرعت: " + speed + " ms";
      restart();
    }
    placeApple();
  } else {
    snake.pop();
  }
  draw();
}

function restart() {
  clearInterval(timer);
  timer = setInterval(step, speed);
}

function turn(name) {
  const d = DIRS[name];
  if (!d || (d.x === -dir.x && d.y === -dir.y)) return;
  nextDir = d;
  if (timer === null) {
    document.getElementById("msg").textContent = "بخور و بزرگ شو! هر ۵ سیب سریع‌تر می‌شود";
    restart();
  }
}

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    turn(button.dataset.dir);
  });
});

const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
document.addEventListener("keydown", (event) => {
  const name = KEYS[event.key] || KEYS[event.key.toLowerCase()];
  if (name) {
    event.preventDefault();
    turn(name);
  }
});

reset();
console.log("بازی مار آماده است. خانه‌ها:", N, "سرعت:", speed);
```

Why it works:
- Each block has a valid header. Note `@@ binary`, not `@@ bin`.
- The JS block mentions `document`/`canvas`, so it runs inside the page.
- Python's `shared` values reach the page as `window.shared`.
- No CDN, no `localStorage`, no `fetch`.

### 5.4 Attachments: an image in a page and a CSV read by Python
Assume the user has uploaded `photo.png` and `scores.csv` (columns `name,score`). Both are used by their plain names.
```
@@ python
import csv
rows = list(csv.DictReader(open("scores.csv", encoding="utf-8")))
shared["rows"] = [{"name": r["name"], "score": int(r["score"])} for r in rows]
shared["pic"] = "photo.png"          # the page receives this as the image itself
print("rows:", len(rows))

@@ html
<img id="pic" alt="" style="width:96px;border-radius:12px">
<ul id="list"></ul>

@@ js
document.getElementById("pic").src = shared.pic;
for (const r of shared.rows) {
  const li = document.createElement("li");
  li.textContent = r.name + ": " + r.score;
  document.getElementById("list").appendChild(li);
}
```
Why it works: `"photo.png"` inside `shared` is replaced by the file's `data:` URL when the page is built, and Python reads `scores.csv` from its working directory. Remember to tell the user to upload the files first (menu → **افزودن عکس یا فایل**), otherwise `open()` raises `FileNotFoundError` and the image stays blank.

---

## 6. Checklist for an AI writing CodePad code
1. Pick the right file type:
   - `.py` for console Python
   - `.html` for a self-contained page
   - `.mix` when Python logic must feed a graphical page
2. In mix files, put an explicit `@@ name` from §3.2 on every block. Never write `@@ bin`.
3. Keep page code **inline and offline**: no CDN scripts, `fetch`, `localStorage`, `eval` or `new Function`.
4. Page JS must mention `document`/`window`/`canvas` to be placed in the page. Read data with `shared.x`.
5. Python: standard library only. No GUI and no `time.sleep` animations. Avoid randomness or slow work before `input()`.
6. JS console files: synchronous `console.log` only.
7. C/C++: simple C-style code. Input comes from the **ورودی** box.
8. Use a mobile layout: a viewport fitting about 360 px wide, touch/pointer events (`pointerdown`), and large buttons.
9. Tell the user: press **اجرا**, then look at **صفحه** (graphics) or **خروجی** (text). Switching tabs restarts a page.
10. To give the user a program together with its images or data, deliver **one `.jibpack`** (§2.9) instead of asking for separate uploads.
11. For an app meant for the launcher: ship `index.html` (or `main.mix`), use `jibos.storage` to save data, `jibos.beep`/`jibos.play` for sound, and guard every call with `if (window.jibos)` so it still runs in the editor.
12. If the program needs the user's images or files: ask for their exact names, use flat names in full literal strings (§2.8), read data in a page with `assetText(...)` (not `fetch`), read data in Python with `open(...)`, and tell the user to upload them first via **افزودن عکس یا فایل**.

## 7. Getting the Android app (APK)
- Latest release: https://github.com/hoosein91hoosein91-arch/CodePad/releases/latest
- Direct download, **v2.1.0** (adds terminal shell over a virtual filesystem, private browser, multi-page home + export/backup, simulated nmap/port-scan samples, optional Termux hand-off): https://github.com/hoosein91hoosein91-arch/CodePad/releases/download/v2.1.0/CodePad.apk
- v2.0.0 (JibOS launcher: neon-terminal theme, wallpapers, custom icons, Gemini, `window.jibos`, developer mode, security samples): https://github.com/hoosein91hoosein91-arch/CodePad/releases/download/v2.0.0/CodePad.apk
- v1.9.0 (adds the launcher): https://github.com/hoosein91hoosein91-arch/CodePad/releases/download/v1.9.0/CodePad.apk
- v1.8.0 (packs and the built-in image snake sample): https://github.com/hoosein91hoosein91-arch/CodePad/releases/download/v1.8.0/CodePad.apk
- v1.7.0 (attachments, no packs): https://github.com/hoosein91hoosein91-arch/CodePad/releases/download/v1.7.0/CodePad.apk
- Previous version, v1.6.0 (no attachments): https://github.com/hoosein91hoosein91-arch/CodePad/releases/download/v1.6.0/CodePad.apk
- Source: https://github.com/hoosein91hoosein91-arch/CodePad
- Each APK is a **debug build** from GitHub Actions (`./gradlew assembleDebug`). It is not release-signed and is not on Google Play.
  - Android will ask you to allow **installing from unknown sources** for your browser or file manager.
  - Every CI build is signed with a **freshly generated debug key**, so a new version cannot be installed over an old one ("App not installed" / signature conflict). **Uninstall the old CodePad first**, then install the new APK. Your saved projects live in the app's storage and are removed when you uninstall, so copy out anything you need first.

## 8. Building from source (for maintainers)
- Web dev: `npm install`, then `npm run dev`.
- Mobile web bundle: `npm run build:mobile` (static SPA in `dist/client`).
- Android: workflow `.github/workflows/android.yml`. It runs `npx cap add android`, `npm run android:prepare`, `npx cap sync android`, then `./gradlew assembleDebug`, and uploads the artifact `CodePad-debug-apk`.
- Checks:
  - `npx tsc --noEmit`
  - `npx eslint .`
  - `node --experimental-strip-types scripts/jib-selftest.mjs` with Node 22+ (or `npx -y node@22 scripts/jib-selftest.mjs`; must print `ALL PASSED`). Since v2.0.0 it also checks the sample packs, the crypto helpers, launcher settings validation and the Gemini request/response/error path with a fake `fetch`.

## 9. Where things live
| File | What it does |
|---|---|
| `src/labshell/types.ts` | language ids, labels, extensions (`LANG_META`) |
| `src/labshell/mix.ts` | mix parser, aliases, auto-detection, `shared`, page assembly (`runMix`) |
| `src/labshell/html-doc.ts` | page document builder, CSP, console bridge, `buildWebDoc`, attachment embedding (`withAssets`) |
| `src/labshell/runtime.ts` | Python/JS/C/Jib runners, time limits, the input re-run loop, sending attachments to the Python worker |
| `src/labshell/py.worker.ts` | Pyodide worker, `input()` handling, writing attachments into Python's working directory |
| `src/labshell/farsi.ts`, `english.ts` | Jib compiler (Farsi + English keywords) |
| `src/labshell/binary.ts` | 8-bit machine |
| `src/labshell/open-files.ts` | opening external files, extension map, 1 MB code limit, routing everything else to attachments |
| `src/labshell/assets.ts` | attachments: IndexedDB storage, add/remove, `data:` URLs for pages |
| `src/labshell/pack.ts` | `.jibpack` parser: code files + base64 attachments in one text file |
| `src/labshell/pack-samples.ts`, `src/labshell/packs/*.jibpack` | built-in pack samples shown under **پروژهٔ تازه** and in the launcher (snake, piano, five security samples) |
| `scripts/make-pack.mjs` | builds a `.jibpack` from a folder |
| `src/routes/launcher.tsx`, `src/labshell/launcher.ts`, `src/components/launcher-button.tsx` | launcher home screen, installed-apps store, editor toolbar button |
| `src/components/launcher/*` | JibOS UI: app window + `jibos` bridge handler (`app-window.tsx`), settings, Gemini, app customize/editor/install sheets, developer mode (`dev-sheet.tsx`), console (`terminal.tsx`), matrix rain |
| `src/labshell/launcher-prefs.ts` | launcher themes, wallpapers, accents, settings validation |
| `src/labshell/gemini.ts` | Gemini REST call (`generateContent`), on-device key storage, prompts, code extraction |
| `src/labshell/jibos.ts` | `window.jibos` client script injected into installed apps, per-app storage |
| `src/labshell/crypto-utils.ts` | SHA (WebCrypto), base64, hex, XOR, Caesar, entropy, password generator |
| `src/labshell/asset-refs.ts` | pure helpers: finding and replacing attachment names in code, `assetText`/`assetBytes` page helpers |
| `src/labshell/samples.ts` | built-in samples and project templates |
| `src/components/lab-shell.tsx` | UI, Run button, tabs, sandboxed iframe |
