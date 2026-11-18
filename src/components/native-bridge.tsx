import { useEffect } from "react";
import { installNativeBackButton } from "@/lib/native";

/** Mount once in `__root.tsx`. No-op outside the Android app. */
export function NativeBridge() {
  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    void installNativeBackButton().then((off) => {
      if (cancelled) off();
      else cleanup = off;
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
  return null;
}
