// آزمون داشبورد شبکه: فقط شبکهٔ خصوصی، نیازمند تأیید، و با سرور واقعی محلی پورت باز را با عنوان صفحه پیدا می‌کند.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { HUB_SAMPLES } from "../mobile-src/assets/hub-data.js";

const py = ["python3", "python"].find((c) => spawnSync(c, ["--version"]).status === 0);
const need = { skip: !py && "python is not installed" };
const dir = mkdtempSync(join(tmpdir(), "cpnet-"));
if (py) writeFileSync(join(dir, "scan.py"), HUB_SAMPLES.find((s) => s.id === "sec_lan_dashboard").code);

const run = (env, stdin) => new Promise((resolve) => {
  const p = spawn(py, ["scan.py"], { cwd: dir, env: { ...process.env, ...env } });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  p.stdin.write(stdin); p.stdin.end(); p.on("close", () => resolve(out));
});

test("public ranges are refused before anything is sent", need, async () => {
  for (const net of ["8.8.8.0/24", "1.1.1.1/32", "0.0.0.0/0", "10.0.0.0/8"]) {
    const out = await run({ CP_NET: net }, "y\n");
    assert.match(out, /✖/, net);
    assert.ok(!out.includes("شبکهٔ هدف"), net + " must not start scanning");
  }
});

test("without the owner's confirmation nothing is scanned", need, async () => {
  const out = await run({ CP_NET: "127.0.0.1/32", CP_PORTS: "80" }, "n\n");
  assert.match(out, /لغو شد/);
  assert.ok(!existsSync(join(dir, "network_report.txt")));
});

test("finds an open port and reads the page title, and flags risky services", need, async () => {
  const srv = http.createServer((_, res) => { res.setHeader("Server", "TestRouter/1.0"); res.end("<html><title>Router Admin</title></html>"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const out = await run({ CP_NET: "127.0.0.1/32", CP_PORTS: `${port},23` }, "y\n");
  srv.close();
  assert.match(out, new RegExp(String(port)));
  assert.match(out, /Router Admin/);
  assert.match(out, /TestRouter/);
  assert.ok(existsSync(join(dir, "network_report.txt")));
});
