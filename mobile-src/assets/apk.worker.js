(function () {
  self.onmessage = async (e) => {
    let t = (e) => self.postMessage({ progress: e });
    try {
      let n = self.location.origin;
      t(`بارگذاری سازندهٔ پایتون…`);
      let [r, i, a] = await Promise.all([
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
        ]),
        o = await r.loadPyodide({ indexURL: `${n}/pyodide/` });
      (o.FS.writeFile(`/home/pyodide/codepad_apk.py`, new TextEncoder().encode(i)),
        o.FS.writeFile(`/home/pyodide/template.apk`, new Uint8Array(a)),
        o.FS.writeFile(`/home/pyodide/request.json`, new TextEncoder().encode(JSON.stringify(e.data))),
        t(`بسته‌بندی پروژه و امضای APK…`),
        await o.runPythonAsync(`import json
from pathlib import Path
from codepad_apk import build_apk
r = json.loads(Path('request.json').read_text())
apk = build_apk(Path('template.apk').read_bytes(), r['project'], r['key'], r['packageId'], r['versionCode'], r['versionName'])
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
