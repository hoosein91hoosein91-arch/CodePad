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

import { parseToolCalls, renderTools, runTextAgent } from "../mobile-src/assets/ai-provider.js";

test("parseToolCalls understands tags, fenced JSON and OpenAI-style objects", () => {
  assert.deepEqual(parseToolCalls('بررسی می‌کنم <tool_call>{"name":"ls","args":{"a":1}}</tool_call>').calls, [{ name: "ls", args: { a: 1 } }]);
  assert.deepEqual(parseToolCalls('```json\n{"tool":"x","arguments":{"k":"v"}}\n```').calls, [{ name: "x", args: { k: "v" } }]);
  assert.deepEqual(parseToolCalls('{"name":"y","arguments":"{\\"q\\":2}"}').calls, [{ name: "y", args: { q: 2 } }]);
  assert.equal(parseToolCalls("```js\nconsole.log(1)\n```").calls.length, 0);
  assert.equal(parseToolCalls("final answer").text, "final answer");
});

test("renderTools lists name, typed params and optionality", () => {
  const out = renderTools([{ name: "t", description: "d", parameters: { type: "OBJECT", properties: { a: { type: "STRING" }, b: { type: "INTEGER" } }, required: ["a"] } }]);
  assert.equal(out, "- t(a: string, b?: integer) — d");
});

test("runTextAgent loops through tools, reports errors back and returns the final text", async () => {
  const script = [
    '<tool_call>{"name":"echo","args":{"v":"hi"}}</tool_call>',
    '<tool_call>{"name":"nope","args":{}}</tool_call><tool_call>{"name":"boom","args":{}}</tool_call>',
    "کار تمام شد",
  ];
  const seenBodies = [];
  const fetcher = async (_u, init) => {
    seenBodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: script[seenBodies.length - 1] } }] }));
  };
  const events = [];
  const out = await runTextAgent(openai, "do it", {
    system: "SYS", tools: [{ name: "echo", description: "e", parameters: { type: "OBJECT", properties: {} } }, { name: "boom", description: "b", parameters: { type: "OBJECT", properties: {} } }],
    execute: async (name, args) => { if (name === "boom") throw new Error("exploded"); return { echoed: args.v }; },
    onEvent: (e) => events.push(e), fetcher,
  });
  assert.equal(out, "کار تمام شد");
  assert.match(seenBodies[0].messages[0].content, /AVAILABLE TOOLS:\n- echo\(/);
  const last = seenBodies[2].messages.at(-1).content;
  assert.match(last, /tool_result name="nope".*ابزار ناشناخته/);
  assert.match(last, /tool_result name="boom".*exploded/);
  assert.equal(seenBodies[1].messages.at(-1).content.includes('"echoed":"hi"'), true);
  assert.deepEqual(events.filter((e) => e.kind === "result").map((e) => e.ok), [true, false, false]);
});

test("runTextAgent enforces action and round limits", async () => {
  const loop = async () => new Response(JSON.stringify({ choices: [{ message: { content: '<tool_call>{"name":"t","args":{}}</tool_call>' } }] }));
  const deps = { system: "S", tools: [{ name: "t", description: "", parameters: {} }], execute: async () => ({}), fetcher: loop };
  await assert.rejects(runTextAgent(openai, "x", { ...deps, maxRounds: 3 }), /حد 3 مرحله/);
  await assert.rejects(runTextAgent(openai, "x", { ...deps, maxActions: 2 }), /حد 2 اقدام/);
});
