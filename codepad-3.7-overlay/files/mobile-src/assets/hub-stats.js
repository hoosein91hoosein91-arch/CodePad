// «آمار من»: یک ویجت خانگی که پیشرفت واقعی آکادمی/CTF/موردعلاقه‌ها را یک‌جا نشان می‌دهد — داده از همان منابع واقعی هر بخش.
import { progressSummary as academyProgress } from "./hub-academy.js";
import { progress as ctfProgress } from "./hub-ctf.js";
import { favoriteCount } from "./hub-favorites.js";
import { h, chip } from "./ui-dom.js";

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/** یک کارت کوچک آمار با نوار پیشرفت؛ برای استفاده در خانهٔ هاب. */
export function statsSection({ onOpenAcademy, onOpenSecurity } = {}) {
  const ac = academyProgress();
  const ctf = ctfProgress();
  const favPy = favoriteCount("py");
  const favRef = favoriteCount("ref");

  const bar = (value, max) => h("div", { class: "ui-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct(value, max)) }, h("i", { style: { width: pct(value, max) + "%" } }));

  const row = (title, line, value, max, onclick) =>
    h("button", { type: "button", class: "ui-tile", onclick }, h("strong", {}, title), h("span", {}, line), max ? bar(value, max) : null);

  return h("section", { class: "ui-card ui-stack" },
    h("strong", {}, "آمار من"),
    h("div", { class: "ui-grid" },
      row("آکادمی امنیت", `${ac.passed} از ${ac.total} فصل`, ac.passed, ac.total, onOpenAcademy),
      row("چالش‌های CTF", `${ctf.count}/${ctf.total} · ${ctf.points} امتیاز`, ctf.count, ctf.total, onOpenSecurity),
      h("div", { class: "ui-tile", style: { cursor: "default" } }, h("strong", {}, "موردعلاقه‌ها"), h("span", {}, `${favPy} نمونه · ${favRef} مرجع`), h("div", { class: "ui-actions" }, chip(`⭐ ${favPy + favRef}`, "primary")))));
}
