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
for (const f of ['package.json', 'main.js', 'preload.js', 'system.js', 'icon.png']) cpSync(join(desktop, f), join(stage, f));
// Fail the build (not the user's first launch) if main.js needs a file that is not in the package.
for (const [, rel] of readFileSync(join(stage, 'main.js'), 'utf8').matchAll(/require\('\.\/([^']+)'\)/g)) {
  if (!existsSync(join(stage, rel.endsWith('.js') ? rel : rel + '.js')) && !existsSync(join(stage, rel))) throw new Error(`main.js requires ./${rel} but it is not packaged`);
}
cpSync(dist, join(stage, 'web'), { recursive: true });
// Python host for real CPython runs (same runner as the Android build) next to main.js
cpSync(join(desktop, 'pyhost'), join(stage, 'pyhost'), { recursive: true });
for (const f of ['codepad_console.py', 'codepad_runtime.py', 'codepad.py']) cpSync(join(root, 'resources/python', f), join(stage, 'pyhost', f));
// Optional: bundle the official Python "embeddable" package so CodePad has real Python without installing it.
for (const f of ['desktop_host.py', 'codepad_console.py', 'codepad_runtime.py', 'codepad.py']) if (!existsSync(join(stage, 'pyhost', f))) throw new Error(`pyhost/${f} is missing from the package`);
const embed = process.env.CODEPAD_PYTHON_EMBED_DIR ? resolve(process.env.CODEPAD_PYTHON_EMBED_DIR) : '';
const extra = join(out, 'extra', 'python');
if (embed) {
  if (!existsSync(join(embed, 'python.exe'))) throw new Error('CODEPAD_PYTHON_EMBED_DIR must contain python.exe');
  cpSync(embed, extra, { recursive: true });
}

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
  ...(embed ? { extraResource: [extra] } : {}),
};
if (process.platform === 'win32') { // icon/metadata editing needs rcedit, which runs natively only on Windows
  options.icon = join(desktop, 'icon.ico');
  options.win32metadata = { CompanyName: 'CodePad', FileDescription: 'CodePad', ProductName: 'CodePad', OriginalFilename: 'CodePad.exe' };
}
const result = await packager(options);
cpSync(join(desktop, 'README-Desktop.txt'), join(result[0], 'README-Windows.txt'));
console.log('built:', result[0]);
