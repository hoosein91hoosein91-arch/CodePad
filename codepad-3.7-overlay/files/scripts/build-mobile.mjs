import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Build from editable JS sources, without a previous APK or distribution ZIP.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
writeFileSync(resolve(root, 'mobile-src/assets/version.js'), `export const VERSION = '${version}';\n`);
const launcherPath = resolve(root, 'mobile-src/assets/launcher.js');
writeFileSync(launcherPath, readFileSync(launcherPath, 'utf8').replace(/var Mn = [`'"][^`'"]+[`'"]/, `var Mn = '${version}'`));
if(existsSync(resolve(root,'node_modules/fflate/esm/browser.js')))cpSync(resolve(root,'node_modules/fflate/esm/browser.js'),resolve(root,'mobile-src/assets/vendor/fflate.js'));
else if(!existsSync(resolve(root,'mobile-src/assets/vendor/fflate.js')))throw Error('Missing fflate source');
if(existsSync(resolve(root,'node_modules/fflate/LICENSE')))cpSync(resolve(root,'node_modules/fflate/LICENSE'),resolve(root,'mobile-src/assets/vendor/fflate-LICENSE'));
else if(!existsSync(resolve(root,'mobile-src/assets/vendor/fflate-LICENSE')))throw Error('Missing bundled license');
if(existsSync(resolve(root,'node_modules/lucide-react/LICENSE')))cpSync(resolve(root,'node_modules/lucide-react/LICENSE'),resolve(root,'mobile-src/assets/LUCIDE-LICENSE.txt'));
else if(!existsSync(resolve(root,'mobile-src/assets/LUCIDE-LICENSE.txt')))throw Error('Missing bundled license');
// The source bundle ships generated Nava modules. Reuse them for offline
// packaging when no Nava source has changed.
if (process.argv.includes('--offline')) {
  for (const path of ['mobile-src/assets/runtime.js', 'export-player-src/assets/standalone-DSlJSeP3.js']) {
    const source = readFileSync(path, 'utf8');
    for (const fn of ['navaPhysics', 'navaScene3d', 'navaModel']) {
      if (!source.includes('function ' + fn + '(')) throw Error('Missing generated Nava function: ' + fn);
    }
  }
} else {
  const { syncNavaModels } = await import('./sync-nava-models.mjs');
  syncNavaModels();
  syncNavaModels('export-player-src/assets/standalone-DSlJSeP3.js');
}
execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['scripts/build-export-templates.py'], { stdio: 'inherit' });
const out = resolve(root, 'dist/client');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'mobile-src'), out, { recursive: true, filter: path => !basename(path).startsWith('.') && basename(path) !== '__pycache__' });
cpSync(resolve(root, 'public/background'), resolve(out, 'background'), { recursive: true, filter: path => !basename(path).startsWith('.') && basename(path) !== '__pycache__' });
if(existsSync(resolve(root,'public/libs')))cpSync(resolve(root,'public/libs'),resolve(out,'libs'),{recursive:true});
for(const name of ['codepad_console.py','codepad.py'])cpSync(resolve(root,'resources/python/'+name),resolve(out,'background/'+name));
writeFileSync(resolve(out, 'version.json'), JSON.stringify({ version, runtime: 'continuous-python', source: 'mobile-src' }) + '\n');
mkdirSync(resolve(out,'legal'),{recursive:true});
for(const name of ['COPYING','THIRD-PARTY-TERMUX.md'])cpSync(resolve(root,name),resolve(out,'legal/'+name+'.txt'));
const html = readFileSync(resolve(out, 'index.html'), 'utf8');
if (!html.includes('background/native-worker.js')) throw new Error('Missing Android runtime bridge');
console.log(`CodePad ${version} assembled from editable sources: dist/client`);
