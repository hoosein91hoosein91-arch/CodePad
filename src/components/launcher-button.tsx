import * as Dialog from "@radix-ui/react-dialog";
import { LayoutGrid, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { installProject } from "@/labshell/launcher";
import { activeProject, useLab } from "@/labshell/store";

const btn = "grid size-10 shrink-0 place-items-center rounded-lab text-paper outline-none hover:bg-panel-2";

export function LauncherButton() {
  const [msg, setMsg] = useState("");
  return (
    <Dialog.Root onOpenChange={() => setMsg("")}>
      <Dialog.Trigger asChild>
        <button type="button" className={btn} aria-label="لانچر">
          <LayoutGrid className="size-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-2xl bg-panel p-4 outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">لانچر</Dialog.Title>
            <Dialog.Close className={btn} aria-label="بستن">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-mist">پروژهٔ فعال را مثل یک برنامه در لانچر نصب کن (نصب دوباره، نسخهٔ قبلی را به‌روز می‌کند).</Dialog.Description>
          <button
            type="button"
            className="h-11 rounded-lab bg-lime px-4 font-semibold text-ink"
            onClick={async () => {
              try {
                const app = await installProject(activeProject(useLab.getState()));
                setMsg(`«${app.name}» نصب شد.`);
              } catch (e) {
                setMsg(`نصب نشد: ${e instanceof Error ? e.message : e}`);
              }
            }}
          >
            نصب پروژهٔ فعال در لانچر
          </button>
          {msg ? <p className="text-sm">{msg}</p> : null}
          <Link to="/launcher" className="grid h-11 place-items-center rounded-lab bg-panel-2 text-sm">
            رفتن به لانچر
          </Link>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
