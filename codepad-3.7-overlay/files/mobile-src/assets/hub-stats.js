// «📊 آمار من»: یک‌جا نشان می‌دهد در آکادمی، CTF و موردعلاقه‌ها کجای کاری — همه از همان دادهٔ واقعی هر بخش، نه عدد ساختگی.
import { progressSummary as academyProgress, CHAPTERS as ACADEMY_CHAPTERS } from "./hub-academy.js";
import { progress as ctfProgress, CTF_CHALLENGES } from "./hub-ctf.js";
import { favoriteCount } from "./hub-favorites.js";

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

const bar = (h, value, max, cls = "") =>
  h("div", { class: "hb-stat-bar" + (cls ? " " + cls : "") }, h("div", { class: "hb-stat-bar-fill", style: `width:${pct(value, max)}%` }));

export function viewStats({ h, show }) {
  const root = h("div", { class: "hb-view" });
  const ac = academyProgress();
  const ctf = ctfProgress();
  const favPy = favoriteCount("py");
  const favRef = favoriteCount("ref");

  const statCard = (icon, title, line, value, max, onclick) =>
    h("button", { type: "button", class: "hb-stat-card", onclick },
      h("div", { class: "hb-stat-head" }, h("span", { class: "hb-ico" }, icon), h("b", {}, title)),
      h("p", {}, line),
      max ? bar(h, value, max) : null);

  root.append(
    h("div", { class: "hb-hero" }, h("div", { class: "hb-logo", "aria-hidden": "true" }, "📊"),
      h("div", {}, h("h2", {}, "آمار من"), h("p", {}, "پیشرفت واقعی‌ات در آکادمی امنیت، چالش‌های CTF و موردعلاقه‌ها — همه از همین دستگاه، جایی فرستاده نمی‌شود."))),
    h("div", { class: "hb-grid hb-stat-grid" },
      statCard("🎓", "آکادمی امنیت", `${ac.passed} از ${ac.total} فصل گذرانده شد`, ac.passed, ac.total, () => show("academy")),
      statCard("🚩", "چالش‌های CTF", `${ctf.count} از ${ctf.total} چالش · ${ctf.points} از ${ctf.maxPoints} امتیاز`, ctf.count, ctf.total, () => show("security")),
      statCard("⭐", "موردعلاقه‌های پایتون", `${favPy} نمونه ستاره‌دار شده`, favPy, 0, () => show("python")),
      statCard("⭐", "موردعلاقه‌های مرجع", `${favRef} مدخل ستاره‌دار شده`, favRef, 0, () => show("reference"))),
    h("section", { class: "hb-sec" },
      h("h3", {}, "فصل‌های آکادمی"),
      h("div", { class: "hb-stat-rows" }, ACADEMY_CHAPTERS.map((c, i) => {
        const done = i < ac.passed;
        return h("div", { class: "hb-stat-row" + (done ? " done" : "") }, h("span", {}, done ? "✅" : "⬜"), h("span", {}, c.title));
      }))),
    h("section", { class: "hb-sec" },
      h("h3", {}, "چالش‌های CTF حل‌شده"),
      ctf.count
        ? h("div", { class: "hb-stat-rows" }, CTF_CHALLENGES.filter((c) => ctf.solved[c.id]).map((c) => h("div", { class: "hb-stat-row done" }, h("span", {}, "✅"), h("span", {}, c.title), h("span", { class: "hb-lvl" }, `${c.pts} امتیاز`))))
        : h("p", { class: "hb-lead" }, "هنوز چالشی حل نشده؛ از تب «امنیت» شروع کن.")));
  return root;
}
