// آزمون با «میزبان بومی واقعی» CodePad (همان codepad_runtime.py اندروید/ویندوز): برنامه‌های امنیتی داخل CodePad واقعاً سرور بالا می‌آورند.
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

function runInHost(sampleId, { port, assets = [], env = {}, probe }) {
  const dir = mkdtempSync(join(tmpdir(), "cphost-"));
  const sample = HUB_SAMPLES.find((s) => s.id === sampleId);
  const cfg = join(dir, "cfg.json");
  writeFileSync(cfg, JSON.stringify({ code: sample.code, entry: sample.file, assets, env: { ...env }, port }));
  const script = String.raw`
import json, os, sys, threading, time, urllib.request, tempfile
sys.path.insert(0, sys.argv[1])
import codepad_runtime
cfg = json.load(open(sys.argv[2]))
log = []
class Bridge:
    def write(self, kind, text): log.append(text)
    def flush(self): pass
    def finish(self, failure): log.append("FINISH:" + (failure or ""))
    def requestInput(self, prompt): return "y"
    def display(self, j): pass
payload = json.dumps({"projectKey": "t", "entryFile": cfg["entry"], "code": cfg["code"], "assets": cfg["assets"], "runConfig": {"env": cfg["env"]}})
t = threading.Thread(target=lambda: codepad_runtime.run(payload, tempfile.mkdtemp(), Bridge()), daemon=True)
t.start()
def get(path):
    for _ in range(60):
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d%s" % (cfg["port"], path), timeout=2) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "replace")
        except Exception:
            time.sleep(0.1)
    return None, ""
results = {}
${probe}
sys.__stdout__.write("RESULT" + json.dumps({"results": results, "log": "".join(log)}) + "\n")
sys.__stdout__.flush()
os._exit(0)
`;
  const r = spawnSync(py, ["-I", "-c", script, host, cfg], { encoding: "utf8", timeout: 40000 });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return JSON.parse(r.stdout.split("RESULT").pop());
}

test("the vulnerable lab runs inside the real CodePad host and serves on 127.0.0.1", need, () => {
  const port = 21000 + Math.floor(Math.random() * 500);
  const out = runInHost("sec_lab_site", { port, env: { CP_LAB_PORT: String(port) }, probe: `
results["home"] = get("/")
results["debug"] = get("/debug")
` });
  assert.equal(out.results.home[0], 200);
  assert.match(out.results.home[1], /آزمایشگاه تست نفوذ/);
  assert.match(out.results.debug[1], /CP\{debug_/);
  assert.match(out.log, /روشن شد/);
  assert.ok(!/Traceback/.test(out.log), out.log);
});

test("LAN share inside the real host serves a project attachment and hides the program itself", need, () => {
  const port = 21600 + Math.floor(Math.random() * 300);
  const b64 = Buffer.from("<h1>سلام از CodePad</h1>").toString("base64");
  const out = runInHost("sec_lan_share", { port, env: { CP_SHARE_PORT: String(port), CP_SHARE_TOKEN: "0" }, assets: [{ name: "index.html", b64 }, { name: "notes.txt", b64: Buffer.from("hello").toString("base64") }], probe: `
results["index"] = get("/")
results["notes"] = get("/notes.txt")
results["self"] = get("/sec_lan_share.py")
results["traversal"] = get("/..%2f..%2fetc%2fpasswd")
` });
  assert.equal(out.results.index[0], 200);
  assert.match(out.results.index[1], /سلام از CodePad/);
  assert.equal(out.results.notes[1], "hello");
  assert.equal(out.results.self[0], 404, "the program's own source is not shared");
  assert.equal(out.results.traversal[0], 404);
  assert.match(out.log, /اشتراک روی شبکه روشن شد/);
  assert.ok(!/Traceback/.test(out.log), out.log);
});
