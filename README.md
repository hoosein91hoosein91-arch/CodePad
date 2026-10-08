# CodePad (جیب‌کد)

An offline, multi-language coding workshop for phones. It runs Python (Pyodide), JavaScript, C/C++, the Jib teaching language (English and Farsi keywords), an 8-bit binary machine, HTML and CSS, plus **mix files** that combine several languages in one file and can render a live HTML/canvas page.

- **Writing code for CodePad (for AI assistants and humans): see [AI_GUIDE.md](AI_GUIDE.md).** It covers the languages, the mix-file format (`@@` blocks, `shared`), limitations and worked examples.
- Download the Android APK: https://github.com/hoosein91hoosein91-arch/CodePad/releases/latest (debug build: allow unknown sources, and uninstall the old version before installing a new one).
- Build: `npm install`, `npm run build:mobile`; the Android APK is built by `.github/workflows/android.yml`.
