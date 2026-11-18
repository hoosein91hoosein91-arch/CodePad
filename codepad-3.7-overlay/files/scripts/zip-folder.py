#!/usr/bin/env python3
"""zip-folder.py FOLDER OUT.zip PREFIX : zip FOLDER's contents under PREFIX/ (portable, no external zip tool)."""
import os, sys, zipfile
folder, out, prefix = sys.argv[1:4]
n = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
    for root, dirs, files in os.walk(folder):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(root, name)
            z.write(path, f"{prefix}/{os.path.relpath(path, folder).replace(os.sep, '/')}"); n += 1
print(f"{out}: {n} files, {os.path.getsize(out)/1e6:.0f} MB")
