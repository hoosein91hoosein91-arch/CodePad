import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const host = join(dirname(fileURLToPath(import.meta.url)), "../resources/python");
const script = String.raw`
import json, os, sys, tempfile
sys.path.insert(0, sys.argv[1])
import codepad_runtime
log = []
class Bridge:
    def write(self, kind, text): log.append(text)
    def flush(self): pass
    def finish(self, failure): log.append("FAIL:" + failure if failure else "DONE")
    def requestInput(self, prompt):
        log.append("ASK:" + repr(prompt)); return "never-used"
    def display(self, j): pass
code = """
import sys, os, getpass
print("argv", sys.argv[1:])
print("env", os.environ.get("CP_TEST"))
print("got", getpass.getpass("Token: "))
"""
payload = json.dumps({"projectKey": "t", "entryFile": "main.py", "code": code, "assets": [], "stdin": "s3cret",
    "runConfig": {"argv": ["--daily-at", "09:30"], "env": {"CP_TEST": "yes", "PATH": "/evil", "bad name": "x"}}})
before = os.environ.get("PATH")
codepad_runtime.run(payload, tempfile.mkdtemp(), Bridge())
print(json.dumps({"log": "".join(log), "env_after": os.environ.get("CP_TEST"), "path_same": os.environ.get("PATH") == before}))
`;

test("native host applies run config, answers getpass from the prepared input and restores the environment", () => {
  const r = spawnSync("python3", ["-I", "-c", script, host], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim().split("\n").at(-1));
  assert.match(out.log, /argv \['--daily-at', '09:30'\]/);
  assert.match(out.log, /env yes/);
  assert.ok(!/ASK:/.test(out.log), "no interactive question is ever sent to the page");
  assert.match(out.log, /got s3cret/);
  assert.ok(!/s3cret[\s\S]*s3cret/.test(out.log.replace("got s3cret", "")), "secret answer must not be echoed");
  assert.match(out.log, /DONE/);
  assert.equal(out.env_after, null);
  assert.equal(out.path_same, true);
});

const interactiveScript = String.raw`
import json, sys, tempfile
sys.path.insert(0, sys.argv[1])
import codepad_runtime
log, asked = [], []
class Bridge:
    def write(self, kind, text): log.append(text)
    def flush(self): pass
    def finish(self, failure): log.append("FAIL:" + failure if failure else "DONE")
    def requestInput(self, prompt):
        asked.append(prompt); return "typed" if len(asked) == 1 else None
    def display(self, j): pass
code = "import getpass\nprint('got', input('Name: '))\ntry:\n    input('More: ')\nexcept EOFError:\n    print('EOF-OK')\n"
codepad_runtime.run(json.dumps({"projectKey": "i", "entryFile": "main.py", "code": code, "assets": [], "interactive": True}), tempfile.mkdtemp(), Bridge())
print(json.dumps({"log": "".join(log), "asked": asked}))
`;
test("interactive mode (exported apps) asks through requestInput; EOF from the page ends input", () => {
  const r = spawnSync("python3", ["-I", "-c", interactiveScript, host], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim().split("\n").at(-1));
  assert.deepEqual(out.asked, ["Name: ", "More: "]);
  assert.match(out.log, /got typed/); assert.match(out.log, /EOF-OK/); assert.match(out.log, /DONE/);
});
