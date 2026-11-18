// آزمون «مرجع پایتون»: هر مدخل واقعاً با python3 اجرا می‌شود (نه کد نمایشی)، و فیلتر جست‌وجو/دسته درست کار می‌کند.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REFERENCE_ITEMS, REFERENCE_CATEGORIES } from "../mobile-src/assets/hub-reference-data.js";

const py = ["python3", "python"].find((c) => spawnSync(c, ["--version"]).status === 0);
const need = { skip: !py && "python is not installed" };
let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), "hubref-")); });

test("every reference entry has a unique id, a known category, a title and a description", () => {
  const catIds = new Set(REFERENCE_CATEGORIES.map(([id]) => id));
  const seen = new Set();
  for (const it of REFERENCE_ITEMS) {
    assert.ok(!seen.has(it.id), `duplicate id: ${it.id}`);
    seen.add(it.id);
    assert.ok(catIds.has(it.cat), `${it.id}: unknown category ${it.cat}`);
    assert.ok(it.title && it.title.length > 2, `${it.id}: missing title`);
    assert.ok(it.desc && it.desc.length > 2, `${it.id}: missing description`);
    assert.ok(it.code && it.code.trim().length > 0, `${it.id}: missing code`);
  }
});

test("every reference entry actually runs with real python3 and exits cleanly", need, () => {
  for (const it of REFERENCE_ITEMS) {
    const f = join(dir, it.id + ".py");
    writeFileSync(f, it.code, "utf8");
    const input = it.code.includes("input(") ? "سارا\n25\n" : undefined;
    const r = spawnSync(py, [f], { cwd: dir, encoding: "utf8", timeout: 10000, input });
    assert.equal(r.status, 0, `${it.id} (${it.title}) failed:\n${r.stderr}`);
  }
});

test("filterItems-equivalent search matches title/description/code case-insensitively", () => {
  const needle = "regex";
  const hit = REFERENCE_ITEMS.find((x) => x.id === "ref-regex");
  const matches = (it, q) => `${it.title} ${it.desc} ${it.code}`.toLowerCase().includes(q.toLowerCase());
  assert.ok(matches(hit, needle));
  assert.ok(!matches(hit, "zzz-not-present-anywhere"));
});

test("every category (except 'all') has at least 3 entries, so none is a dead filter", () => {
  for (const [id, label] of REFERENCE_CATEGORIES) {
    if (id === "all") continue;
    const count = REFERENCE_ITEMS.filter((x) => x.cat === id).length;
    assert.ok(count >= 3, `category ${id} (${label}) only has ${count} entries`);
  }
});
