// حالت محرمانه: مسدودکردن ارتباطات خروجیِ تحت کنترل خودِ CodePad (نه دستگاه‌های دیگر، نه شبکهٔ بی‌سیم).
// صادقانه: این یک قفل سمت کاربر در همان مرورگر/اپ است، نه یک دیوار امنیتی سیستم‌عامل. هرکس که به دیباگر دسترسی
// فنی داشته باشد نهایتاً می‌تواند دور بزند؛ هدف جلوگیری از نشت تصادفی/خودکار است، نه مقاومت در برابر مهاجم مصمم.
// سه لایه:
//   ۱) CSP روی سند اصلی (connect-src 'self') — پوشش fetch/XHR/WebSocket صفحهٔ اصلی و هر Worker که از این سند ساخته شود.
//   ۲) libs-loader.js همین CSP سخت‌گیرتر (connect-src 'none') را به هر iframe (پیش‌نمایش، برنامه‌های لانچر، نوا، نمایشگر سه‌بعدی) تزریق می‌کند.
//   ۳) اجرای پایتون بومی و ترمینال (سوکت واقعی سیستم‌عامل) اصلاً قابل فیلتر نیستند؛ در حالت محرمانه کاملاً غیرفعال می‌شوند.

const STATE_KEY = "codepad-confidential-v1";
const PIN_KEY = "codepad-confidential-pin-v1";
const LOG_KEY = "codepad-confidential-log-v1";
const CHANNEL = "codepad-confidential";
const MAX_LOG = 300;

const ls = () => { try { return globalThis.localStorage; } catch { return null; } };
const enc = (s) => new TextEncoder().encode(s);
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// ── وضعیت ──
export function loadState(storage = ls()) {
  try {
    const v = JSON.parse(storage?.getItem(STATE_KEY) || "null");
    return v && typeof v === "object" ? { enabled: !!v.enabled } : { enabled: false };
  } catch { return { enabled: false }; }
}
function saveState(state, storage = ls()) { try { storage?.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* حافظه در دسترس نیست */ } }
export const isEnabled = (storage = ls()) => loadState(storage).enabled;

// ── پین مدیریتی (PBKDF2؛ فقط هش و نمک ذخیره می‌شود، هرگز خودِ پین) ──
export function hasPin(storage = ls()) { try { return !!JSON.parse(storage?.getItem(PIN_KEY) || "null"); } catch { return false; } }
async function deriveHash(pin, saltBytes) {
  const key = await crypto.subtle.importKey("raw", enc(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 150000 }, key, 256);
  return toHex(bits);
}
export function validPin(pin) { return /^\d{4,8}$/.test(String(pin ?? "")); }
export async function setPin(pin, storage = ls()) {
  if (!validPin(pin)) throw new Error("پین باید فقط عدد و بین ۴ تا ۸ رقم باشد.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(pin, salt);
  try { storage?.setItem(PIN_KEY, JSON.stringify({ salt: toHex(salt), hash })); } catch { throw new Error("ذخیرهٔ پین ممکن نشد (حافظهٔ دستگاه؟)."); }
}
export async function checkPin(pin, storage = ls()) {
  let rec; try { rec = JSON.parse(storage?.getItem(PIN_KEY) || "null"); } catch { rec = null; }
  if (!rec) return false;
  const salt = Uint8Array.from(rec.salt.match(/../g).map((h) => parseInt(h, 16)));
  const hash = await deriveHash(pin, salt);
  // مقایسهٔ زمان‌ثابت ساده (طول هش‌ها همیشه ۶۴ است)
  let diff = hash.length ^ rec.hash.length;
  for (let i = 0; i < Math.max(hash.length, rec.hash.length); i++) diff |= (hash.charCodeAt(i) || 0) ^ (rec.hash.charCodeAt(i) || 0);
  return diff === 0;
}
export async function changePin(oldPin, newPin, storage = ls()) {
  if (hasPin(storage) && !(await checkPin(oldPin, storage))) throw new Error("پین فعلی درست نیست.");
  await setPin(newPin, storage);
}
export function clearPin(storage = ls()) { try { storage?.removeItem(PIN_KEY); } catch { /* ignore */ } }

/** تغییر وضعیت (روشن/خاموش). اگر پین تنظیم شده، باید درست باشد؛ وگرنه هرکسی (تا وقتی پینی ست نشده) می‌تواند عوض کند. */
export async function setEnabled(next, { pin, storage = ls(), broadcast = true } = {}) {
  if (hasPin(storage) && !(await checkPin(pin, storage))) throw new Error("پین اشتباه است.");
  saveState({ enabled: !!next }, storage);
  log(next ? "mode-enabled" : "mode-disabled", "", storage);
  if (broadcast) { try { new BroadcastChannel(CHANNEL).postMessage({ enabled: !!next }); } catch { /* ignore */ } }
  if (typeof document !== "undefined") { applyDocumentCSP(!!next); mountBadge(); }
  try { await globalThis.cpDesktop?.confidential?.set(!!next); } catch { /* نسخهٔ وب/اندروید این پل را ندارد */ }
  return true;
}

// ── مجاز بودن مقصد: هم‌خاستگاه یا لوپ‌بک؛ هر چیز دیگر «خروج اطلاعات» است ──
export function isAllowedOrigin(url, baseHref = (typeof location !== "undefined" ? location.href : "http://localhost/")) {
  let u;
  try { u = new URL(String(url), baseHref); } catch { return false; }
  let base; try { base = new URL(baseHref); } catch { base = null; }
  if (base && u.origin === base.origin) return true;
  if (["codepad:", "capacitor:", "blob:", "data:", "about:"].includes(u.protocol)) return true;
  if (/^(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)$/i.test(u.hostname) && (u.protocol === "http:" || u.protocol === "https:")) return true;
  return false;
}
export function hostOf(url) { try { return new URL(String(url), typeof location !== "undefined" ? location.href : "http://localhost/").hostname || "?"; } catch { return "?"; } }

// ── رویدادها (فقط فراداده: نوع، میزبان، زمان — هرگز محتوا/بدنه/پرس‌وجو) ──
export function readLog(storage = ls()) { try { const v = JSON.parse(storage?.getItem(LOG_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function clearLog(storage = ls()) { try { storage?.setItem(LOG_KEY, "[]"); } catch { /* ignore */ } }
export function log(kind, host = "", storage = ls()) {
  const list = readLog(storage);
  list.unshift({ t: Date.now(), kind, host: String(host).slice(0, 80) });
  try { storage?.setItem(LOG_KEY, JSON.stringify(list.slice(0, MAX_LOG))); } catch { /* ignore */ }
}

const PROTECTED_MSG = "این عملیات در حالت محرمانه مسدود است (خروج اطلاعات از CodePad).";
/** اگر حالت محرمانه روشن است خطا می‌دهد؛ وگرنه عادی ادامه می‌دهد. برای همهٔ نقاط غیر-شبکه‌ای (کلیپ‌بورد، خروجی، اشتراک). */
export function guard(actionLabel, storage = ls()) {
  if (!isEnabled(storage)) return;
  log("blocked:" + actionLabel, "", storage);
  throw new Error(`${PROTECTED_MSG} (${actionLabel})`);
}
/** مثل guard ولی برای یک URL خاص: اگر مقصد محلی/هم‌خاستگاه باشد مسدود نمی‌کند. */
export function guardUrl(url, actionLabel, storage = ls()) {
  if (!isEnabled(storage) || isAllowedOrigin(url)) return;
  log("blocked:" + actionLabel, hostOf(url), storage);
  throw new Error(`${PROTECTED_MSG} مقصد: ${hostOf(url)}`);
}

// ── CSP سند اصلی (صفحهٔ ویرایشگر خودش + هر Worker که از همین سند ساخته شود، چون CSP سند به Worker به‌ارث می‌رسد) ──
const MAIN_CSP = "default-src 'self' blob: data:; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; worker-src 'self' blob:; frame-src 'self'; form-action 'self'; base-uri 'self'";
const META_ID = "cp-confidential-csp";
export function applyDocumentCSP(enabled) {
  if (typeof document === "undefined") return;
  let meta = document.getElementById(META_ID);
  if (enabled) {
    if (!meta) { meta = document.createElement("meta"); meta.httpEquiv = "Content-Security-Policy"; meta.id = META_ID; document.head?.prepend(meta); }
    meta.content = MAIN_CSP;
  } else if (meta) meta.remove();
}
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("securitypolicyviolation", (e) => {
    if (e.disposition !== "enforce") return;
    log("blocked:csp:" + (e.violatedDirective || "?"), hostOf(e.blockedURI));
  });
}

// ── محافظ شبکهٔ سند اصلی: fetch/XHR/WebSocket/sendBeacon/EventSource (دفاع در عمق؛ CSP لایهٔ اصلی است) ──
let patched = false;
export function installNetworkGuard(target = (typeof window !== "undefined" ? window : globalThis)) {
  if (patched || !target) return;
  patched = true;
  const origFetch = target.fetch?.bind(target);
  if (origFetch) target.fetch = (input, init) => { const url = typeof input === "string" ? input : input?.url; try { guardUrl(url, "fetch"); } catch (e) { return Promise.reject(e); } return origFetch(input, init); };
  if (target.XMLHttpRequest) {
    const origOpen = target.XMLHttpRequest.prototype.open;
    target.XMLHttpRequest.prototype.open = function (method, url, ...rest) { guardUrl(url, "xhr"); return origOpen.call(this, method, url, ...rest); };
  }
  if (target.WebSocket) {
    const OrigWS = target.WebSocket;
    target.WebSocket = function (url, protocols) { guardUrl(url, "websocket"); return protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols); };
    target.WebSocket.prototype = OrigWS.prototype;
  }
  if (target.navigator?.sendBeacon) { const orig = target.navigator.sendBeacon.bind(target.navigator); target.navigator.sendBeacon = (url, data) => { try { guardUrl(url, "sendBeacon"); } catch { return false; } return orig(url, data); }; }
  if (target.EventSource) { const OrigES = target.EventSource; target.EventSource = function (url, cfg) { guardUrl(url, "eventsource"); return new OrigES(url, cfg); }; target.EventSource.prototype = OrigES.prototype; }
  if (target.navigator?.clipboard?.writeText) { const orig = target.navigator.clipboard.writeText.bind(target.navigator.clipboard); target.navigator.clipboard.writeText = (text) => { try { guard("clipboard"); } catch (e) { return Promise.reject(e); } return orig(text); }; }
}

let badge = null;
function mountBadge() {
  if (typeof document === "undefined") return;
  if (!badge) {
    badge = document.createElement("button");
    badge.type = "button";
    badge.className = "cp-confidential-badge";
    badge.textContent = "حالت محرمانه";
    badge.setAttribute("aria-label", "حالت محرمانه فعال است؛ برای مدیریت، باز کردن هاب");
    badge.onclick = () => window.CodePadHub?.open("confidential");
  }
  badge.hidden = !isEnabled();
  if (!badge.isConnected) document.body?.append(badge);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const state = loadState();
  if (state.enabled) applyDocumentCSP(true);
  installNetworkGuard();
  try { globalThis.cpDesktop?.confidential?.set(!!state.enabled); } catch { /* نسخهٔ وب/اندروید این پل را ندارد */ }
  try { new BroadcastChannel(CHANNEL).onmessage = (e) => { applyDocumentCSP(!!e.data?.enabled); mountBadge(); }; } catch { /* ignore */ }
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; mountBadge(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  mountBadge();
  window.CodePadConfidential = { isEnabled, setEnabled, hasPin, setPin, checkPin, changePin, clearPin, validPin, guard, guardUrl, isAllowedOrigin, readLog, clearLog, log };
}
