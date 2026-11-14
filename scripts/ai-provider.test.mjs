import test from "node:test";
import assert from "node:assert/strict";
import { AI_PRESETS, aiReady, askCustom, buildRequest, extractAnswer, isCustomReady, loadCustomAI, pickPath, saveCustomAI, stripThinking } from "../mobile-src/assets/ai-provider.js";

const openai = { ...AI_PRESETS.openai, url: "http://10.0.0.5:8000/v1/chat/completions", model: "my-model", key: "" };
const reply = (body, init = {}) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, ...init });

test("OpenAI preset builds messages and omits empty Authorization", () => {
  const { url, init } = buildRequest(openai, "سلام", "be brief");
  assert.equal(url, openai.url);
  const body = JSON.parse(init.body);
  assert.equal(body.model, "my-model");
  assert.deepEqual(body.messages, [{ role: "system", content: "be brief" }, { role: "user", content: "سلام" }]);
  assert.equal(init.headers.Authorization, undefined);
  assert.equal(buildRequest({ ...openai, key: "k1" }, "x").init.headers.Authorization, "Bearer k1");
});

test("quotes and newlines in the prompt stay valid JSON", () => {
  const cfg = { ...AI_PRESETS.simple, url: "http://h/generate" };
  const prompt = 'say "hi"\nand \\ done';
  assert.equal(JSON.parse(buildRequest(cfg, prompt).init.body).prompt, prompt);
});

test("validation errors are Persian and specific", () => {
  assert.throws(() => buildRequest({ ...openai, url: "ftp://x" }, "a"), /http/);
  assert.throws(() => buildRequest({ ...openai, headers: "nope" }, "a"), /سرآیندها/);
  assert.throws(() => buildRequest({ ...openai, body: "[1]" }, "a"), /قالب بدنه/);
  assert.equal(isCustomReady({ url: "not a url" }), false);
});

test("pickPath and auto detection", () => {
  assert.equal(pickPath({ a: [{ b: "x" }] }, "a[0].b"), "x");
  assert.equal(extractAnswer({ choices: [{ message: { content: " hi " } }] }), "hi");
  assert.equal(extractAnswer({ response: "ok" }), "ok");
  assert.equal(extractAnswer({ out: { t: ["a", { text: "b" }] } }, "out.t"), "ab");
  assert.throws(() => extractAnswer({ x: 1 }, "no.such"), /no\.such/);
  assert.throws(() => extractAnswer({ x: 1 }), /مسیر پاسخ/);
});

test("askCustom returns text, strips <think>, and surfaces server errors", async () => {
  assert.equal(await askCustom(openai, "q", { fetcher: reply({ choices: [{ message: { content: "<think>hmm</think>جواب" } }] }) }), "جواب");
  assert.equal(await askCustom({ ...openai, responsePath: "" }, "q", { fetcher: reply("plain text") }), "plain text");
  await assert.rejects(askCustom(openai, "q", { fetcher: reply({ error: { message: "model not loaded" } }, { status: 503 }) }), /503.*model not loaded/);
  await assert.rejects(askCustom(openai, "q", { fetcher: async () => { throw new TypeError("Failed to fetch"); } }), /CORS/);
  await assert.rejects(askCustom(openai, "  "), /خالی/);
});

test("abort from the caller is propagated unchanged", async () => {
  const ctl = new AbortController();
  const fetcher = (_u, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const p = askCustom(openai, "q", { fetcher, signal: ctl.signal });
  ctl.abort(new DOMException("stop", "AbortError"));
  await assert.rejects(p, (e) => e.name === "AbortError");
});

test("settings persist and readiness follows the provider", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveCustomAI({ url: "https://ai.example/x", model: "m" }, storage);
  assert.equal(loadCustomAI(storage).model, "m");
  assert.equal(aiReady({ provider: "custom", custom: loadCustomAI(storage), key: "" }), true);
  assert.equal(aiReady({ provider: "gemini", key: "" }), false);
  assert.equal(aiReady({ provider: "gemini", key: "AIza" }), true);
  assert.equal(stripThinking("<think>x</think>"), "<think>x</think>".trim());
});
