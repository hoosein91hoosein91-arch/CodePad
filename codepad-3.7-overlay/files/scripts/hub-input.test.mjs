// CodePad دیگر پنجرهٔ سؤال ندارد: input() فقط از «جواب‌های آماده» می‌خواند. این آزمون با میزبان بومی واقعی CodePad
// هر نمونهٔ تعاملی را هم با جواب‌های آمادهٔ خودش و هم با ورودی خالی اجرا می‌کند: نباید گیر کند، سؤالی به صفحه بفرستد یا Traceback بدهد.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { HUB_SAMPLES } from "../mobile-src/assets/hub-data.js";

const host = join(dirname(fileURLToPath(import.meta.url)), "../resources/python");
const py = ["python3", "python"].find((c) => spawnSync(c, ["--version"]).status === 0);
const need = { skip: !py && "python is not installed" };

function run(code, stdin) {
  const dir = mkdtempSync(join(tmpdir(), "cpin-"));
  const cfg = join(dir, "cfg.json");
  writeFileSync(cfg, JSON.stringify({ code, stdin }));
  const script = String.raw`
import json, sys, tempfile
sys.path.insert(0, sys.argv[1])
import codepad_runtime
cfg = json.load(open(sys.argv[2]))
log, asked, shown = [], [], []
class Bridge:
    def write(self, kind, text): log.append(text)
    def flush(self): pass
    def finish(self, failure): log.append("\nFINISH:" + (failure or ""))
    def requestInput(self, prompt): asked.append(prompt); return "SHOULD-NEVER-BE-USED"
    def display(self, j): shown.append(json.loads(j))
codepad_runtime.run(json.dumps({"projectKey": "t", "entryFile": "main.py", "code": cfg["code"], "assets": [], "stdin": cfg["stdin"]}), tempfile.mkdtemp(), Bridge())
sys.__stdout__.write("RESULT" + json.dumps({"log": "".join(log), "asked": asked, "shown": shown}))
`;
  const r = spawnSync(py, ["-I", "-c", script, host, cfg], { encoding: "utf8", timeout: 30000, env: { ...process.env, CP_LAB_PORT: "0" } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return JSON.parse(r.stdout.split("RESULT").pop());
}

const interactive = HUB_SAMPLES.filter((s) => s.ext === "py" && /\binput\(|\bask\(/.test(s.code) && s.id !== "sec_lab_site" && s.id !== "sec_lan_share");

test("there are interactive samples and every one ships prepared answers or has a safe default", need, () => {
  assert.ok(interactive.length >= 10);
  for (const s of interactive) assert.ok(/EOFError/.test(s.code), `${s.id} must handle running out of answers`);
});

for (const s of interactive) {
  test(`${s.id}: finishes with its prepared answers, never asks the page, no traceback`, need, () => {
    const r = run(s.code, s.stdin);
    assert.deepEqual(r.asked, [], "no interactive question");
    assert.ok(!/Traceback|Error:/.test(r.log), r.log.slice(-400));
    assert.match(r.log, /FINISH:\s*$/m, "finished normally");
  });
  test(`${s.id}: with NO prepared answers it ends cleanly instead of hanging`, need, () => {
    const r = run(s.code, "");
    assert.deepEqual(r.asked, []);
    assert.ok(!/Traceback/.test(r.log), r.log.slice(-400));
  });
}

test("the demo games really play: guess wins, tic-tac-toe has a winner, calculator refuses code injection", need, () => {
  const by = Object.fromEntries(HUB_SAMPLES.map((s) => [s.id, s]));
  assert.match(run(by.games_guess.code, by.games_guess.stdin).log, /درست بود/);
  assert.match(run(by.games_tictactoe.code, by.games_tictactoe.stdin).log, /X برد/);
  assert.match(run(by.games_rps.code, by.games_rps.stdin).log, /برنده: تو/);
  const calc = run(by.tool_calc.code, by.tool_calc.stdin).log;
  assert.match(calc, /= 14/); assert.match(calc, /= 1036\.0/); assert.match(calc, /خطا: عبارت مجاز نیست/);
});

test("the question dialog is gone from the shipped page", () => {
  const html = String(spawnSync("cat", [join(dirname(fileURLToPath(import.meta.url)), "../mobile-src/index.html")], { encoding: "utf8" }).stdout);
  assert.ok(!html.includes("python-input"), "python-input.js/css must not be loaded");
});

test("a program that asks for more than was prepared gets an EOFError that says what to do", need, () => {
  const r = run('try:\n    input("x? ")\nexcept EOFError as e:\n    print("MSG:", e)\n', "");
  assert.match(r.log, /MSG: ورودی آماده تمام شد/);
  assert.deepEqual(r.asked, []);
  const r2 = run('import getpass\nprint("got", getpass.getpass("pw: "))\nprint(input())\n', "secret\nline2");
  assert.match(r2.log, /got secret/); assert.match(r2.log, /line2/); assert.ok(!/secret[\s\S]*secret/.test(r2.log.replace("got secret", "")), "getpass answer is not echoed");
});

test("codepad.share_file hands a report to the page (the Save / Share card) from inside the real host", need, () => {
  const r = run('import codepad\ncodepad.share_file("گزارش آزمایشی\\nخط دوم", name="r.txt", title="گزارش")\nprint("sent")\n', "");
  assert.match(r.log, /sent/);
  assert.equal(r.shown.length, 1);
  const f = r.shown[0];
  assert.equal(f.kind, "file"); assert.equal(f.name, "r.txt"); assert.equal(f.mime, "text/plain"); assert.equal(f.title, "گزارش");
  assert.equal(Buffer.from(f.b64, "base64").toString(), "گزارش آزمایشی\nخط دوم");
  const big = run('import codepad\ntry:\n    codepad.share_file(b"x" * (5 * 1024 * 1024), name="big.bin")\nexcept ValueError as e:\n    print("REFUSED", e)\n', "");
  assert.match(big.log, /REFUSED/); assert.equal(big.shown.length, 0);
  const file = run('import codepad\nopen("out.csv","w").write("a,b\\n1,2\\n")\ncodepad.share_file("out.csv")\n', "");
  assert.equal(file.shown[0].name, "out.csv"); assert.equal(file.shown[0].mime, "text/csv");
});
