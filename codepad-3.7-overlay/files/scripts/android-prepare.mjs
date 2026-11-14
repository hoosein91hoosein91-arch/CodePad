#!/usr/bin/env node
/**
 * Run after `npx cap add android` (CI does this; the android/ folder is not committed).
 * - Copies the CodePad launcher icons and splash screens from resources/android/res.
 * - Hides system bars until an edge swipe and keeps the native window dark.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const [major, minor, patch] = version.split(".").map(Number);
const versionCode = major * 1000 + minor * 10 + patch;
const appId = JSON.parse(readFileSync("capacitor.config.json", "utf8")).appId;

const res = "android/app/src/main/res";
if (!existsSync(res)) {
  console.error("android/ not found. Run `npx cap add android` first.");
  process.exit(1);
}
cpSync("resources/android/res", res, { recursive: true });

// Optional Termux hand-off and external browser launch. Commands are only sent
// after an explicit user action in the CodePad console.
const manifestPath = "android/app/src/main/AndroidManifest.xml";
let manifest = readFileSync(manifestPath, "utf8");
if (!manifest.includes("com.termux.permission.RUN_COMMAND")) {
  manifest = manifest.replace(/(<application\b)/, '    <uses-permission android:name="com.termux.permission.RUN_COMMAND" />\n    <queries>\n        <package android:name="com.termux" />\n        <package android:name="org.torproject.torbrowser" />\n    </queries>\n\n    $1');
}
if (!manifest.includes(".TermuxResultService")) {
  manifest = manifest.replace(/(<application\b[^>]*>)/, '$1\n        <service android:name=".TermuxResultService" android:exported="false" />');
}
if (!manifest.includes("android.permission.QUERY_ALL_PACKAGES")) manifest=manifest.replace(/(<application\b)/,'<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n    $1');
if (!manifest.includes(".CodePadBrowserActivity")) manifest=manifest.replace(/(<application\b[^>]*>)/,'$1\n        <activity android:name=".CodePadBrowserActivity" android:exported="false" android:theme="@android:style/Theme.Material.NoActionBar" />');
writeFileSync(manifestPath, manifest);

// A user-started interpreter is specialUse, not a timed dataSync service.
for (const permission of ["CAMERA", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_SPECIAL_USE", "POST_NOTIFICATIONS", "WAKE_LOCK"]) {
  if (!manifest.includes(`android.permission.${permission}"`)) manifest = manifest.replace(/(<application\b)/, `    <uses-permission android:name="android.permission.${permission}" />\n    $1`);
}
if (!manifest.includes(".CodePadRuntimeService")) manifest = manifest.replace(/(<application\b[^>]*>)/, `$1
        <service android:name=".CodePadRuntimeService" android:exported="false" android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="User-started Python interpreter and bot polling with visible stop notification" />
        </service>`);
if (!manifest.includes("android:networkSecurityConfig=")) manifest = manifest.replace(/(<application\b)/, '$1 android:networkSecurityConfig="@xml/codepad_network_security"');
if(!manifest.includes(".CodePadPythonService"))manifest=manifest.replace(/(<application\b[^>]*>)/, `$1
        <service android:name=".CodePadPythonService" android:process=":cpython" android:exported="false" android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="User-started native CPython interpreter with live input and stop notification" />
        </service>`);
if(!manifest.includes(".CodePadTerminalActivity"))manifest=manifest.replace(/(<application\b[^>]*>)/,'$1\n        <activity android:name=".CodePadTerminalActivity" android:exported="false" android:theme="@android:style/Theme.Material.NoActionBar" android:windowSoftInputMode="adjustResize" />');
writeFileSync(manifestPath, manifest);
const pythonDir="android/app/src/main/python";
mkdirSync(pythonDir,{recursive:true});cpSync("resources/python",pythonDir,{recursive:true});
const xmlDir = join(res, "xml");
import { mkdirSync } from "node:fs";
mkdirSync(xmlDir, { recursive: true });
writeFileSync(join(xmlDir, "codepad_network_security.xml"), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
  <domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">127.0.0.1</domain><domain includeSubdomains="false">localhost</domain></domain-config>
</network-security-config>`);

const javaPackagePath = appId.replaceAll(".", "/");
const javaDir = join("android/app/src/main/java", javaPackagePath);
for (const name of ["CodePadUpdateCore", "CodePadUpdatesPlugin", "CodePadRuntimePlugin", "CodePadRuntimeService", "CodePadPythonPlugin", "CodePadPythonService", "CodePadAssetServer", "ApkExportPlugin", "CodePadSystemPlugin", "CodePadBrowserActivity", "CodePadTerminalActivity"]) {
  writeFileSync(join(javaDir, name + ".java"), readFileSync("resources/android/" + name + ".java.in", "utf8").replaceAll("__APP_ID__", appId));
}
const pluginPath = join(javaDir, "TermuxBridgePlugin.java");
const java = readFileSync("resources/android/TermuxBridgePlugin.java.in", "utf8").replaceAll("__APP_ID__", appId);
writeFileSync(pluginPath, java);

const resultService = `package ${appId};

import android.app.IntentService;
import android.content.Intent;
import android.os.Bundle;

public class TermuxResultService extends IntentService {
    public TermuxResultService() { super("TermuxResultService"); }

    @Override
    protected void onHandleIntent(Intent intent) {
        if (intent == null) return;
        int id = intent.getIntExtra("execution_id", 0);
        Bundle result = intent.getBundleExtra("result");
        if (result != null) TermuxBridgePlugin.deliverResult(id, result);
        else {
            Bundle failed = new Bundle(); failed.putInt("err", 1);
            failed.putString("errmsg", "Termux پاسخی با قالب معتبر برنگرداند؛ نسخه و راه‌اندازی آن را بررسی کن.");
            TermuxBridgePlugin.deliverResult(id, failed);
        }
    }
}
`;
writeFileSync(join(javaDir, "TermuxResultService.java"), resultService);

// Own the activity template so regeneration always retains immersive mode.
const activityPath = join(javaDir, "MainActivity.java");
const activity = readFileSync("resources/android/MainActivity.java.in", "utf8").replaceAll("__APP_ID__", appId);
writeFileSync(activityPath, activity);

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

// Monotonic app version so Android can identify this update.
const gradlePath = "android/app/build.gradle";
if (existsSync(gradlePath)) {
  const gradle = readFileSync(gradlePath, "utf8")
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  const nativePython = `
// codepad-cpython
apply plugin: 'com.chaquo.python'
android {
    defaultConfig { minSdkVersion 24; ndk { abiFilters "arm64-v8a", "x86_64" } }
    packagingOptions { jniLibs { useLegacyPackaging = false } }
}
chaquopy {
    defaultConfig {
        version = "3.13"
        if (System.getenv("CODEPAD_BUILD_PYTHON")) buildPython(System.getenv("CODEPAD_BUILD_PYTHON"))
        pyc { src = false; pip = false; stdlib = false }
        pip { install "Pillow==11.0.0" }
    }
}
`;
  let prepared=gradle.includes("// codepad-cpython")?gradle:gradle+nativePython;
  if(!prepared.includes('pip { install "Pillow==11.0.0" }'))prepared=prepared.replace(/(chaquopy\s*\{\s*defaultConfig\s*\{)/,'$1\n        pip { install "Pillow==11.0.0" }');
  if(!prepared.includes('CODEPAD_BUILD_PYTHON'))prepared=prepared.replace(/(chaquopy\s*\{\s*defaultConfig\s*\{)/,'$1\n        if (System.getenv("CODEPAD_BUILD_PYTHON")) buildPython(System.getenv("CODEPAD_BUILD_PYTHON"))');
  writeFileSync(gradlePath,prepared);
}

// Use the explicitly installed build tools for every Android module.
const rootGradlePath="android/build.gradle";
let rootGradle=readFileSync(rootGradlePath,"utf8");
if(!rootGradle.includes("com.chaquo.python:gradle")){
 rootGradle=rootGradle.replace(/dependencies\s*\{/,"dependencies {\n        classpath 'com.chaquo.python:gradle:17.1.0'");
 writeFileSync(rootGradlePath,rootGradle);
}
if(!rootGradle.includes("codepad-build-tools")) {rootGradle+=`
// codepad-build-tools
subprojects { afterEvaluate { p -> if (p.hasProperty("android")) { p.android.buildToolsVersion = "35.0.0" } } }
`;writeFileSync(rootGradlePath,rootGradle);}

const stringsPath=join(res,"values/strings.xml");
let strings=readFileSync(stringsPath,"utf8");
for(const name of ["app_name","title_activity_main"])strings=strings.replace(new RegExp('(<string name="'+name+'">)[^<]*(</string>)'),'$1CodePad Studio$2');
writeFileSync(stringsPath,strings);

// Build the actual upstream terminal sources, with reproducible bundled PTY JNI.
const terminalDir="android/codepad-terminal";mkdirSync(terminalDir,{recursive:true});
writeFileSync(terminalDir+"/build.gradle",`apply plugin: 'com.android.library'
android {
 namespace 'com.termux.view'
 compileSdk 35
 defaultConfig { minSdkVersion 24 }
 sourceSets { main {
  java.srcDirs = ['../../vendor/termux-app/terminal-emulator/src/main/java','../../vendor/termux-app/terminal-view/src/main/java']
  res.srcDirs = ['../../vendor/termux-app/terminal-view/src/main/res']
  jniLibs.srcDirs = ['../../resources/termux-jni']
 } }
 compileOptions { sourceCompatibility JavaVersion.VERSION_1_8; targetCompatibility JavaVersion.VERSION_1_8 }
}
dependencies { implementation 'androidx.annotation:annotation:1.9.0' }
`);
mkdirSync(terminalDir+"/src/main",{recursive:true});writeFileSync(terminalDir+"/src/main/AndroidManifest.xml",'<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>');
const settingsPath="android/settings.gradle";let settings=readFileSync(settingsPath,"utf8");
if(!settings.includes("':codepad-terminal'")){settings+="\ninclude ':codepad-terminal'\nproject(':codepad-terminal').projectDir = new File('./codepad-terminal')\n";writeFileSync(settingsPath,settings);}
let appGradle=readFileSync(gradlePath,"utf8");if(!appGradle.includes("implementation project(':codepad-terminal')")){appGradle+="\ndependencies { implementation project(':codepad-terminal') }\n";writeFileSync(gradlePath,appGradle);}
