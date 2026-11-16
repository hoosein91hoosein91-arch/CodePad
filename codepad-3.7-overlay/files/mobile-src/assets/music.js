// پخش‌کنندهٔ موسیقی CodePad: پوشهٔ محلی (دسکتاپ: Music\Phonk - Video Songs) · رادیوی فانک با دکمهٔ «بعدی» · پلی‌لیست تمرکز.
// مینی‌پلیر هنگام کدنویسی روی صفحه می‌ماند. window.CodePadMusic.open() پنل کامل را باز می‌کند.
import { FOCUS_PLAYLIST, matchesTrack, searchUrl } from "./focus-playlist.js";

const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* حافظه در دسترس نیست */ } return null; };
const API_BASES = ["https://de1.api.radio-browser.info", "https://nl1.api.radio-browser.info", "https://at1.api.radio-browser.info"];
export const RADIO_TAGS = ["phonk", "drift phonk", "brazilian phonk", "memphis", "darksynth", "synthwave", "lofi"];
const VIDEO_EXT = /^(mp4|m4v|webm|mov)$/i;

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
};
const fmt = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "LIVE");

/** ایستگاه‌های رادیو از radio-browser.info (جامعه‌محور و رایگان). فقط https، چون برنامه یک زمینهٔ امن است. */
export async function fetchStations(tag, { bases = API_BASES, fetcher = fetch, allowHttp = false, timeoutMs = 8000 } = {}) {
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
  if (els.pillTitle) els.pillTitle.textContent = t ? title : "MUSIC";
  for (const b of [els.play, els.pillPlay]) if (b) b.textContent = playing ? "⏸" : "▶";
  if (pill) pill.classList.toggle("playing", !!playing);
  if (els.seek) { const live = !Number.isFinite(media.duration); els.seekRow.classList.toggle("live", live); if (!live) { els.seek.max = String(media.duration); els.seek.value = String(media.currentTime); els.time.textContent = `${fmt(media.currentTime)} / ${fmt(media.duration)}`; } else els.time.textContent = media.src ? "LIVE" : ""; }
  if (els.list) for (const li of els.list.querySelectorAll("li[data-i]")) li.classList.toggle("on", Number(li.dataset.i) === state.index && li.dataset.q === state.source);
  if ("mediaSession" in navigator && t) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: t.sub || "CodePad" }); } catch { /* ignore */ } }
}

async function playIndex(i) {
  if (!state.queue.length) return setStatus("فهرست خالی است.");
  state.index = ((i % state.queue.length) + state.queue.length) % state.queue.length;
  const t = current();
  media.src = t.src;
  const isVideo = t.kind === "local" && VIDEO_EXT.test(t.ext || "");
  els.videoBox?.classList.toggle("has-video", isVideo);
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
function renderList() {
  if (!els.list) return;
  const q = (els.search?.value || "").toLowerCase();
  const items = (state.source === "focus" ? [] : state.queue).map((t, i) => [t, i]).filter(([t]) => !q || t.title.toLowerCase().includes(q));
  els.list.replaceChildren(...items.slice(0, 400).map(([t, i]) => h("li", { "data-i": i, "data-q": state.source, onclick: () => playIndex(i) }, h("b", {}, t.title), h("small", {}, t.sub || ""))));
  updateUi();
}
function renderFocus() {
  const box = els.focus; box.replaceChildren();
  const all = FOCUS_PLAYLIST.groups.flatMap((g) => g.tracks);
  const matched = all.map((t) => [t, state.local.find((f) => matchesTrack(f.title + " " + (f.rel || ""), t))]);
  const found = matched.filter(([, f]) => f).map(([, f]) => f);
  box.append(h("p", { class: "mu-tip" }, FOCUS_PLAYLIST.tips),
    h("div", { class: "mu-row" },
      h("button", { type: "button", class: "pri", disabled: !found.length, onclick: () => { setQueue("focus", found, -1); playIndex(0); } }, found.length ? `▶ پخش ${found.length} آهنگ از پوشهٔ من` : "هیچ‌کدام در پوشهٔ تو پیدا نشد"),
      h("button", { type: "button", onclick: () => navigator.clipboard?.writeText(all.map((t) => `${t.artist} - ${t.title}`).join("\n")).then(() => setStatus("فهرست کپی شد."), () => {}) }, "کپی فهرست")));
  for (const g of FOCUS_PLAYLIST.groups) {
    box.append(h("h4", {}, g.title));
    for (const t of g.tracks) {
      const local = matched.find(([x]) => x === t)[1];
      box.append(h("div", { class: "mu-track" }, h("div", {}, h("b", {}, t.title), h("small", {}, t.artist + " · " + t.note)),
        local ? h("button", { type: "button", class: "pri", title: "از پوشهٔ تو", onclick: () => { setQueue("focus", found, found.indexOf(local)); playIndex(found.indexOf(local)); } }, "▶")
          : h("button", { type: "button", title: "جست‌وجو در مرورگر", onclick: () => openExternal(searchUrl(t)) }, "🔎")));
    }
  }
}
function renderSource() {
  const src = els.sourceBar; src.replaceChildren();
  if (state.source === "local") {
    const desktop = !!window.cpDesktop?.music;
    src.append(h("div", { class: "mu-row" },
      desktop ? h("button", { type: "button", onclick: chooseFolderDesktop }, "📁 انتخاب پوشه") : h("button", { type: "button", onclick: () => pickFiles(true) }, "📁 انتخاب پوشه"),
      h("button", { type: "button", onclick: () => pickFiles(false) }, "➕ انتخاب فایل‌ها"),
      desktop ? h("button", { type: "button", onclick: async () => { await loadLocalDesktop(); setQueue("local", state.local); renderAll(); } }, "↻ بازخوانی") : null),
      h("small", { class: "mu-path", dir: "ltr" }, state.folder || (desktop ? "…" : "پوشه یا فایل‌های موسیقی را انتخاب کن (در نسخهٔ دسکتاپ پوشهٔ Music خودکار خوانده می‌شود)")));
  } else if (state.source === "radio") {
    src.append(h("div", { class: "mu-chips" }, RADIO_TAGS.map((tag) => h("button", { type: "button", class: tag === state.tag ? "on" : "", onclick: () => useRadio(tag) }, tag))));
  }
}
function renderAll() {
  for (const b of els.tabs.querySelectorAll("button")) b.setAttribute("aria-selected", String(b.dataset.s === state.source));
  renderSource();
  els.listBox.hidden = state.source === "focus"; els.focus.hidden = state.source !== "focus";
  if (state.source === "focus") renderFocus(); else renderList();
  els.shuffle.classList.toggle("on", state.shuffle);
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
  media = h("video", { id: "cp-media", playsinline: true, preload: "metadata" });
  media.volume = Math.min(1, Math.max(0, Number(LS("codepad-music-volume") ?? 0.8)));
  media.addEventListener("ended", () => (state.source === "radio" ? null : next(1)));
  media.addEventListener("error", onError);
  for (const ev of ["play", "pause", "timeupdate", "loadedmetadata"]) media.addEventListener(ev, updateUi);
  if ("mediaSession" in navigator) for (const [a, f] of [["play", toggle], ["pause", toggle], ["previoustrack", () => next(-1)], ["nexttrack", () => next(1)]]) { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* ignore */ } }

  els.pillTitle = h("span", { class: "mu-pill-title" }, "MUSIC");
  els.pillPlay = h("button", { type: "button", "aria-label": "پخش/توقف", onclick: toggle }, "▶");
  pill = h("div", { id: "cp-music-pill" },
    h("button", { type: "button", class: "mu-open", "aria-label": "موسیقی", onclick: open }, "♪"),
    els.pillTitle,
    h("button", { type: "button", "aria-label": "قبلی", class: "mu-opt", onclick: () => next(-1) }, "⏮"),
    els.pillPlay,
    h("button", { type: "button", "aria-label": "بعدی", onclick: () => next(1) }, "⏭"));

  els.title = h("b", { class: "mu-title" }, "—"); els.sub = h("small", { class: "mu-sub" });
  els.play = h("button", { type: "button", class: "mu-big", onclick: toggle }, "▶");
  els.seek = h("input", { type: "range", min: "0", max: "1", step: "0.1", value: "0", "aria-label": "جلو/عقب" });
  els.seek.addEventListener("input", () => { if (Number.isFinite(media.duration)) media.currentTime = Number(els.seek.value); });
  els.time = h("small", {}, ""); els.seekRow = h("div", { class: "mu-seek" }, els.seek, els.time);
  const vol = h("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(media.volume), "aria-label": "صدا" });
  vol.addEventListener("input", () => { media.volume = Number(vol.value); LS("codepad-music-volume", String(media.volume)); });
  els.shuffle = h("button", { type: "button", onclick: () => { state.shuffle = !state.shuffle; LS("codepad-music-shuffle", state.shuffle ? "1" : "0"); els.shuffle.classList.toggle("on", state.shuffle); } }, "🔀");
  els.status = h("p", { class: "mu-status", role: "status" });
  els.videoBox = h("div", { class: "mu-video" }, media);
  els.tabs = h("div", { class: "mu-tabs", role: "tablist" }, [["local", "LOCAL"], ["radio", "RADIO"], ["focus", "FOCUS"]].map(([s, label]) => h("button", { type: "button", role: "tab", "data-s": s, onclick: () => chooseSource(s) }, label)));
  els.sourceBar = h("div", { class: "mu-source" });
  els.search = h("input", { type: "search", placeholder: "جست‌وجو در فهرست…", dir: "auto", "aria-label": "جست‌وجو" }); els.search.addEventListener("input", renderList);
  els.list = h("ul", { class: "mu-list" });
  els.listBox = h("div", { class: "mu-listbox" }, els.search, els.list);
  els.focus = h("div", { class: "mu-focus", hidden: true });
  panel = h("section", { id: "cp-music", role: "dialog", "aria-label": "Music", hidden: true },
    h("div", { class: "mu-head" }, h("div", { class: "mu-name" }, "PHONK PLAYER", h("small", {}, "local · radio · focus")), h("button", { type: "button", "aria-label": "بستن", onclick: close }, "✕")),
    els.tabs,
    h("div", { class: "mu-now" }, els.title, els.sub, els.videoBox, els.seekRow,
      h("div", { class: "mu-ctrl" }, h("button", { type: "button", onclick: () => next(-1) }, "⏮"), els.play, h("button", { type: "button", onclick: () => next(1) }, "⏭"), els.shuffle),
      h("button", { type: "button", class: "mu-next", onclick: () => next(1) }, "⚡ موزیک بعدی / NEXT"),
      h("label", { class: "mu-vol" }, "🔊", vol), els.status),
    els.sourceBar, els.listBox, els.focus);
  document.body.append(pill, panel);
}

export function open() { panel.hidden = false; chooseSource(state.source).catch((e) => setStatus(e.message)); }
export function close() { if (panel) panel.hidden = true; }

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const init = () => {
    build();
    window.CodePadMusic = { open, close, next, toggle, state: () => ({ source: state.source, index: state.index, queue: state.queue.length, playing: !media.paused, title: current()?.title, currentTime: media.currentTime, folder: state.folder }), setQueue, useRadio };
    window.addEventListener("keydown", (e) => e.key === "Escape" && panel && !panel.hidden && close());
    if (window.cpDesktop?.music) loadLocalDesktop().then(() => { if (state.source === "local" && !state.queue.length) state.queue = state.local; }).catch(() => {});
  };
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
}
