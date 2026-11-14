// ابزارهای دستگاه برای ایجنت (هم Gemini هم AI سفارشی). همه با مجوز جدا در لانچر روشن/خاموش می‌شوند.
// بخش‌های خالص (اعتبارسنجی هدف اسکن) بدون DOM آزمون می‌شوند: scripts/device-tools.test.mjs

/** IPv4 → عدد ۳۲ بیتی؛ نامعتبر = null */
export function ipToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((n) => n > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

const PRIVATE = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16],
  ["127.0.0.0", 8],
].map(([ip, bits]) => [ipToInt(ip), bits]);

const inRange = (addr, base, bits) => bits === 0 || addr >>> (32 - bits) === base >>> (32 - bits);

/**
 * فقط شبکهٔ خودِ کاربر: IP یا CIDR داخل 10/8، 172.16/12، 192.168/16، لینک‌محلی یا loopback و حداکثر ۱۰۲۴ آدرس.
 * هدف عمومی (اینترنت) عمداً رد می‌شود؛ برای آن‌ها کاربر باید خودش در ترمینال و با مسئولیت خودش کار کند.
 */
export function validateScanTarget(target) {
  const t = String(target ?? "").trim();
  if (t.toLowerCase() === "localhost") return { ok: true, target: "127.0.0.1", hosts: 1 };
  const m = /^([\d.]+)(?:\/(\d{1,2}))?$/.exec(t);
  if (!m) return { ok: false, error: "هدف باید یک IP یا CIDR مثل 192.168.1.0/24 باشد." };
  const addr = ipToInt(m[1]);
  if (addr === null) return { ok: false, error: "IP نامعتبر است." };
  const bits = m[2] === undefined ? 32 : Number(m[2]);
  if (bits > 32) return { ok: false, error: "طول CIDR نامعتبر است." };
  const hosts = 2 ** (32 - bits);
  if (hosts > 1024) return { ok: false, error: "بازهٔ بزرگ‌تر از ۱۰۲۴ آدرس (حداکثر /22) مجاز نیست." };
  const first = bits === 32 ? addr : (addr >>> (32 - bits)) << (32 - bits) >>> 0;
  const last = (first + hosts - 1) >>> 0;
  const ok = PRIVATE.some(([base, b]) => inRange(first, base, b) && inRange(last, base, b));
  if (!ok) return { ok: false, error: "فقط شبکهٔ خصوصی خودت (192.168.x.x، 10.x.x.x، 172.16-31.x.x، localhost) اسکن می‌شود؛ هدف عمومی رد شد." };
  return { ok: true, target: bits === 32 ? m[1] : `${m[1]}/${bits}`, hosts };
}

function portList(ports) {
  const text = String(ports ?? "").trim();
  if (!text) return "";
  if (!/^\d{1,5}(-\d{1,5})?(,\d{1,5}(-\d{1,5})?)*$/.test(text) || text.length > 120) throw new Error("فهرست پورت نامعتبر است (مثلاً 22,80,443 یا 1-1024).");
  for (const n of text.split(/[,-]/).map(Number)) if (n < 1 || n > 65535) throw new Error("پورت باید بین 1 و 65535 باشد.");
  return text;
}

/** فرمان nmap ساخته‌شده از ورودی ساختاریافته (نه متن آزاد): بدون root، فقط TCP connect */
export function buildNmapCommand({ target, mode = "ping", ports } = {}) {
  const v = validateScanTarget(target);
  if (!v.ok) throw new Error(v.error);
  const list = portList(ports);
  if (mode === "ping") return `nmap -sn -T3 ${v.target}`;
  if (mode === "ports") return `nmap -sT -T3 ${list ? `-p ${list}` : "-F"} ${v.target}`;
  if (mode === "services") return `nmap -sT -sV -T3 ${list ? `-p ${list}` : "-F"} ${v.target}`;
  throw new Error("mode باید ping، ports یا services باشد.");
}

// ───────────── بخش‌های مرورگری ─────────────

const withTimeout = (promise, ms, message) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

export async function deviceStatus() {
  const nav = globalThis.navigator ?? {};
  const out = {
    time: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: nav.language,
    platform: nav.platform,
    userAgent: nav.userAgent,
    cpuCores: nav.hardwareConcurrency,
    memoryGB: nav.deviceMemory,
    online: nav.onLine,
    screen: globalThis.screen ? { width: screen.width, height: screen.height, pixelRatio: globalThis.devicePixelRatio } : undefined,
    connection: nav.connection ? { type: nav.connection.type, effectiveType: nav.connection.effectiveType, downlinkMbps: nav.connection.downlink, rttMs: nav.connection.rtt, saveData: nav.connection.saveData } : undefined,
  };
  try {
    const b = await withTimeout(nav.getBattery(), 2000, "battery");
    out.battery = { level: Math.round(b.level * 100), charging: b.charging };
  } catch {
    /* API در دسترس نیست */
  }
  return out;
}

export async function getLocation({ highAccuracy = true, timeoutMs = 15000 } = {}) {
  const geo = globalThis.navigator?.geolocation;
  if (!geo) throw new Error("موقعیت‌یابی در این محیط پشتیبانی نمی‌شود.");
  const pos = await new Promise((resolve, reject) =>
    geo.getCurrentPosition(resolve, (e) => reject(new Error(e.code === 1 ? "اجازهٔ مکان در اندروید داده نشد (تنظیمات برنامه ← مجوزها ← مکان)." : e.code === 3 ? "زمان دریافت مکان تمام شد؛ GPS را روشن کن و بیرون از ساختمان امتحان کن." : `مکان در دسترس نیست: ${e.message}`)), {
      enableHighAccuracy: !!highAccuracy,
      timeout: timeoutMs,
      maximumAge: 10000,
    }),
  );
  const c = pos.coords;
  return { latitude: c.latitude, longitude: c.longitude, accuracyMeters: c.accuracy, altitude: c.altitude, speed: c.speed, heading: c.heading, timestamp: new Date(pos.timestamp).toISOString(), map: `https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=17/${c.latitude}/${c.longitude}` };
}

/** آدرس‌های محلی از WebRTC (ممکن است مرورگر آن‌ها را mDNS پنهان کند؛ برای دقت از termux_command با `ip -4 addr` استفاده کن) */
export async function localAddresses(timeoutMs = 2500) {
  const RTC = globalThis.RTCPeerConnection;
  if (!RTC) return { addresses: [], note: "WebRTC در دسترس نیست." };
  const found = new Set();
  const pc = new RTC({ iceServers: [] });
  pc.createDataChannel("x");
  pc.onicecandidate = (e) => {
    const m = e.candidate && /(\d{1,3}(?:\.\d{1,3}){3})/.exec(e.candidate.candidate);
    if (m && ipToInt(m[1]) !== null) found.add(m[1]);
  };
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((r) => setTimeout(r, timeoutMs));
  pc.close();
  const addresses = [...found];
  return { addresses, note: addresses.length ? "" : "WebRTC آدرسی نداد (احتمالاً پنهان‌سازی mDNS). از termux_command با `ip -4 addr` استفاده کن." };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** نمایش پیام هوش مصنوعی روی صفحهٔ کدپد (متن امن، بدون HTML دلخواه) */
export function showOnScreen({ title = "", text = "", seconds = 8, level = "info" } = {}) {
  const doc = globalThis.document;
  if (!doc) throw new Error("نمایش روی صفحه در این محیط ممکن نیست.");
  const body = String(text).slice(0, 2000);
  if (!body.trim() && !String(title).trim()) throw new Error("متن یا عنوان لازم است.");
  const ms = Math.min(120, Math.max(2, Number(seconds) || 8)) * 1000;
  let host = doc.getElementById("cp-ai-hud");
  if (!host) {
    host = doc.createElement("div");
    host.id = "cp-ai-hud";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    doc.body.appendChild(host);
  }
  const card = doc.createElement("div");
  card.className = `cp-ai-card cp-ai-${["info", "warn", "alert"].includes(level) ? level : "info"}`;
  card.innerHTML = `<b>${escapeHtml(String(title).slice(0, 80) || "AI")}</b><span>${escapeHtml(body)}</span>`;
  card.addEventListener("click", () => card.remove());
  host.appendChild(card);
  while (host.children.length > 4) host.firstElementChild.remove();
  setTimeout(() => card.remove(), ms);
  return { shown: true, seconds: ms / 1000 };
}
