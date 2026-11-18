"""CodePad APK builder. Pure Python 3; also runs in a dedicated Pyodide worker.

Builds real v1/v2-signed Android packages from CodePad's bundled runtime template.
It packages supported code with its interpreter; it is not a Python-to-Java compiler.
No Java, Gradle, pip, server, shell command or shared signing key is needed.
"""
import base64
import hashlib
import io
import json
import re
import struct
import zipfile
from export_bundle import prepare_bundle, safe_name


def u32(data, offset):
    return struct.unpack_from("<I", data, offset)[0]


def lp(value):
    return struct.pack("<I", len(value)) + value


def der(tag, data):
    size = len(data)
    length = bytes([size]) if size < 128 else bytes([128 + (size.bit_length() + 7) // 8]) + size.to_bytes((size.bit_length() + 7) // 8, "big")
    return bytes([tag]) + length + data


def seq(*parts):
    return der(0x30, b"".join(parts))


def integer(number):
    data = number.to_bytes(max(1, (number.bit_length() + 7) // 8), "big")
    return der(2, (b"\0" if data[0] & 128 else b"") + data)


def oid(text):
    numbers = list(map(int, text.split(".")))
    result = bytearray([40 * numbers[0] + numbers[1]])
    for number in numbers[2:]:
        encoded = [number & 127]
        number >>= 7
        while number:
            encoded.insert(0, 128 | (number & 127))
            number >>= 7
        result.extend(encoded)
    return der(6, bytes(result))


SHA256 = seq(oid("2.16.840.1.101.3.4.2.1"), b"\x05\0")
RSA = seq(oid("1.2.840.113549.1.1.1"), b"\x05\0")
SHA256_RSA = seq(oid("1.2.840.113549.1.1.11"), b"\x05\0")


class Signer:
    def __init__(self, jwk):
        def number(field):
            raw = jwk[field]
            return int.from_bytes(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)), "big")
        if jwk.get("kty") != "RSA":
            raise ValueError("Signing key must be an RSA JWK")
        self.n, self.e, self.d = number("n"), number("e"), number("d")
        if self.n.bit_length() < 2048 or self.e != 65537:
            raise ValueError("An RSA key of at least 2048 bits with e=65537 is required")
        self.public = seq(RSA, der(3, b"\0" + seq(integer(self.n), integer(self.e))))
        self.issuer = seq(der(0x31, seq(oid("2.5.4.3"), der(12, b"CodePad personal apps"))))
        self.serial = int.from_bytes(hashlib.sha256(self.public).digest()[:16], "big") or 1
        # Stable certificate: the same private key produces the same Android identity.
        tbs = seq(der(0xa0, integer(2)), integer(self.serial), SHA256_RSA, self.issuer,
                  seq(der(23, b"250101000000Z"), der(23, b"491231235959Z")), self.issuer, self.public)
        self.certificate = seq(tbs, SHA256_RSA, der(3, b"\0" + self.sign(tbs)))
        probe = self.sign(b"CodePad key check")
        if pow(int.from_bytes(probe, "big"), self.e, self.n) != int.from_bytes(self.encoded(b"CodePad key check"), "big"):
            raise ValueError("The private signing key is invalid")

    def encoded(self, data):
        digest_info = seq(SHA256, der(4, hashlib.sha256(data).digest()))
        size = (self.n.bit_length() + 7) // 8
        return b"\0\1" + b"\xff" * (size - len(digest_info) - 3) + b"\0" + digest_info

    def sign(self, data):
        encoded = int.from_bytes(self.encoded(data), "big")
        return pow(encoded, self.d, self.n).to_bytes((self.n.bit_length() + 7) // 8, "big")

    def pkcs7(self, data):
        signer_info = seq(integer(1), seq(self.issuer, integer(self.serial)), SHA256, RSA, der(4, self.sign(data)))
        signed_data = seq(integer(1), der(0x31, SHA256), seq(oid("1.2.840.113549.1.7.1")),
                          der(0xa0, self.certificate), der(0x31, signer_info))
        return seq(oid("1.2.840.113549.1.7.2"), der(0xa0, signed_data))


def patch_manifest(data, package, name, version_code, version_name, camera=False, preserve_permissions=False):
    """Patch values, preserving compiled Android resource names/IDs and native classes."""
    chunks, strings, position = [], [], 8
    pool_index, pool_header, pool_flags = None, None, None
    while position < len(data):
        kind, header, size = struct.unpack_from("<HHI", data, position)
        if size < header or position + size > len(data):
            raise ValueError("Invalid binary Android manifest")
        chunk = bytearray(data[position:position + size])
        if kind == 1:
            count, styles, flags, start, style_start = struct.unpack_from("<IIIII", chunk, 8)
            if styles:
                raise ValueError("Styled manifest string pools are unsupported")
            def length_at(p):
                if flags & 0x100:
                    v = chunk[p]
                    return (((v & 127) << 8) | chunk[p + 1], p + 2) if v & 128 else (v, p + 1)
                v = struct.unpack_from("<H", chunk, p)[0]
                return (((v & 32767) << 16) | struct.unpack_from("<H", chunk, p + 2)[0], p + 4) if v & 32768 else (v, p + 2)
            for i in range(count):
                offset = u32(chunk, header + i * 4)
                length, p = length_at(start + offset)
                if flags & 0x100:
                    length, p = length_at(p)
                    strings.append(bytes(chunk[p:p + length]).decode("utf-8"))
                else:
                    strings.append(bytes(chunk[p:p + length * 2]).decode("utf-16le"))
            pool_index, pool_header, pool_flags = len(chunks), bytes(chunk[:header]), flags
        chunks.append((kind, chunk))
        position += size
    if pool_index is None:
        raise ValueError("Manifest has no string pool")
    def add(text):
        if text not in strings:
            strings.append(text)
        return strings.index(text)
    old_package = None
    for kind, chunk in chunks:
        if kind == 0x102 and strings[u32(chunk, 20)] == "manifest":
            attr_start, attr_size, count = struct.unpack_from("<HHH", chunk, 24)
            for i in range(count):
                p = 16 + attr_start + i * attr_size
                if strings[u32(chunk, p + 4)] == "package":
                    old_package = strings[u32(chunk, p + 16)]
    if not old_package:
        raise ValueError("Manifest has no package")
    for kind, chunk in chunks:
        if kind != 0x102:
            continue
        tag = strings[u32(chunk, 20)]
        attr_start, attr_size, count = struct.unpack_from("<HHH", chunk, 24)
        for i in range(count):
            p = 16 + attr_start + i * attr_size
            attr = strings[u32(chunk, p + 4)]
            current = strings[u32(chunk, p + 16)] if chunk[p + 15] == 3 else None
            value = None
            if tag == "manifest" and attr == "package":
                value = package
            elif tag == "manifest" and attr == "versionName":
                value = version_name
            elif tag == "manifest" and attr == "versionCode":
                chunk[p + 15] = 0x10
                struct.pack_into("<II", chunk, p + 8, 0xffffffff, 0x10000008)
                struct.pack_into("<I", chunk, p + 16, version_code)
            elif tag in ("application", "activity", "activity-alias") and attr == "label":
                value = name
            elif tag == "application" and attr == "debuggable":
                struct.pack_into("<I", chunk, p + 8, 0xffffffff)
                chunk[p + 15] = 0x12
                struct.pack_into("<I", chunk, p + 16, 0)
            elif attr == "name" and current and tag in ("application", "activity", "service", "receiver", "provider"):
                if current.startswith("."):
                    value = old_package + current
                elif "." not in current:
                    value = old_package + "." + current
            elif current and (attr == "authorities" or tag in ("permission", "uses-permission")):
                value = current.replace(old_package + ".", package + ".")
            if value is not None:
                index = add(value)
                struct.pack_into("<I", chunk, p + 8, index)
                chunk[p + 15] = 3
                struct.pack_into("<I", chunk, p + 16, index)
    if camera:
        present, prototype, ending = False, None, None
        for kind, chunk in chunks:
            if kind == 0x102 and strings[u32(chunk, 20)] == "uses-permission":
                attr_start, attr_size, count = struct.unpack_from("<HHH", chunk, 24)
                for i in range(count):
                    p = 16 + attr_start + i * attr_size
                    if strings[u32(chunk, p + 4)] == "name" and chunk[p + 15] == 3:
                        present |= strings[u32(chunk, p + 16)] == "android.permission.CAMERA"
                        if count == 1:
                            prototype = (bytearray(chunk), p)
            elif kind == 0x103 and strings[u32(chunk, 20)] == "uses-permission":
                ending = bytearray(chunk)
        if not present:
            if prototype is None or ending is None:
                raise ValueError("No permission template for camera export")
            start, p = prototype
            index = add("android.permission.CAMERA")
            struct.pack_into("<I", start, p + 8, index)
            struct.pack_into("<I", start, p + 16, index)
            position = next(i for i, (kind, chunk) in enumerate(chunks) if kind == 0x102 and strings[u32(chunk, 20)] == "application")
            chunks[position:position] = [(0x102, start), (0x103, ending)]
    def length8(number):
        return bytes([number]) if number < 128 else bytes([0x80 | (number >> 8), number & 255])
    def length16(number):
        return struct.pack("<H", number) if number < 32768 else struct.pack("<HH", 0x8000 | (number >> 16), number & 65535)
    offsets, raw = [], bytearray()
    for value in strings:
        offsets.append(len(raw))
        units = len(value.encode("utf-16le")) // 2
        if pool_flags & 0x100:
            encoded = value.encode("utf-8")
            raw += length8(units) + length8(len(encoded)) + encoded + b"\0"
        else:
            raw += length16(units) + value.encode("utf-16le") + b"\0\0"
    raw += b"\0" * (-len(raw) % 4)
    header = bytearray(pool_header)
    start = len(header) + len(offsets) * 4
    struct.pack_into("<I", header, 4, start + len(raw))
    struct.pack_into("<IIIII", header, 8, len(strings), 0, pool_flags & ~1, start, 0)
    chunks[pool_index] = (1, header + struct.pack("<" + "I" * len(offsets), *offsets) + raw)
    if preserve_permissions:
        result = bytearray(data[:8]) + b"".join(chunk for _, chunk in chunks)
        struct.pack_into("<I", result, 4, len(result))
        return bytes(result)
    # Standalone apps do not use the editor's optional external Termux bridge.
    filtered, omit = [], False
    for kind, chunk in chunks:
        if kind == 0x102 and strings[u32(chunk, 20)] == "uses-permission":
            attr_start, attr_size, count = struct.unpack_from("<HHH", chunk, 24)
            for i in range(count):
                p = 16 + attr_start + i * attr_size
                if strings[u32(chunk, p + 4)] == "name" and chunk[p + 15] == 3 and strings[u32(chunk, p + 16)] in {"com.termux.permission.RUN_COMMAND","android.permission.QUERY_ALL_PACKAGES","android.permission.REQUEST_INSTALL_PACKAGES"}:
                    omit = True
        if omit:
            if kind == 0x103:
                omit = False
            continue
        filtered.append(chunk)
    result = bytearray(data[:8]) + b"".join(filtered)
    struct.pack_into("<I", result, 4, len(result))
    return bytes(result)


def validated_project(project, binary_assets=None):
    if not isinstance(project, dict) or project.get("format") != "codepad-app-1":
        raise ValueError("Invalid CodePad project format")
    name, files, entry = project.get("name"), project.get("files"), project.get("entryFile")
    if not isinstance(name, str) or not name.strip() or len(name) > 80:
        raise ValueError("App name must contain 1-80 characters")
    if not isinstance(files, list) or not 1 <= len(files) <= 100:
        raise ValueError("A project needs 1-100 source files")
    clean_files, seen = [], set()
    for f in files:
        if not isinstance(f, dict) or not isinstance(f.get("name"), str) or not isinstance(f.get("content"), str):
            raise ValueError("Invalid source file")
        if not f["name"] or len(f["name"]) > 150 or any(c in f["name"] for c in "\0\r\n") or f["name"] in seen:
            raise ValueError("Invalid or duplicate source file name")
        safe_name(f["name"])
        seen.add(f["name"])
        clean_files.append({"name": f["name"], "content": f["content"]})
    if entry not in seen:
        raise ValueError("The selected entry file is missing")
    if sum(len(f["content"]) for f in clean_files) > 5_000_000:
        raise ValueError("Source files exceed 5 MB")
    assets = project.get("assets", [])
    if not isinstance(assets, list) or len(assets) > 200:
        raise ValueError("Too many attachments")
    clean_assets, asset_seen, total = [], set(), 0
    for a in assets:
        if not isinstance(a, dict) or not all(isinstance(a.get(k), str) for k in ("name", "type")) or not (isinstance(a.get("b64"),str) or a.get("binary") is True):
            raise ValueError("Invalid attachment")
        if a["name"] in asset_seen or not a["name"] or "\0" in a["name"]:
            raise ValueError("Invalid or duplicate attachment name")
        safe_name(a["name"])
        blob = (binary_assets or {}).get(a["name"]) if a.get("binary") else base64.b64decode(a["b64"], validate=True)
        if blob is None:raise ValueError("Attachment binary data is missing")
        total += len(blob)
        if total > 128*1024*1024:
            raise ValueError("Attachments exceed 128 MB for on-device APK export")
        asset_seen.add(a["name"])
        clean_assets.append({k: a[k] for k in (("name", "type", "binary") if a.get("binary") else ("name", "type", "b64"))})
    requirements = project.get("requirements", [])
    if not isinstance(requirements, list) or len(requirements) > 100 or not all(isinstance(r, str) and len(r) <= 2048 for r in requirements):
        raise ValueError("Invalid package requirements")
    return {"format": "codepad-app-1", "name": name.strip(), "entryFile": entry, "files": clean_files,
            "assets": clean_assets, "requirements": requirements,"exportSettings":project.get("exportSettings",{})}


def jar_line(key, value):
    text = (key + ": " + value).encode("utf-8")
    lines = []
    while len(text) > 70:
        lines.append(text[:70])
        text = b" " + text[70:]
    return b"\r\n".join(lines + [text]) + b"\r\n"


def v1_entries(entries, signer):
    manifest = b"Manifest-Version: 1.0\r\nCreated-By: CodePad Python APK Builder\r\n\r\n"
    sections = []
    for name, data, _ in entries:
        section = jar_line("Name", name) + jar_line("SHA-256-Digest", base64.b64encode(hashlib.sha256(data).digest()).decode()) + b"\r\n"
        manifest += section
        sections.append((name, section))
    sf = b"Signature-Version: 1.0\r\nCreated-By: CodePad\r\nX-Android-APK-Signed: 2\r\n"
    sf += jar_line("SHA-256-Digest-Manifest", base64.b64encode(hashlib.sha256(manifest).digest()).decode()) + b"\r\n"
    for name, section in sections:
        sf += jar_line("Name", name) + jar_line("SHA-256-Digest", base64.b64encode(hashlib.sha256(section).digest()).decode()) + b"\r\n"
    return [("META-INF/MANIFEST.MF", manifest, zipfile.ZIP_DEFLATED), ("META-INF/CODEPAD.SF", sf, zipfile.ZIP_DEFLATED),
            ("META-INF/CODEPAD.RSA", signer.pkcs7(sf), zipfile.ZIP_DEFLATED)]


def aligned_zip(entries):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=False) as z:
        for name, data, compression in entries:
            # Android 11+ must memory-map the resource table; native libraries
            # must also be mappable when extractNativeLibs=false.
            if name == 'resources.arsc' or (name.startswith('lib/') and name.endswith('.so')):
                compression = zipfile.ZIP_STORED
            info = zipfile.ZipInfo(name, (2025, 1, 1, 0, 0, 0))
            info.compress_type = compression
            info.external_attr = 0o644 << 16
            if compression == zipfile.ZIP_STORED:
                alignment = 16384 if name.endswith(".so") else 4
                padding = (-(output.tell() + 30 + len(name.encode("utf-8")) + 4)) % alignment
                info.extra = struct.pack("<HH", 0xd935, padding) + b"\0" * padding
            z.writestr(info, data)
    return output.getvalue()


def sign_v2(apk, signer):
    eocd = apk.rfind(b"PK\x05\x06")
    if eocd < 0 or eocd + 22 != len(apk):
        raise ValueError("Unexpected ZIP end record")
    cd = u32(apk, eocd + 16)
    digests = []
    for section in (apk[:cd], apk[cd:eocd], apk[eocd:]):
        for offset in range(0, len(section), 1024 * 1024):
            chunk = section[offset:offset + 1024 * 1024]
            digests.append(hashlib.sha256(b"\xa5" + struct.pack("<I", len(chunk)) + chunk).digest())
    digest = hashlib.sha256(b"\x5a" + struct.pack("<I", len(digests)) + b"".join(digests)).digest()
    algorithm = struct.pack("<I", 0x0103)
    signed = lp(lp(algorithm + lp(digest))) + lp(lp(signer.certificate)) + lp(b"")
    signature = lp(lp(algorithm + lp(signer.sign(signed))))
    value = lp(lp(lp(signed) + signature + lp(signer.public)))
    pair = struct.pack("<Q", len(value) + 4) + struct.pack("<I", 0x7109871a) + value
    size = len(pair) + 24
    block = struct.pack("<Q", size) + pair + struct.pack("<Q", size) + b"APK Sig Block 42"
    end = bytearray(apk[eocd:])
    struct.pack_into("<I", end, 16, cd + len(block))
    return apk[:cd] + block + apk[cd:eocd] + end


def build_apk(template, project, key, package, version_code=1, version_name="1.0", progress=None, binary_assets=None, web_overrides=None):
    """Return signed APK bytes. template is the official CodePad runtime template."""
    if not re.fullmatch(r"[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}", package) or len(package) > 150:
        raise ValueError("Package ID must contain at least 3 lowercase segments, e.g. com.codepad.myapp")
    if package in {"com.hoosein.codepad", "com.hoosein.codepad.continuous", "com.hoosein.codepad.stable", "com.hoosein.codepad.vision212"}:
        raise ValueError("The exported app must not replace CodePad")
    if isinstance(version_code, bool) or not isinstance(version_code, int) or not 1 <= version_code <= 2_100_000_000:
        raise ValueError("Invalid Android version code")
    if not isinstance(version_name, str) or not 1 <= len(version_name) <= 30:
        raise ValueError("Invalid version name")
    project = validated_project(project,binary_assets)
    runtime,launch,project_files=prepare_bundle(project,binary_assets)
    report = progress or (lambda _message: None)
    report("Preparing project and signing identity")
    signer = Signer(key)
    entries = []
    overlays=web_overrides or {};used_overlays=set()
    with zipfile.ZipFile(io.BytesIO(template)) as source:
        if "assets/public/runtime.json" not in source.namelist() or "classes.dex" not in source.namelist():
            raise ValueError("This is not a CodePad standalone runtime template")
        for info in source.infolist():
            name = info.filename
            if name.endswith("/") or re.match(r"^META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$", name, re.I):
                continue
            if name.startswith('assets/public/project/') or name in {'assets/public/runtime.json','assets/public/launch.json'}:continue
            if not launch['nativePython'] and (name.startswith('assets/chaquopy/') or name.startswith('lib/')):continue
            if launch['fast'] and name.startswith('assets/public/') and name not in {'assets/public/index.html','assets/public/boot.js','assets/public/boot.css'}:continue
            relative=name.removeprefix("assets/public/") if name.startswith("assets/public/") else None
            data=overlays[relative] if relative in overlays else source.read(name)
            if relative in overlays:used_overlays.add(relative)
            if name == "AndroidManifest.xml":
                data = patch_manifest(data, package, project["name"], version_code, version_name, camera=any(re.search(r"(?:^|\n)\s*(?:import|from)\s+(?:cv2|mediapipe)\b", f["content"]) for f in project["files"]))
            elif name == "assets/public/runtime.json":
                data = json.dumps(project, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            elif name == "assets/capacitor.config.json":
                config = json.loads(data)
                config.update(appId=package, appName=project["name"])
                data = json.dumps(config).encode("utf-8")
            entries.append((name, data, info.compress_type))
    for name,data in overlays.items():
        safe_name(name)
        if name not in used_overlays and (not launch["fast"] or name in {"index.html","boot.js","boot.css"}):entries.append(("assets/public/"+name,data,zipfile.ZIP_DEFLATED))
    entries.extend(("assets/public/"+name,data,zipfile.ZIP_STORED if not name.endswith((".html",".js",".css",".json",".txt",".py")) else zipfile.ZIP_DEFLATED) for name,data in project_files.items())
    report("Packaging runtime and attachments")
    entries.extend(v1_entries(entries, signer))
    unsigned = aligned_zip(entries)
    report("Signing APK (v1 + v2)")
    apk = sign_v2(unsigned, signer)
    with zipfile.ZipFile(io.BytesIO(apk)) as check:
        if check.testzip() is not None:
            raise ValueError("APK archive verification failed")
        if json.loads(check.read("assets/public/runtime.json")) != runtime:
            raise ValueError("APK project verification failed")
        for info in check.infolist():
            if info.filename == 'resources.arsc' or (info.filename.startswith('lib/') and info.filename.endswith('.so')):
                if info.compress_type != zipfile.ZIP_STORED:
                    raise ValueError('Android requires uncompressed resources and native libraries')
                local = info.header_offset
                offset = local + 30 + struct.unpack_from('<H', apk, local+26)[0] + struct.unpack_from('<H', apk, local+28)[0]
                if offset % (16384 if info.filename.endswith('.so') else 4):
                    raise ValueError('APK resource or library alignment failed')
    report("APK ready")
    return apk


def main(argv=None):
    """CLI entry point; a plain editor Run explains the required inputs."""
    import argparse
    import sys
    from pathlib import Path
    if argv is None:
        argv = sys.argv[1:]
    if not argv:
        print("این فایل، موتور ساخت APK کدپد است. بدون پروژه، قالب و کلید امضا APK نمی‌سازد.")
        print("برای ساخت روی گوشی، کدپد ۲٫۸ را نصب کن و پروژهٔ خودت را باز کن.")
        print("منوی «پروژه‌ها» ← «ساخت APK از پروژهٔ فعال» ← «ساخت فایل APK» ← «ذخیرهٔ APK»")
        print("برای برنامهٔ لانچر: ویرایش برنامه ← «ساخت APK مستقل».")
        print("برای اجرای مستقیم در ترمینال، همهٔ ورودی‌ها را بده:")
        print("python3 codepad_apk.py --template apk-template.bin --project project.json --key signing-key.json --package com.codepad.myapp --output myapp.apk")
        print("APK ساخته نشد؛ هنوز ورودی‌های ساخت انتخاب نشده‌اند.")
        return None
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--project", type=Path, required=True, help="CodePad app JSON")
    parser.add_argument("--key", type=Path, required=True, help="Your private RSA JWK; keep it for future updates")
    parser.add_argument("--package", required=True)
    parser.add_argument("--version-code", type=int, default=1)
    parser.add_argument("--version-name", default="1.0")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    result = build_apk(args.template.read_bytes(), json.loads(args.project.read_text("utf-8")),
                       json.loads(args.key.read_text("utf-8")), args.package, args.version_code, args.version_name, print)
    args.output.write_bytes(result)
    print(f"Saved {args.output} ({len(result):,} bytes)")
    return args.output


if __name__ == "__main__":
    main()
