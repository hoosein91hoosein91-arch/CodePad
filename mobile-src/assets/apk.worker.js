(function () {
  self.onmessage = async (e) => {
    let t = (e) => self.postMessage({ progress: e });
    try {
      let n = self.location.origin;
      t(`بارگذاری سازندهٔ پایتون…`);
      let [r, i, a, bundle] = await Promise.all([
          import(
            /* @vite-ignore */
            `${n}/pyodide/pyodide.mjs`
          ),
          fetch(`${n}/codepad_apk.py`).then((e) => {
            if (!e.ok) throw Error(`کد سازنده پیدا نشد.`);
            return e.text();
          }),
          fetch(`${n}/apk-template.bin`).then((e) => {
            if (!e.ok) throw Error(`قالب APK پیدا نشد.`);
            return e.arrayBuffer();
          }),
          fetch(`${n}/export_bundle.py`).then(e=>{if(!e.ok)throw Error('کد بسته‌بندی پیدا نشد.');return e.text();}),
        ]),
        o = await r.loadPyodide({ indexURL: `${n}/pyodide/` });
      o.FS.writeFile('/home/pyodide/export_bundle.py',new TextEncoder().encode(bundle));
      const overlayResponse=await fetch(`${n}/export-overrides.json`);let overlays={};
      if(overlayResponse.ok){const map=await overlayResponse.json(),entries=Object.entries(map.files||{});let cursor=0;await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(cursor<entries.length){const [name,path]=entries[cursor++];const response=await fetch(new URL(path,n+'/'));if(!response.ok)throw Error('فایل قالب به‌روز پیدا نشد: '+name);overlays[name]=new Uint8Array(await response.arrayBuffer());}}));}
      for(const [name,bytes]of Object.entries(overlays)){const path='/home/pyodide/overlay/'+name;o.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));o.FS.writeFile(path,bytes);}
      const request={...e.data,project:{...e.data.project,assets:[]}};
      for(const [index,asset] of (e.data.project.assets||[]).entries()){
        if(asset.buf){o.FS.writeFile('/home/pyodide/asset-'+index,new Uint8Array(asset.buf));request.project.assets.push({name:asset.name,type:asset.type,binary:true,index});}
        else request.project.assets.push(asset);
      }
      (o.FS.writeFile(`/home/pyodide/codepad_apk.py`, new TextEncoder().encode(i)),
        o.FS.writeFile(`/home/pyodide/template.apk`, new Uint8Array(a)),
        o.FS.writeFile(`/home/pyodide/request.json`, new TextEncoder().encode(JSON.stringify(request))),
        t(`بسته‌بندی پروژه و امضای APK…`),
        await o.runPythonAsync(`import json
from pathlib import Path
from codepad_apk import build_apk
r = json.loads(Path('request.json').read_text())
binary = {a['name']:Path('asset-'+str(a['index'])).read_bytes() for a in r['project']['assets'] if a.get('binary')}
for a in r['project']['assets']:
    if a.get('binary'): Path('asset-'+str(a['index'])).unlink()
apk = build_apk(Path('template.apk').read_bytes(), r['project'], r['key'], r['packageId'], r['versionCode'], r['versionName'], binary_assets=binary, web_overrides={str(p.relative_to('overlay')):p.read_bytes() for p in Path('overlay').rglob('*') if p.is_file()})
Path('output.apk').write_bytes(apk)
Path('request.json').unlink()
`));
      let s = o.FS.readFile(`/home/pyodide/output.apk`).slice().buffer;
      self.postMessage({ apk: s }, [s]);
    } catch (e) {
      self.postMessage({ error: e instanceof Error ? e.message : String(e) });
    }
  };
})();
