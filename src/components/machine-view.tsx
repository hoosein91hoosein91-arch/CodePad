import type { MachineSnap } from "@/labshell/binary";
import { bitsOf } from "@/labshell/binary";

export function MachineView({ snap }: { snap: MachineSnap | null }) {
  const bits = snap?.bits ?? bitsOf(0);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-ink p-3" dir="rtl">
      <div className="flex items-end justify-between gap-3">
        <p className="font-mono text-2xl tracking-widest text-lime" dir="ltr">
          {bits}
        </p>
        <p className="text-sm text-mist">{snap ? `register ${snap.a}` : "register 0"}</p>
      </div>
      <div className="flex gap-1" dir="ltr" aria-label="هشت لامپ رجیستر">
        {bits.split("").map((bit, index) => (
          <span
            key={index}
            className={`h-8 min-w-0 flex-1 rounded-full ${bit === "1" ? "bg-lime" : "border border-line bg-panel-2"}`}
          />
        ))}
      </div>
      <p className="text-sm leading-relaxed text-paper">{snap ? snap.gloss : "برای روشن‌کردن ماشین اجرا را بزن."}</p>
      <p className="font-mono text-xs text-mist" dir="ltr">
        {snap ? `PC ${snap.pc}  steps ${snap.steps}` : "PC 0"}
      </p>
    </div>
  );
}
