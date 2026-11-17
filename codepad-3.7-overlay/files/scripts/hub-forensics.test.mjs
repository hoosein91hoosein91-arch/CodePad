import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { md5, entropy, extractStrings, hexdump, sniff, zipEntries, zipWarnings, analyze, digest } from "../mobile-src/assets/hub-forensics.js";

const enc = (s) => new TextEncoder().encode(s);

test("md5 matches known vectors and node's own implementation", () => {
  assert.equal(md5(enc("")), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5(enc("abc")), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(md5(enc("The quick brown fox jumps over the lazy dog")), "9e107d9d372bb6826bd81d3542a419d6");
  for (const n of [1, 55, 56, 63, 64, 65, 1000, 70000]) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 255);
    assert.equal(md5(b), createHash("md5").update(b).digest("hex"), "length " + n);
  }
});
test("sha digests match", async () => {
  const b = enc("hello");
  assert.equal(await digest(b, "SHA-256"), createHash("sha256").update(b).digest("hex"));
});
test("entropy: constant data ≈ 0, random-looking data ≈ 8", () => {
  assert.equal(entropy(new Uint8Array(1000)), 0);
  const r = new Uint8Array(65536).map((_, i) => (i * 2654435761 >>> 24) & 255);
  assert.ok(entropy(r) > 7.9);
});
test("strings and hexdump", () => {
  assert.deepEqual(extractStrings(Uint8Array.from([0, ...enc("hello world"), 1, ...enc("ab"), 0, ...enc("another one")])), ["hello world", "another one"]);
  assert.match(hexdump(enc("ABCDEFGHIJKLMNOPQ")), /^00000000  41 42 43 44 .+\|ABCDEFGHIJKLMNOP\|\n00000010  51 +\|Q\|$/);
});
test("type sniffing by magic bytes, not by name", () => {
  assert.equal(sniff(Uint8Array.from([0x4d, 0x5a, 0x90, 0])).kind, "exe");
  assert.equal(sniff(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46])).kind, "elf");
  assert.equal(sniff(enc("<!DOCTYPE html><html>")).kind, "html");
  assert.equal(sniff(enc("just text")).kind, "text");
  assert.equal(sniff(Uint8Array.from([0, 1, 2, 3, 250])).kind, "unknown");
});

function makeZip(entries) { // ZIP بدون فشرده‌سازی؛ فقط دایرکتوری مرکزی برای آزمون
  const parts = [], central = []; let off = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const e of entries) {
    const name = [...enc(e.name)], data = [...enc(e.data || "")];
    const local = [0x50, 0x4b, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(e.csize ?? data.length), ...u32(e.usize ?? data.length), ...u16(name.length), ...u16(0), ...name, ...data];
    central.push([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(e.enc ? 1 : 0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(e.csize ?? data.length), ...u32(e.usize ?? data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...name]);
    parts.push(local); off += local.length;
  }
  const cd = central.flat(), body = parts.flat();
  return Uint8Array.from([...body, ...cd, 0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(cd.length), ...u32(body.length), ...u16(0)]);
}

test("zip listing finds Zip Slip paths, executables, bombs and APKs", async () => {
  const z = makeZip([{ name: "../../evil.sh", data: "x" }, { name: "readme.txt", data: "hi" }, { name: "setup.exe", data: "MZ" }, { name: "AndroidManifest.xml", data: "<m/>" }, { name: "big.bin", csize: 10, usize: 900 * 1024 * 1024 }]);
  const entries = zipEntries(z);
  assert.equal(entries.length, 5);
  const text = zipWarnings(entries).map((w) => w.text).join(" | ");
  assert.match(text, /Zip Slip/); assert.match(text, /اجرایی/); assert.match(text, /بمب ZIP/); assert.match(text, /APK/);
  assert.equal(zipEntries(enc("not a zip")), null);
});

test("analyze: double extension, PowerShell payload and leaked private key are reported", async () => {
  const bytes = enc("MZ\u0000junk powershell.exe -enc AAAA http://1.2.3.4:4444/payload.exe -----BEGIN RSA PRIVATE KEY----- ");
  const r = await analyze(bytes, "invoice.pdf.exe");
  const text = r.findings.map((f) => f.text).join(" | ");
  assert.match(text, /پسوند دوگانه/); assert.match(text, /PowerShell/); assert.match(text, /فایل اجرایی|executable/); assert.match(text, /کلید/);
  assert.equal(r.md5, createHash("md5").update(bytes).digest("hex"));
  assert.equal(r.sha256, createHash("sha256").update(bytes).digest("hex"));
  const clean = await analyze(enc("just a normal note about groceries"), "notes.txt");
  assert.equal(clean.findings.length, 0);
});
