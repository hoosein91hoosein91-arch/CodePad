// CodePad Hub: یک نقطهٔ ورود مرتب برای همه‌چیز. ویرایشگر کار خودش را می‌کند؛ Studio، Cyber، موزیک، اخبار و نمونه‌ها اینجا هستند.
import { HUB_SAMPLES } from "./hub-data.js";
import { viewSecurity, addNote, CVE_RE } from "./hub-security.js";
import { viewConfidential } from "./hub-confidential.js";

const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* حافظه در دسترس نیست */ } return null; };
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
};

export const CATEGORIES = [
  ["all", "همه"], ["3d", "سه‌بعدی"], ["basics", "یادگیری"], ["games", "بازی"], ["data", "داده و تصویر"], ["security", "امنیت"], ["tools", "ابزار"], ["jslib", "JS آفلاین"],
];
export const TIPS = [
  "هیچ‌وقت روی سامانه‌ای که مجوز مکتوب نداری اسکن نکن؛ در CodePad فقط آی‌پی‌های محلی و آزمایشگاه شخصی پذیرفته می‌شوند.",
  "هش کردن رمز با MD5/SHA-1 ساده امن نیست؛ از bcrypt، scrypt یا argon2 با salt استفاده کن.",
  "JWT با الگوریتم none یا کلید ضعیف اولین چیزی است که در تست نفوذ بررسی می‌شود.",
  "ورودی کاربر را هرگز با eval اجرا نکن؛ از ast.literal_eval یا یک پارسر امن استفاده کن.",
  "پروژهٔ CTF خوب: قبل از هر ابزار، فایل را با file و strings شناسایی کن.",
  "پورت باز یعنی سرویس در حال گوش دادن؛ آسیب‌پذیر بودن را نسخهٔ سرویس مشخص می‌کند.",
  "قانون ۳-۲-۱ پشتیبان: سه نسخه، دو رسانه، یک نسخه بیرون از خانه.",
  "احراز هویت دو مرحله‌ای با برنامهٔ TOTP امن‌تر از پیامک است.",
  "در SQL همیشه از پارامتر (placeholder) استفاده کن، نه الحاق رشته.",
  "regex خوب برای تحلیل لاگ: اول چند خط نمونه بنویس، بعد الگو را روی آن‌ها آزمون کن.",
  "آنتروپی رمز = طول × log2(اندازهٔ الفبا). طول از پیچیدگی مهم‌تر است.",
  "فایل‌های ZIP ناشناس را قبل از باز کردن در محیط ایزوله بررسی کن (zip-bomb و مسیرهای ../).",
  "در Python مقایسهٔ توکن‌ها را با hmac.compare_digest انجام بده تا حملهٔ زمان‌بندی ممکن نشود.",
  "Base64 رمزنگاری نیست؛ فقط کدگذاری است.",
  "قبل از اجرای اسکریپت دانلودشده، یک بار کامل بخوانش.",
];

/** منبع‌های خبری که CORS باز دارند. هر کدام آرایه‌ای از {title,url,src,time,meta} برمی‌گرداند. */
export const NEWS_SOURCES = [
  { id: "hn", label: "Hacker News", url: "https://hn.algolia.com/api/v1/search_by_date?tags=story&query=security%20OR%20vulnerability%20OR%20exploit%20OR%20malware&hitsPerPage=40",
    parse: (j) => (j.hits || []).filter((x) => x.title).map((x) => ({ title: x.title, url: x.url || `https://news.ycombinator.com/item?id=${x.objectID}`, src: "Hacker News", time: Date.parse(x.created_at) || 0, meta: `▲ ${x.points ?? 0} · ${x.num_comments ?? 0} 💬` })) },
  { id: "lobsters", label: "Lobsters / security", url: "https://lobste.rs/t/security.json",
    parse: (j) => (Array.isArray(j) ? j : []).map((x) => ({ title: x.title, url: x.url || x.comments_url, src: "Lobsters", time: Date.parse(x.created_at) || 0, meta: `▲ ${x.score ?? 0}` })) },
  { id: "cisa", label: "CISA KEV (آسیب‌پذیری‌های فعال)", url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    parse: (j) => (j.vulnerabilities || []).slice(-30).reverse().map((x) => ({ title: `${x.cveID} — ${x.vendorProject} ${x.product}: ${x.vulnerabilityName}`, url: `https://nvd.nist.gov/vuln/detail/${x.cveID}`, src: "CISA KEV", time: Date.parse(x.dateAdded) || 0, meta: x.knownRansomwareCampaignUse === "Known" ? "⚠ باج‌افزار" : "" })) },
];
const NEWS_KEY = "codepad-hub-news-v1";

export async function fetchNews({ sources = NEWS_SOURCES, fetcher = (typeof fetch === "function" ? fetch : null), timeoutMs = 9000 } = {}) {
  if (globalThis.CodePadConfidential?.isEnabled()) return { items: [], errors: ["اخبار در حالت محرمانه غیرفعال است."] };
  const items = [], errors = [];
  await Promise.all(sources.map(async (s) => {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetcher(s.url, ctl ? { signal: ctl.signal } : {});
      if (!res.ok) throw new Error("HTTP " + res.status);
      for (const it of s.parse(await res.json())) if (it.title && /^https:\/\//i.test(it.url || "")) items.push({ ...it, source: s.id });
    } catch (e) { errors.push(`${s.label}: ${e?.name === "AbortError" ? "timeout" : e?.message || e}`); }
    finally { if (timer) clearTimeout(timer); }
  }));
  const seen = new Set();
  const out = items.sort((a, b) => b.time - a.time).filter((x) => (seen.has(x.url) ? false : seen.add(x.url)));
  return { items: out, errors };
}

export function filterSamples(list, { cat = "all", q = "" } = {}) {
  const needle = String(q).trim().toLowerCase();
  return list.filter((s) => (cat === "all" || s.cat === cat) && (!needle || `${s.title} ${s.desc} ${s.file}`.toLowerCase().includes(needle)));
}

async function goEditor() {
  if (location.pathname.endsWith("/launcher")) {
    history.pushState({}, "", location.pathname.replace(/\/launcher$/, "/"));
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((r) => setTimeout(r, 400));
  }
}
/** نمونه را به‌عنوان پروژهٔ تازه به ویرایشگر می‌آورد. گزینه‌ها: run، files (پیوست‌ها)، patch (تغییر کد پیش از ورود). */
export async function importSample(s, { run = false, files = [], patch } = {}) {
  const rt = await import("./runtime.js");
  const name = s.file;
  const lang = s.ext === "html" ? "html" : "python";
  const code = typeof patch === "function" ? patch(s.code) : s.code;
  const id = rt.pt.getState().importProject(s.title.replace(/[^\p{L}\p{N}\u200c ._-]/gu, "").slice(0, 60) || name, [{ name, lang, content: code }]);
  if (files.length) {
    try { const r = await rt.Et(id, files.filter((f) => f.name !== name)); if (r?.failed?.length) alert("این فایل‌ها ذخیره نشدند: " + r.failed.join("، ")); } catch (e) { alert("پیوست فایل‌ها ناموفق بود: " + (e?.message || e)); }
  }
  close();
  await goEditor();
  // جواب‌های آماده‌ی input() همراه نمونه می‌آید (CodePad پنجرهٔ سؤال ندارد؛ فقط از «جواب‌های آماده» می‌خواند)
  rt.pt.setState((st) => ({ projects: st.projects.map((p) => (p.id === id ? { ...p, entryFile: name, files: s.stdin ? p.files.map((f) => ({ ...f, stdin: s.stdin })) : p.files } : p)) }));
  if (run) clickRun();
}
/** دکمهٔ اجرای ویرایشگر را وقتی آماده شد می‌زند (تا ۵ ثانیه صبر می‌کند). */
function clickRun(tries = 0) {
  const btn = document.querySelector("[data-codepad-run]");
  if (btn && !btn.disabled) { setTimeout(() => btn.click(), 250); return; }
  if (tries < 25) setTimeout(() => clickRun(tries + 1), 200);
}
const sampleById = (id) => HUB_SAMPLES.find((s) => s.id === id);

let root, body, tabs, current = "home", state = { cat: "all", q: "", news: null, newsFilter: "all", newsBusy: false };

const TABS = [["home", "خانه"], ["python", "پایتون"], ["3d", "سه‌بعدی و کتابخانه‌ها"], ["security", "امنیت"], ["confidential", "🔒 محرمانه"], ["news", "اخبار هک"], ["tools", "ابزارها"]];
const lvl = (n) => "●".repeat(n) + "○".repeat(Math.max(0, 3 - n));
const day = () => Math.floor(Date.now() / 864e5);
const openUrl = (url) => { try { if (window.CodePadStudio?.openBrowser) return window.CodePadStudio.openBrowser(url); } catch { /* ادامه */ } window.open(url, "_blank", "noopener"); };
const ago = (t) => { if (!t) return ""; const m = Math.max(1, Math.round((Date.now() - t) / 6e4)); return m < 60 ? `${m} دقیقه پیش` : m < 1440 ? `${Math.round(m / 60)} ساعت پیش` : `${Math.round(m / 1440)} روز پیش`; };

const card = (icon, title, text, onclick, cls = "") => h("button", { type: "button", class: "hb-card " + cls, onclick }, h("span", { class: "hb-ico", "aria-hidden": "true" }, icon), h("b", {}, title), h("small", {}, text));

function sampleCard(s) {
  return h("article", { class: "hb-sample", "data-cat": s.cat },
    h("div", { class: "hb-st" }, h("b", {}, s.title), h("span", { class: "hb-lvl", title: "سطح" }, lvl(s.level))),
    h("p", {}, s.desc),
    h("div", { class: "hb-row" },
      h("button", { type: "button", class: "hb-btn pri", onclick: () => importSample(s, { run: true }) }, "▶ اجرا"),
      h("button", { type: "button", class: "hb-btn", onclick: () => importSample(s) }, "باز کردن در ویرایشگر"),
      h("span", { class: "hb-file" }, s.file)));
}

function viewHome() {
  const tip = TIPS[day() % TIPS.length];
  const music = window.CodePadMusic?.state?.();
  return h("div", { class: "hb-view" },
    h("div", { class: "hb-hero" }, h("div", { class: "hb-logo", "aria-hidden": "true" }, "{ }"), h("div", {}, h("h2", {}, "به CodePad خوش آمدی"), h("p", {}, "کدنویسی، بازی سه‌بعدی، تحلیل امنیتی و موزیک؛ همه آفلاین و در یک جا."))),
    h("div", { class: "hb-grid" },
      card("🐍", "پایتون", `${HUB_SAMPLES.filter((s) => s.ext === "py").length} برنامهٔ آماده برای اجرا`, () => show("python")),
      card("🧊", "سه‌بعدی", "مینی‌کرافت، فیزیک، تیراندازی با Python", () => { state.cat = "3d"; show("python"); }),
      card("📰", "اخبار هک", "تیترهای امنیت و آسیب‌پذیری‌های فعال", () => show("news")),
      card("🛡", "امنیت و تست نفوذ", "سایت تمرین محلی، CTF، تحلیل فایل، اشتراک شبکه", () => show("security")),
      card("🎧", "موسیقی", music?.title ? `در حال پخش: ${music.title}` : "فانک، رادیو و پلی‌لیست تمرکز", () => { close(); window.CodePadMusic?.open(); }),
      card("🧰", "Studio", "مرورگر، OpenCV، ZIP، رسانه", () => { close(); window.CodePadStudio?.open("projects"); })),
    h("section", { class: "hb-tip" }, h("b", {}, "💡 نکتهٔ امروز"), h("p", {}, tip)));
}

function viewPython() {
  const list = h("div", { class: "hb-list" });
  const render = () => {
    list.replaceChildren();
    const items = filterSamples(HUB_SAMPLES, state);
    if (!items.length) list.append(h("p", { class: "hb-empty" }, "چیزی پیدا نشد."));
    for (const s of items) list.append(sampleCard(s));
    count.textContent = `${items.length} نمونه`;
  };
  const count = h("span", { class: "hb-count" });
  const search = h("input", { type: "search", dir: "auto", placeholder: "جست‌وجو…", "aria-label": "جست‌وجو", value: state.q });
  search.addEventListener("input", () => { state.q = search.value; render(); });
  const chips = h("div", { class: "hb-chips", role: "group", "aria-label": "دسته" }, CATEGORIES.map(([id, label]) => {
    const b = h("button", { type: "button", "aria-pressed": String(state.cat === id), onclick: () => { state.cat = id; [...chips.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b))); render(); } }, label);
    return b;
  }));
  render();
  return h("div", { class: "hb-view" },
    h("p", { class: "hb-lead" }, "هر نمونه به‌صورت پروژهٔ تازه در ویرایشگر باز می‌شود؛ می‌توانی تغییرش بدهی. نمونه‌های ‏سه‌بعدی با Python کار می‌کنند و روی موبایل هم اجرا می‌شوند."),
    h("div", { class: "hb-bar" }, search, count), chips, list);
}

function viewDiag() {
  const out = h("div", {}), btn = h("button", { type: "button", class: "hb-btn pri" }, "🧪 بررسی سازگاری سه‌بعدی روی این دستگاه");
  btn.addEventListener("click", async () => {
    btn.disabled = true; btn.textContent = "در حال بررسی… (تا ۳۰ ثانیه)"; out.replaceChildren();
    try {
      const r = await window.CodePadPython3D.diagnose();
      out.append(h("p", { class: r.ok ? "hb-lead" : "hb-warn", role: "status" }, r.ok ? "✔ سه‌بعدی روی این دستگاه آماده است." : "✖ مشکلی پیدا شد؛ ردیف‌های قرمز را ببین و گزارش را برای پشتیبانی بفرست."),
        h("ul", { class: "hb-find" }, r.items.map((x) => h("li", {}, `${x.ok ? "✅" : "❌"} ${x.name}${x.detail ? " — " + x.detail : ""}`))),
        h("div", { class: "hb-row" }, h("button", { type: "button", class: "hb-btn", onclick: () => navigator.clipboard?.writeText(r.report).then(() => alert("گزارش کپی شد.")) }, "کپی گزارش")));
    } catch (e) { out.append(h("p", { class: "hb-warn" }, "بررسی اجرا نشد: " + (e?.message || e))); }
    btn.disabled = false; btn.textContent = "🧪 بررسی دوبارهٔ سازگاری سه‌بعدی";
  });
  return h("section", { class: "hb-sec" }, h("h3", {}, "اگر سه‌بعدی باز نمی‌شود"), h("p", { class: "hb-lead" }, "این بررسی بدون Python کتابخانه، WebGL و نمایشگر را امتحان می‌کند و دلیل دقیق را می‌گوید."), btn, out);
}
function viewLibs() {
  const libs = window.CodePadLibs?.list?.() || [];
  const three = HUB_SAMPLES.filter((s) => s.cat === "3d");
  return h("div", { class: "hb-view" },
    h("h3", {}, "کتابخانه‌های آفلاین جاوااسکریپت"),
    h("p", { class: "hb-lead" }, "در HTML فقط بنویس ", h("code", { dir: "ltr" }, '<script src="lib:three"></script>'), " و بدون اینترنت (حتی روی موبایل) کار می‌کند."),
    h("div", { class: "hb-grid" }, (libs.length ? libs : [{ id: "three" }, { id: "p5" }, { id: "matter" }, { id: "chart" }]).map((l) => {
      const id = l.id || l.name || l;
      const sample = HUB_SAMPLES.find((s) => s.ext === "html" && s.code.includes(`lib:${id}`));
      return card({ three: "🧊", p5: "🎨", matter: "⚙️", chart: "📊" }[id] || "📦", id, sample ? sample.title : "کتابخانه", () => sample && importSample(sample, { run: true }));
    })),
    viewDiag(),
    h("h3", {}, "سه‌بعدی با Python"),
    h("p", { class: "hb-lead" }, "با ", h("code", { dir: "ltr" }, "from codepad3d import Scene"), " صحنهٔ سه‌بعدی زنده بساز؛ حرکت با WASD یا جوی‌استیک، نگاه با ماوس/انگشت."),
    h("div", { class: "hb-list" }, three.map(sampleCard)));
}

async function loadNews(force) {
  if (state.newsBusy) return;
  const cached = (() => { try { return JSON.parse(LS(NEWS_KEY) || "null"); } catch { return null; } })();
  if (cached && !state.news) state.news = cached;
  if (!force && cached && Date.now() - cached.at < 10 * 6e4) return;
  state.newsBusy = true; paint();
  try {
    const r = await fetchNews();
    if (r.items.length) { state.news = { at: Date.now(), items: r.items.slice(0, 120), errors: r.errors }; LS(NEWS_KEY, JSON.stringify(state.news)); }
    else state.news = { ...(state.news || { items: [] }), errors: r.errors.length ? r.errors : ["اینترنت در دسترس نیست"] };
  } finally { state.newsBusy = false; paint(); }
}

function viewNews() {
  if (!state.news) loadNews(false);
  const n = state.news;
  const items = (n?.items || []).filter((x) => state.newsFilter === "all" || x.source === state.newsFilter);
  return h("div", { class: "hb-view" },
    h("div", { class: "hb-bar" },
      h("button", { type: "button", class: "hb-btn pri", onclick: () => loadNews(true), disabled: state.newsBusy }, state.newsBusy ? "در حال دریافت…" : "↻ به‌روزرسانی"),
      h("span", { class: "hb-count" }, n?.at ? `آخرین دریافت: ${ago(n.at)}` : "")),
    h("div", { class: "hb-chips" }, [["all", "همه"], ...NEWS_SOURCES.map((s) => [s.id, s.label.split(" ")[0]])].map(([id, label]) =>
      h("button", { type: "button", "aria-pressed": String(state.newsFilter === id), onclick: () => { state.newsFilter = id; paint(); } }, label))),
    n?.errors?.length ? h("p", { class: "hb-warn", role: "status" }, "⚠ برخی منبع‌ها در دسترس نبودند: " + n.errors.join(" · ")) : null,
    !items.length ? h("p", { class: "hb-empty" }, state.newsBusy ? "در حال دریافت خبرها…" : "خبری نیست. اینترنت را بررسی کن و دوباره بزن (خبرهای قبلی آفلاین ذخیره می‌شوند).") : null,
    h("ul", { class: "hb-news" }, items.map((x) => h("li", {}, h("button", { type: "button", onclick: () => openUrl(x.url) }, h("b", { dir: "auto" }, x.title), h("small", {}, `${x.src} · ${ago(x.time)}${x.meta ? " · " + x.meta : ""}`)), h("button", { type: "button", class: "hb-pin", "aria-label": "ذخیره به‌عنوان کارت آسیب‌پذیری", title: "ذخیره در بخش امنیت", onclick: (e) => { addNote(x); e.currentTarget.textContent = "✔"; } }, CVE_RE.test(x.title) ? "📌" : "🗂")))),
    h("p", { class: "hb-lead" }, "عنوان‌ها به زبان اصلی (انگلیسی) هستند. می‌توانی متن را به دستیار AI بدهی تا ترجمه و توضیح دهد."));
}

function viewTools() {
  return h("div", { class: "hb-view" },
    h("h3", {}, "امنیت"),
    h("div", { class: "hb-grid" },
      card("🛡", "Cyber Lab", "ترمینال، نقشهٔ حملات زنده، اسکن مجاز", () => { close(); window.CodePadCyber?.open(); }),
      card("🛡", "Cyber Lab", "ترمینال، نقشهٔ حمله، nmap (هدف مجاز)", () => { close(); window.CodePadCyber?.open(); }),
      card("🔐", "بخش امنیت", "سایت تمرین، CTF، تحلیل فایل، شبکه", () => show("security"))),
    h("h3", {}, "ساخت و رسانه"),
    h("div", { class: "hb-grid" },
      card("🧰", "Studio", "مرورگر، OpenCV، ZIP، ابزار رسانه", () => { close(); window.CodePadStudio?.open("projects"); }),
      card("🌐", "مرورگر", "باز کردن صفحه‌ها", () => { close(); window.CodePadStudio?.open("browser"); }),
      card("📦", "ورود پروژهٔ ZIP", "پروژهٔ آماده را وارد کن", () => { close(); window.CodePadProjects?.chooseZIP?.(); }),
      card("🎧", "پخش‌کننده", "فانک، رادیو، تمرکز", () => { close(); window.CodePadMusic?.open(); })),
    h("h3", {}, "ظاهر"),
    h("div", { class: "hb-grid" },
      card("🟢", "تم هکری", `حالت فعلی: ${["خاموش", "روشن", "Hyper"][window.CodePadCyber?.hackerLevel?.() ?? 1]}`, () => { const c = window.CodePadCyber; c?.setHackerTheme(((c.hackerLevel?.() ?? 1) + 2) % 3); paint(); })));
}

let secView = null;
const viewSec = () => { secView = viewSecurity({ h, importSample, sampleById, openUrl, card, show, close }); return secView.el; };
const VIEWS = { home: viewHome, python: viewPython, "3d": viewLibs, security: viewSec, confidential: () => viewConfidential({ h }), news: viewNews, tools: viewTools };
function paint() {
  if (!root) return;
  body.replaceChildren(VIEWS[current]());
  [...tabs.children].forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === current)));
}
export function show(t) { current = VIEWS[t] ? t : "home"; paint(); body.scrollTop = 0; }

function build() {
  tabs = h("div", { class: "hb-tabs", role: "tablist" }, TABS.map(([id, label]) => h("button", { type: "button", role: "tab", "data-t": id, onclick: () => show(id) }, label)));
  body = h("div", { class: "hb-body" });
  root = h("section", { id: "cp-hub", role: "dialog", "aria-label": "CodePad Hub", hidden: true },
    h("header", { class: "hb-head" }, h("div", { class: "hb-name" }, "CODEPAD HUB", h("small", {}, "python · 3d · news · cyber · music")), h("button", { type: "button", class: "hb-x", "aria-label": "بستن", onclick: close }, "✕")),
    tabs, body);
  document.body.append(root);
}
export function open(tab) { if (!root) build(); root.hidden = false; show(tab || current); }
export function close() { if (root) root.hidden = true; }

/** دکمهٔ ورود: یک دکمه به‌جای Studio/Cyber پراکنده در نوار ویرایشگر. */
function mountEntry() {
  const bar = document.querySelector(".cp-workspaces");
  if (!bar || bar.querySelector(".cp-hub-entry")) return;
  bar.append(h("button", { type: "button", class: "cp-hub-entry", "aria-label": "هاب CodePad", onclick: () => open() }, "هاب"));
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.CodePadHub = { open, close, show, importSample, fetchNews, filterSamples, samples: () => HUB_SAMPLES.slice() };
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; mountEntry(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  mountEntry();
  window.addEventListener("keydown", (e) => e.key === "Escape" && root && !root.hidden && close());
}
