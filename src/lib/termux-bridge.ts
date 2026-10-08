import { Capacitor, registerPlugin } from "@capacitor/core";

type TermuxPlugin = {
  runCommand(options: { command: string }): Promise<{ sent: boolean; message: string; stdout?: string; stderr?: string; exitCode?: number }>;
  openTorBrowser(options: { url: string }): Promise<{ opened: boolean }>;
  openExternal(options: { url: string }): Promise<{ opened: boolean }>;
};

const TermuxBridge = registerPlugin<TermuxPlugin>("TermuxBridge");

export async function runTermuxCommand(command: string) {
  if (!Capacitor.isNativePlatform()) throw new Error("اتصال Termux فقط در نسخهٔ نصب‌شدهٔ Android کار می‌کند.");
  return TermuxBridge.runCommand({ command });
}

export async function openTorBrowser(url: string) {
  if (!Capacitor.isNativePlatform()) throw new Error("بازکردن برنامه‌های دیگر فقط در نسخهٔ Android در دسترس است.");
  return TermuxBridge.openTorBrowser({ url: safeHttpUrl(url) });
}

export async function openExternalBrowser(url: string) {
  const safe = safeHttpUrl(url);
  if (!Capacitor.isNativePlatform()) {
    const opened = window.open(safe, "_blank", "noopener,noreferrer");
    if (!opened) throw new Error("مرورگر بیرونی باز نشد.");
    return { opened: true };
  }
  return TermuxBridge.openExternal({ url: safe });
}

function safeHttpUrl(raw: string) {
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("فقط نشانی‌های HTTP و HTTPS پذیرفته می‌شوند.");
  return url.toString();
}
