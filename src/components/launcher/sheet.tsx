import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

// برگهٔ پایین‌صفحه برای همهٔ پنجره‌های لانچر
export function Sheet({ title, icon, children, open, onOpenChange, testId }: { title: string; icon?: ReactNode; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void; testId?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          data-testid={testId}
          aria-describedby={undefined}
          className="jibos-sheet fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[460px] flex-col gap-4 overflow-y-auto rounded-t-[28px] border border-[color:var(--launcher-accent)]/25 bg-[#050b08]/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-[0_-10px_60px_rgba(0,255,156,.12)] outline-none"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {icon}
              <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
            </div>
            <Dialog.Close className="grid size-9 place-items-center rounded-full bg-white/8" aria-label="بستن">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const field = "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[color:var(--launcher-accent)]";
export const codeArea = "w-full resize-y rounded-2xl border border-white/10 bg-black/60 p-3 font-mono text-xs leading-5 text-[color:var(--launcher-accent)] outline-none";
export const primaryBtn = "h-11 rounded-xl font-bold text-black disabled:opacity-50";
export const ghostBtn = "h-10 rounded-xl bg-white/10 px-3 text-sm";
