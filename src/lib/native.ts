// رفتار مخصوص برنامهٔ اندروید (Capacitor). روی وب هیچ کاری نمی‌کند.
import { Capacitor } from "@capacitor/core";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

/** Android back button: close the open dialog/popover first, otherwise send the app to background. */
export async function installNativeBackButton(): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  const { App } = await import("@capacitor/app");
  const handle = await App.addListener("backButton", () => {
    const open = document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]');
    if (open) {
      // Radix dialogs close on Escape.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
    void App.minimizeApp();
  });
  return () => void handle.remove();
}
