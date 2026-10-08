// Exercise the real launcher storage/export/import code with in-memory adapters.
// Run: node --experimental-vm-modules scripts/launcher-merge-selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const context = vm.createContext({ console, Math, Date, Uint8Array, File, Blob, btoa, atob });
const attachments = new Map();
let persistConfig;
let state;
const create = () => (init) => {
  const setState = (change) => { state = { ...state, ...(typeof change === "function" ? change(state) : change) }; };
  state = init(setState);
  return { getState: () => state, setState };
};
const adapters = {
  zustand: { create },
  "zustand/middleware": { createJSONStorage: () => ({}), persist: (init, config) => { persistConfig = config; return init; } },
  "@/labshell/assets": {
    loadAssets: async () => {},
    addAssets: async (key, files) => { attachments.set(key, files); },
    assetsOf: (key) => (attachments.get(key) ?? []).map((f) => ({ name: f.name })),
    readAssetBlob: async (key, name) => (attachments.get(key) ?? []).find((f) => f.name === name),
    removeProjectAssets: async (key) => { attachments.delete(key); },
  },
  "@/labshell/jibos": { dropAppStore: () => {} },
};
const modules = new Map();
function moduleFor(specifier) {
  if (modules.has(specifier)) return modules.get(specifier);
  let module;
  if (adapters[specifier]) {
    const exports = adapters[specifier];
    module = new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  } else {
    assert.ok(specifier.startsWith("@/labshell/"), `unexpected dependency: ${specifier}`);
    const path = fileURLToPath(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url));
    module = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(path, "utf8")), { context, identifier: path });
  }
  modules.set(specifier, module);
  return module;
}
const launcher = moduleFor("@/labshell/launcher");
await launcher.link((specifier) => moduleFor(specifier));
await launcher.evaluate();
const api = launcher.namespace;

const original = { id: "legacy", name: "بازی قدیمی", icon: "🎮", iconImage: "data:image/png;base64,YWJj", iconColor: "#14271e", pageIndex: 8, installedAt: 1, files: [{ name: "main.nava", content: 'bt "شروع": sy "تو باختی"' }] };
const hydrated = persistConfig.merge({ apps: [original] }, state);
api.useLauncher.setState(hydrated);
assert.equal(state.apps[0].page, 8);
assert.equal(state.apps[0].iconImage, original.iconImage);
state.patch("legacy", { pageIndex: 4 });
assert.equal(state.apps[0].page, 4);
state.patch("legacy", { page: 6 });
assert.equal(state.apps[0].pageIndex, 6);

assert.equal(api.exportAppPack, api.exportPack);
attachments.set(api.assetKey("legacy"), [new File([new Uint8Array([0, 255, 127])], "picture.png", { type: "image/png" })]);
const packText = await api.exportAppPack(state.apps[0]);
const pack = modules.get("@/labshell/pack").namespace.parsePack(packText);
assert.equal(pack.name, original.name);
assert.equal(pack.files[0].content.trimEnd(), original.files[0].content);
assert.deepEqual(Array.from(pack.assets[0].bytes), [0, 255, 127]);
await assert.rejects(api.exportPack({ ...original, files: [{ name: "main.nava", content: "@@@ file injected.js\n" }] }));

const prefs = { pages: 9, pageNames: ["خانه", "بازی‌ها"], pageWallpapers: ["#123"], customCss: "body{}" };
const backup = await api.exportBackup(prefs);
api.useLauncher.setState({ apps: [] });
attachments.clear();
const restored = await api.importBackup(backup);
assert.equal(restored.installed, 1);
assert.equal(restored.prefs.pageNames[1], "بازی‌ها");
assert.equal(state.apps[0].page, 6);
assert.equal(state.apps[0].iconImage, original.iconImage);
assert.deepEqual(Array.from(new Uint8Array(await (await adapters["@/labshell/assets"].readAssetBlob(api.assetKey(state.apps[0].id), "picture.png")).arrayBuffer())), [0, 255, 127]);

const before = JSON.stringify(state.apps);
const bad = JSON.parse(backup);
bad.apps[0].assets[0].b64 = "!invalid!";
await assert.rejects(api.importBackup(JSON.stringify(bad)));
assert.equal(JSON.stringify(state.apps), before);

api.useLauncher.setState({ apps: [] });
const old = await api.importBackup(JSON.stringify({ format: "jibcode-launcher-backup-v1", preferences: { pages: [{ name: "خانه", wallpaper: "#123" }] }, apps: [original] }));
assert.equal(old.installed, 1);
assert.equal(state.apps[0].page, 8);
assert.equal(state.apps[0].files[0].content, original.files[0].content);
console.log("PASS launcher integration: hydration, legacy page API, pack export/assets, both backups, invalid-backup nonmutation.");
