import assert from "node:assert/strict";
import test from "node:test";
import { appPage, readLauncherBackup } from "./launcher-compat.ts";
import { normalizePrefs, loadPrefs, savePrefs, PREF_KEY } from "./launcher-prefs.ts";
import { navaCodeDirection } from "./nava-direction.ts";

test("old nine-page preferences migrate without losing names, wallpapers or selected apps", () => {
  const pages = Array.from({ length: 9 }, (_, i) => ({ name: `صفحهٔ ویژه ${i}`, wallpaper: `linear-gradient(#${i}${i}${i},#000)` }));
  const old = { pages, wallpaper: "data:image/png;base64,YWJj", accent: "#67f5a5", columns: 5, iconSize: 62, roundness: 20, glass: false };
  const migrated = normalizePrefs(old);
  assert.equal(migrated.pages, 9);
  assert.deepEqual(migrated.pageNames, pages.map((p) => p.name));
  assert.deepEqual(migrated.pageWallpapers, pages.map((p) => p.wallpaper));
  assert.equal(migrated.wallpaper, old.wallpaper);
  assert.equal(migrated.glass, false);
  assert.equal(migrated.columns, 5);
  assert.equal(appPage({ pageIndex: 8 }), 8);
  assert.deepEqual(normalizePrefs(migrated), migrated);
});

test("the actual localStorage load/save path upgrades old preferences and preserves hidden pages", () => {
  const entries = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => entries.set(k, v) } });
  try {
    entries.set(PREF_KEY, JSON.stringify({ pages: [{ name: "خانه", wallpaper: "#123" }, { name: "بازی‌ها", wallpaper: "#456" }] }));
    const prefs = loadPrefs();
    assert.equal(prefs.pages, 2);
    assert.equal(savePrefs(prefs), true);
    const hidden = normalizePrefs({ ...loadPrefs(), pages: 1 });
    assert.equal(savePrefs(hidden), true);
    const restored = normalizePrefs({ ...loadPrefs(), pages: 2 });
    assert.equal(restored.pageNames[1], "بازی‌ها");
    assert.equal(restored.pageWallpapers[1], "#456");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("original JSON backup keeps literal code, icons, images and pageIndex", () => {
  const content = 'bt "تو باختی" (ru240rn64yGi65G72): sy "تو باختی"\r\n';
  const data = readLauncherBackup(JSON.stringify({ format: "jibcode-launcher-backup-v1", preferences: { pages: [{ name: "خانه", wallpaper: "#000" }] }, apps: [{ name: "بازی من", icon: "🎮", iconImage: "data:image/png;base64,YWJj", iconColor: "#14271e", pageIndex: 8, files: [{ name: "main.nava", content }] }] }));
  assert.equal(data.apps[0].page, 8);
  assert.equal(data.apps[0].pageIndex, 8);
  assert.equal(data.apps[0].files[0].content, content);
  assert.equal(data.apps[0].iconImage, "data:image/png;base64,YWJj");
  assert.deepEqual(data.apps[0].assets, []);
  assert.equal(normalizePrefs(data.prefs).pageNames[0], "خانه");
});

test("2.4 backup preserves attachments, explicit page and custom developer settings", () => {
  const app = { name: "test", icon: "T", page: 2, pageIndex: 7, files: [{ name: "main.nava", content: "cal mb" }], assets: [{ name: "x.png", type: "image/png", b64: "YWJj" }] };
  const prefs = { pages: 3, pageWallpapers: ["#000", "#123"], devMode: true, customCss: "body{}", bootScript: "api.toast('ok')" };
  const parsed = readLauncherBackup(JSON.stringify({ jibosBackup: 1, prefs, apps: [app] }));
  assert.deepEqual(parsed.apps[0].assets, app.assets);
  assert.equal(parsed.apps[0].page, 2);
  assert.equal(normalizePrefs(parsed.prefs).customCss, prefs.customCss);
  assert.equal(normalizePrefs(parsed.prefs).bootScript, prefs.bootScript);
});

test("invalid backup rows reject before an installer can mutate storage", () => {
  for (const data of [null, {}, { jibosBackup: 1, apps: [null] }, { jibosBackup: 1, apps: [{ name: "app", files: [{ name: "main.nava", content: null }] }] }, { jibosBackup: 1, apps: [{ name: "app", files: [], assets: [{ name: "x.png", type: "image/png" }] }] }]) {
    assert.throws(() => readLauncherBackup(JSON.stringify(data)));
  }
});

test("compact Nava stays LTR and full Persian Nava stays RTL, ignoring comments", () => {
  assert.equal(navaCodeDirection('# متن فارسی\n// note\nbt "شروع": sy "تو باختی"'), "ltr");
  assert.equal(navaCodeDirection('# pg "note"\nعنوان "سلام"'), "rtl");
});

// Regression: an imported/edited game must launch instead of the starter main.nava.
test("explicit launcher entry selects the active project file and survives backup", async () => {
  const { launcherEntry } = await import("./launcher-entry.ts");
  const files = [{ name: "main.nava", content: 'Pg "Starter" | Cnt' }, { name: "rift.nava", content: 'Pg "My game" | Scene N360,N480' }];
  const app = { name: "Game", icon: "G", files, entryFile: "rift.nava", sourceProjectId: "my-project" };
  assert.equal(launcherEntry(app)?.content, files[1].content);
  const copy = readLauncherBackup(JSON.stringify({ jibosBackup: 1, apps: [app] })).apps[0];
  assert.equal(launcherEntry(copy)?.name, "rift.nava");
  assert.equal(copy.sourceProjectId, "my-project");
  assert.equal(launcherEntry({ files })?.name, "main.nava");
  assert.equal(launcherEntry({ files, entryFile: "missing" })?.name, "main.nava");
});
