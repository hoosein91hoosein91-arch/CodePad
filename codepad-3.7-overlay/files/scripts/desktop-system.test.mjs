import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { createSystem, shellCommand } = require(join(root, "resources/windows/desktop/system.js"));

// the host directory is assembled exactly like the packaging script does it
const hostDir = mkdtempSync(join(tmpdir(), "cp-host-"));
cpSync(join(root, "resources/windows/desktop/pyhost"), hostDir, { recursive: true });
for (const f of ["codepad_console.py", "codepad_runtime.py", "codepad.py"]) cpSync(join(root, "resources/python", f), join(hostDir, f));
const make = () => createSystem({ platform: process.platform, userData: mkdtempSync(join(tmpdir(), "cp-ud-")), resourcesPath: "", hostDir, env: process.env });

test("shell command mapping: PowerShell -File with a UTF-8 BOM script on Windows, sh elsewhere", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const tmp = mkdtempSync(join(tmpdir(), "cp-ps-"));
  const tricky = `$c = @'\nprint("quote \\" and \\d regex \u0641\u0627\u0631\u0633\u06cc")\n'@\nWrite-Output $c`;
  const win = shellCommand("win32", tricky, tmp);
  assert.equal(win.file, "powershell.exe");
  assert.deepEqual(win.args.slice(0, 5), ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]);
  assert.equal(win.args.at(-2), "-File");
  const script = readFileSync(win.args.at(-1), "utf8");
  assert.ok(script.startsWith("\ufeff[Console]::OutputEncoding=[Text.Encoding]::UTF8"), "BOM + UTF-8 console");
  assert.ok(script.includes(tricky), "the command is stored verbatim (no escaping)");
  assert.match(script, /exit \$LASTEXITCODE/);
  win.cleanup(); assert.equal(existsSync(win.args.at(-1)), false);
  const lin = shellCommand("linux", "ls", tmp);
  assert.deepEqual([lin.file, lin.args], ["/bin/sh", ["-c", "ls"]]);
});

test("shellRun returns stdout, stderr and the real exit code; times out cleanly", async () => {
  const sys = make();
  const ok = await sys.shellRun("echo hello-فارسی; echo oops 1>&2; exit 3");
  assert.equal(ok.stdout.trim(), "hello-فارسی"); assert.equal(ok.stderr.trim(), "oops"); assert.equal(ok.exitCode, 3);
  const slow = await sys.shellRun("sleep 30", { timeoutMs: 1000 });
  assert.equal(slow.timedOut, true); assert.equal(slow.exitCode, 124);
  await assert.rejects(sys.shellRun("   "), /فرمان/);
});

function collect(sys, payload) {
  const events = []; let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const emit = ({ data }) => { events.push(data); if (data.done) resolveDone(data); };
  const started = sys.pythonStart({ channel: "c1", payload: JSON.stringify(payload) }, emit);
  return { events, done, started };
}
const job = (code, extra = {}) => ({ id: 7, projectKey: "t" + Math.random(), entryFile: "main.py", code, assets: [], stdin: "", ...extra });

test("real CPython: streaming output, sockets, sqlite3 and threads work (they do not in WebAssembly)", async () => {
  const sys = make();
  const code = `
import socket, sqlite3, threading
srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen(1); port = srv.getsockname()[1]
t = threading.Thread(target=lambda: (lambda c: (c.sendall(c.recv(10).upper()), c.close()))(srv.accept()[0])); t.start()
c = socket.create_connection(("127.0.0.1", port)); c.sendall(b"codepad"); print("SOCKET", c.recv(10)); t.join()
db = sqlite3.connect(":memory:"); db.execute("create table t(x)"); db.execute("insert into t values (42)"); print("SQLITE", db.execute("select x from t").fetchone()[0])
print("فارسی OK")
`;
  const { events, done } = collect(sys, job(code));
  const end = await done;
  const out = events.filter((e) => e.stream && e.kind === "out").map((e) => e.text).join("");
  assert.match(out, /SOCKET b'CODEPAD'/); assert.match(out, /SQLITE 42/); assert.match(out, /فارسی OK/);
  assert.equal(end.displayStderr, ""); assert.equal(end.streamed, true);
  assert.ok(events.some((e) => e.phase === "run" && /CPython/.test(e.engine)));
});

test("input() and getpass are answered from the prepared input (no dialog is ever requested); argv and env from the run config", async () => {
  const sys = make();
  const code = `
import sys, os, getpass
print("argv", sys.argv[1:], os.environ.get("CP_TOKEN"))
name = input("Name: "); print("hello", name)
print("secret", getpass.getpass("Token: "))
try:
    input("More: ")
except EOFError as e:
    print("EOF:", str(e)[:12])
`;
  const { events, done } = collect(sys, job(code, { stdin: "کدپد\ns3", runConfig: { argv: ["--daily-at", "09:30"], env: { CP_TOKEN: "abc" } } }));
  const end = await done;
  assert.equal(events.filter((e) => e.inputRequest).length, 0, "the host never asks the page for input");
  const out = events.filter((e) => e.stream && e.kind === "out").map((e) => e.text).join("");
  assert.match(out, /argv \['--daily-at', '09:30'\] abc/); assert.match(out, /Name: کدپد/); assert.match(out, /hello کدپد/); assert.match(out, /secret s3/);
  assert.ok(!/s3[\s\S]*s3/.test(out.replace("secret s3", "")), "secret is not echoed");
  assert.match(out, /EOF: ورودی آماده/, "running out of answers is a normal EOFError with a clear message");
  assert.equal(end.done, true);
});

test("only one job at a time; Stop kills the process and reports an aborted run", async () => {
  const sys = make();
  const { done } = collect(sys, job("import time\nprint('start', flush=True)\ntime.sleep(60)\n"));
  await new Promise((r) => setTimeout(r, 800));
  await assert.rejects(sys.pythonStart({ channel: "c2", payload: JSON.stringify(job("print(1)")) }, () => {}), /در حال اجراست/);
  assert.equal(sys.pythonStatus().running, true);
  const t0 = Date.now(); sys.pythonStop();
  const end = await done;
  assert.equal(end.aborted, true); assert.ok(Date.now() - t0 < 5000);
  assert.equal(sys.pythonStatus().running, false);
  const again = collect(sys, job("print('after stop')")); await again.started; assert.match((await again.done).stdout, /after stop/);
});

test("errors in user code are reported as failures, not host crashes", async () => {
  const sys = make();
  const { done } = collect(sys, job("raise ValueError('boom-123')"));
  const end = await done;
  assert.match(end.displayStderr, /ValueError: boom-123/);
});

test("pythonExec stages files safely and returns stdout/stderr/exitCode", async () => {
  const sys = make();
  const r = await sys.pythonExec({ id: "p1", files: [{ name: "main.py", content: "import helper\nprint(helper.X, input())\nimport sys; sys.exit(2)" }, { name: "helper.py", content: "X = 5" }], entry: "main.py", stdin: "hi\n" });
  assert.equal(r.stdout.trim(), "5 hi"); assert.equal(r.exitCode, 2);
  await assert.rejects(sys.pythonExec({ id: "p1", files: [{ name: "../evil.py", content: "" }], entry: "main.py" }), /مسیر/);
});

test("info reports the shell and Python it found", () => {
  const i = make().info();
  assert.equal(i.shell, process.platform === "win32" ? "powershell" : "sh");
  assert.ok(i.python && /^3\.\d+$/.test(i.python.version));
});

import { safeReportName, saveReportFile, isInsideDir } from "../resources/windows/desktop/system.js";
import { mkdtempSync as mkd, readFileSync as rd, existsSync as ex, symlinkSync as sym, writeFileSync as wr } from "node:fs";
import { tmpdir as tmp } from "node:os";
import { join as jn } from "node:path";

test("reports are saved into the public reports folder with safe, unique names", () => {
  const dir = jn(mkd(jn(tmp(), "cprep-")), "CodePad", "Reports");
  const b64 = (s) => Buffer.from(s).toString("base64");
  const a = saveReportFile(dir, "network_report-2026-11-17_2230.txt", b64("گزارش ۱"));
  assert.equal(rd(a.path, "utf8"), "گزارش ۱");
  assert.equal(a.dir.endsWith(jn("CodePad", "Reports")), true);
  const b = saveReportFile(dir, "network_report-2026-11-17_2230.txt", b64("دوم"));
  assert.notEqual(b.path, a.path, "never overwrites an existing report");
  assert.equal(rd(a.path, "utf8"), "گزارش ۱");
  assert.match(b.name, /-1\.txt$/);
});
test("report names cannot escape the folder or become runnable files", () => {
  assert.equal(safeReportName("../../Windows/evil.txt"), "evil.txt");
  assert.equal(safeReportName("..\\..\\x.txt"), "x.txt");
  assert.equal(safeReportName("run.bat"), "run.bat.txt");
  assert.equal(safeReportName("setup.EXE"), "setup.EXE.txt");
  assert.equal(safeReportName("con.txt"), "_con.txt");
  assert.equal(safeReportName(""), "report.txt");
  assert.equal(safeReportName("a<b>c:d.txt"), "a_b_c_d.txt");
  const dir = mkd(jn(tmp(), "cprep2-"));
  assert.throws(() => saveReportFile(dir, "x.txt", ""), /Empty/);
  assert.throws(() => saveReportFile(dir, "x.txt", Buffer.alloc(20).toString("base64"), 10), /too large/);
  const s = saveReportFile(dir, "../../escape.txt", Buffer.from("hi").toString("base64"));
  assert.equal(s.path.startsWith(s.dir), true);
});
test("reveal is limited to files inside the reports folder (symlinks included)", () => {
  const base = mkd(jn(tmp(), "cprep3-")), dir = jn(base, "Reports"), outside = jn(base, "secret.txt");
  const r = saveReportFile(dir, "ok.txt", Buffer.from("x").toString("base64"));
  wr(outside, "s");
  assert.equal(isInsideDir(dir, r.path), true);
  assert.equal(isInsideDir(dir, outside), false);
  assert.equal(isInsideDir(dir, jn(dir, "missing.txt")), false);
  sym(outside, jn(dir, "link.txt"));
  assert.equal(isInsideDir(dir, jn(dir, "link.txt")), false, "a link out of the folder is not a report");
});
