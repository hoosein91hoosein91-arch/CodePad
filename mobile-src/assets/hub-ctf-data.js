// تولید خودکار؛ فقط هش پرچم‌ها اینجا هست (متن چالش‌ها قابل خواندن است، پرچم نه)
export const CTF_CHALLENGES = [
 {
  "id": "base64",
  "title": "کدگذاری ساده",
  "cat": "رمزنگاری",
  "pts": 10,
  "story": "این پیام در یک فایل پیکربندی پیدا شد. فقط کدگذاری شده، رمزنگاری نشده.",
  "data": "Q1B7YmFzZTY0X2lzX25vdF9lbmNyeXB0aW9ufQ==",
  "hints": [
   "نویسه‌های A-Z a-z 0-9 + / و گاهی = آخر؟",
   "این Base64 است.",
   "هر ابزار Base64 → متن. یا در پایتون: base64.b64decode"
  ],
  "flagHash": "6cff9258c4add5d488a350d8ffe9dccbb9f17a1d34fccc69a048251a64d5df03"
 },
 {
  "id": "caesar",
  "title": "رمز سزار",
  "cat": "رمزنگاری",
  "pts": 10,
  "story": "ژولیوس سزار هر حرف را چند جا جابه‌جا می‌کرد. شیفت را پیدا کن.",
  "data": "JW{jhlzhy_dhz_h_yvthu}",
  "hints": [
   "ساختار پرچم را می‌دانی: CP{...}",
   "اولین حرف C شده است چه؟",
   "شیفت ۷؛ هر حرف را ۷ تا به عقب ببر (ROT-7)."
  ],
  "flagHash": "d21f03ac00cf8b6555e202fb002aafb71dd2854b3bef488233360acb3ca09e97"
 },
 {
  "id": "hex",
  "title": "بایت‌های هگز",
  "cat": "رمزنگاری",
  "pts": 10,
  "story": "یک سرور این رشته را در لاگ نوشته.",
  "data": "43507b6865785f69735f6a7573745f62797465737d",
  "hints": [
   "فقط 0-9 و a-f. هر دو نویسه = یک بایت.",
   "کد ASCII: 43 = C",
   "bytes.fromhex(...).decode()"
  ],
  "flagHash": "f974c46a4087e8e47b21f92492467dfc569727c6844c4f569ac86a1ba205aced"
 },
 {
  "id": "layers",
  "title": "دو لایه",
  "cat": "رمزنگاری",
  "pts": 20,
  "story": "مهاجم دو بار پیام را پوشانده است. اول Base64 سپس ROT13.",
  "data": "UEN7eW5scmVmX2JhX3lubHJlZn0=",
  "hints": [
   "ظاهرش Base64 است.",
   "بعد از Base64 متن عجیبی می‌ماند: ROT13.",
   "Base64 → ROT13 (حرف‌ها ۱۳ جا جابه‌جا)."
  ],
  "flagHash": "4e02e92e042c0637708b8b68ef8e12eb19f2be490b17533f56a9db4ea47d320f"
 },
 {
  "id": "xor",
  "title": "XOR تک‌بایتی",
  "cat": "رمزنگاری",
  "pts": 25,
  "story": "هر بایت با یک کلید یک‌بایتی XOR شده. می‌دانیم پیام با CP{ شروع می‌شود.",
  "data": "697a515943444d464f7548535e4f7552455857",
  "hints": [
   "بایت اول با 'C' (0x43) XOR شده.",
   "کلید = بایت اول رمز XOR 0x43.",
   "کلید 0x2a است. همه را با آن XOR کن."
  ],
  "flagHash": "805d99e6e635f0b2ccf4348f342d6a3f6103610b231129b44ccccbffb317ceb1"
 },
 {
  "id": "md5",
  "title": "شکستن هش",
  "cat": "هش و رمز",
  "pts": 20,
  "story": "این هش MD5 رمز یک کاربر است و پرچم CP{رمز} است. رمز در فهرست رایج‌ترین‌هاست: password, 123456, qwerty, letmein, dragon, sunshine, welcome",
  "data": "0d107d09f5bbe40cade3de5c71e9e9b7",
  "hints": [
   "MD5 بدون salt را با فرهنگ‌لغت می‌شکنند.",
   "هر کلمهٔ فهرست را هش کن و مقایسه کن.",
   "پایتون: hashlib.md5(w.encode()).hexdigest() برای هر w."
  ],
  "flagHash": "65a23ec44507220644de136b44ff32050b537e883ddfdf081b1b097c4b9019ba"
 },
 {
  "id": "jwt",
  "title": "JWT با alg=none",
  "cat": "وب",
  "pts": 30,
  "story": "این توکن نقش کاربر guest/user دارد. سرور ضعیف است و alg «none» را می‌پذیرد. توکنی با role=admin و alg=none بساز و در پایین بچسبان (قسمت امضا خالی).",
  "data": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiZ3Vlc3QiLCJyb2xlIjoidXNlciIsImlhdCI6MTcwMDAwMDAwMH0.dGhpcy1pcy1ub3QtYS1yZWFsLXNpZ25hdHVyZQ",
  "type": "jwt",
  "hints": [
   "سه بخش جدا با نقطه: header.payload.signature",
   "header را Base64URL بساز: {\"alg\":\"none\",\"typ\":\"JWT\"}",
   "payload با role=admin؛ در آخر یک نقطه و امضای خالی: header.payload."
  ],
  "flagHash": "e83149f3ca5f29a3229c13911d64d8477833b045c5420ea3a22671c6a3af835f"
 },
 {
  "id": "logs",
  "title": "حملهٔ حدس رمز در لاگ",
  "cat": "تحلیل لاگ",
  "pts": 25,
  "story": "لاگ SSH سرور. کدام آی‌پی بیشترین ورود ناموفق را دارد؟ پرچم: CP{attacker_آی‌پی}",
  "data": "Nov 12 03:10:00 srv sshd[1200]: Failed password for admin from 203.0.113.77 port 40000 ssh2\nNov 12 03:10:17 srv sshd[1201]: Failed password for oracle from 203.0.113.77 port 40013 ssh2\nNov 12 03:11:34 srv sshd[1202]: Failed password for oracle from 192.0.2.14 port 40026 ssh2\nNov 12 03:11:51 srv sshd[1203]: Failed password for oracle from 198.51.100.9 port 40039 ssh2\nNov 12 03:12:08 srv sshd[1204]: Failed password for admin from 203.0.113.77 port 40052 ssh2\nNov 12 03:12:25 srv sshd[1205]: Failed password for ubuntu from 198.51.100.9 port 40065 ssh2\nNov 12 03:13:42 srv sshd[1206]: Failed password for root from 203.0.113.77 port 40078 ssh2\nNov 12 03:13:59 srv sshd[1207]: Failed password for test from 198.51.100.23 port 40091 ssh2\nNov 12 03:14:16 srv sshd[1208]: Failed password for pi from 198.51.100.9 port 40104 ssh2\nNov 12 03:14:33 srv sshd[1209]: Failed password for admin from 203.0.113.77 port 40117 ssh2\nNov 12 03:15:50 srv sshd[1210]: Failed password for test from 198.51.100.9 port 40130 ssh2\nNov 12 03:16:02 srv sshd[1211]: Accepted password for deploy from 192.0.2.14 port 51111 ssh2\nNov 12 03:15:07 srv sshd[1211]: Failed password for root from 203.0.113.77 port 40143 ssh2\nNov 12 03:16:24 srv sshd[1212]: Failed password for oracle from 198.51.100.23 port 40156 ssh2\nNov 12 03:16:41 srv sshd[1213]: Failed password for test from 198.51.100.23 port 40169 ssh2\nNov 12 03:17:58 srv sshd[1214]: Failed password for ubuntu from 203.0.113.77 port 40182 ssh2\nNov 12 03:17:15 srv sshd[1215]: Failed password for pi from 203.0.113.77 port 40195 ssh2\nNov 12 03:18:32 srv sshd[1216]: Failed password for admin from 203.0.113.77 port 40208 ssh2\nNov 12 03:18:49 srv sshd[1217]: Failed password for oracle from 198.51.100.9 port 40221 ssh2\nNov 12 03:19:06 srv sshd[1218]: Failed password for admin from 203.0.113.77 port 40234 ssh2\nNov 12 03:19:23 srv sshd[1219]: Failed password for pi from 203.0.113.77 port 40247 ssh2\nNov 12 03:20:40 srv sshd[1220]: Failed password for admin from 203.0.113.77 port 40260 ssh2\nNov 12 03:20:57 srv sshd[1221]: Failed password for ubuntu from 192.0.2.14 port 40273 ssh2\nNov 12 03:21:14 srv sshd[1222]: Failed password for ubuntu from 192.0.2.14 port 40286 ssh2\nNov 12 03:21:31 srv sshd[1223]: Failed password for admin from 203.0.113.77 port 40299 ssh2\nNov 12 03:22:48 srv sshd[1224]: Failed password for pi from 203.0.113.77 port 40312 ssh2\nNov 12 03:22:05 srv sshd[1225]: Failed password for ubuntu from 203.0.113.77 port 40325 ssh2\nNov 12 03:23:22 srv sshd[1226]: Failed password for ubuntu from 203.0.113.77 port 40338 ssh2\nNov 12 03:23:39 srv sshd[1227]: Failed password for test from 203.0.113.77 port 40351 ssh2\nNov 12 03:24:56 srv sshd[1228]: Failed password for root from 203.0.113.77 port 40364 ssh2\nNov 12 03:24:13 srv sshd[1229]: Failed password for pi from 192.0.2.14 port 40377 ssh2\nNov 12 03:25:30 srv sshd[1230]: Failed password for ubuntu from 198.51.100.9 port 40390 ssh2\nNov 12 03:25:47 srv sshd[1231]: Failed password for pi from 203.0.113.77 port 40403 ssh2\nNov 12 03:26:04 srv sshd[1232]: Failed password for admin from 198.51.100.9 port 40416 ssh2\nNov 12 03:26:21 srv sshd[1233]: Failed password for root from 203.0.113.77 port 40429 ssh2",
  "hints": [
   "خطوط Failed password را بشمار.",
   "با شمارش آی‌پی‌ها: Counter در پایتون.",
   "پراشتباه‌ترین آی‌پی همان مهاجم است."
  ],
  "flagHash": "db6077347c9f4c10114c47e8244571abf18f0b425e8a05ebcfa26386291d450c"
 },
 {
  "id": "dump",
  "title": "پنهان در بایت‌ها",
  "cat": "فارنزیک",
  "pts": 25,
  "story": "این هگزدامپ سربرگ یک «تصویر PNG» است، ولی کسی داخلش چیزی پنهان کرده.",
  "data": "00000000  89 50 4e 47 0d 0a 1a 0a 00 00 00 00 00 00 00 00  |.PNG............|\n00000010  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  |................|\n00000020  49 44 41 54 00 01 02 03 6a 75 6e 6b 6a 75 6e 6b  |IDAT....junkjunk|\n00000030  43 50 7b 68 69 64 64 65 6e 5f 69 6e 5f 70 6c 61  |CP{hidden_in_pla|\n00000040  69 6e 5f 62 79 74 65 73 7d ff fe 00 00 00 00     |in_bytes}......|",
  "hints": [
   "ستون سمت راست (ASCII) را بخوان.",
   "دنبال CP{ بگرد.",
   "پرچم بعد از 'junkjunk' است."
  ],
  "flagHash": "5fa647311d3f34a90f8c24add1d5226b4b3c7f81f136d7923d2ababf188aa97a"
 },
 {
  "id": "vig",
  "title": "رمز ویژنر",
  "cat": "رمزنگاری",
  "pts": 30,
  "story": "رمز ویژنر با کلید سه‌حرفی LAB (نام این آزمایشگاه). حروف را رمز کرده‌اند و بقیه نویسه‌ها ثابت‌اند.",
  "data": "NP{wtgfyesp_hbd_a_lpy}",
  "hints": [
   "هر حرف با حرف کلید جابه‌جا می‌شود: L=11, A=0, B=1.",
   "کلید را تکرار کن و از هر حرف کم کن.",
   "الگو: شیفت ۱۱، ۰، ۱، ۱۱، ۰، ۱ …"
  ],
  "flagHash": "c8ddc77a88e32068ad08b3b0f5b14ba5bf5a2dbf868fe13a268ad4317208354e"
 },
 {
  "id": "binary",
  "title": "دودویی",
  "cat": "رمزنگاری",
  "pts": 10,
  "story": "کامپیوتر فقط صفر و یک می‌فهمد. هر ۸ بیت یک نویسه است.",
  "data": "01000011 01010000 01111011 01100010 01101001 01101110 01100001 01110010 01111001 01011111 01101001 01110011 01011111 01100101 01110110 01100101 01110010 01111001 01110111 01101000 01100101 01110010 01100101 01111101",
  "hints": [
   "۸ بیت = یک بایت.",
   "int('01000011', 2) = 67 = 'C'",
   "chr(int(b,2)) برای هر گروه."
  ],
  "flagHash": "9071d407ec00584cd2322f51343d6533c88577e5b8f24a3efa9ac2b4283d8155"
 },
 {
  "id": "url",
  "title": "دو بار URL-encode",
  "cat": "وب",
  "pts": 15,
  "story": "WAFها بعضی وقت‌ها فقط یک‌بار decode می‌کنند. این پیام دو بار کدگذاری شده.",
  "data": "CP%257Burl_encoded_twice%257D",
  "hints": [
   "%25 همان % است.",
   "دو بار decode کن.",
   "urllib.parse.unquote(urllib.parse.unquote(x))"
  ],
  "flagHash": "565216ce8da111b7f4bd67dba67543a5d37a0d8d0754c1baca3d951d64fe7d8c"
 }
];
