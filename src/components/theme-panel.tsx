import * as Dialog from "@radix-ui/react-dialog";
import { Palette, X } from "lucide-react";
import { useEffect } from "react";
import { applyTheme, useTheme } from "@/labshell/theme";

const btn = "grid size-10 shrink-0 place-items-center rounded-lab text-paper outline-none hover:bg-panel-2";
const row = "flex items-center justify-between gap-3 text-sm";

// عکس را کوچک می‌کند تا در حافظهٔ مرورگر جا شود.
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function ThemePanel() {
  const t = useTheme();
  useEffect(() => {
    void Promise.resolve(useTheme.persist.rehydrate()).then(() => applyTheme(useTheme.getState()));
  }, []);
  useEffect(() => applyTheme(t), [t.text, t.bg, t.accent, t.image, t.dim, t.fontSize]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className={btn} aria-label="شخصی‌سازی">
          <Palette className="size-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-panel p-4 outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">شخصی‌سازی</Dialog.Title>
            <Dialog.Close className={btn} aria-label="بستن">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">رنگ، پس‌زمینه، اندازهٔ قلم و تکمیل خودکار</Dialog.Description>
          {(
            [
              ["رنگ متن", "text"],
              ["رنگ پس‌زمینه", "bg"],
              ["رنگ تاکید (کلیدواژه‌ها و دکمه‌ها)", "accent"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className={row}>
              {label}
              <input type="color" value={t[key]} onChange={(e) => t.set({ [key]: e.target.value })} className="h-10 w-16 rounded bg-transparent" />
            </label>
          ))}
          <label className={row}>
            اندازهٔ قلم ویرایشگر ({t.fontSize})
            <input type="range" min={12} max={26} value={t.fontSize} onChange={(e) => t.set({ fontSize: +e.target.value })} />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm">عکس پس‌زمینه</span>
            <input
              type="file"
              accept="image/*"
              className="text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) t.set({ image: await shrink(f) });
              }}
            />
            {t.image ? (
              <>
                <label className={row}>
                  شفافیت لایهٔ رنگ ({t.dim}٪)
                  <input type="range" min={20} max={100} value={t.dim} onChange={(e) => t.set({ dim: +e.target.value })} />
                </label>
                <button type="button" className="h-10 rounded-lab bg-panel-2 text-sm" onClick={() => t.set({ image: "" })}>
                  حذف عکس
                </button>
              </>
            ) : null}
          </div>
          <label className={row}>
            تکمیل خودکار کد (با Tab قبول می‌شود)
            <input type="checkbox" checked={t.autocomplete} onChange={(e) => t.set({ autocomplete: e.target.checked })} className="size-5" />
          </label>
          <button type="button" className="h-11 rounded-lab bg-panel-2 text-sm" onClick={t.reset}>
            بازگشت به پیش‌فرض
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
