// بخش «امنیت» هاب: سایت تمرین آسیب‌پذیر، اشتراک روی شبکه، CTF، تحلیل فایل، داشبورد شبکه و کارت‌های CVE.
// همهٔ این‌ها فقط روی دستگاه خودت کار می‌کنند و به هدف بیرونی حمله نمی‌کنند.
import { CTF_CHALLENGES, progress as ctfProgress, submit as ctfSubmit, reset as ctfReset } from "./hub-ctf.js";
import { analyze, buildAnalysisReport } from "./hub-forensics.js";

const NOTES_KEY = "codepad-cve-notes-v1";
export const CVE_RE = /CVE-\d{4}-\d{4,7}/i;
const ls = () => { try { return globalThis.localStorage; } catch { return null; } };

export function loadNotes(storage = ls()) { try { const v = JSON.parse(storage?.getItem(NOTES_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveNotes(list, storage) { try { storage?.setItem(NOTES_KEY, JSON.stringify(list.slice(0, 200))); } catch { /* حافظه پر */ } }
export function addNote(item, storage = ls()) {
  const cve = (item.title.match(CVE_RE) || [])[0]?.toUpperCase();
  const id = cve || "N-" + Date.now().toString(36);
  const list = loadNotes(storage);
  if (list.some((n) => n.id === id)) return list.find((n) => n.id === id);
  const note = { id, title: String(item.title).slice(0, 200), url: String(item.url), source: item.src || "", text: "", at: Date.now() };
  saveNotes([note, ...list], storage);
  return note;
}
export function updateNote(id, text, storage = ls()) { const list = loadNotes(storage); const n = list.find((x) => x.id === id); if (n) { n.text = String(text).slice(0, 4000); saveNotes(list, storage); } return !!n; }
export function removeNote(id, storage = ls()) { saveNotes(loadNotes(storage).filter((n) => n.id !== id), storage); }

const lvlIcon = { high: "🔴", medium: "🟡", info: "🟢" };
const fmtSize = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB");

export function viewSecurity(c) {
  const { h, importSample, sampleById, openUrl, card, show, close } = c;
  const root = h("div", { class: "hb-view" });
  const sec = (title, ...kids) => h("section", { class: "hb-sec" }, h("h3", {}, title), ...kids);
  const note = (t) => h("p", { class: "hb-lead" }, t);
  const row = (...k) => h("div", { class: "hb-row" }, ...k);
  const btn = (label, fn, cls = "") => h("button", { type: "button", class: "hb-btn " + cls, onclick: fn }, label);

  // ── ۱) سایت تمرین آسیب‌پذیر ──
  const lab = sampleById("sec_lab_site");
  const labBox = sec("🎯 سایت تمرین تست نفوذ (محلی)",
    note("یک سایت عمداً آسیب‌پذیر با ۱۴ مرحله (SQL Injection، XSS، IDOR، تزریق فرمان شبیه‌سازی‌شده، SSRF، آپلود ناامن…). روی همین دستگاه (127.0.0.1) اجرا می‌شود؛ به شبکه و اینترنت وصل نیست و فایل یا فرمان واقعی دستگاهت در معرض حمله نیست."),
    h("ol", { class: "hb-steps" }, h("li", {}, "«اجرا» را بزن (در ویرایشگر راه می‌افتد و آدرس را چاپ می‌کند)."), h("li", {}, "«باز کردن سایت» را بزن یا آدرس http://127.0.0.1:8088/ را در مرورگر بزن."), h("li", {}, "هر مرحله را هک کن، پرچم CP{…} را در صفحهٔ 🚩 ثبت کن. فقط در صورت نیاز راهنما را باز کن.")),
    row(btn("▶ اجرای سایت تمرین", () => importSample(lab, { run: true }), "pri"), btn("🌐 باز کردن سایت", () => openUrl("http://127.0.0.1:8088/")), btn("کد را ببین", () => importSample(lab))),
    note("لازم: نسخهٔ ویندوز یا اندروید CodePad (Python واقعی). در نسخهٔ مرورگر وب، سوکت وجود ندارد و برنامه پیغام می‌دهد."));
  root.append(labBox);

  // ── ۲) اشتراک روی شبکه ──
  const share = sampleById("sec_lan_share");
  const files = h("input", { type: "file", multiple: true, "aria-label": "فایل‌های اشتراکی" });
  const noToken = h("input", { type: "checkbox", id: "hb-notoken" });
  const picked = h("p", { class: "hb-lead" }, "هیچ فایلی انتخاب نشده؛ می‌توانی index.html (برای سایت) یا هر فایل دیگری را انتخاب کنی.");
  files.addEventListener("change", () => { const l = [...files.files]; picked.textContent = l.length ? `${l.length} فایل · ${fmtSize(l.reduce((a, f) => a + f.size, 0))}: ${l.slice(0, 4).map((f) => f.name).join("، ")}${l.length > 4 ? "…" : ""}` : "هیچ فایلی انتخاب نشده."; });
  root.append(sec("📡 اشتراک روی شبکه (برای دستگاه‌های دیگر)",
    note("فایل یا سایتت را روی شبکهٔ محلی منتشر کن. هر کس به همین وای‌فای/هات‌اسپات وصل است، فقط با باز کردن آدرس در مرورگر می‌بیند؛ چیزی نصب نمی‌کند. فقط خواندنی است و هیچ‌چیز اجرا نمی‌شود."),
    files, picked,
    h("label", { class: "hb-check" }, noToken, " بدون توکن در آدرس (فقط برای شبکه‌ای که کاملاً مطمئنی)"),
    row(btn("▶ شروع اشتراک", () => importSample(share, { run: true, files: [...files.files], patch: (code) => (noToken.checked ? code.replace('os.environ.get("CP_SHARE_TOKEN", "1")', 'os.environ.get("CP_SHARE_TOKEN", "0")') : code) }), "pri"), btn("کد را ببین", () => importSample(share))),
    note("آدرس شبکه در خروجی چاپ می‌شود (مثل http://192.168.1.20:8000/…). ویندوز بار اول اجازهٔ شبکه می‌خواهد (Allow). فقط آی‌پی‌های شبکهٔ خصوصی پذیرفته می‌شوند. برای توقف: Stop.")));

  // ── ۳) CTF ──
  const ctfBox = h("div", { class: "hb-ctf" });
  const renderCtf = (openId) => {
    const p = ctfProgress();
    ctfBox.replaceChildren(h("p", { class: "hb-lead" }, `پیشرفت: ${p.count}/${p.total} چالش · ${p.points}/${p.maxPoints} امتیاز`));
    if (!openId) {
      ctfBox.append(h("div", { class: "hb-grid" }, CTF_CHALLENGES.map((ch) => h("button", { type: "button", class: "hb-card" + (p.solved[ch.id] ? " done" : ""), onclick: () => renderCtf(ch.id) }, h("b", {}, (p.solved[ch.id] ? "✔ " : "") + ch.title), h("small", {}, `${ch.cat} · ${ch.pts} امتیاز`)))));
      ctfBox.append(row(btn("💾 ذخیره / 📤 اشتراک نتیجه", () => { const q = ctfProgress(); window.CodePadReports?.show({ name: "ctf-progress.txt", mime: "text/plain", title: "نتیجهٔ CTF", text: ["CodePad CTF", `حل‌شده: ${q.count}/${q.total} · امتیاز ${q.points}/${q.maxPoints}`, "", ...CTF_CHALLENGES.map((c) => `${q.solved[c.id] ? "[x]" : "[ ]"} ${c.title} (${c.pts})`)].join("\n") }); }), btn("پاک‌کردن پیشرفت", () => { if (confirm("همهٔ پیشرفت CTF پاک شود؟")) { ctfReset(); renderCtf(); } })));
      return;
    }
    const ch = CTF_CHALLENGES.find((x) => x.id === openId);
    const input = h("input", { type: ch.type === "jwt" ? "text" : "text", dir: "ltr", placeholder: ch.type === "jwt" ? "توکن جعلی را اینجا بچسبان" : "CP{...}", "aria-label": "پاسخ" });
    const out = h("p", { role: "status", class: "hb-lead" }, p.solved[ch.id] ? "✔ قبلاً حل کرده‌ای." : "");
    const hintBox = h("div", {}); let shown = 0;
    ctfBox.append(h("article", { class: "hb-sample" },
      h("div", { class: "hb-st" }, h("b", {}, ch.title), h("span", { class: "hb-lvl" }, ch.pts + " امتیاز")),
      h("p", {}, ch.story),
      h("pre", { class: "hb-pre", dir: "ltr", tabindex: "0" }, ch.data),
      row(btn("کپی داده", () => navigator.clipboard?.writeText(ch.data).then(() => (out.textContent = "کپی شد."))), btn("↩ فهرست", () => renderCtf())),
      input,
      row(btn("بررسی پاسخ", async () => { const r = await ctfSubmit(ch.id, input.value); out.textContent = r.ok ? `✔ درست! +${ch.pts} امتیاز` : "✖ اشتباه است؛ دوباره امتحان کن."; if (r.ok) setTimeout(() => renderCtf(ch.id), 700); }, "pri"), btn("💡 راهنما", () => { if (shown < ch.hints.length) hintBox.append(h("p", { class: "hb-hint" }, `راهنما ${shown + 1}: ${ch.hints[shown++]}`)); })),
      hintBox, out));
  };
  renderCtf();
  root.append(sec("🚩 چالش‌های CTF آفلاین", note("۱۲ چالش رمزنگاری، وب، لاگ و فارنزیک. همه‌چیز داخل برنامه است، به هدف واقعی وصل نیست."), ctfBox));

  // ── ۴) تحلیل فایل ──
  const rep = h("div", {});
  const fin = h("input", { type: "file", "aria-label": "فایل برای تحلیل" });
  fin.addEventListener("change", async () => {
    const f = fin.files[0]; if (!f) return;
    rep.replaceChildren(h("p", { class: "hb-lead" }, "در حال بررسی…"));
    if (f.size > 200 * 1048576) { rep.replaceChildren(h("p", { class: "hb-warn" }, "فایل بزرگ‌تر از ۲۰۰ مگابایت است.")); return; }
    try {
      const r = await analyze(new Uint8Array(await f.arrayBuffer()), f.name);
      const risk = r.findings.some((x) => x.level === "high") ? "high" : r.findings.some((x) => x.level === "medium") ? "medium" : "info";
      rep.replaceChildren(
        h("div", { class: "hb-card", style: "min-height:0" }, h("b", {}, `${lvlIcon[risk]} ${r.name}`), h("small", {}, `${fmtSize(r.size)} · ${r.type.desc} · آنتروپی ${r.entropy.toFixed(2)}/8`)),
        r.findings.length ? h("ul", { class: "hb-find" }, r.findings.map((x) => h("li", {}, `${lvlIcon[x.level] || "•"} ${x.text}`))) : h("p", { class: "hb-lead" }, "🟢 نشانهٔ مشکوکی در این بررسی ساده پیدا نشد (این به معنی «بی‌خطر بودن» نیست)."),
        h("pre", { class: "hb-pre", dir: "ltr" }, `MD5     ${r.md5}\nSHA-1   ${r.sha1}\nSHA-256 ${r.sha256}`),
        r.zip ? h("details", {}, h("summary", {}, `محتوای ZIP (${r.zip.length} مورد)`), h("pre", { class: "hb-pre", dir: "ltr" }, r.zip.slice(0, 200).map((e) => `${String(e.usize).padStart(10)}  ${e.name}${e.encrypted ? "  🔒" : ""}`).join("\n"))) : null,
        h("details", {}, h("summary", {}, "رشته‌های قابل‌خواندن"), h("pre", { class: "hb-pre", dir: "ltr" }, r.strings.join("\n") || "—")),
        h("details", {}, h("summary", {}, "هگزدامپ ۲۵۶ بایت اول"), h("pre", { class: "hb-pre", dir: "ltr" }, r.hexdump)),
        row(btn("💾 ذخیره / 📤 اشتراک گزارش", () => window.CodePadReports?.show({ name: "file-analysis-" + r.name.replace(/[^\w.\-\u0600-\u06ff]+/g, "_") + ".txt", text: buildAnalysisReport(r), mime: "text/plain", title: "گزارش تحلیل فایل: " + r.name }), "pri"), btn("🔎 جست‌وجوی SHA-256 در VirusTotal", () => openUrl("https://www.virustotal.com/gui/file/" + r.sha256))));
    } catch (e) { rep.replaceChildren(h("p", { class: "hb-warn" }, "بررسی نشد: " + (e?.message || e))); }
  });
  root.append(sec("🔬 تحلیل فایل مشکوک", note("فایل را انتخاب کن: نوع واقعی (از روی بایت‌ها)، هش‌ها، آنتروپی، رشته‌ها و محتوای ZIP/APK. فایل هرگز اجرا یا آپلود نمی‌شود؛ همه‌چیز روی همین دستگاه است. فقط دکمهٔ VirusTotal هش را (نه فایل را) در مرورگر باز می‌کند."), fin, rep));

  // ── ۵) داشبورد شبکه ──
  const dash = sampleById("sec_lan_dashboard");
  root.append(sec("🏠 داشبورد شبکهٔ خانه", note("دستگاه‌های روشن شبکهٔ خودت و پورت‌های پرخطر (Telnet، SMB، RDP…) را پیدا می‌کند و توصیهٔ سخت‌سازی می‌دهد. فقط بازهٔ خصوصی خودت و فقط بعد از تأیید تو. برای تأیید، y را در «جواب‌های آماده» بنویس."), row(btn("باز کردن در ویرایشگر", () => importSample(dash), "pri")), note("برای تأیید اینکه شبکه مال خودت است، در کادر «جواب‌های آماده» پایین ویرایشگر فقط حرف y را بنویس و بعد «اجرا» را بزن؛ بدون آن اسکن شروع نمی‌شود. لازم: Python واقعی (ویندوز/اندروید). اسکن شبکهٔ دیگران بدون اجازه ممنوع است.")));

  // ── ۶) کارت‌های CVE ──
  const notes = h("div", {});
  const renderNotes = () => {
    const list = loadNotes();
    notes.replaceChildren(list.length ? "" : h("p", { class: "hb-lead" }, "هنوز کارتی نداری. در «اخبار هک» روی 📌 کنار هر خبر بزن تا اینجا ذخیره شود."));
    for (const n of list) {
      const ta = h("textarea", { rows: "2", placeholder: "یادداشت خودت: تأثیر روی چه چیزی؟ چه کاری باید بکنم؟", "aria-label": "یادداشت" }, n.text);
      ta.addEventListener("change", () => updateNote(n.id, ta.value));
      const ai = window.CodePadAI;
      notes.append(h("article", { class: "hb-sample" }, h("b", { dir: "auto" }, n.title), h("small", {}, `${n.id} · ${n.source}`), ta,
        row(btn("باز کردن خبر", () => openUrl(n.url)),
          ai?.ready?.() ? btn("🤖 توضیح فارسی با AI", async (e) => { const b = e.currentTarget; b.disabled = true; b.textContent = "…"; try { const t = await ai.ask(`این خبر/آسیب‌پذیری امنیتی را به فارسی ساده در ۵ جمله توضیح بده: چیست، چه کسانی در خطرند، و چه کاری باید کرد. فقط توصیهٔ دفاعی بده.\n\n${n.title}`); updateNote(n.id, (ta.value ? ta.value + "\n\n" : "") + String(t?.text ?? t)); renderNotes(); } catch (err) { b.textContent = "AI در دسترس نبود"; } }) : null,
          btn("🗑 حذف", () => { removeNote(n.id); renderNotes(); }))));
    }
  };
  renderNotes();
  const exportNotes = () => { const list = loadNotes(); if (!list.length) { alert("هنوز کارتی نداری."); return; } window.CodePadReports?.show({ name: "cve-cards.txt", mime: "text/plain", title: "کارت‌های آسیب‌پذیری", text: list.map((n) => `${n.id}\n${n.title}\n${n.url}${n.text ? "\nیادداشت: " + n.text : ""}`).join("\n\n----\n\n") }); };
  root.append(sec("📌 کارت‌های آسیب‌پذیری (CVE)", row(btn("💾 ذخیره / 📤 اشتراک همهٔ کارت‌ها", exportNotes)), note("از اخبار هک ذخیره کن و یادداشت بنویس؛ اگر AI شخصی‌ات وصل باشد می‌تواند فارسی توضیح بدهد (متن خبر به همان سرویس فرستاده می‌شود)."), notes));

  root.append(sec("🛡 ابزارهای دیگر", row(btn("Cyber Lab (ترمینال، nmap، نقشهٔ حمله)", () => { close(); window.CodePadCyber?.open(); }))));
  return { el: root, refreshNotes: renderNotes };
}
