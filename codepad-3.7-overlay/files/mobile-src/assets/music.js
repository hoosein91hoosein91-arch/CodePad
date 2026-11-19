// پخش‌کنندهٔ موسیقی CodePad: پوشهٔ محلی (دسکتاپ: Music\Phonk - Video Songs) · رادیوی فانک با دکمهٔ «بعدی» · پلی‌لیست تمرکز.
// مینی‌پلیر هنگام کدنویسی روی صفحه می‌ماند. window.CodePadMusic.open() پنل کامل را باز می‌کند.
import { FOCUS_PLAYLIST, matchesTrack, searchUrl } from "./focus-playlist.js";
import { h, icon, btn, row, state as uiState, modal, tabs } from "./ui-dom.js";

const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* حافظه در دسترس نیست */ } return null; };
const API_BASES = ["https://de1.api.radio-browser.info", "https://nl1.api.radio-browser.info", "https://at1.api.radio-browser.info"];
export const RADIO_TAGS = ["phonk", "drift phonk", "brazilian phonk", "memphis", "darksynth", "synthwave", "lofi"];
const VIDEO_EXT = /^(mp4|m4v|webm|mov)$/i;

/** موقعیت پخش‌کنندهٔ شناور را داخل صفحه نگه می‌دارد (قابل آزمون بدون DOM). */
export function clampPillPos(x, y, vw, vh, w = 60, hgt = 44) {
  const nx = Math.min(Math.max(Number.isFinite(x) ? x : 0, 4), Math.max(4, vw - w - 4));
  const ny = Math.min(Math.max(Number.isFinite(y) ? y : 0, 4), Math.max(4, vh - hgt - 4));
  return { x: Math.round(nx), y: Math.round(ny) };
}
const fmt = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "LIVE");

/** ایستگاه‌های رادیو از radio-browser.info (جامعه‌محور و رایگان). فقط https، چون برنامه یک زمینهٔ امن است. */
export async function fetchStations(tag, { bases = API_BASES, fetcher = fetch, allowHttp = false, timeoutMs = 8000 } = {}) {
  if (globalThis.CodePadConfidential?.isEnabled()) throw new Error("رادیو در حالت محرمانه غیرفعال است.");
  let lastError = "";
  for (const base of bases) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetcher(`${base}/json/stations/search?tag=${encodeURIComponent(tag)}&hidebroken=true&order=clickcount&reverse=true&limit=120`, { signal: ctl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const list = await res.json();
      const seen = new Set(), out = [];
      for (const s of Array.isArray(list) ? list : []) {
        const src = String(s.url_resolved || s.url || "");
        if (!/^https:\/\//i.test(src) && !(allowHttp && /^http:\/\//i.test(src))) continue;
        if (seen.has(src) || !String(s.name || "").trim()) continue;
        seen.add(src);
        out.push({ id: s.stationuuid || src, title: String(s.name).trim().slice(0, 80), sub: [s.country, String(s.tags || "").split(",").slice(0, 3).join("/"), s.bitrate ? s.bitrate + "k" : ""].filter(Boolean).join(" · "), src, kind: "radio" });
      }
      if (out.length) return out;
      lastError = "no https stations";
    } catch (e) {
      lastError = e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("رادیو در دسترس نیست (" + lastError + "). اینترنت را بررسی کن یا از پوشهٔ محلی پخش کن.");
}

async function openExternal(url) {
  try {
    if (globalThis.Capacitor?.isNativePlatform?.()) { const core = await import("./studio-core.js"); return core.openBrowser(url); }
  } catch { /* به window.open برمی‌گردیم */ }
  window.open(url, "_blank", "noopener");
}

const state = { source: LS("codepad-music-source") || "local", queue: [], index: -1, shuffle: LS("codepad-music-shuffle") === "1", tag: LS("codepad-music-tag") || "phonk", local: [], radio: [], status: "", failures: 0, folder: "" };
let media, pill, panel, els = {}, objectUrls = [];

function current() { return state.queue[state.index]; }
function setStatus(text) { state.status = text || ""; if (els.status) els.status.textContent = state.status; }

function updateUi() {
  const t = current(), playing = media && !media.paused && !media.ended;
  const title = t ? t.title : "—";
  if (els.title) els.title.textContent = title;
  if (els.sub) els.sub.textContent = t ? (t.sub || (t.kind === "radio" ? "Radio" : "Local")) : "";
  if (els.pillTitle) els.pillTitle.textContent = t ? title : "—";
  if (els.pillSub) els.pillSub.textContent = t ? (t.sub || (t.kind === "radio" ? "رادیو" : "پوشهٔ من")) : "";
  if (pill) pill.hidden = !t || !!dialog;
  for (const b of [els.play, els.pillPlay]) setPlayIcon(b, playing);
  if (pill) pill.classList.toggle("playing", !!playing);
  if (els.seek) { const live = !Number.isFinite(media.duration); els.seekRow.classList.toggle("live", live); if (!live) { els.seek.max = String(media.duration); els.seek.value = String(media.currentTime); els.time.textContent = `${fmt(media.currentTime)} / ${fmt(media.duration)}`; } else els.time.textContent = media.src ? "LIVE" : ""; }
  if (els.list) for (const li of els.list.querySelectorAll("li[data-i]")) { const on = Number(li.dataset.i) === state.index && li.dataset.q === state.source; (li.firstElementChild || li).setAttribute("aria-current", String(on)); }
  if ("mediaSession" in navigator && t) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: t.sub || "CodePad" }); } catch { /* ignore */ } }
}

async function playIndex(i) {
  if (!state.queue.length) return setStatus("فهرست خالی است.");
  state.index = ((i % state.queue.length) + state.queue.length) % state.queue.length;
  const t = current();
  media.src = t.src;
  const isVideo = t.kind === "local" && VIDEO_EXT.test(t.ext || "");
  if (els.videoBox) els.videoBox.style.display = isVideo ? "block" : "none";
  try { await media.play(); setStatus(""); state.failures = 0; } catch (e) { if (e && e.name !== "AbortError") onError(); }
  updateUi();
}
function next(delta = 1) {
  if (!state.queue.length) return setStatus("اول یک منبع انتخاب کن: پوشهٔ محلی یا رادیو.");
  if (state.shuffle && state.queue.length > 1) { let j; do { j = Math.floor(Math.random() * state.queue.length); } while (j === state.index); return playIndex(j); }
  return playIndex(state.index < 0 ? 0 : state.index + delta);
}
function onError() {
  const t = current();
  state.failures++;
  if (state.failures >= 6 || state.queue.length < 2) { setStatus("پخش نشد: " + (t ? t.title : "") + (t?.kind === "radio" ? " — ایستگاه‌ها در دسترس نیستند؛ برچسب دیگری امتحان کن." : "")); updateUi(); return; }
  setStatus("ایستگاه/فایل پخش نشد؛ می‌روم سراغ بعدی…");
  next(1);
}
function toggle() { if (!media.src) return next(1); if (media.paused) media.play().catch(onError); else media.pause(); }

function setQueue(source, list, startIndex = -1) {
  state.source = source; LS("codepad-music-source", source);
  state.queue = list; state.index = startIndex;
  updateUi(); renderList();
}

// ── منبع‌ها ──
async function loadLocalDesktop() {
  const d = window.cpDesktop?.music;
  if (!d) return;
  setStatus("در حال خواندن پوشه…");
  const info = await d.info(); const res = await d.list();
  state.folder = res?.dir || info?.dir || "";
  state.local = (res?.files || []).map((f) => ({ id: f.id, title: f.name, sub: f.ext.toUpperCase() + " · " + (f.size / 1e6).toFixed(1) + " MB", src: f.url, kind: "local", ext: f.ext, rel: f.rel }));
  setStatus(res?.exists ? (state.local.length ? "" : "پوشه خالی است یا فایل پشتیبانی‌شده ندارد (mp3, m4a, ogg, wav, flac, mp4, webm).") : "پوشه پیدا نشد: " + state.folder + " — با «انتخاب پوشه» مسیر درست را بده.");
}
async function chooseFolderDesktop() {
  const res = await window.cpDesktop.music.choose();
  if (!res) return;
  state.folder = res.dir; state.local = res.files.map((f) => ({ id: f.id, title: f.name, sub: f.ext.toUpperCase() + " · " + (f.size / 1e6).toFixed(1) + " MB", src: f.url, kind: "local", ext: f.ext, rel: f.rel }));
  setStatus(state.local.length ? "" : "فایل پشتیبانی‌شده‌ای در این پوشه نیست.");
  if (state.source === "local") setQueue("local", state.local);
  renderAll();
}
function pickFiles(directory) {
  const input = h("input", { type: "file", multiple: true, accept: "audio/*,video/mp4,video/webm", ...(directory ? { webkitdirectory: true } : {}) });
  input.addEventListener("change", () => {
    for (const u of objectUrls) URL.revokeObjectURL(u);
    objectUrls = [];
    const files = [...input.files].filter((f) => /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|mp4|m4v|mov)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    state.local = files.map((f, i) => { const url = URL.createObjectURL(f); objectUrls.push(url); const ext = f.name.split(".").pop().toLowerCase(); return { id: "f" + i, title: f.name.replace(/\.[^.]+$/, ""), sub: ext.toUpperCase(), src: url, kind: "local", ext }; });
    state.folder = directory ? "(انتخاب‌شده)" : "(فایل‌های انتخاب‌شده)";
    setStatus(state.local.length ? "" : "فایل صوتی پشتیبانی‌شده‌ای انتخاب نشد.");
    if (state.source === "local") setQueue("local", state.local);
    renderAll();
  });
  input.click();
}
async function loadRadio(tag) {
  state.tag = tag; LS("codepad-music-tag", tag);
  const cacheKey = "codepad-radio-cache:" + tag;
  try { const c = JSON.parse(LS(cacheKey) || "null"); if (c && Date.now() - c.t < 3600e3 && c.list.length) { state.radio = c.list; return; } } catch { /* بدون کش */ }
  setStatus("در حال گرفتن ایستگاه‌های «" + tag + "»…");
  const override = LS("codepad-radio-base");
  state.radio = await fetchStations(tag, { bases: override ? [override] : API_BASES, allowHttp: LS("codepad-radio-allow-http") === "1" });
  LS(cacheKey, JSON.stringify({ t: Date.now(), list: state.radio.slice(0, 60) }));
  setStatus("");
}
async function useRadio(tag = state.tag) {
  try { await loadRadio(tag); } catch (e) { state.radio = []; setStatus(e.message); }
  if (state.radio.length) { const start = Math.floor(Math.random() * Math.min(state.radio.length, 25)); setQueue("radio", state.radio, -1); await playIndex(start); }
  renderAll();
}

// ── رابط ──
const setPlayIcon = (b, playing) => b && b.replaceChildren(icon(playing ? "pause" : "play"));
function renderList() {
  if (!els.list) return;
  const q = (els.search?.value || "").toLowerCase();
  const items = (state.source === "focus" ? [] : state.queue).map((t, i) => [t, i]).filter(([t]) => !q || t.title.toLowerCase().includes(q));
  if (!items.length) {
    els.list.replaceChildren(h("li", {}, uiState({ icon: "headphones", title: state.source === "radio" ? "ایستگاهی پیدا نشد" : "فهرست خالی است", text: state.source === "radio" ? "برچسب دیگری امتحان کن یا اینترنت را بررسی کن." : "پوشه یا فایل‌های موسیقی را انتخاب کن." })));
    return updateUi();
  }
  els.list.replaceChildren(...items.slice(0, 400).map(([t, i]) => h("li", { "data-i": i, "data-q": state.source }, row({ icon: "music", title: t.title, detail: t.sub || "", onclick: () => playIndex(i), current: i === state.index }))));
  updateUi();
}
function renderFocus() {
  const box = els.focus; box.replaceChildren();
  const all = FOCUS_PLAYLIST.groups.flatMap((g) => g.tracks);
  const matched = all.map((t) => [t, state.local.find((f) => matchesTrack(f.title + " " + (f.rel || ""), t))]);
  const found = matched.filter(([, f]) => f).map(([, f]) => f);
  box.append(h("p", { class: "ui-caption" }, FOCUS_PLAYLIST.tips),
    h("div", { class: "ui-actions" },
      btn(found.length ? `پخش ${found.length} آهنگ از پوشهٔ من` : "هیچ‌کدام در پوشهٔ تو پیدا نشد", { icon: "play", kind: "primary", disabled: !found.length, onclick: () => { setQueue("focus", found, -1); playIndex(0); } }),
      btn("کپی فهرست", { icon: "copy", kind: "line", onclick: () => navigator.clipboard?.writeText(all.map((t) => `${t.artist} - ${t.title}`).join("\n")).then(() => setStatus("فهرست کپی شد."), () => {}) })));
  for (const g of FOCUS_PLAYLIST.groups) {
    box.append(h("h3", { class: "ui-label", style: { margin: "16px 0 4px" } }, g.title));
    for (const t of g.tracks) {
      const local = matched.find(([x]) => x === t)[1];
      box.append(row({ icon: "music", title: t.title, detail: t.artist + " · " + t.note,
        end: local ? btn("پخش از پوشهٔ من", { icon: "play", kind: "tool", onclick: () => { setQueue("focus", found, found.indexOf(local)); playIndex(found.indexOf(local)); } })
          : btn("جست‌وجو در مرورگر", { icon: "search", kind: "tool", onclick: () => openExternal(searchUrl(t)) }) }));
    }
  }
}
function renderSource() {
  const src = els.sourceBar; src.replaceChildren();
  if (state.source === "local") {
    const desktop = !!window.cpDesktop?.music;
    src.append(h("div", { class: "ui-actions" },
      btn("انتخاب پوشه", { icon: "folder", kind: "line", onclick: desktop ? chooseFolderDesktop : () => pickFiles(true) }),
      btn("انتخاب فایل‌ها", { icon: "plus", kind: "line", onclick: () => pickFiles(false) }),
      desktop ? btn("بازخوانی", { icon: "refresh", kind: "quiet", onclick: async () => { await loadLocalDesktop(); setQueue("local", state.local); renderAll(); } }) : null),
      h("p", { class: "ui-caption ui-ltr", dir: "ltr" }, state.folder || (desktop ? "…" : "")),
      desktop ? null : h("p", { class: "ui-caption" }, "پوشه یا فایل‌های موسیقی را انتخاب کن. در نسخهٔ دسکتاپ پوشهٔ Music خودکار خوانده می‌شود."));
  } else if (state.source === "radio") {
    src.append(h("div", { class: "ui-actions", role: "group", "aria-label": "برچسب رادیو" }, RADIO_TAGS.map((tag) => h("button", { type: "button", class: "ui-chip" + (tag === state.tag ? " ui-chip--primary" : ""), "aria-pressed": String(tag === state.tag), style: { minHeight: "40px", cursor: "pointer", border: 0 }, onclick: () => useRadio(tag) }, tag))));
  }
}
function renderAll() {
  for (const b of els.tabs.querySelectorAll("button")) b.setAttribute("aria-selected", String(b.dataset.t === state.source));
  renderSource();
  els.listBox.hidden = state.source === "focus"; els.focus.hidden = state.source !== "focus";
  if (state.source === "focus") renderFocus(); else renderList();
  els.shuffle.setAttribute("aria-pressed", String(state.shuffle));
  updateUi();
}
async function chooseSource(source) {
  if (source === state.source && state.queue.length) return renderAll();
  state.source = source; LS("codepad-music-source", source);
  if (source === "local") { if (window.cpDesktop?.music && !state.local.length) await loadLocalDesktop(); state.queue = state.local; }
  else if (source === "radio") { await useRadio(); return; }
  else if (source === "focus") { if (window.cpDesktop?.music && !state.local.length) await loadLocalDesktop(); state.queue = []; }
  state.index = -1; renderAll();
}

function build() {
  media = h("video", { id: "cp-media", playsinline: true, preload: "metadata", style: { width: "100%", borderRadius: "12px", background: "#000" } });
  media.volume = Math.min(1, Math.max(0, Number(LS("codepad-music-volume") ?? 0.8)));
  media.addEventListener("ended", () => (state.source === "radio" ? null : next(1)));
  media.addEventListener("error", onError);
  for (const ev of ["play", "pause", "timeupdate", "loadedmetadata"]) media.addEventListener(ev, updateUi);
  if ("mediaSession" in navigator) for (const [a, f] of [["play", toggle], ["pause", toggle], ["previoustrack", () => next(-1)], ["nexttrack", () => next(1)]]) { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* ignore */ } }

  // مینی‌پلیر: فقط وقتی آهنگی انتخاب شده نمایش داده می‌شود و بالای ناوبری می‌نشیند.
  els.pillTitle = h("strong", {}, "—"); els.pillSub = h("span", {}, "");
  els.pillPlay = h("button", { type: "button", class: "ui-btn ui-btn--tool", "aria-label": "پخش یا توقف", onclick: toggle }, icon("play"));
  pill = h("div", { class: "ui-root ui-mini", role: "region", "aria-label": "پخش‌کنندهٔ موسیقی", hidden: true },
    h("button", { type: "button", class: "ui-row ui-fill", style: { padding: 0 }, "aria-label": "باز کردن پخش‌کننده", onclick: open }, icon("music"), h("span", { class: "ui-row-main" }, els.pillTitle, els.pillSub)),
    h("button", { type: "button", class: "ui-btn ui-btn--tool", "aria-label": "قبلی", onclick: () => next(-1) }, icon("prev")),
    els.pillPlay,
    h("button", { type: "button", class: "ui-btn ui-btn--tool", "aria-label": "بعدی", onclick: () => next(1) }, icon("next")));

  els.title = h("strong", { class: "ui-h2", style: { display: "block" } }, "—"); els.sub = h("span", { class: "ui-caption" });
  els.play = h("button", { type: "button", class: "ui-btn ui-btn--primary ui-btn--pill", "aria-label": "پخش یا توقف", style: { width: "64px", height: "64px" }, onclick: toggle }, icon("play"));
  els.seek = h("input", { type: "range", class: "ui-range", min: "0", max: "1", step: "0.1", value: "0", "aria-label": "جلو یا عقب" });
  els.seek.addEventListener("input", () => { if (Number.isFinite(media.duration)) media.currentTime = Number(els.seek.value); });
  els.time = h("span", { class: "ui-caption ui-ltr" }, ""); els.seekRow = h("div", { class: "ui-stack", style: { gap: "4px" } }, els.seek, els.time);
  const vol = h("input", { type: "range", class: "ui-range", min: "0", max: "1", step: "0.01", value: String(media.volume), "aria-label": "صدا" });
  vol.addEventListener("input", () => { media.volume = Number(vol.value); LS("codepad-music-volume", String(media.volume)); });
  els.shuffle = h("button", { type: "button", class: "ui-btn ui-btn--tool", "aria-label": "پخش تصادفی", "aria-pressed": String(state.shuffle), onclick: () => { state.shuffle = !state.shuffle; LS("codepad-music-shuffle", state.shuffle ? "1" : "0"); els.shuffle.setAttribute("aria-pressed", String(state.shuffle)); els.shuffle.style.color = state.shuffle ? "var(--ui-primary)" : ""; } }, icon("shuffle"));
  els.shuffle.style.color = state.shuffle ? "var(--ui-primary)" : "";
  els.status = h("p", { class: "ui-caption", role: "status" });
  els.videoBox = h("div", { class: "mu-video", style: { display: "none" } }, media);
  els.tabs = tabs([["local", "پوشهٔ من", "folder"], ["radio", "رادیو", "headphones"], ["focus", "تمرکز", "star"]], state.source, (s) => chooseSource(s));
  els.sourceBar = h("div", { class: "ui-stack" });
  els.search = h("input", { type: "search", class: "ui-input", placeholder: "جست‌وجو در فهرست…", dir: "auto", "aria-label": "جست‌وجو" }); els.search.addEventListener("input", renderList);
  els.list = h("ul", { class: "ui-list" });
  els.listBox = h("div", { class: "ui-stack" }, els.search, els.list);
  els.focus = h("div", { class: "ui-stack", hidden: true });
  els.now = h("div", { class: "ui-card ui-stack" }, h("div", {}, els.title, els.sub), els.videoBox, els.seekRow,
    h("div", { class: "ui-actions", style: { justifyContent: "center", alignItems: "center" } },
      h("button", { type: "button", class: "ui-btn ui-btn--tool", "aria-label": "قبلی", onclick: () => next(-1) }, icon("prev")), els.play,
      h("button", { type: "button", class: "ui-btn ui-btn--tool", "aria-label": "بعدی", onclick: () => next(1) }, icon("next")), els.shuffle),
    h("label", { class: "ui-actions", style: { alignItems: "center" } }, icon("volume"), h("span", { class: "ui-fill" }, vol)), els.status);
  document.body.append(pill);
}

/** پنل کامل پخش‌کننده (فقط هنگام باز بودن ساخته می‌شود). */
let dialog;
export function open() {
  if (dialog) return;
  dialog = modal({ title: "موسیقی", kind: "page", onClose: () => { dialog = null; updateUi(); } });
  dialog.el.id = "ui-music";
  dialog.body.append(els.tabs, els.now, els.sourceBar, els.listBox, els.focus);
  pill.hidden = true;
  chooseSource(state.source).catch((e) => setStatus(e.message));
}
export function close() { if (dialog) dialog.close(); }

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const init = () => {
    build();
    window.CodePadMusic = { open, close, next, toggle, state: () => ({ source: state.source, index: state.index, queue: state.queue.length, playing: !media.paused, title: current()?.title, currentTime: media.currentTime, folder: state.folder }), setQueue, useRadio };
    if (window.cpDesktop?.music) loadLocalDesktop().then(() => { if (state.source === "local" && !state.queue.length) state.queue = state.local; }).catch(() => {});
  };
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
}
