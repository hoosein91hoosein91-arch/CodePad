// CodePad Hub: یک نقطهٔ ورود مرتب برای همه‌چیز. ویرایشگر کار خودش را می‌کند؛ Studio، Cyber، موزیک، اخبار و نمونه‌ها اینجا هستند.
import { HUB_SAMPLES } from "./hub-data.js";
import { viewSecurity, addNote, CVE_RE } from "./hub-security.js";
import { viewConfidential } from "./hub-confidential.js";
import { viewAcademy } from "./hub-academy.js";
import { PATHS } from "./ui-icons.js";
import { h, icon, btn, row, state as uiState, modal, tabs as tabsEl, chip, section, toast } from "./ui-dom.js";

const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* حافظه در دسترس نیست */ } return null; };

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

let root, body, tabs, current = "home", state = { cat: "all", q: "", news: null, newsFilter: "all", newsBusy: false, secPart: "practice" };

const TABS = [["home", "خانه", "home"], ["samples", "نمونه‌ها", "code"], ["academy", "آکادمی", "book"], ["security", "امنیت", "shield"], ["tools", "ابزارها", "tool"]];
const ALIAS = { python: "samples", "3d": "samples", news: "security", confidential: "tools" };

/** ایموجی‌های قدیمی داده‌ها به آیکن هم‌خانواده تبدیل می‌شوند. */
const EMOJI_ICON = { "🐍": "code", "🧊": "box", "📰": "news", "🛡": "shield", "🎧": "headphones", "🧰": "tool", "🔐": "lock", "🌐": "globe", "📦": "box", "🟢": "sliders", "🎨": "image", "⚙️": "cpu", "📊": "grid", "🔒": "lock", "🎓": "book", "🧪": "flask", "📡": "globe", "🔍": "search", "🕵": "search" };
const ic = (k, size) => icon(PATHS[k] ? k : EMOJI_ICON[k] || "box", size);
const lvl = (n) => `سطح ${n} از 3`;
const day = () => Math.floor(Date.now() / 864e5);
const openUrl = (url) => { try { if (window.CodePadStudio?.openBrowser) return window.CodePadStudio.openBrowser(url); } catch { /* ادامه */ } window.open(url, "_blank", "noopener"); };
const ago = (t) => { if (!t) return ""; const m = Math.max(1, Math.round((Date.now() - t) / 6e4)); return m < 60 ? `${m} دقیقه پیش` : m < 1440 ? `${Math.round(m / 60)} ساعت پیش` : `${Math.round(m / 1440)} روز پیش`; };

/** کارت ورودی (آیکن، عنوان، توضیح). به ماژول‌های امنیت و آکادمی هم داده می‌شود. */
const card = (iconKey, title, text, onclick, cls = "") => h("button", { type: "button", class: "ui-tile " + cls, onclick }, ic(iconKey), h("strong", {}, title), h("span", {}, text));

function sampleCard(s) {
  return h("article", { class: "ui-card ui-stack", "data-cat": s.cat },
    h("div", { style: { display: "flex", gap: "8px", alignItems: "flex-start", justifyContent: "space-between" } }, h("strong", { class: "ui-h2", style: { margin: 0 } }, s.title), chip(lvl(s.level))),
    h("p", { class: "ui-caption", style: { margin: 0 } }, s.desc),
    h("div", { class: "ui-actions", style: { alignItems: "center" } },
      btn("اجرا", { icon: "play", kind: "primary", onclick: () => importSample(s, { run: true }) }),
      btn("باز کردن در ویرایشگر", { kind: "line", onclick: () => importSample(s) }),
      h("span", { class: "ui-chip ui-ltr", dir: "ltr" }, s.file)));
}

function viewHome() {
  const tip = TIPS[day() % TIPS.length];
  const music = window.CodePadMusic?.state?.();
  return h("div", { class: "ui-stack" },
    h("div", { class: "ui-hero" }, h("h2", {}, "به CodePad خوش آمدی"), h("p", {}, "کدنویسی، بازی سه‌بعدی، تحلیل امنیتی و موزیک؛ همه آفلاین و در یک جا."),
      h("div", { class: "ui-actions" }, btn("نمونه‌ها", { icon: "code", kind: "primary", onclick: () => show("samples") }), btn("آکادمی", { icon: "book", kind: "line", onclick: () => show("academy") }))),
    h("div", { class: "ui-grid" },
      card("code", "پایتون", `${HUB_SAMPLES.filter((s) => s.ext === "py").length} برنامهٔ آماده برای اجرا`, () => { state.cat = "all"; show("samples"); }),
      card("box", "سه‌بعدی", "مینی‌کرافت، فیزیک، تیراندازی با Python", () => { state.cat = "3d"; show("samples"); }),
      card("news", "اخبار امنیت", "تیترهای امنیت و آسیب‌پذیری‌های فعال", () => { state.secPart = "news"; show("security"); }),
      card("shield", "امنیت و تست نفوذ", "سایت تمرین محلی، CTF، تحلیل فایل", () => { state.secPart = "practice"; show("security"); }),
      card("headphones", "موسیقی", music?.title ? `در حال پخش: ${music.title}` : "فانک، رادیو و پلی‌لیست تمرکز", () => { close(); window.CodePadMusic?.open(); }),
      card("tool", "Studio", "مرورگر، OpenCV، ZIP، رسانه", () => { close(); window.CodePadStudio?.open("projects"); })),
    h("section", { class: "ui-card ui-stack" }, h("strong", {}, "نکتهٔ امروز"), h("p", { style: { margin: 0 } }, tip)));
}

function viewDiag() {
  const out = h("div", { class: "ui-stack" });
  const b = btn("بررسی سازگاری سه‌بعدی روی این دستگاه", { icon: "flask", kind: "primary" });
  b.addEventListener("click", async () => {
    b.disabled = true; b.lastChild.textContent = "در حال بررسی… (تا ۳۰ ثانیه)"; out.replaceChildren();
    try {
      const r = await window.CodePadPython3D.diagnose();
      out.append(h("div", { class: "ui-notice " + (r.ok ? "ui-notice--ok" : "ui-notice--err"), role: "status" }, r.ok ? "سه‌بعدی روی این دستگاه آماده است." : "مشکلی پیدا شد؛ ردیف‌های قرمز را ببین و گزارش را برای پشتیبانی بفرست."),
        h("ul", { class: "ui-list" }, r.items.map((x) => h("li", { class: "ui-row" }, icon(x.ok ? "check" : "x"), h("span", { class: "ui-row-main" }, h("strong", {}, x.name), x.detail ? h("span", {}, x.detail) : null)))),
        btn("کپی گزارش", { icon: "copy", kind: "line", onclick: () => navigator.clipboard?.writeText(r.report).then(() => toast("گزارش کپی شد.")) }));
    } catch (e) { out.append(h("div", { class: "ui-notice ui-notice--err", role: "alert" }, "بررسی اجرا نشد: " + (e?.message || e))); }
    b.disabled = false; b.lastChild.textContent = "بررسی دوبارهٔ سازگاری سه‌بعدی";
  });
  return section("اگر سه‌بعدی باز نمی‌شود", h("p", { class: "ui-caption", style: { margin: 0 } }, "این بررسی بدون Python کتابخانه، WebGL و نمایشگر را امتحان می‌کند و دلیل دقیق را می‌گوید."), b, out);
}

function libsSection() {
  const libs = window.CodePadLibs?.list?.() || [];
  return h("div", { class: "ui-stack" },
    section("کتابخانه‌های آفلاین جاوااسکریپت", h("p", { class: "ui-caption", style: { margin: 0 } }, "در HTML فقط بنویس ", h("code", { dir: "ltr", class: "ui-kbd" }, '<script src="lib:three"></script>'), " و بدون اینترنت (حتی روی موبایل) کار می‌کند."),
      h("div", { class: "ui-grid" }, (libs.length ? libs : [{ id: "three" }, { id: "p5" }, { id: "matter" }, { id: "chart" }]).map((l) => {
        const id = l.id || l.name || l;
        const sample = HUB_SAMPLES.find((s) => s.ext === "html" && s.code.includes(`lib:${id}`));
        return card({ three: "box", p5: "image", matter: "cpu", chart: "grid" }[id] || "box", id, sample ? sample.title : "کتابخانه", () => sample && importSample(sample, { run: true }));
      }))),
    viewDiag());
}

function viewSamples() {
  const list = h("div", { class: "ui-stack" });
  const count = h("span", { class: "ui-caption" });
  const render = () => {
    list.replaceChildren();
    const items = filterSamples(HUB_SAMPLES, state);
    if (!items.length) list.append(uiState({ icon: "search", title: "چیزی پیدا نشد", text: "عبارت یا دستهٔ دیگری را امتحان کن." }));
    for (const s of items) list.append(sampleCard(s));
    count.textContent = `${items.length} نمونه`;
  };
  const search = h("input", { type: "search", class: "ui-input", dir: "auto", placeholder: "جست‌وجو در نمونه‌ها", "aria-label": "جست‌وجو", value: state.q });
  search.addEventListener("input", () => { state.q = search.value; render(); });
  const chips = h("div", { class: "ui-chiprow", style: { padding: 0 }, role: "group", "aria-label": "دسته" }, CATEGORIES.map(([id, label]) => {
    const b = h("button", { type: "button", class: "ui-seg", "aria-pressed": String(state.cat === id), onclick: () => { state.cat = id; [...chips.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b))); render(); extra.replaceChildren(...(state.cat === "3d" || state.cat === "jslib" ? [libsSection()] : [])); } }, label);
    return b;
  }));
  const extra = h("div", { class: "ui-stack" });
  render();
  if (state.cat === "3d" || state.cat === "jslib") extra.append(libsSection());
  return h("div", { class: "ui-stack" },
    h("p", { class: "ui-caption", style: { margin: 0 } }, "هر نمونه به‌صورت پروژهٔ تازه در ویرایشگر باز می‌شود؛ می‌توانی تغییرش بدهی. نمونه‌های سه‌بعدی با Python کار می‌کنند و روی موبایل هم اجرا می‌شوند."),
    search, h("div", { style: { display: "flex", justifyContent: "space-between" } }, count), chips, list, extra);
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
  return h("div", { class: "ui-stack" },
    h("div", { class: "ui-actions", style: { alignItems: "center" } },
      btn(state.newsBusy ? "در حال دریافت…" : "به‌روزرسانی", { icon: "refresh", kind: "primary", disabled: state.newsBusy, onclick: () => loadNews(true) }),
      h("span", { class: "ui-caption" }, n?.at ? `آخرین دریافت: ${ago(n.at)}` : "")),
    h("div", { class: "ui-chiprow", style: { padding: 0 }, role: "group", "aria-label": "منبع" }, [["all", "همه"], ...NEWS_SOURCES.map((s) => [s.id, s.label.split(" ")[0]])].map(([id, label]) =>
      h("button", { type: "button", class: "ui-seg", "aria-pressed": String(state.newsFilter === id), onclick: () => { state.newsFilter = id; paint(); } }, label))),
    n?.errors?.length ? h("div", { class: "ui-notice", role: "status" }, "برخی منبع‌ها در دسترس نبودند: " + n.errors.join(" · ")) : null,
    !items.length ? uiState({ icon: "news", title: state.newsBusy ? "در حال دریافت خبرها…" : "خبری نیست", loading: state.newsBusy, text: state.newsBusy ? "" : "اینترنت را بررسی کن و دوباره به‌روزرسانی بزن؛ خبرهای قبلی آفلاین ذخیره می‌شوند." }) : null,
    h("ul", { class: "ui-list" }, items.map((x) => h("li", {}, row({ icon: "news", title: x.title, detail: `${x.src} · ${ago(x.time)}${x.meta ? " · " + x.meta : ""}`, onclick: () => openUrl(x.url),
      end: btn("ذخیره در بخش امنیت", { icon: CVE_RE.test(x.title) ? "star" : "plus", kind: "tool", onclick: (e) => { addNote(x); e.currentTarget.replaceChildren(icon("check")); } }) })))),
    h("p", { class: "ui-caption" }, "عنوان‌ها به زبان اصلی (انگلیسی) هستند. می‌توانی متن را به دستیار هوش مصنوعی بدهی تا ترجمه و توضیح دهد."));
}

let secView = null;
const viewSec = () => { secView = viewSecurity({ h, importSample, sampleById, openUrl, card, show, close }); return secView.el; };
function viewSecurityHub() {
  const sub = state.secPart === "news" ? viewNews() : viewSec();
  const bar = tabsBar([["practice", "تمرین و تحلیل", "shield"], ["news", "اخبار", "news"]], state.secPart, (id) => { state.secPart = id; paint(); });
  return h("div", { class: "ui-stack" }, bar, sub);
}
const tabsBar = (items, cur, pick) => { const t = tabsEl(items, cur, pick); t.style.padding = "0"; return t; };

function viewTools() {
  return h("div", { class: "ui-stack" },
    section("امنیت", h("div", { class: "ui-grid" },
      card("shield", "Cyber Lab", "ترمینال، نقشهٔ حمله، nmap (هدف مجاز)", () => { close(); window.CodePadCyber?.open(); }),
      card("lock", "بخش امنیت", "سایت تمرین، CTF، تحلیل فایل، شبکه", () => { state.secPart = "practice"; show("security"); }))),
    section("ساخت و رسانه", h("div", { class: "ui-grid" },
      card("tool", "Studio", "مرورگر، OpenCV، ZIP، ابزار رسانه", () => { close(); window.CodePadStudio?.open("projects"); }),
      card("globe", "مرورگر", "باز کردن صفحه‌ها", () => { close(); window.CodePadStudio?.open("browser"); }),
      card("box", "ورود پروژهٔ ZIP", "پروژهٔ آماده را وارد کن", () => { close(); window.CodePadProjects?.chooseZIP?.(); }),
      card("headphones", "پخش‌کننده", "فانک، رادیو، تمرکز", () => { close(); window.CodePadMusic?.open(); }))),
    section("حالت محرمانه", viewConfidential({ h })));
}

const VIEWS = { home: viewHome, samples: viewSamples, academy: () => viewAcademy(), security: viewSecurityHub, tools: viewTools };
function paint() {
  if (!root) return;
  const prev = body.scrollTop;
  body.replaceChildren(VIEWS[current]());
  tabs.set(current);
  body.scrollTop = prev;
}
export function show(t) { t = ALIAS[t] ? (t === "3d" && (state.cat = "3d"), t === "news" && (state.secPart = "news"), ALIAS[t]) : t; current = VIEWS[t] ? t : "home"; if (!root) return; body.replaceChildren(VIEWS[current]()); tabs.set(current); body.scrollTop = 0; }

function build() {
  tabs = tabsBar(TABS.map(([id, label, ic2]) => [id, label, ic2]), current, (id) => show(id));
  tabs.className += " ui-tabbar";
  body = h("div", { class: "ui-pane-body", style: { padding: "16px" } });
  root = modal({ title: "هاب CodePad", kind: "page", onClose: () => { root = null; } });
  root.el.id = "ui-hub";
  root.body.replaceWith(body);
  root.el.insertBefore(tabs, body);
  root.el.removeAttribute("hidden");
}
export function open(tab) { if (!root) build(); show(tab || current); }
export function close() { if (root) { const r = root; root = null; r.close(); } }

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.CodePadHub = { open, close, show, importSample, fetchNews, filterSamples, samples: () => HUB_SAMPLES.slice() };
}
