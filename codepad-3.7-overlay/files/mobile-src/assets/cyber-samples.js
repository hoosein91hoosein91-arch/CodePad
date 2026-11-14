// نمونه‌کدهای آموزشیِ امنیت و ارزیابی برای دستگاه‌ها و شبکه‌هایی که مالکشان هستی (یا مجوز کتبی داری).
// هر اسکریپت در Termux با python3 اجرا می‌شود. اسکن شبکه فقط روی بازهٔ خصوصی؛ بررسی‌های تک‌درخواستی روی میزبان
// بیرونی فقط با پرچم صریح --i-own-this. هیچ اسکریپتی بهره‌برداری (exploit)، حمله، ربایش یا مخفی‌سازی ندارد.
// پایتون این فایل‌ها با String.raw نوشته شده: بک‌تیک و ${ در آن‌ها ممنوع است.

const GUARD = String.raw`import ipaddress, socket, sys

def resolve(host):
    try:
        return socket.gethostbyname(host)
    except OSError as e:
        sys.exit("cannot resolve %s: %s" % (host, e))

def is_own_network(ip):
    a = ipaddress.ip_address(ip)
    return a.is_private or a.is_loopback or a.is_link_local

def require_scope(host, allow_public_flag=False):
    ip = resolve(host)
    if is_own_network(ip):
        return ip
    if allow_public_flag and "--i-own-this" in sys.argv:
        print("[!] public host %s (%s): continuing because --i-own-this was given. Only test systems you own or have written permission for." % (host, ip))
        return ip
    sys.exit("refused: %s (%s) is not on your private network. For single-request checks of a system you own, add --i-own-this." % (host, ip))
`;

export const CYBER_SAMPLES = [
  {
    id: "tcp_scan",
    title: "اسکنر پورت TCP (شبکهٔ خصوصی)",
    level: "پایه",
    about: "اتصال TCP به پورت‌های یک دستگاه در شبکهٔ خودت و گرفتن بنر سرویس. بدون root. هدف عمومی رد می‌شود.",
    args: "هدف [پورت‌ها]  مثال: 192.168.1.1 22,80,443,8000-8100",
    code: GUARD + String.raw`
import concurrent.futures as cf

def parse_ports(text):
    ports = set()
    for part in text.split(","):
        if "-" in part:
            a, b = part.split("-")
            ports.update(range(int(a), int(b) + 1))
        elif part:
            ports.add(int(part))
    ports = sorted(p for p in ports if 1 <= p <= 65535)
    if len(ports) > 1024:
        sys.exit("max 1024 ports per run")
    return ports

def probe(ip, port):
    try:
        with socket.create_connection((ip, port), timeout=0.8) as s:
            s.settimeout(0.6)
            try:
                banner = s.recv(80).decode("latin-1", "replace").strip().replace("\n", " ")
            except OSError:
                banner = ""
            return port, banner
    except OSError:
        return None

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    sys.exit("usage: tcp_scan.py HOST [PORTS]")
ip = require_scope(args[0])
ports = parse_ports(args[1] if len(args) > 1 else "21,22,23,25,53,80,110,139,143,443,445,631,993,995,1883,3306,3389,5432,5900,8000,8080,8443")
print("scanning %s (%d ports)" % (ip, len(ports)))
with cf.ThreadPoolExecutor(max_workers=64) as pool:
    hits = sorted(r for r in pool.map(lambda p: probe(ip, p), ports) if r)
for port, banner in hits:
    print("%5d/tcp open  %s" % (port, banner[:70]))
print("done: %d open" % len(hits))
`,
  },
  {
    id: "lan_discover",
    title: "کشف دستگاه‌های شبکهٔ محلی",
    level: "پایه",
    about: "ping چند آدرس از /24 خودت و خواندن جدول همسایه‌ها (ip neigh). فقط بازهٔ خصوصی.",
    args: "[192.168.1.0/24]  (خالی = شبکهٔ Wi‑Fi فعلی)",
    code: GUARD + String.raw`
import subprocess, concurrent.futures as cf

def local_cidr():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return str(ipaddress.ip_network(ip + "/24", strict=False))
    except OSError:
        return "192.168.1.0/24"

args = [a for a in sys.argv[1:] if not a.startswith("--")]
net = ipaddress.ip_network(args[0] if args else local_cidr(), strict=False)
if not (net.is_private or net.is_loopback or net.is_link_local) or net.num_addresses > 1024:
    sys.exit("refused: only private networks up to /22")
print("network:", net)

def ping(ip):
    r = subprocess.run(["ping", "-c", "1", "-W", "1", str(ip)], capture_output=True)
    return str(ip) if r.returncode == 0 else None

with cf.ThreadPoolExecutor(max_workers=48) as pool:
    alive = [x for x in pool.map(ping, net.hosts()) if x]
print("alive:", len(alive))
for ip in alive:
    print("  ", ip)
try:
    print("--- ip neigh ---")
    print(subprocess.run(["ip", "neigh"], capture_output=True, text=True).stdout.strip())
except OSError:
    pass
`,
  },
  {
    id: "http_headers",
    title: "ممیزی هدرهای امنیتی وب‌سایت",
    level: "پایه",
    about: "یک درخواست GET و بررسی هدرهای CSP، HSTS، X-Frame-Options، کوکی‌ها و افشای نسخهٔ سرور. برای سایت خودت.",
    args: "https://example.com --i-own-this",
    code: GUARD + String.raw`
import urllib.request, urllib.parse

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    sys.exit("usage: http_headers.py URL [--i-own-this]")
url = args[0]
host = urllib.parse.urlparse(url).hostname or sys.exit("bad URL")
require_scope(host, allow_public_flag=True)
req = urllib.request.Request(url, headers={"User-Agent": "CodePad-audit/1.0"})
try:
    resp = urllib.request.urlopen(req, timeout=10)
except Exception as e:
    sys.exit("request failed: %s" % e)
h = {k.lower(): v for k, v in resp.getheaders()}
print("status:", resp.status, "| final url:", resp.geturl())
checks = [
    ("strict-transport-security", "HSTS missing: browsers may use plain HTTP"),
    ("content-security-policy", "CSP missing: no script-injection mitigation"),
    ("x-content-type-options", "nosniff missing"),
    ("x-frame-options", "clickjacking protection missing (or use CSP frame-ancestors)"),
    ("referrer-policy", "Referrer-Policy missing"),
    ("permissions-policy", "Permissions-Policy missing"),
]
bad = 0
for name, msg in checks:
    if name in h:
        print("[ok]  %s: %s" % (name, h[name][:90]))
    else:
        bad += 1
        print("[!!]  " + msg)
for name in ("server", "x-powered-by", "x-aspnet-version"):
    if name in h:
        print("[info] %s discloses: %s" % (name, h[name]))
for c in resp.headers.get_all("set-cookie") or []:
    flags = c.lower()
    miss = [f for f in ("secure", "httponly", "samesite") if f not in flags]
    print("[cookie] %s -> %s" % (c.split("=")[0], ("missing " + ", ".join(miss)) if miss else "ok"))
print("summary: %d missing security headers" % bad)
`,
  },
  {
    id: "tls_check",
    title: "بررسی گواهی و پروتکل TLS",
    level: "پایه",
    about: "نسخهٔ TLS، رمز، صادرکننده و تاریخ انقضای گواهی یک سرور. برای سرویس خودت.",
    args: "host [port] --i-own-this",
    code: GUARD + String.raw`
import ssl, datetime

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    sys.exit("usage: tls_check.py HOST [PORT] [--i-own-this]")
host, port = args[0], int(args[1]) if len(args) > 1 else 443
ip = require_scope(host, allow_public_flag=True)
ctx = ssl.create_default_context()
try:
    with socket.create_connection((ip, port), timeout=8) as raw, ctx.wrap_socket(raw, server_hostname=host) as s:
        cert = s.getpeercert()
        print("protocol:", s.version(), "| cipher:", s.cipher()[0])
except ssl.SSLCertVerificationError as e:
    sys.exit("[!!] certificate verification failed: %s" % e)
except OSError as e:
    sys.exit("connection failed: %s" % e)
exp = datetime.datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z")
left = (exp - datetime.datetime.utcnow()).days
print("subject:", dict(x[0] for x in cert["subject"]).get("commonName"))
print("issuer :", dict(x[0] for x in cert["issuer"]).get("organizationName"))
print("expires:", exp.date(), "(%d days left)%s" % (left, "  [!!] renew soon" if left < 21 else ""))
print("SANs   :", ", ".join(v for k, v in cert.get("subjectAltName", ()))[:150])
`,
  },
  {
    id: "hash_audit",
    title: "ممیزی هش رمز (برای هش‌های خودت)",
    level: "میانی",
    about: "تشخیص نوع هش از روی طول/قالب و آزمون فهرست رمزهای ضعیف رایج روی هش‌های خودت. آموزش اینکه چرا MD5/SHA1 ساده برای رمز بد است.",
    args: "هش  [--wordlist فایل.txt]",
    code: String.raw`import hashlib, sys

TYPES = {32: "MD5 / NTLM", 40: "SHA-1", 56: "SHA-224", 64: "SHA-256", 96: "SHA-384", 128: "SHA-512"}
COMMON = ["123456", "password", "12345678", "qwerty", "abc123", "111111", "letmein", "admin", "welcome", "iloveyou", "123456789", "p@ssw0rd"]

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    sys.exit("usage: hash_audit.py HASH [--wordlist FILE]")
h = args[0].strip().lower()
if h.startswith(("$2a$", "$2b$", "$2y$")):
    sys.exit("bcrypt: slow adaptive hash, good choice. Not testable with fast hashes.")
if h.startswith(("$argon2", "$scrypt", "$pbkdf2")):
    sys.exit("memory-hard / iterated KDF: good choice.")
print("possible type:", TYPES.get(len(h), "unknown (len=%d)" % len(h)))
words = list(COMMON)
if "--wordlist" in sys.argv:
    path = sys.argv[sys.argv.index("--wordlist") + 1]
    words += [w.strip() for w in open(path, encoding="utf-8", errors="ignore")][:200000]
algos = [a for a in ("md5", "sha1", "sha224", "sha256", "sha384", "sha512") if hashlib.new(a).digest_size * 2 == len(h)]
for w in words:
    for a in algos:
        if hashlib.new(a, w.encode()).hexdigest() == h:
            print("[!!] WEAK: matches %s('%s')" % (a, w))
            sys.exit(0)
print("not found in %d candidate passwords. Unsalted fast hashes are still unsuitable for storing passwords; use bcrypt/argon2." % len(words))
`,
  },
  {
    id: "jwt_inspect",
    title: "بازرسی توکن JWT",
    level: "میانی",
    about: "رمزگشایی سرآیند و بار JWT (بدون اعتبارسنجی امضا) و هشدار دربارهٔ alg=none، نبود exp و انقضا.",
    args: "TOKEN",
    code: String.raw`import base64, json, sys, time

def b64(part):
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))

if len(sys.argv) < 2:
    sys.exit("usage: jwt_inspect.py TOKEN")
try:
    head, body, *_ = sys.argv[1].split(".")
    header, payload = b64(head), b64(body)
except Exception as e:
    sys.exit("not a JWT: %s" % e)
print("header :", json.dumps(header))
print("payload:", json.dumps(payload, ensure_ascii=False))
alg = str(header.get("alg", "")).lower()
if alg == "none":
    print("[!!] alg=none: token is unsigned; servers must reject it")
if alg.startswith("hs"):
    print("[info] HMAC signature: secret must be long and random; never put it in the client")
if "exp" not in payload:
    print("[!!] no exp claim: token never expires")
elif payload["exp"] < time.time():
    print("[info] expired", int(time.time() - payload["exp"]), "seconds ago")
for k in ("iss", "aud", "sub"):
    if k not in payload:
        print("[info] missing claim:", k)
`,
  },
];

export const CYBER_CHEATS = [
  {
    title: "nmap روی شبکهٔ خودت",
    lines: [
      "nmap -sn 192.168.1.0/24            کشف دستگاه‌ها",
      "nmap -sT -F 192.168.1.1            ۱۰۰ پورت رایج (بدون root)",
      "nmap -sT -sV -p 22,80,443 HOST     نسخهٔ سرویس‌ها",
      "nmap -sT --top-ports 1000 HOST     ۱۰۰۰ پورت پرکاربرد",
      "nmap -sT -T3 -oN out.txt HOST      ذخیرهٔ خروجی",
      "root لازم برای -sS و -O است؛ در Termux بدون root از -sT استفاده کن",
    ],
  },
  {
    title: "git (Termux)",
    lines: [
      "pkg install git                    نصب",
      "git clone URL                      دریافت مخزن",
      "git status / git diff              وضعیت و تغییرات",
      "git add -A && git commit -m 'msg'  ثبت",
      "git pull --rebase / git push       همگام‌سازی",
      "git log --oneline -n 10            تاریخچه",
      "git secrets / trufflehog           جست‌وجوی کلید لورفته در مخزن خودت",
    ],
  },
  {
    title: "پورت‌های رایج",
    lines: ["21 FTP · 22 SSH · 23 Telnet · 25 SMTP · 53 DNS · 80 HTTP · 110 POP3", "139/445 SMB · 443 HTTPS · 1883 MQTT · 3306 MySQL · 3389 RDP · 5432 PostgreSQL", "5900 VNC · 8080/8443 وب‌های جایگزین · 9100 چاپگر"],
  },
  {
    title: "OWASP Top 10 (۲۰۲۱)",
    lines: ["A01 کنترل دسترسی شکسته · A02 خطاهای رمزنگاری · A03 تزریق (SQL/XSS)", "A04 طراحی ناامن · A05 پیکربندی نادرست · A06 مؤلفهٔ قدیمی", "A07 احراز هویت ضعیف · A08 یکپارچگی داده/نرم‌افزار · A09 نبود لاگ و پایش · A10 SSRF"],
  },
  {
    title: "سخت‌سازی شبکهٔ خانه",
    lines: ["رمز پیش‌فرض مودم را عوض کن · WPS را خاموش کن · WPA2/WPA3 با رمز بلند", "فریم‌ور مودم را به‌روز کن · مدیریت از راه دور (WAN) را خاموش کن", "با nmap ببین چه سرویسی روی دستگاه‌هایت باز است و غیرلازم را ببند"],
  },
];
