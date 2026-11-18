"""Rebuild exporter web code from sources, preserving supplied native shells."""
from pathlib import Path
from io import BytesIO
import zipfile

root = Path(__file__).resolve().parent.parent
web = {p.relative_to(root/'export-player-src').as_posix(): p.read_bytes()
       for p in (root/'export-player-src').rglob('*') if p.is_file()}
for directory in ['pyodide', 'fonts']:
    for p in (root/'mobile-src'/directory).rglob('*'):
        if p.is_file(): web[p.relative_to(root/'mobile-src').as_posix()] = p.read_bytes()
for p in (root/'mobile-src/assets').glob('*.woff*'):
    web['assets/'+p.name] = p.read_bytes()
web['background/python-worker.js'] = (root/'public/background/python-worker.js').read_bytes()
web['assets/py.worker-Ox6J_UBn.js'] = b'import "../background/python-worker.js";\n'
for name, prefix in [('desktop-template.bin', 'app/'), ('apk-template.bin', 'assets/public/')]:
    target = root/'mobile-src'/name
    with zipfile.ZipFile(target) as original:
        keep = {n: original.read(n) for n in original.namelist() if not n.startswith(prefix)}
        if name == 'apk-template.bin':
            keep[prefix+'runtime.json'] = original.read(prefix+'runtime.json')
    keep.update({prefix+n: data for n, data in web.items()})
    # Optional fresh Windows launcher, built from resources/windows/main.go.
    fresh = root/'build-windows/Start.exe'
    if name == 'desktop-template.bin' and fresh.is_file(): keep['Start.exe'] = fresh.read_bytes()
    out = BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for n, data in sorted(keep.items()): archive.writestr(n, data)
    target.write_bytes(out.getvalue())
    print(name + ': web sources refreshed')
