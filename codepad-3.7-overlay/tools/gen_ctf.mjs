// چالش‌های CTF را با هش پرچم‌ها تولید می‌کند:  node tools/gen_ctf.mjs
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const b64 = (s) => Buffer.from(s).toString("base64");
const rot = (s, n) => s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + n + 26) % 26 + b); });
const hex = (s) => Buffer.from(s).toString("hex");
const bin = (s) => [...Buffer.from(s)].map((b) => b.toString(2).padStart(8, "0")).join(" ");
const xor = (s, k) => [...Buffer.from(s)].map((b) => (b ^ k).toString(16).padStart(2, "0")).join("");
const vig = (s, key) => { let i = 0; return s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; const k = key.charCodeAt(i++ % key.length) - 65; return String.fromCharCode((c.charCodeAt(0) - b + k) % 26 + b); }); };
const urlTwice = (s) => encodeURIComponent(encodeURIComponent(s)).replace(/[A-Za-z0-9_.~-]/g, (c) => c);
const md5 = (s) => createHash("md5").update(s).digest("hex");

const flags = {
  base64: "CP{base64_is_not_encryption}", caesar: "CP{caesar_was_a_roman}", hex: "CP{hex_is_just_bytes}", layers: "CP{layers_on_layers}",
  xor: "CP{single_byte_xor}", md5: "CP{letmein}", jwt: "CP{jwt_alg_none_pwned}", logs: "CP{attacker_203.0.113.77}",
  dump: "CP{hidden_in_plain_bytes}", vig: "CP{vigenere_has_a_key}", binary: "CP{binary_is_everywhere}", url: "CP{url_encoded_twice}",
};
// لاگ ورود: مهاجم ۲۰۳٫۰٫۱۱۳٫۷۷ بیشترین شکست را دارد
const logLines = [];
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const users = ["root", "admin", "ubuntu", "pi", "test", "oracle"];
for (let i = 0; i < 34; i++) {
  const t = `Nov 12 03:${String(10 + Math.floor(i / 2)).padStart(2, "0")}:${String((i * 17) % 60).padStart(2, "0")}`;
  const attacker = rnd() < 0.62;
  const ip = attacker ? "203.0.113.77" : ["198.51.100.9", "192.0.2.14", "198.51.100.23"][Math.floor(rnd() * 3)];
  logLines.push(`${t} srv sshd[${1200 + i}]: Failed password for ${users[Math.floor(rnd() * users.length)]} from ${ip} port ${40000 + i * 13} ssh2`);
}
logLines.splice(11, 0, "Nov 12 03:16:02 srv sshd[1211]: Accepted password for deploy from 192.0.2.14 port 51111 ssh2");
// هگزدامپ
const hidden = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 0), Buffer.from("IDAT"), Buffer.from([0, 1, 2, 3]), Buffer.from("junkjunk"), Buffer.from(flags.dump), Buffer.from([0xff, 0xfe, 0, 0, 0, 0])]);
const dump = (() => { const lines = []; for (let i = 0; i < hidden.length; i += 16) { const row = hidden.subarray(i, i + 16); lines.push(i.toString(16).padStart(8, "0") + "  " + [...row].map((b) => b.toString(16).padStart(2, "0")).join(" ").padEnd(47) + "  |" + [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("") + "|"); } return lines.join("\n"); })();
// JWT
const jwtHeader = b64(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, ""), jwtPayload = b64(JSON.stringify({ user: "guest", role: "user", iat: 1700000000 })).replace(/=/g, "");
const jwt = `${jwtHeader}.${jwtPayload}.dGhpcy1pcy1ub3QtYS1yZWFsLXNpZ25hdHVyZQ`;

const C = [
  { id: "base64", title: "کدگذاری ساده", cat: "رمزنگاری", pts: 10, story: "این پیام در یک فایل پیکربندی پیدا شد. فقط کدگذاری شده، رمزنگاری نشده.", data: b64(flags.base64), hints: ["نویسه‌های A-Z a-z 0-9 + / و گاهی = آخر؟", "این Base64 است.", "هر ابزار Base64 → متن. یا در پایتون: base64.b64decode"], flag: flags.base64 },
  { id: "caesar", title: "رمز سزار", cat: "رمزنگاری", pts: 10, story: "ژولیوس سزار هر حرف را چند جا جابه‌جا می‌کرد. شیفت را پیدا کن.", data: rot(flags.caesar, 7), hints: ["ساختار پرچم را می‌دانی: CP{...}", "اولین حرف C شده است چه؟", "شیفت ۷؛ هر حرف را ۷ تا به عقب ببر (ROT-7)."], flag: flags.caesar },
  { id: "hex", title: "بایت‌های هگز", cat: "رمزنگاری", pts: 10, story: "یک سرور این رشته را در لاگ نوشته.", data: hex(flags.hex), hints: ["فقط 0-9 و a-f. هر دو نویسه = یک بایت.", "کد ASCII: 43 = C", "bytes.fromhex(...).decode()"], flag: flags.hex },
  { id: "layers", title: "دو لایه", cat: "رمزنگاری", pts: 20, story: "مهاجم دو بار پیام را پوشانده است. اول Base64 سپس ROT13.", data: b64(rot(flags.layers, 13)), hints: ["ظاهرش Base64 است.", "بعد از Base64 متن عجیبی می‌ماند: ROT13.", "Base64 → ROT13 (حرف‌ها ۱۳ جا جابه‌جا)."], flag: flags.layers },
  { id: "xor", title: "XOR تک‌بایتی", cat: "رمزنگاری", pts: 25, story: "هر بایت با یک کلید یک‌بایتی XOR شده. می‌دانیم پیام با CP{ شروع می‌شود.", data: xor(flags.xor, 0x2a), hints: ["بایت اول با 'C' (0x43) XOR شده.", "کلید = بایت اول رمز XOR 0x43.", "کلید 0x2a است. همه را با آن XOR کن."], flag: flags.xor },
  { id: "md5", title: "شکستن هش", cat: "هش و رمز", pts: 20, story: "این هش MD5 رمز یک کاربر است و پرچم CP{رمز} است. رمز در فهرست رایج‌ترین‌هاست: password, 123456, qwerty, letmein, dragon, sunshine, welcome", data: md5("letmein"), hints: ["MD5 بدون salt را با فرهنگ‌لغت می‌شکنند.", "هر کلمهٔ فهرست را هش کن و مقایسه کن.", "پایتون: hashlib.md5(w.encode()).hexdigest() برای هر w."], flag: flags.md5 },
  { id: "jwt", title: "JWT با alg=none", cat: "وب", pts: 30, story: "این توکن نقش کاربر guest/user دارد. سرور ضعیف است و alg «none» را می‌پذیرد. توکنی با role=admin و alg=none بساز و در پایین بچسبان (قسمت امضا خالی).", data: jwt, type: "jwt", hints: ["سه بخش جدا با نقطه: header.payload.signature", "header را Base64URL بساز: {\"alg\":\"none\",\"typ\":\"JWT\"}", "payload با role=admin؛ در آخر یک نقطه و امضای خالی: header.payload."], flag: flags.jwt },
  { id: "logs", title: "حملهٔ حدس رمز در لاگ", cat: "تحلیل لاگ", pts: 25, story: "لاگ SSH سرور. کدام آی‌پی بیشترین ورود ناموفق را دارد؟ پرچم: CP{attacker_آی‌پی}", data: logLines.join("\n"), hints: ["خطوط Failed password را بشمار.", "با شمارش آی‌پی‌ها: Counter در پایتون.", "پراشتباه‌ترین آی‌پی همان مهاجم است."], flag: flags.logs },
  { id: "dump", title: "پنهان در بایت‌ها", cat: "فارنزیک", pts: 25, story: "این هگزدامپ سربرگ یک «تصویر PNG» است، ولی کسی داخلش چیزی پنهان کرده.", data: dump, hints: ["ستون سمت راست (ASCII) را بخوان.", "دنبال CP{ بگرد.", "پرچم بعد از 'junkjunk' است."], flag: flags.dump },
  { id: "vig", title: "رمز ویژنر", cat: "رمزنگاری", pts: 30, story: "رمز ویژنر با کلید سه‌حرفی LAB (نام این آزمایشگاه). حروف را رمز کرده‌اند و بقیه نویسه‌ها ثابت‌اند.", data: vig(flags.vig, "LAB"), hints: ["هر حرف با حرف کلید جابه‌جا می‌شود: L=11, A=0, B=1.", "کلید را تکرار کن و از هر حرف کم کن.", "الگو: شیفت ۱۱، ۰، ۱، ۱۱، ۰، ۱ …"], flag: flags.vig },
  { id: "binary", title: "دودویی", cat: "رمزنگاری", pts: 10, story: "کامپیوتر فقط صفر و یک می‌فهمد. هر ۸ بیت یک نویسه است.", data: bin(flags.binary), hints: ["۸ بیت = یک بایت.", "int('01000011', 2) = 67 = 'C'", "chr(int(b,2)) برای هر گروه."], flag: flags.binary },
  { id: "url", title: "دو بار URL-encode", cat: "وب", pts: 15, story: "WAFها بعضی وقت‌ها فقط یک‌بار decode می‌کنند. این پیام دو بار کدگذاری شده.", data: urlTwice(flags.url), hints: ["%25 همان % است.", "دو بار decode کن.", "urllib.parse.unquote(urllib.parse.unquote(x))"], flag: flags.url },
];
const out = C.map(({ flag, ...c }) => ({ ...c, flagHash: sha(flag) }));
writeFileSync(join(HERE, "../files/mobile-src/assets/hub-ctf-data.js"), "// تولید خودکار؛ فقط هش پرچم‌ها اینجا هست (متن چالش‌ها قابل خواندن است، پرچم نه)\nexport const CTF_CHALLENGES = " + JSON.stringify(out, null, 1) + ";\n");
console.log(out.length, "challenges");
// برای تست: پرچم‌ها

