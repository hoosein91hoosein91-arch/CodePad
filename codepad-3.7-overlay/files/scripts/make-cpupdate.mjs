#!/usr/bin/env node
// Build a desktop web update:  node scripts/make-cpupdate.mjs <folder-with-changed-web-files> <version> <out.cpupdate> ["notes"]
// The folder mirrors resources/app/web (e.g. assets/ui.css). Format: ZIP with manifest.json {format,version,notes,files:{path:sha256}}.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from '../mobile-src/assets/vendor/fflate.js';
const [dir, version, out, ...notes] = process.argv.slice(2);
if (!dir || !version || !out) { console.error('usage: node scripts/make-cpupdate.mjs <folder> <version> <out.cpupdate> [notes]'); process.exit(1); }
const files = {}, manifestFiles = {};
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else { const rel = relative(dir, p).split(sep).join('/'); if (rel === 'manifest.json') continue; const bytes = readFileSync(p); files[rel] = bytes; manifestFiles[rel] = createHash('sha256').update(bytes).digest('hex'); } } })(dir);
if (!Object.keys(files).length) throw new Error('folder is empty');
const manifest = { format: 'codepad-web-update/1', version, notes: notes.join(' '), files: manifestFiles };
files['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2));
writeFileSync(out, zipSync(files, { level: 6 }));
console.log(`wrote ${out}: ${Object.keys(manifestFiles).length} files`);
