// چالش‌های CTF آفلاین: همه‌چیز داخل برنامه است و هیچ هدف واقعی ندارد. فقط هش پرچم‌ها نگه‌داری می‌شود.
import { CTF_CHALLENGES } from "./hub-ctf-data.js";
export { CTF_CHALLENGES };

const KEY = "codepad-ctf-v1";
const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64urlDecode = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - (s.length % 4)) % 4); return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); };

/** توکن جعلی را بررسی می‌کند: alg=none و role=admin و بدون امضا. */
export function verifyForgedJwt(token) {
  try {
    const [h, p, sig, ...rest] = String(token).trim().split(".");
    if (rest.length || h === undefined || p === undefined) return false;
    const header = JSON.parse(b64urlDecode(h)), payload = JSON.parse(b64urlDecode(p));
    return String(header.alg).toLowerCase() === "none" && payload.role === "admin" && (sig ?? "") === "";
  } catch { return false; }
}

export async function checkAnswer(ch, answer) {
  const a = String(answer ?? "").trim();
  if (!a) return false;
  if (ch.type === "jwt") return verifyForgedJwt(a) && (await sha256("CP{jwt_alg_none_pwned}")) === ch.flagHash;
  return (await sha256(a)) === ch.flagHash;
}

function store(storage) {
  return {
    load() { try { const v = JSON.parse(storage?.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } },
    save(v) { try { storage?.setItem(KEY, JSON.stringify(v)); } catch { /* حافظه پر/غیرفعال */ } },
  };
}
export function progress(storage = globalThis.localStorage) {
  const s = store(storage), solved = s.load().solved || {};
  const done = CTF_CHALLENGES.filter((c) => solved[c.id]);
  return { solved, count: done.length, points: done.reduce((a, c) => a + c.pts, 0), total: CTF_CHALLENGES.length, maxPoints: CTF_CHALLENGES.reduce((a, c) => a + c.pts, 0) };
}
export async function submit(id, answer, storage = globalThis.localStorage) {
  const ch = CTF_CHALLENGES.find((c) => c.id === id);
  if (!ch) return { ok: false, reason: "unknown" };
  const ok = await checkAnswer(ch, answer);
  if (ok) { const s = store(storage), v = s.load(); v.solved = { ...(v.solved || {}), [id]: Date.now() }; s.save(v); }
  return { ok, points: ok ? ch.pts : 0 };
}
export function reset(storage = globalThis.localStorage) { store(storage).save({}); }
