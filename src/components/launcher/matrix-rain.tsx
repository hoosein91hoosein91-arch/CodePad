import { useEffect, useRef } from "react";

// باران ماتریکس پشت صفحهٔ خانه. وقتی برنامه باز است یا صفحه پنهان است متوقف می‌شود؛
// اگر کاربر «کاهش حرکت» را در سیستم روشن کرده باشد، فقط یک قاب ثابت کشیده می‌شود.
const GLYPHS = "01アイウエオカキクケコサシスセソタチツテトナニヌネノ$#@%&*<>/\\{}[]=+-جیبکدابپتثجچحخدذرزسشصضطظعغفقکگلمنوهی";

export function MatrixRain({ color, paused, opacity = 0.55 }: { color: string; paused: boolean; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    let drops: number[] = [];
    const size = 14;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, canvas.clientWidth * dpr);
      canvas.height = Math.max(1, canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.ceil(canvas.clientWidth / size);
      drops = Array.from({ length: cols }, () => Math.random() * -40);
    };
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.fillStyle = "rgba(0,0,0,0.09)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${size}px ui-monospace, monospace`;
      for (let i = 0; i < drops.length; i++) {
        const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        const y = drops[i] * size;
        ctx.fillStyle = Math.random() > 0.96 ? "#e9fff4" : color;
        ctx.fillText(ch, i * size, y);
        if (y > h && Math.random() > 0.975) drops[i] = Math.random() * -20;
        drops[i] += 1;
      }
    };
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 55) return;
      last = t;
      draw();
    };
    const still = reduce || paused;
    const onResize = () => {
      resize();
      if (still) for (let k = 0; k < 40; k++) draw();
    };
    onResize();
    window.addEventListener("resize", onResize);
    if (!still) raf = requestAnimationFrame(frame);
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [color, paused]);
  return <canvas ref={ref} aria-hidden="true" data-testid="matrix-rain" className="pointer-events-none absolute inset-0 size-full" style={{ opacity }} />;
}
