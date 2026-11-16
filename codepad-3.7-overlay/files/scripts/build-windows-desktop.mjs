#!/usr/bin/env node
// Build the standalone Windows app (Electron): node scripts/build-windows-desktop.mjs DIST_CLIENT_DIR OUT_DIR
// Needs: npm install --no-save @electron/packager   (it downloads the Windows Electron runtime)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ELECTRON_VERSION = '45.3.3';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [dist, out] = process.argv.slice(2).map(p => resolve(p));
if (!dist || !out || !existsSync(join(dist, 'index.html'))) { console.error('usage: build-windows-desktop.mjs DIST_CLIENT_DIR OUT_DIR'); process.exit(2); }

const desktop = join(root, 'resources/windows/desktop');
const stage = join(out, 'stage');
rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of ['package.json', 'main.js', 'preload.js', 'icon.png']) cpSync(join(desktop, f), join(stage, f));
cpSync(dist, join(stage, 'web'), { recursive: true });

// The bundled router treats any non-http(s) location as an external link and would render nothing under the private
// codepad:// scheme. Allow our own scheme in the copy that ships with the desktop app; the web/APK builds are untouched.
const mainJs = join(stage, 'web/assets/main.js');
const original = '(e.protocol !== `http:` && e.protocol !== `https:`) || e.origin !== t || !!e.username || !!e.password';
const text = readFileSync(mainJs, 'utf8');
if (text.split(original).length !== 2) throw new Error('main.js changed: the router origin check was not found exactly once; update the desktop patch.');
writeFileSync(mainJs, text.replace(original, original.replace('e.protocol !== `https:`)', 'e.protocol !== `https:` && e.protocol !== `codepad:`)')));

const loaded = createRequire(join(process.cwd(), 'noop.js'))('@electron/packager');
const packager = typeof loaded === 'function' ? loaded : (loaded.packager ?? loaded.default);
const options = {
  dir: stage, name: 'CodePad', platform: 'win32', arch: 'x64', electronVersion: ELECTRON_VERSION,
  out, overwrite: true, asar: false, prune: false, appVersion: '3.7.0', quiet: true,
};
if (process.platform === 'win32') { // icon/metadata editing needs rcedit, which runs natively only on Windows
  options.icon = join(desktop, 'icon.ico');
  options.win32metadata = { CompanyName: 'CodePad', FileDescription: 'CodePad', ProductName: 'CodePad', OriginalFilename: 'CodePad.exe' };
}
const result = await packager(options);
cpSync(join(desktop, 'README-Desktop.txt'), join(result[0], 'README-Windows.txt'));
console.log('built:', result[0]);
