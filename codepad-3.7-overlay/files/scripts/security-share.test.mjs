// آزمون «اشتراک روی شبکه»: سرور واقعی راه می‌افتد؛ فایل‌های اشتراکی دیده می‌شوند و هیچ چیز بیرون از پوشه یا پنهان نشت نمی‌کند.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir, networkInterfaces } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { HUB_SAMPLES } from "../mobile-src/assets/hub-data.js";

const py = ["python3", "python"].find((c) => spawnSync(c, ["--version"]).status === 0);
const need = { skip: !py && "python is not installed" };
const sample = HUB_SAMPLES.find((s) => s.id === "sec_lan_share");
const PORT = 19000 + Math.floor(Math.random() * 900);
const root = mkdtempSync(join(tmpdir(), "cpshare-"));
const outside = mkdtempSync(join(tmpdir(), "cpoutside-"));
let proc, token, out = "";

const req = (path, { method = "GET", headers = {}, port = PORT, host = "127.0.0.1" } = {}) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host, port, path, method, headers }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.on("error", reject); r.end();
  });

before(async () => {
  if (!py) return;
  writeFileSync(join(root, "lan_share.py"), sample.code);
  writeFileSync(join(root, "hello.txt"), "0123456789");
  writeFileSync(join(root, "فایل فارسی.txt"), "سلام");
  writeFileSync(join(root, ".secret"), "hidden");
  writeFileSync(join(root, "mounted.json"), "[]");
  writeFileSync(join(outside, "private.txt"), "TOP-SECRET-OUTSIDE");
  mkdirSync(join(root, "site")); writeFileSync(join(root, "site", "index.html"), "<h1>my site</h1>");
  mkdirSync(join(root, "docs")); writeFileSync(join(root, "docs", "a.bin"), Buffer.from([1, 2, 3]));
  symlinkSync(outside, join(root, "escape"));
  proc = spawn(py, ["-u", "lan_share.py"], { cwd: root, env: { ...process.env, PYTHONUNBUFFERED: "1", CP_SHARE_PORT: String(PORT) } });
  proc.stdout.on("data", (d) => (out += d));
  for (let i = 0; i < 80 && !/http:\/\/127\.0\.0\.1:\d+\/[\w-]+\//.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  token = out.match(/http:\/\/127\.0\.0\.1:\d+\/([\w-]+)\//)?.[1];
});
after(() => proc?.kill());

test("starts, prints the local and LAN addresses and a random token", need, () => {
  assert.ok(token && token.length >= 6, out);
  assert.match(out, /روی این دستگاه/);
});

test("lists shared files but hides the script itself, dotfiles and internals", need, async () => {
  const r = await req(`/${token}/`);
  assert.equal(r.status, 200);
  for (const shown of ["hello.txt", "docs/", "site/"]) assert.ok(r.body.includes(encodeURI(shown).replace("%2F", "/")) || r.body.includes(shown), shown);
  for (const hidden of ["lan_share.py", ".secret", "mounted.json"]) assert.ok(!r.body.includes(hidden), hidden + " must be hidden");
  assert.ok(r.body.includes("فایل فارسی.txt"));
});

test("serves files, ranges and HEAD; index.html makes a site", need, async () => {
  assert.equal((await req(`/${token}/hello.txt`)).body, "0123456789");
  const rg = await req(`/${token}/hello.txt`, { headers: { Range: "bytes=2-4" } });
  assert.equal(rg.status, 206); assert.equal(rg.body, "234"); assert.equal(rg.headers["content-range"], "bytes 2-4/10");
  const head = await req(`/${token}/hello.txt`, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(head.body, ""); assert.equal(head.headers["content-length"], "10");
  assert.equal((await req(`/${token}/site/`)).body, "<h1>my site</h1>");
  assert.equal((await req(`/${token}/${encodeURIComponent("فایل فارسی.txt")}`)).body, "سلام");
  assert.match((await req(`/${token}/docs/a.bin`)).headers["content-disposition"], /attachment/);
});

test("without the token nothing is served", need, async () => {
  assert.equal((await req("/")).status, 404);
  assert.equal((await req("/hello.txt")).status, 404);
  assert.equal((await req("/wrong-token/hello.txt")).status, 404);
});

test("path traversal, encoded traversal, symlink escape and hidden files are all refused", need, async () => {
  for (const p of ["/../hello.txt", "/%2e%2e/hello.txt", "/docs/../../hello.txt", "/..%2f..%2fetc/passwd", "/.secret", "/lan_share.py", "/mounted.json", "/escape/private.txt", "/escape/", "/%00"]) {
    const r = await req(`/${token}${p}`);
    assert.ok([400, 404].includes(r.status), `${p} → ${r.status}`);
    assert.ok(!r.body.includes("TOP-SECRET-OUTSIDE") && !r.body.includes("hidden") && !r.body.includes("sample"), p);
  }
});

test("read-only: write methods are rejected", need, async () => {
  for (const m of ["POST", "PUT", "DELETE", "PATCH"]) assert.equal((await req(`/${token}/hello.txt`, { method: m })).status, 405, m);
});

test("another device on the same network can open it with just a browser", need, async () => {
  const ext = Object.values(networkInterfaces()).flat().find((i) => i && !i.internal && i.family === "IPv4");
  if (!ext) return;
  assert.equal((await req(`/${token}/hello.txt`, { host: ext.address })).body, "0123456789");
});

test("only private-network clients are accepted", need, () => {
  const code = `import importlib.util,sys;sys.argv=['x'];s=importlib.util.spec_from_file_location('m','lan_share.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print([m.is_private_client(i) for i in ['192.168.1.5','10.0.0.2','172.20.1.1','127.0.0.1','169.254.1.1','8.8.8.8','1.1.1.1','::ffff:8.8.8.8','garbage']])`;
  const r = spawnSync(py, ["-c", code], { cwd: root, encoding: "utf8" });
  assert.equal(r.stdout.trim(), "[True, True, True, True, True, False, False, False, False]", r.stderr);
});
