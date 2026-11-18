// ابزارهای کوچک رمزنگاری/کدگذاری برای ترمینال لانچر و آزمون خودکار (همه با WebCrypto و بدون شبکه)
const enc = new TextEncoder();
export async function sha(algo: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512", text: string): Promise<string> {
  if (!crypto.subtle) throw new Error("WebCrypto در دسترس نیست");
  const buf = await crypto.subtle.digest(algo, enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const toB64 = (text: string) => btoa(String.fromCharCode(...enc.encode(text)));
export const fromB64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)));
export const caesar = (text: string, n: number) =>
  text.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((((c.charCodeAt(0) - base + n) % 26) + 26) % 26) + base);
  });
export function passgen(len: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?";
  const out = new Uint32Array(len);
  crypto.getRandomValues(out);
  return [...out].map((v) => chars[v % chars.length]).join("");
}

export const toHex = (text: string) => [...enc.encode(text)].map((b) => b.toString(16).padStart(2, "0")).join("");
export function fromHex(hex: string): string {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  if (clean.length % 2) throw new Error("طول رشتهٔ hex باید زوج باشد");
  return new TextDecoder().decode(Uint8Array.from(clean.match(/../g) ?? [], (h) => parseInt(h, 16)));
}
/** XOR آموزشی: خروجی hex؛ با همان کلید برمی‌گردد (کلید تکراری امن نیست) */
export function xorHex(text: string, key: string): string {
  const k = enc.encode(key || "k");
  return [...enc.encode(text)].map((b, i) => (b ^ k[i % k.length]).toString(16).padStart(2, "0")).join("");
}
/** تخمین آنتروپی رمز عبور بر اساس اندازهٔ مجموعهٔ نویسه‌ها (بیت) */
export function entropyBits(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  return pw.length && pool ? Math.round(pw.length * Math.log2(pool)) : 0;
}
