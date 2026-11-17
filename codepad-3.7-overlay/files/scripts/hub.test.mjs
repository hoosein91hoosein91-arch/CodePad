import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { HUB_SAMPLES } from "../mobile-src/assets/hub-data.js";
import { fetchNews, filterSamples, NEWS_SOURCES, CATEGORIES } from "../mobile-src/assets/hub.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("hub samples are complete and unique", () => {
  assert.ok(HUB_SAMPLES.length >= 30);
  assert.equal(new Set(HUB_SAMPLES.map((s) => s.id)).size, HUB_SAMPLES.length);
  const cats = new Set(CATEGORIES.map((c) => c[0]));
  for (const s of HUB_SAMPLES) {
    assert.ok(s.title && s.desc && s.code.length > 40, s.id);
    assert.ok(cats.has(s.cat), `category ${s.cat} of ${s.id} has a filter chip`);
    assert.ok(s.level >= 1 && s.level <= 3, s.id);
    assert.match(s.file, s.ext === "html" ? /\.html$/ : /\.py$/);
    assert.ok(!/\t/.test(s.code) || s.ext === "html", `${s.id}: no tab indentation`);
  }
});

test("3D samples use the CodePad 3D API and HTML samples only use bundled offline libraries", () => {
  for (const s of HUB_SAMPLES.filter((x) => x.cat === "3d")) assert.match(s.code, /from codepad3d import|import codepad3d/, s.id);
  for (const s of HUB_SAMPLES.filter((x) => x.ext === "html")) {
    for (const m of s.code.matchAll(/src="lib:([a-z0-9._-]+)"/g)) assert.ok(existsSync(new URL(`../public/libs/${m[1]}.min.js`, import.meta.url)), `${s.id} → lib:${m[1]}`);
    assert.ok(!/src="https?:/.test(s.code), `${s.id} must not need the internet`);
  }
});

test("filterSamples filters by category and text", () => {
  assert.equal(filterSamples(HUB_SAMPLES, { cat: "all" }).length, HUB_SAMPLES.length);
  const sec = filterSamples(HUB_SAMPLES, { cat: "security" });
  assert.ok(sec.length >= 5 && sec.every((s) => s.cat === "security"));
  assert.ok(filterSamples(HUB_SAMPLES, { q: "ماینکرافت" }).length >= 1);
  assert.equal(filterSamples(HUB_SAMPLES, { q: "zzzz-no-such" }).length, 0);
});

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });

test("fetchNews merges sources, drops non-https links, dedupes, sorts newest first and reports failures", async () => {
  const now = Date.now();
  const fetcher = async (url) => {
    if (url.includes("hn.algolia")) return json({ hits: [
      { title: "A", url: "https://a.example/x", created_at: new Date(now - 5e6).toISOString(), points: 5, num_comments: 1, objectID: "1" },
      { title: "http only", url: "http://insecure.example/", created_at: new Date(now).toISOString(), objectID: "2" },
      { title: "javascript", url: "javascript:alert(1)", created_at: new Date(now).toISOString(), objectID: "3" },
      { title: "no url → HN item", created_at: new Date(now - 1e6).toISOString(), objectID: "4" },
    ] });
    if (url.includes("lobste.rs")) return json([{ title: "A dup", url: "https://a.example/x", created_at: new Date(now - 4e6).toISOString(), score: 1 }, { title: "L", url: "https://l.example/", created_at: new Date(now - 9e6).toISOString(), score: 2 }]);
    return json({}, false);
  };
  const r = await fetchNews({ fetcher });
  assert.deepEqual(r.items.map((x) => x.title), ["no url → HN item", "A dup", "L"]);
  assert.ok(r.items.every((x) => x.url.startsWith("https://")));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /CISA/);
});

test("fetchNews survives total failure and bad JSON", async () => {
  const r = await fetchNews({ fetcher: async () => { throw new Error("offline"); } });
  assert.equal(r.items.length, 0);
  assert.equal(r.errors.length, NEWS_SOURCES.length);
  const r2 = await fetchNews({ fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad"); } }) });
  assert.equal(r2.items.length, 0);
});

test("Nova is no longer offered for new projects (existing projects still open)", () => {
  const rt = read("mobile-src/assets/runtime.js");
  const order = rt.slice(rt.indexOf("var LANG_ORDER = ["), rt.indexOf("LANG_META = {"));
  assert.ok(!order.includes("`nava`"), "LANG_ORDER");
  const seed = rt.slice(rt.indexOf("var SEED_PROJECT"), rt.indexOf("function uid("));
  assert.ok(!seed.includes("nava") && seed.includes("python"), "seed project is Python");
  const tpl = rt.slice(rt.indexOf("var TEMPLATE_CHOICES"), rt.indexOf("var TEMPLATE_CHOICES") + 600);
  assert.ok(!tpl.includes("kind: `nava`"), "template list");
  assert.ok(rt.includes("PACK_SAMPLES = [") && rt.includes(".filter((e) => e.group !== `nava`)"), "nava pack samples hidden");
  assert.ok(rt.includes("nava: { label:"), "nava runtime kept so old projects still open");
});

test("hub is wired: script, styles, entry points; Studio/Cyber no longer sit side by side in the toolbar", () => {
  const html = read("mobile-src/index.html");
  for (const f of ["assets/hub.js", "assets/hub.css", "background/libs-loader.js", "assets/python-3d.js"]) assert.ok(html.includes(f), f);
  assert.match(read("mobile-src/assets/launcher.js"), /CodePadHub\?\.open\(\)[\s\S]{0,80}dock-hub/);
  assert.match(read("mobile-src/assets/hub.css"), /\.cp-workspaces \[data-studio-launch\]/);
});

import { addNote, loadNotes, updateNote, removeNote, CVE_RE } from "../mobile-src/assets/hub-security.js";
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test("CVE cards: saved once per CVE id, editable, removable, and survive a broken store", () => {
  const st = mem();
  const item = { title: "CVE-2025-12345 — Acme VPN: auth bypass", url: "https://nvd.nist.gov/vuln/detail/CVE-2025-12345", src: "CISA KEV" };
  const n = addNote(item, st);
  assert.equal(n.id, "CVE-2025-12345");
  addNote(item, st);
  assert.equal(loadNotes(st).length, 1, "same CVE is not saved twice");
  addNote({ title: "Some blog post about malware", url: "https://x.example/p" }, st);
  assert.equal(loadNotes(st).length, 2);
  assert.ok(updateNote("CVE-2025-12345", "patch on Monday", st));
  assert.equal(loadNotes(st).find((x) => x.id === "CVE-2025-12345").text, "patch on Monday");
  removeNote("CVE-2025-12345", st);
  assert.equal(loadNotes(st).length, 1);
  assert.deepEqual(loadNotes({ getItem() { throw new Error("x"); } }), []);
  assert.match("fix for cve-2024-0001 released", CVE_RE);
});

test("the build copies public/libs so lib:three and the Python 3D viewer work in the shipped app", () => {
  assert.match(read("scripts/build-mobile.mjs"), /public\/libs/);
});

test("security tab, practice lab programs and their data are wired", () => {
  const hub = read("mobile-src/assets/hub.js");
  assert.match(hub, /\["security", "امنیت"\]/);
  for (const id of ["sec_lab_site", "sec_lan_share", "sec_lan_dashboard"]) assert.ok(HUB_SAMPLES.some((s) => s.id === id), id);
  for (const f of ["hub-security.js", "hub-ctf.js", "hub-ctf-data.js", "hub-forensics.js"]) assert.ok(existsSync(new URL("../mobile-src/assets/" + f, import.meta.url)), f);
});

test("every practice program only touches the network deliberately: lab = loopback, share = private clients only", () => {
  const lab = HUB_SAMPLES.find((s) => s.id === "sec_lab_site").code, share = HUB_SAMPLES.find((s) => s.id === "sec_lan_share").code;
  assert.match(lab, /HOST = "127\.0\.0\.1"/);
  assert.ok(!/Server\(\("0\.0\.0\.0"/.test(lab));
  assert.match(share, /ONLY_PRIVATE_CLIENTS = True/);
  assert.ok(!/import subprocess|subprocess\.|os\.system\(|os\.popen\(|os\.exec/.test(lab + share), "no real command execution");
});
