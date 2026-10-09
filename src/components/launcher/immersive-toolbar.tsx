import { ArrowRight, ChevronUp, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** The app always keeps the whole viewport; revealing tools never resizes its iframe. */
export function ImmersiveToolbar({ name, icon, iconImage, iconColor, accent, resetKey, onClose, onReload }: {
  name: string;
  icon: string;
  iconImage?: string;
  iconColor?: string;
  accent: string;
  resetKey: string;
  onClose: () => void;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const drag = useRef<{ id: number; y: number } | null>(null);
  useEffect(() => { setOpen(false); drag.current = null; }, [resetKey]);

  return <>
    <button
      type="button"
      className="jibos-chrome-reveal"
      hidden={open}
      aria-label="نمایش ابزارهای برنامه"
      aria-expanded={open}
      aria-controls="jibos-app-toolbar"
      title="برای نمایش ابزارها، لمس کن یا به پایین بکش"
      onClick={() => setOpen(true)}
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current?.id === e.pointerId && e.clientY - drag.current.y > 20) setOpen(true);
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    />
    <header id="jibos-app-toolbar" data-testid="app-toolbar" hidden={!open} className="jibos-app-toolbar" style={{ borderColor: `${accent}33` }}>
      <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/10" aria-label="بازگشت به خانه" onClick={onClose}><ArrowRight className="size-5" /></button>
      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg text-sm" style={{ background: iconColor ?? "#06150d" }}>{iconImage ? <img src={iconImage} alt="" className="size-full object-cover" /> : icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
      <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10" aria-label="اجرای دوباره" onClick={() => { setOpen(false); onReload(); }}><RotateCw className="size-4" /></button>
      <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10" aria-label="مخفی‌کردن ابزارهای برنامه" onClick={() => setOpen(false)}><ChevronUp className="size-5" /></button>
    </header>
  </>;
}
