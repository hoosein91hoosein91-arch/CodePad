import { mkdirSync, writeFileSync } from "node:fs";
import { compileNava } from "../src/labshell/nava.ts";
import { NAVA_PRESETS } from "../src/labshell/nava-kit.ts";

mkdirSync("examples/nava", { recursive: true });
for (const preset of NAVA_PRESETS) {
  const compiled = compileNava(preset.code);
  if (!compiled.web) throw new Error(compiled.error);
  const web = compiled.web;
  const js = web.js.replace(/<\/script/gi, "<\\/script");
  const doc = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${preset.title}</title><style>${web.css}</style></head><body>${web.html}<script>${js}</script></body></html>`;
  writeFileSync(`examples/nava/${preset.id}.nava`, preset.code);
  writeFileSync(`examples/nava/${preset.id}.html`, doc);
  writeFileSync(`examples/nava/${preset.id}.jibpack`, `@@@ jibpack 1 ${preset.title}\n@@@ file main.nava\n${preset.code}`);
}
console.log(`Exported ${NAVA_PRESETS.length} offline Nava examples.`);
