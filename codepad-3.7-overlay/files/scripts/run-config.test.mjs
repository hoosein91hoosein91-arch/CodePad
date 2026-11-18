import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, parseEnv } from "../mobile-src/assets/run-config.js";
import { guessPythonEntry } from "../mobile-src/assets/project-zip.js";

test("parseArgs splits like a simple shell", () => {
  assert.deepEqual(parseArgs('--daily-at 09:30 "two words" \'single q\' a\\ b ""'), ["--daily-at", "09:30", "two words", "single q", "a b", ""]);
  assert.deepEqual(parseArgs("   "), []);
  assert.throws(() => parseArgs('"open'), /نقل‌قول/);
  assert.throws(() => parseArgs("x ".repeat(70)), /۶۴/);
});

test("parseEnv reads NAME=value lines, comments and quotes; rejects bad names", () => {
  assert.deepEqual(parseEnv('# c\nBALE_TOKEN=123:abc\nRADAR_MODEL_NAME="qwen 3"\n\nEMPTY='), { BALE_TOKEN: "123:abc", RADAR_MODEL_NAME: "qwen 3", EMPTY: "" });
  assert.throws(() => parseEnv("1BAD=x"), /NAME=value/);
  assert.throws(() => parseEnv("novalue"), /NAME=value/);
});

test("entry guess prefers the runnable script and ignores tests", () => {
  const f = (name, content) => ({ name, content });
  const main = 'x = 1\nif __name__ == "__main__":\n    main()\n';
  assert.equal(guessPythonEntry([f("bale_bot.py", main), f("desk.py", "def a(): pass\n"), f("tests/test_desk.py", main)]), "bale_bot.py");
  assert.equal(guessPythonEntry([f("a.py", main), f("b.py", main)]), "");
  assert.equal(guessPythonEntry([f("tools.py", main), f("run_job.py", main)]), "run_job.py");
});
