// رابط «حالت محرمانه» در هاب. منطق واقعی در confidential.js است؛ این فایل فقط UI است.
import * as CM from "./confidential.js";

const fmt = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 6e4)); return m < 1 ? "همین الان" : m < 60 ? `${m} دقیقه پیش` : m < 1440 ? `${Math.round(m / 60)} ساعت پیش` : `${Math.round(m / 1440)} روز پیش`; };
const KIND_FA = {
  "mode-enabled": "حالت محرمانه روشن شد", "mode-disabled": "حالت محرمانه خاموش شد",
  "blocked:اتصال AI": "اتصال به هوش مصنوعی مسدود شد", "blocked:export": "خروجی‌گرفتن مسدود شد", "blocked:clipboard": "کپی در کلیپ‌بورد مسدود شد",
  "blocked:ذخیرهٔ گزارش": "ذخیرهٔ گزارش مسدود شد", "blocked:اشتراک گزارش": "اشتراک گزارش مسدود شد", "blocked:مرورگر": "باز کردن مرورگر مسدود شد",
};
const kindLabel = (k) => KIND_FA[k] || (k.startsWith("blocked:csp:") ? "ارتباط خروجی در یک صفحه مسدود شد" : k.startsWith("blocked:") ? "" + k.slice(8) + " مسدود شد" : k);

const PROTECTED = [
  ["اتصال به هوش مصنوعی شخصی", "هر درخواست به سرور AI پیکربندی‌شده شما (حتی در شبکهٔ محلی) رد می‌شود."],
  ["موزیک، اخبار هک، نقشهٔ حملات", "رادیوی آنلاین، دریافت اخبار و نقشهٔ زندهٔ حملات خاموش می‌شوند."],
  ["مرورگر، ترمینال، git، nmap", "دکمهٔ «باز کردن مرورگر» و هر فرمان ترمینال (از جمله git و nmap در Cyber Lab) رد می‌شوند."],
  ["اجرای پایتون واقعی (بومی)", "چون سوکت واقعی سیستم‌عامل می‌سازد و از جاوااسکریپت قابل‌دیدن نیست، به‌جای فیلترشدن کاملاً غیرفعال می‌شود؛ فقط پایتون داخل مرورگر (بدون سوکت) باقی می‌ماند."],
  ["خروجی‌گرفتن (APK / ZIP ویندوز)", "ساخت و دانلود خروجی نصبی پروژه مسدود می‌شود."],
  ["ذخیره و اشتراک گزارش", "دکمه‌های «ذخیره» و «اشتراک» در تحلیل فایل، CTF و کارت‌های CVE مسدود می‌شوند."],
  ["کپی در کلیپ‌بورد", "navigator.clipboard در همهٔ برنامه (هر دکمهٔ «کپی») مسدود است."],
  ["هر پیش‌نمایش/iframe (ویرایشگر، نوا، برنامه‌های لانچر، نمایشگر سه‌بعدی)", "یک CSP سخت‌گیر به هرکدام تزریق می‌شود که ارتباط خروجی را کاملاً می‌بندد، مستقل از کدی که داخلش اجرا می‌شود."],
];
const NOT_CONTROLLED = [
  "این یک قفل سمت برنامه (جاوااسکریپت) است، نه دیوار امنیتی سیستم‌عامل؛ کسی با دسترسی فنی به ابزار توسعه‌دهنده می‌تواند دور بزند.",
  "در اندروید، کدِ جاوای خود برنامه تغییر نکرده؛ این قفل فقط نقطه‌های فراخوانی از جاوااسکریپت را می‌بندد.",
  "ابزارهای عامل هوش مصنوعی برای «وضعیت دستگاه» و «مکان» در این نسخه مسدود نشده‌اند (اگر لازم است بگو تا اضافه شود).",
  "دستگاه‌های دیگر یا ارتباطات بی‌سیم ساختمان کنترل نمی‌شوند؛ این فقط خروجی‌های خودِ CodePad را می‌بندد.",
];

function pinPrompt(ui, { title, onSubmit }) {
  const input = ui.h("input", { class: "ui-input", type: "password", inputmode: "numeric", pattern: "[0-9]*", maxlength: "8", placeholder: "پین (۴ تا ۸ رقم)", dir: "ltr", "aria-label": title });
  const status = ui.h("p", { class: "ui-muted", style: "margin:0", role: "status" });
  const go = async () => { try { await onSubmit(input.value); } catch (e) { status.textContent = e?.message || String(e); return; } };
  input.addEventListener("keydown", (e) => e.key === "Enter" && go());
  return ui.h("div", { class: "ui-actions" }, input, ui.h("button", { type: "button", class: "ui-btn ui-btn--primary", onclick: go }, title), status);
}

export function viewConfidential(ui) {
  const { h } = ui;
  const root = h("div", { class: "ui-stack" });
  const sec = (title, ...kids) => h("section", { class: "ui-sec" }, h("h2", {}, title), ...kids);
  const body = h("div", {});
  const render = () => { body.replaceChildren(renderBody()); };

  function renderBody() {
    const enabled = CM.isEnabled();
    const hasPin = CM.hasPin();
    const frag = h("div", { class: "ui-stack" });

    frag.append(h("div", { class: enabled ? "ui-tile ui-tile--done" : "ui-tile", style: "min-height:0;cursor:default" },
      h("b", {}, enabled ? "حالت محرمانه فعال است" : "حالت محرمانه خاموش است"),
      h("small", {}, enabled ? "ارتباطات خروجیِ تحت کنترل CodePad بسته‌اند." : "برنامه مثل همیشه کار می‌کند؛ هیچ چیزی مسدود نیست.")));

    const toggleBox = h("div", {});
    const doToggle = async (pin) => {
      await CM.setEnabled(!enabled, { pin });
      render();
    };
    if (hasPin) toggleBox.append(pinPrompt(ui, { title: enabled ? "خاموش‌کردن با پین" : "روشن‌کردن با پین", onSubmit: doToggle }));
    else toggleBox.append(h("button", { type: "button", class: "ui-btn ui-btn--primary", onclick: () => doToggle() }, enabled ? "خاموش کردن" : "روشن کردن حالت محرمانه"));
    frag.append(sec("کنترل", toggleBox,
      !hasPin ? h("p", { class: "ui-notice ui-notice--err", role: "alert" }, "هنوز پین مدیریتی تنظیم نشده؛ هرکسی که به این دستگاه دسترسی دارد می‌تواند حالت را عوض کند. پایین همین صفحه پین بگذار.") : null));

    frag.append(sec("چه چیزی مسدود می‌شود", h("ul", { class: "ui-stack", style: "margin:0;padding-inline-start:20px" }, PROTECTED.map(([t, d]) => h("li", {}, h("b", {}, t), h("br"), d)))));
    frag.append(sec("چه چیزی کنترل نمی‌شود (صادقانه)", h("ul", { class: "ui-stack", style: "margin:0;padding-inline-start:20px" }, NOT_CONTROLLED.map((t) => h("li", {}, t)))));

    // پین
    const pinBox = h("div", {});
    if (!hasPin) {
      const p1 = h("input", { class: "ui-input", type: "password", inputmode: "numeric", maxlength: "8", placeholder: "پین جدید", dir: "ltr", "aria-label": "پین جدید" });
      const p2 = h("input", { class: "ui-input", type: "password", inputmode: "numeric", maxlength: "8", placeholder: "تکرار پین", dir: "ltr", "aria-label": "تکرار پین" });
      const st = h("p", { class: "ui-muted", style: "margin:0", role: "status" });
      pinBox.append(h("div", { class: "ui-actions" }, p1, p2,
        h("button", { type: "button", class: "ui-btn ui-btn--primary", onclick: async () => { if (p1.value !== p2.value) { st.textContent = "دو پین یکی نیستند."; return; } try { await CM.setPin(p1.value); st.textContent = "پین تنظیم شد."; render(); } catch (e) { st.textContent = e.message; } } }, "تنظیم پین")), st);
    } else {
      const old = h("input", { class: "ui-input", type: "password", inputmode: "numeric", maxlength: "8", placeholder: "پین فعلی", dir: "ltr", "aria-label": "پین فعلی" });
      const n1 = h("input", { class: "ui-input", type: "password", inputmode: "numeric", maxlength: "8", placeholder: "پین جدید", dir: "ltr", "aria-label": "پین جدید" });
      const st = h("p", { class: "ui-muted", style: "margin:0", role: "status" });
      pinBox.append(h("div", { class: "ui-actions" }, old, n1,
        h("button", { type: "button", class: "ui-btn ui-btn--line", onclick: async () => { try { await CM.changePin(old.value, n1.value); st.textContent = "پین عوض شد."; old.value = n1.value = ""; } catch (e) { st.textContent = e.message; } } }, "تغییر پین")), st,
        h("p", { class: "ui-muted", style: "margin:0" }, "برای برداشتن کامل قفل (بدون پین)، پین فعلی را درست وارد کن و «حذف پین» را بزن."),
        h("div", { class: "ui-actions" }, h("button", { type: "button", class: "ui-btn ui-btn--line", onclick: async () => { if (await CM.checkPin(old.value)) { CM.clearPin(); st.textContent = "پین حذف شد."; render(); } else st.textContent = "پین فعلی اشتباه است."; } }, "حذف پین")));
    }
    frag.append(sec("پین مدیریتی", pinBox));

    // رویدادها
    const entries = CM.readLog();
    frag.append(sec("رویدادها (فقط نوع و میزبان، بدون محتوا)",
      entries.length ? h("ul", { class: "ui-stack", style: "margin:0;padding-inline-start:20px" }, entries.slice(0, 60).map((e) => h("li", {}, `${kindLabel(e.kind)}${e.host ? " — " + e.host : ""} · ${fmt(e.t)}`))) : h("p", { class: "ui-muted", style: "margin:0" }, "هنوز رویدادی ثبت نشده."),
      entries.length ? h("button", { type: "button", class: "ui-btn ui-btn--line", onclick: () => { CM.clearLog(); render(); } }, "پاک‌کردن گزارش") : null));

    return frag;
  }
  render();
  root.append(body);
  return root;
}
