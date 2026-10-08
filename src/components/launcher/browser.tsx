import { ArrowRight, Lock, RotateCw, Shield, ExternalLink } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { openExternalBrowser } from "@/lib/termux-bridge";

// مرورگر امن درون‌برنامه‌ای با حالت ناشناس: تاریخچه/کوکی نگه نمی‌دارد و با بستن پاک می‌شود.
// محدودیت‌های صادقانه (در یادداشت داخل صفحه هم نوشته شده‌اند):
//  • IP واقعی تو را پنهان نمی‌کند (برای آن به VPN/Tor واقعی نیاز است).
//  • افزونه‌های کروم PC را اجرا نمی‌کند؛ موتور WebView اندروید از آن‌ها پشتیبانی نمی‌کند.
//  • خودش را به‌جای PC جا نمی‌زند.
//  • بسیاری از سایت‌ها اجازهٔ نمایش در iframe را نمی‌دهند (X-Frame-Options)؛ در آن صورت
//    دکمهٔ «باز کردن بیرونی» سایت را در مرورگر اصلی/Tor باز می‌کند.

const START = "https://duckduckgo.com/";

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return START;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(v)}`;
}

export function Browser({ onClose, accent, initialUrl }: { onClose: () => void; accent: string; initialUrl?: string }) {
  const [address, setAddress] = useState(initialUrl ? normalizeUrl(initialUrl) : START);
  const [src, setSrc] = useState(address);
  const [reloadKey, setReloadKey] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);

  const go = (e?: FormEvent) => {
    e?.preventDefault();
    const url = normalizeUrl(address);
    setAddress(url);
    setBlocked(false);
    setSrc(url);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="jibos-window fixed inset-0 z-40 flex flex-col bg-[#0a0a0a] pt-[env(safe-area-inset-top)]" data-testid="browser">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2" style={{ borderColor: `${accent}44` }}>
        <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="بستن مرورگر" onClick={onClose}>
          <ArrowRight className="size-5" />
        </button>
        <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${accent}22`, color: accent }} data-testid="incognito-badge">
          <Shield className="size-3" /> ناشناس
        </span>
        <form onSubmit={go} className="flex min-w-0 flex-1 items-center gap-1 rounded-full border bg-black/60 px-3" style={{ borderColor: `${accent}33` }}>
          <Lock className="size-3.5 shrink-0 text-white/50" />
          <input
            aria-label="نشانی مرورگر"
            dir="ltr"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/40"
            placeholder="نشانی یا جست‌وجو…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </form>
        <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="بازخوانی" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw className="size-4" />
        </button>
      </header>

      {note ? (
        <div className="shrink-0 border-b border-white/10 bg-black/60 px-3 py-2 text-[11px] leading-5 text-white/70" data-testid="browser-note">
          این یک تب ناشناس درون‌برنامه است: تاریخچه و کوکی ذخیره نمی‌شود و با بستن پاک می‌شود. ولی{" "}
          <b className="text-white/90">IP واقعی‌ات را پنهان نمی‌کند</b>، افزونهٔ کروم PC اجرا نمی‌کند و خودش را به‌جای PC جا نمی‌زند. برای IP: VPN/Tor واقعی لازم است.{" "}
          <button type="button" className="underline" onClick={() => setNote(false)}>
            متوجه شدم
          </button>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-white">
        {blocked ? (
          <div className="grid h-full place-items-center p-6 text-center" data-testid="browser-blocked">
            <div className="max-w-xs text-white/80">
              <p className="text-sm">این سایت اجازهٔ نمایش داخل برنامه را نمی‌دهد (X-Frame-Options).</p>
              <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-black" style={{ background: accent }} onClick={() => void openExternalBrowser(src).catch(() => {})}>
                <ExternalLink className="size-4" /> باز کردن بیرونی
              </button>
            </div>
          </div>
        ) : (
          <iframe
            key={reloadKey}
            ref={frame}
            title="مرورگر امن"
            data-testid="browser-frame"
            src={src}
            className="size-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
            referrerPolicy="no-referrer"
            onError={() => setBlocked(true)}
          />
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 grid place-items-center bg-black/80 py-1">
        <button type="button" className="text-[11px] text-white/60 underline" onClick={() => void openExternalBrowser(src).catch(() => {})}>
          باز کردن در مرورگر بیرونی (Tor/مرورگر اصلی)
        </button>
      </div>
    </div>
  );
}
