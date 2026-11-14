import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncNavaModels } from './sync-nava-models.mjs';
import { execFileSync } from 'node:child_process';

// Build from editable JS sources, without a previous APK or distribution ZIP.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
writeFileSync(resolve(root, 'mobile-src/assets/version.js'), `export const VERSION = '${version}';\n`);
const launcherPath = resolve(root, 'mobile-src/assets/launcher.js');
writeFileSync(launcherPath, readFileSync(launcherPath, 'utf8').replace(/var Mn = [`'"][^`'"]+[`'"]/, `var Mn = '${version}'`));
syncNavaModels();
syncNavaModels('export-player-src/assets/standalone-DSlJSeP3.js');
execFileSync('python3', ['scripts/build-export-templates.py'], { stdio: 'inherit' });
const out = resolve(root, 'dist/client');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'mobile-src'), out, { recursive: true });
cpSync(resolve(root, 'public/background'), resolve(out, 'background'), { recursive: true });
writeFileSync(resolve(out, 'version.json'), JSON.stringify({ version, runtime: 'continuous-python', source: 'mobile-src' }) + '\n');
const html = readFileSync(resolve(out, 'index.html'), 'utf8');
if (!html.includes('background/native-worker.js')) throw new Error('Missing Android runtime bridge');
console.log(`CodePad ${version} assembled from editable sources: dist/client`);
