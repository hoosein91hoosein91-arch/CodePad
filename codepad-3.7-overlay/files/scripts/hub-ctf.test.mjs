import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CTF_CHALLENGES, checkAnswer, submit, progress, reset, verifyForgedJwt } from "../mobile-src/assets/hub-ctf.js";

const by = Object.fromEntries(CTF_CHALLENGES.map((c) => [c.id, c]));
const b64 = (s) => Buffer.from(s, "base64").toString();
const rot = (s, n) => s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + n) % 26 + 26) % 26 + b); });
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

// حل‌کننده‌های مستقل: هر چالش واقعاً با همین روش حل می‌شود
const solvers = {
  base64: (c) => b64(c.data),
  caesar: (c) => rot(c.data, -7),
  hex: (c) => Buffer.from(c.data, "hex").toString(),
  layers: (c) => rot(b64(c.data), -13),
  xor: (c) => { const k = parseInt(c.data.slice(0, 2), 16) ^ 0x43; return Buffer.from(c.data.match(/../g).map((h) => parseInt(h, 16) ^ k)).toString(); },
  md5: (c) => { for (const w of ["password", "123456", "qwerty", "letmein", "dragon", "sunshine", "welcome"]) if (createHash("md5").update(w).digest("hex") === c.data) return `CP{${w}}`; },
  jwt: () => `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ user: "guest", role: "admin" })}.`,
  logs: (c) => { const n = {}; for (const l of c.data.split("\n")) { const m = l.match(/Failed password .* from (\S+)/); if (m) n[m[1]] = (n[m[1]] || 0) + 1; } return "CP{attacker_" + Object.entries(n).sort((a, b) => b[1] - a[1])[0][0] + "}"; },
  dump: (c) => c.data.split("\n").map((l) => l.split("|")[1]).join("").match(/CP\{[^}]+\}/)[0],
  vig: (c) => { let i = 0; return c.data.replace(/[a-z]/gi, (ch) => { const b = ch <= "Z" ? 65 : 97, k = "LAB".charCodeAt(i++ % 3) - 65; return String.fromCharCode(((ch.charCodeAt(0) - b - k) % 26 + 26) % 26 + b); }); },
  binary: (c) => c.data.split(" ").map((x) => String.fromCharCode(parseInt(x, 2))).join(""),
  url: (c) => decodeURIComponent(decodeURIComponent(c.data)),
};

test("there are 12 challenges and every one has a story, hints and no plaintext flag", () => {
  assert.equal(CTF_CHALLENGES.length, 12);
  const src = JSON.stringify(CTF_CHALLENGES);
  for (const c of CTF_CHALLENGES) { assert.equal(c.hints.length, 3); assert.ok(c.story && c.data && c.pts > 0 && /^[0-9a-f]{64}$/.test(c.flagHash)); assert.ok(!src.includes(`"CP{`) || c.id === "dump" || c.id === "md5", "flag text must not be embedded in " + c.id); }
});

for (const id of Object.keys(solvers)) {
  test(`challenge ${id} is solvable by the intended method and rejects wrong answers`, async () => {
    const c = by[id], answer = solvers[id](c);
    assert.ok(answer, "solver produced an answer");
    assert.equal(await checkAnswer(c, answer), true, answer);
    assert.equal(await checkAnswer(c, "CP{wrong_guess}"), false);
    assert.equal(await checkAnswer(c, ""), false);
  });
}
test("every challenge has a solver", () => assert.deepEqual(Object.keys(solvers).sort(), CTF_CHALLENGES.map((c) => c.id).sort()));

test("JWT forging rules: needs alg=none, role=admin, empty signature", () => {
  const h = b64u({ alg: "none" }), p = b64u({ role: "admin" });
  assert.equal(verifyForgedJwt(`${h}.${p}.`), true);
  assert.equal(verifyForgedJwt(`${h}.${p}`), true, "missing trailing dot is still an empty signature");
  assert.equal(verifyForgedJwt(`${b64u({ alg: "HS256" })}.${p}.`), false);
  assert.equal(verifyForgedJwt(`${h}.${b64u({ role: "user" })}.`), false);
  assert.equal(verifyForgedJwt(`${h}.${p}.sig`), false);
  assert.equal(verifyForgedJwt("garbage"), false);
});

test("progress is saved, scored and survives a broken store", async () => {
  const st = mem();
  assert.equal(progress(st).points, 0);
  const r = await submit("base64", solvers.base64(by.base64), st);
  assert.ok(r.ok && r.points === 10);
  assert.equal((await submit("hex", "nope", st)).ok, false);
  assert.deepEqual([progress(st).count, progress(st).points], [1, 10]);
  reset(st); assert.equal(progress(st).count, 0);
  assert.equal(progress({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }).count, 0);
  assert.equal((await submit("nope", "x", st)).ok, false);
});
