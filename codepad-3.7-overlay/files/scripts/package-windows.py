#!/usr/bin/env python3
"""Assemble the portable Windows package: CodePad.exe + app/ (built web sources) + README. Usage:
   package-windows.py DIST_CLIENT_DIR CodePad.exe README-Windows.txt OUT.zip"""
import os, sys, zipfile

dist, exe, readme, out = sys.argv[1:5]
top = "CodePad-3.7-Windows"
skip = {".DS_Store", "Thumbs.db"}
count = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    z.write(exe, f"{top}/CodePad.exe")
    z.write(readme, f"{top}/README-Windows.txt")
    for root, dirs, files in os.walk(dist):
        dirs.sort()
        for name in sorted(files):
            if name in skip or name.endswith(".map"):
                continue
            path = os.path.join(root, name)
            z.write(path, f"{top}/app/{os.path.relpath(path, dist).replace(os.sep, '/')}")
            count += 1
print(f"{out}: {count} app files, {os.path.getsize(out)/1e6:.0f} MB")
