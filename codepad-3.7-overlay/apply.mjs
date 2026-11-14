#!/usr/bin/env node
// استفاده: node apply.mjs /path/to/CodePad-3.7.0   (پوشهٔ بازشدهٔ CodePad-3.7.0-source.zip)
// فایل‌های این overlay را روی سورس ۳٫۷٫۰ می‌نویسد. اگر فایلی از سورس پایه تغییر کرده باشد (هش نخواند) متوقف می‌شود.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(join(target, "mobile-src/assets/launcher.js"))) {
  console.error("usage: node apply.mjs /path/to/unpacked/CodePad-3.7.0");
  process.exit(2);
}
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const bad = [];
for (const [f, h] of Object.entries(manifest.files)) {
  const dest = join(target, f);
  if (h.base === null) { if (existsSync(dest) && sha(dest) !== h.new) bad.push(`${f} already exists with different content`); continue; }
  if (!existsSync(dest)) bad.push(`${f} is missing`);
  else if (sha(dest) !== h.base && sha(dest) !== h.new) bad.push(`${f} differs from the 3.7.0 base (hash mismatch)`);
}
if (bad.length) { console.error("Refusing to apply:\n - " + bad.join("\n - ")); process.exit(1); }
for (const f of Object.keys(manifest.files)) {
  mkdirSync(dirname(join(target, f)), { recursive: true });
  copyFileSync(join(here, "files", f), join(target, f));
}
console.log(`applied ${Object.keys(manifest.files).length} files. Next: npm install --ignore-scripts && npm run build:mobile -- --offline && npm run test:source`);
