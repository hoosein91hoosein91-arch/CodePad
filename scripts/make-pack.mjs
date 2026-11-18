#!/usr/bin/env node
// ساخت «بستهٔ جیب» (.jibpack) از یک پوشه:  node scripts/make-pack.mjs <پوشه> [نام پروژه] > game.jibpack
// فایل‌های کد (nava mix fa jib bit py js c h cpp cc hpp css html htm) داخل بسته می‌شوند به‌صورت متن؛ هر فایل دیگر (عکس و ...) به‌صورت base64 پیوست می‌شود.
// قالب بسته در AI_GUIDE.md (§2.9) توضیح داده شده است.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

const [dir, ...nameParts] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node scripts/make-pack.mjs <folder> [project name] > out.jibpack");
  process.exit(1);
}
const CODE = new Set(["nava", "mix", "fa", "jib", "bit", "py", "js", "mjs", "c", "h", "cpp", "cc", "hpp", "css", "html", "htm"]);
const name = nameParts.join(" ").trim() || basename(dir);
const names = readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile() && !n.startsWith("."));
const isCode = (n) => CODE.has(extname(n).slice(1).toLowerCase());
const out = [`@@@ jibpack 1 ${name}`];
for (const n of names.filter(isCode).sort()) {
  const text = readFileSync(join(dir, n), "utf8").replace(/\r\n?/g, "\n");
  if (/^@@@/m.test(text)) throw new Error(`${n}: a line starting with @@@ is reserved by the pack format`);
  out.push(`@@@ file ${n}`, text.replace(/\n+$/, ""));
}
for (const n of names.filter((x) => !isCode(x)).sort()) {
  const b64 = readFileSync(join(dir, n)).toString("base64");
  out.push(`@@@ asset ${n}`, ...(b64.match(/.{1,76}/g) ?? []));
}
process.stdout.write(out.join("\n") + "\n");
