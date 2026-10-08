#!/usr/bin/env node
/**
 * Run after `npx cap add android` (CI does this; the android/ folder is not committed).
 * - Copies the CodePad launcher icons and splash screens from resources/android/res.
 * - Gives the native window the app's dark background and light status/nav bar icons,
 *   so the bars match the UI (and no white flash before the WebView paints).
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
writeFileSync(manifestPath, manifest);

const javaPackagePath = appId.replaceAll(".", "/");
const javaDir = join("android/app/src/main/java", javaPackagePath);
const pluginPath = join(javaDir, "TermuxBridgePlugin.java");
const java = `package ${appId};

import android.content.Intent;
import android.app.PendingIntent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Bundle;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "TermuxBridge", permissions = {
    @Permission(alias = "termux", strings = { "com.termux.permission.RUN_COMMAND" })
})
public class TermuxBridgePlugin extends Plugin {
    private static final AtomicInteger NEXT_ID = new AtomicInteger(1000);
    private static final ConcurrentHashMap<Integer, PluginCall> PENDING = new ConcurrentHashMap<>();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    static void deliverResult(int id, Bundle bundle) {
        PluginCall call = PENDING.remove(id);
        if (call == null) return;
        MAIN.post(() -> {
            call.setKeepAlive(false);
            JSObject result = new JSObject();
            result.put("sent", true);
            result.put("message", "دستور Termux تمام شد.");
            result.put("stdout", bundle.getString("stdout", ""));
            result.put("stderr", bundle.getString("stderr", ""));
            result.put("exitCode", bundle.getInt("exit_code", -1));
            String error = bundle.getString("errmsg", "");
            if (!error.isEmpty()) result.put("stderr", error);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void runCommand(PluginCall call) {
        String command = call.getString("command", "").trim();
        if (command.isEmpty() || command.length() > 4000) {
            call.reject("دستور خالی است یا بیش از حد طولانی است.");
            return;
        }
        if (command.toLowerCase().contains("nmap") && !isLocalDiscovery(command) && !isNmapInstall(command)) {
            call.reject("این نسخه فقط کشف دستگاه‌های شبکهٔ خصوصی را با nmap -sn می‌پذیرد.");
            return;
        }
        if (getPermissionState("termux") != PermissionState.GRANTED) {
            requestPermissionForAlias("termux", call, "termuxPermissionCallback");
            return;
        }
        sendCommand(call, command);
    }

    @PermissionCallback
    private void termuxPermissionCallback(PluginCall call) {
        if (getPermissionState("termux") != PermissionState.GRANTED) {
            call.reject("برای اجرای دستور باید مجوز Termux را در تنظیمات Android تأیید کنی.");
            return;
        }
        sendCommand(call, call.getString("command", "").trim());
    }

    private void sendCommand(PluginCall call, String command) {
        int id = NEXT_ID.incrementAndGet();
        try {
            Intent intent = new Intent();
            intent.setClassName("com.termux", "com.termux.app.RunCommandService");
            intent.setAction("com.termux.RUN_COMMAND");
            intent.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
            intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", new String[] { "-lc", command });
            intent.putExtra("com.termux.RUN_COMMAND_WORKDIR", "~/");
            intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND", true);
            intent.putExtra("com.termux.RUN_COMMAND_COMMAND_LABEL", "CodePad Terminal");
            Intent resultIntent = new Intent(getContext(), TermuxResultService.class);
            resultIntent.putExtra("execution_id", id);
            int flags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent resultPendingIntent = PendingIntent.getService(getContext(), id, resultIntent, flags);
            intent.putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", resultPendingIntent);
            call.setKeepAlive(true);
            PENDING.put(id, call);
            getContext().startService(intent);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                PluginCall pending = PENDING.remove(id);
                if (pending != null) { pending.setKeepAlive(false); pending.reject("Termux در زمان مجاز پاسخ نداد."); }
            }, 300000);
        } catch (Exception error) {
            PENDING.remove(id);
            call.setKeepAlive(false);
            call.reject("Termux اجرا نشد. مطمئن شو نصب است و گزینهٔ allow-external-apps را آگاهانه فعال کرده‌ای.", error);
        }
    }

    private boolean isLocalDiscovery(String command) {
        String[] parts = command.trim().split("\\\\s+");
        if (parts.length != 3 || !parts[0].equalsIgnoreCase("nmap") || !parts[1].equals("-sn")) return false;
        String target = parts[2];
        String[] cidr = target.split("/", -1);
        if (cidr.length > 2) return false;
        String[] octets = cidr[0].split("\\\\.", -1);
        if (octets.length != 4) return false;
        int[] ip = new int[4];
        try {
            for (int i = 0; i < 4; i++) { ip[i] = Integer.parseInt(octets[i]); if (ip[i] < 0 || ip[i] > 255) return false; }
            if (cidr.length == 2) { int mask = Integer.parseInt(cidr[1]); if (mask < 24 || mask > 32) return false; }
        } catch (NumberFormatException error) { return false; }
        return ip[0] == 10 || (ip[0] == 192 && ip[1] == 168) ||
            (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31);
    }

    private boolean isNmapInstall(String command) {
        return command.trim().matches("(?i)pkg\\\\s+install\\\\s+nmap(?:\\\\s+-y)?");
    }

    @PluginMethod
    public void openTorBrowser(PluginCall call) {
        openUrl(call, "org.torproject.torbrowser", true);
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        openUrl(call, null, false);
    }

    private void openUrl(PluginCall call, String packageName, boolean requiredPackage) {
        String url = call.getString("url", "").trim();
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equals("https") || scheme.equals("http"))) {
            call.reject("فقط نشانی‌های HTTP و HTTPS پذیرفته می‌شوند.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            if (packageName != null) intent.setPackage(packageName);
            if (requiredPackage && getContext().getPackageManager().resolveActivity(intent, 0) == null) {
                call.reject("Tor Browser نصب نیست. آن را فقط از منبع رسمی Tor Project نصب کن.");
                return;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("opened", true); call.resolve(result);
        } catch (Exception error) { call.reject("مرورگر باز نشد.", error); }
    }
}
`;
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
        else TermuxBridgePlugin.deliverResult(id, new Bundle());
    }
}
`;
writeFileSync(join(javaDir, "TermuxResultService.java"), resultService);

const activityPath = join(javaDir, "MainActivity.java");
if (existsSync(activityPath)) {
  let activity = readFileSync(activityPath, "utf8");
  if (!activity.includes("registerPlugin(TermuxBridgePlugin.class)")) {
    activity = activity.replace(/(package [^;]+;)/, "$1\n\nimport android.os.Bundle;");
    activity = activity.replace(/(public class MainActivity extends BridgeActivity\s*\{)/, `$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        registerPlugin(TermuxBridgePlugin.class);\n    }`);
    writeFileSync(activityPath, activity);
  }
}

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
    .replace(/versionCode\s+\d+/, "versionCode 250")
    .replace(/versionName\s+"[^"]+"/, 'versionName "2.5.0"');
  writeFileSync(gradlePath, gradle);
}
