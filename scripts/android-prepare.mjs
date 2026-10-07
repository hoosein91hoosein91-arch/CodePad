#!/usr/bin/env node
/**
 * Run after `npx cap add android` (CI does this; the android/ folder is not committed).
 * - Copies the CodePad launcher icons and splash screens from resources/android/res.
 * - Gives the native window the app's dark background and light status/nav bar icons,
 *   so the bars match the UI (and no white flash before the WebView paints).
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const res = "android/app/src/main/res";
if (!existsSync(res)) {
  console.error("android/ not found. Run `npx cap add android` first.");
  process.exit(1);
}
cpSync("resources/android/res", res, { recursive: true });

const stylesPath = join(res, "values/styles.xml");
let styles = readFileSync(stylesPath, "utf8");
const marker = "<!-- codepad -->";
if (!styles.includes(marker)) {
  const items = [
    marker,
    '<item name="android:windowBackground">@color/ic_launcher_background</item>',
    '<item name="android:statusBarColor">@color/ic_launcher_background</item>',
    '<item name="android:navigationBarColor">@color/ic_launcher_background</item>',
    '<item name="android:windowLightStatusBar">false</item>',
  ].map((line) => `        ${line}`).join("\n");
  const re = /(<style name="AppTheme\.NoActionBar"[^>]*>)/;
  if (!re.test(styles)) throw new Error("AppTheme.NoActionBar not found in styles.xml");
  styles = styles.replace(re, `$1\n${items}`);
  writeFileSync(stylesPath, styles);
}
console.log("android resources prepared");
