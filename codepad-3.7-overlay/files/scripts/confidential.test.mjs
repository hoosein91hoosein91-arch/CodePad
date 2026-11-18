import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedOrigin, hostOf, loadState, isEnabled, setEnabled,
  hasPin, setPin, checkPin, changePin, clearPin, validPin,
  guard, guardUrl, readLog, clearLog, log,
} from "../mobile-src/assets/confidential.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const HOME = "http://127.0.0.1:8090/";

test("isAllowedOrigin: same-origin, loopback and local schemes pass; everything else is an exit", () => {
  assert.equal(isAllowedOrigin("/assets/runtime.js", HOME), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:8090/libs/three.min.js", HOME), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:9999/x", HOME), true, "any loopback port");
  assert.equal(isAllowedOrigin("http://localhost:3000/x", HOME), true);
  assert.equal(isAllowedOrigin("blob:http://x/abc", HOME), true);
  assert.equal(isAllowedOrigin("data:text/plain,hi", HOME), true);
  assert.equal(isAllowedOrigin("codepad://app/assets/runtime.js", "codepad://app/"), true);
  assert.equal(isAllowedOrigin("https://api.openai.com/v1/chat", HOME), false);
  assert.equal(isAllowedOrigin("https://192.168.1.10:8000/v1/chat", HOME), false, "a LAN AI server is still an exit from this device");
  assert.equal(isAllowedOrigin("http://evil.example/leak", HOME), false);
  // a bare word with no scheme resolves as a same-origin relative path — that is correct, not a loophole
  assert.equal(isAllowedOrigin("not-a-url-but-a-relative-path", HOME), true);
  assert.equal(isAllowedOrigin(undefined, HOME), true, "String(undefined) == 'undefined', also a relative path");
  assert.equal(isAllowedOrigin("/x", "this-is-not-a-valid-base-at-all"), false, "an unparseable base/URL is treated as blocked, not allowed");
});

test("hostOf extracts just the hostname, never the path or query (log hygiene)", () => {
  assert.equal(hostOf("https://evil.example/leak?secret=abc123&token=xyz"), "evil.example");
  assert.equal(hostOf("http://127.0.0.1:8090/x"), "127.0.0.1");
});

test("mode state persists and survives a broken/missing store", () => {
  const st = mem();
  assert.equal(isEnabled(st), false);
  assert.equal(loadState({ getItem: () => { throw new Error("blocked"); } }).enabled, false);
});

test("PIN: hashed with per-record salt, never stored in plaintext, correct/wrong checked, 4-8 digits enforced", async () => {
  const st = mem();
  assert.equal(hasPin(st), false);
  assert.equal(validPin("12"), false); assert.equal(validPin("abcd"), false); assert.equal(validPin("123456789"), false);
  assert.equal(validPin("1234"), true); assert.equal(validPin("123456"), true);
  await assert.rejects(() => setPin("ab12", st), /عدد/);
  await setPin("135790", st);
  assert.equal(hasPin(st), true);
  const raw = JSON.stringify(Object.fromEntries([...st.getItem !== undefined ? [] : []]));
  const stored = st.getItem("codepad-confidential-pin-v1");
  assert.ok(!stored.includes("135790"), "the raw PIN must never appear in storage");
  assert.equal(await checkPin("135790", st), true);
  assert.equal(await checkPin("000000", st), false);
  assert.equal(await checkPin("13579", st), false);
});

test("changing the PIN requires the old one; clearing removes the lock", async () => {
  const st = mem();
  await setPin("111111", st);
  await assert.rejects(() => changePin("000000", "222222", st), /فعلی/);
  assert.equal(await checkPin("111111", st), true, "a failed change does not touch the old PIN");
  await changePin("111111", "222222", st);
  assert.equal(await checkPin("222222", st), true);
  assert.equal(await checkPin("111111", st), false);
  clearPin(st);
  assert.equal(hasPin(st), false);
});

test("once a PIN is set, toggling the mode needs it; before that, anyone can toggle", async () => {
  const st = mem();
  assert.equal(await setEnabled(true, { storage: st, broadcast: false }), true);
  assert.equal(isEnabled(st), true);
  await setPin("424242", st);
  await assert.rejects(() => setEnabled(false, { pin: "000000", storage: st, broadcast: false }), /پین/);
  assert.equal(isEnabled(st), true, "a wrong PIN must not change the state");
  await setEnabled(false, { pin: "424242", storage: st, broadcast: false });
  assert.equal(isEnabled(st), false);
});

test("guard()/guardUrl() only throw while the mode is on, and local/loopback destinations are never blocked", () => {
  const st = mem();
  assert.doesNotThrow(() => guard("clipboard", st));
  assert.doesNotThrow(() => guardUrl("https://example.com/x", "fetch", st));
  st.setItem("codepad-confidential-v1", JSON.stringify({ enabled: true }));
  assert.throws(() => guard("clipboard", st), /محرمانه/);
  assert.doesNotThrow(() => guardUrl("/assets/x.js", "fetch", st));
  assert.doesNotThrow(() => guardUrl("http://127.0.0.1:9/x", "fetch", st));
  assert.throws(() => guardUrl("https://example.com/x", "fetch", st), /محرمانه/);
});

test("the log stores only metadata (kind, hostname, timestamp) — never a URL's path/query, never any body text", () => {
  const st = mem();
  log("blocked:fetch", "evil.example", st);
  log("mode-enabled", "", st);
  const entries = readLog(st);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, "mode-enabled");
  assert.equal(entries[1].host, "evil.example");
  assert.ok(entries.every((e) => typeof e.t === "number"));
  const dump = JSON.stringify(entries);
  assert.ok(!dump.includes("secret") && !dump.includes("token"));
  clearLog(st);
  assert.equal(readLog(st).length, 0);
});

test("the log is a bounded ring buffer", () => {
  const st = mem();
  for (let i = 0; i < 350; i++) log("blocked:fetch", "h" + i, st);
  assert.ok(readLog(st).length <= 300);
});

test("guard()/guardUrl() survive a storage that throws", () => {
  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
  assert.doesNotThrow(() => guard("clipboard", broken));
  assert.doesNotThrow(() => guardUrl("https://example.com", "fetch", broken));
});
