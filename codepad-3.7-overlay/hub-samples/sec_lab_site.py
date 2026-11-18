# title: آزمایشگاه آسیب‌پذیر: سایت تمرین تست نفوذ (محلی)
# desc: یک سایت عمداً آسیب‌پذیر با ۲۲ مرحله (SQLi، XSS، IDOR، فروشگاه ارز الکی با دستکاری قیمت…) روی 127.0.0.1؛ به اینترنت وصل نیست
# cat: security
# level: 3
"""
CodePad Vuln Lab: سایت تمرینِ تست نفوذ روی دستگاه خودت
=======================================================
اجرا کن، بعد در مرورگر باز کن:  http://127.0.0.1:8088/
فقط به همین دستگاه (127.0.0.1) گوش می‌دهد؛ از شبکه یا اینترنت دیده نمی‌شود و خودش هم به اینترنت وصل نمی‌شود.
آسیب‌پذیری‌ها عمداً هستند و فقط روی همین آزمایشگاه مجازند. هیچ دستور واقعی سیستم‌عامل و هیچ فایل واقعی دستگاه
در دسترس حمله نیست (فایل‌ها و پوستهٔ این سایت شبیه‌سازی‌شده‌اند).
برای توقف، دکمهٔ Stop را بزن.
هر مرحله یک پرچم CP{...} دارد؛ پرچم را در صفحهٔ /flags ثبت کن. راهنما و راه‌حل هر مرحله در /hints/N و /walkthrough/N است.
مراحل ۱۵ تا ۲۲ یک «فروشگاه» با ارز الکی (CP-Coin، پول واقعی نیست) هستند: از دستکاری قیمت تا زنجیرهٔ کامل حمله.
"""
import base64
import hashlib
import html
import http.server
import json
import os
import posixpath
import random
import re
import socketserver
import sqlite3
import sys
import threading
import time
import urllib.parse
import urllib.request

HOST = "127.0.0.1"  # عمداً ثابت: این سایت آسیب‌پذیر است و هرگز نباید روی شبکه باز شود
PORT = int(os.environ.get("CP_LAB_PORT", "8088"))
PROGRESS_FILE = "cp_lab_progress.json"

# ───────────────────────── پرچم‌ها (برای هر نصب ثابت و منحصربه‌فرد) ─────────────────────────
LEVELS = [
    (1, "sqli-login", "SQL Injection: ورود بدون رمز", "/login", "ورود مدیر را بدون دانستن رمز دور بزن."),
    (2, "sqli-union", "SQL Injection (UNION): خواندن جدول کاربران", "/shop", "از جست‌وجوی فروشگاه، راز مدیر را از جدول users بیرون بکش."),
    (3, "xss-reflected", "XSS بازتابی", "/search?q=test", "کدی بساز که در صفحهٔ جست‌وجو اجرا شود و کوکی را بخواند."),
    (4, "xss-stored", "XSS ذخیره‌شده", "/guestbook", "نظری بگذار که برای هر بازدیدکننده اجرا شود."),
    (5, "idor", "IDOR: دسترسی به یادداشت دیگران", "/notes?id=1", "یادداشت مدیر را ببین؛ یادداشت‌ها به شناسه شماره‌گذاری شده‌اند."),
    (6, "traversal", "پیمایش مسیر (Path Traversal)", "/download?file=report.txt", "از پوشهٔ عمومی بیرون برو و فایل خصوصی را بخوان."),
    (7, "cookie", "کوکی دستکاری‌پذیر", "/admin", "نقش خودت را در کوکی عوض کن."),
    (8, "bruteforce", "حدس رمز + هش ضعیف", "/robots.txt", "فایل‌های فراموش‌شده را پیدا کن، هش را بشکن، با حساب علی وارد شو."),
    (9, "open-redirect", "Open Redirect", "/go?url=/", "ببر کاربر را به آدرس بیرونی."),
    (10, "cmdi", "تزریق فرمان (شبیه‌سازی‌شده)", "/tools/ping?host=127.0.0.1", "پشت ping یک فرمان دیگر اجرا کن؛ پوسته شبیه‌سازی‌شده است."),
    (11, "ssrf", "SSRF: سرور را وادار کن به خودش درخواست بدهد", "/fetch?url=", "به سرویس داخلی که فقط خود سرور به آن دسترسی دارد برس."),
    (12, "upload", "آپلود ناامن", "/upload", "فایل .php آپلود کن؛ بررسی فقط در مرورگر است."),
    (13, "debug", "پیکربندی نادرست: صفحهٔ دیباگ", "/robots.txt", "مسیرهای پنهان را جست‌وجو کن."),
    (14, "csrf", "CSRF: تغییر وضعیت با GET", "/bank", "کاری کن که حساب مهاجم ۵۰۰ واحد پول بگیرد."),
    # ── فروشگاه CP-Coin (ارز الکی، پول واقعی نیست): خیلی‌خیلی‌ساده ← خیلی‌خیلی‌سخت ──
    (15, "store-idor-wallet", "فروشگاه ۱ · خیلی‌خیلی‌ساده: افشای موجودی هرکس", "/store", "موجودی کیف‌پول یک کاربر دیگر (نه خودت) را بدون ورود ببین."),
    (16, "store-price-tamper", "فروشگاه ۲ · ساده: دستکاری قیمت", "/store", "یک کالا را با قیمتی کمتر از قیمت واقعی‌اش در فروشگاه بخر."),
    (17, "store-coupon-brute", "فروشگاه ۳ · متوسط: حدس کد تخفیف با اسکریپت", "/store", "یک کد تخفیف ۴ رقمی پنهان هست؛ با اسکریپت همهٔ حالت‌ها را امتحان کن."),
    (18, "store-coupon-race", "فروشگاه ۴ · متوسط‌به‌سخت: مسابقهٔ هم‌زمانی (Race Condition)", "/store", "یک کد تخفیف «فقط یک‌بار مصرف» را با درخواست‌های هم‌زمان بیشتر از یک‌بار مصرف کن."),
    (19, "store-idor-order", "فروشگاه ۵ · سخت: دستکاری سفارش دیگران (IDOR)", "/store", "سفارش در-انتظار یک کاربر دیگر را بدون پرداخت، «پرداخت‌شده» کن."),
    (20, "store-negative-qty", "فروشگاه ۶ · سخت: تعداد منفی", "/store", "با تعداد خرید منفی، به‌جای کم‌شدن، موجودی کیف‌پولت را زیاد کن."),
    (21, "store-coupon-forge", "فروشگاه ۷ · خیلی‌سخت: جعل امضای کوپن مدیر", "/store", "با کلیدی که از جای دیگری لو رفته، یک کد تخفیف ۱۰۰٪ امضاشدهٔ مدیر بساز."),
    (22, "store-full-chain", "فروشگاه ۸ · خیلی‌خیلی‌سخت: زنجیرهٔ کامل حمله", "/store", "کالای ویژهٔ انحصاری را با ترکیب چند آسیب‌پذیری بالا، با هزینهٔ واقعی ناچیز بخر."),
]


def load_flags():
    data = {}
    try:
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = {}
    if "flags" not in data or set(data["flags"]) != {str(n) for n, *_ in LEVELS}:
        rnd = random.SystemRandom()
        data = {"flags": {str(n): "CP{%s_%06x}" % (slug.replace("-", "_"), rnd.randrange(16**6)) for n, slug, *_ in LEVELS}, "solved": []}
    return data


STATE = load_flags()
FLAGS = STATE["flags"]
LOCK = threading.Lock()


def save_state():
    try:
        with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
            json.dump(STATE, f, ensure_ascii=False)
    except Exception:
        pass


save_state()

# ───────────────────────── دادهٔ مجازی ─────────────────────────
md5 = lambda s: hashlib.md5(s.encode()).hexdigest()  # noqa: E731 (ضعف عمدی: هش بدون salt)

DB = sqlite3.connect(":memory:", check_same_thread=False)
DB.executescript(
    """
CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT, email TEXT, secret TEXT);
CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT, price INTEGER, description TEXT);
CREATE TABLE notes(id INTEGER PRIMARY KEY, owner TEXT, body TEXT);
"""
)
ADMIN_PW = "S3cr3t-%06x" % random.SystemRandom().randrange(16**6)
DB.executemany(
    "INSERT INTO users VALUES(?,?,?,?,?,?)",
    [
        (1, "admin", md5(ADMIN_PW), "admin", "admin@lab.local", FLAGS["2"]),
        (2, "ali", md5("sunshine"), "user", "ali@lab.local", "ali-secret"),
        (3, "sara", md5("Pa55w0rd!x9"), "user", "sara@lab.local", "sara-secret"),
        (4, "guest", md5("guest"), "user", "guest@lab.local", "nothing"),
    ],
)
DB.executemany(
    "INSERT INTO products VALUES(?,?,?,?)",
    [
        (1, "کیبورد مکانیکی", 1200, "سوییچ آبی، نور RGB"),
        (2, "ماوس بی‌سیم", 650, "دقت بالا، شارژی"),
        (3, "هدفون", 900, "حذف نویز"),
        (4, "کابل شبکه", 90, "Cat6، ۲ متر"),
        (5, "فلش ۶۴ گیگ", 300, "USB 3"),
    ],
)
DB.executemany(
    "INSERT INTO notes VALUES(?,?,?)",
    [
        (1, "guest", "به آزمایشگاه خوش آمدی! این یادداشت من است."),
        (2, "ali", "یادم باشه برای تولد سارا کادو بخرم."),
        (3, "sara", "رمز وای‌فای مهمان: Welcome2024"),
        (4, "ali", "قرار ملاقات: چهارشنبه ساعت ۱۰"),
        (5, "sara", "لیست خرید: نان، شیر، تخم‌مرغ"),
        (6, "admin", "یادآوری: گزارش ماهانه را امروز بفرست."),
        (7, "admin", "پرچم مدیر: " + FLAGS["5"]),
    ],
)

COMMENTS = [("مدیر", "به دفتر مهمان سایت ما خوش آمدید 👋")]
BANK = {"guest": 1000, "mallory": 0}
UPLOADS = {}

# ───────────────────────── فروشگاه CP-Coin (مراحل ۱۵–۲۲؛ ارز کاملاً الکی، پول واقعی نیست) ─────────────────────────
COINS = {"guest": 50, "mallory": 5, "admin": 1_000_000}
STORE_PRODUCTS = {
    1: {"name": "تی‌شرت CodePad", "price": 25, "stock": 50},
    2: {"name": "ماگ CodePad", "price": 15, "stock": 50},
    3: {"name": "کول‌تاپ لپ‌تاپ طلاییِ نسخهٔ محدود", "price": 999999, "stock": 1},  # هدف مرحلهٔ ۲۲
}
# کد تخفیف پنهان ۴ رقمی (مرحلهٔ ۱۷): هیچ‌جا نشان داده نمی‌شود، باید با اسکریپت حدس زده شود
STORE_HIDDEN_COUPON = os.environ.get("CP_LAB_TEST_COUPON") or "%04d" % (random.SystemRandom().randrange(10000))
COUPONS = {
    "WELCOME10": {"pct": 10, "uses_left": None, "used": 0},
    STORE_HIDDEN_COUPON: {"pct": 90, "uses_left": None, "used": 0},
    "VIP-ONE-TIME": {"pct": 50, "uses_left": 1, "used": 0},  # مرحلهٔ ۱۸: یک‌بارمصرف ولی چک/کاهش اتمیک نیست
}
COUPON_LOCK = threading.Lock()
STORE_ORDERS = {1: {"id": 1, "user": "admin", "product_id": 1, "qty": 1, "paid_amount": 25, "status": "pending"}}  # سفارشِ در-انتظارِ مدیر (هدف مرحلهٔ ۱۹)
STORE_ORDER_SEQ = [2]


def store_new_order(user, product_id, qty, paid_amount, status):
    with LOCK:
        oid = STORE_ORDER_SEQ[0]
        STORE_ORDER_SEQ[0] += 1
    STORE_ORDERS[oid] = {"id": oid, "user": user, "product_id": product_id, "qty": qty, "paid_amount": paid_amount, "status": status}
    return oid
# فایل‌های «سرور» شبیه‌سازی‌شده؛ هیچ فایل واقعی دستگاه خوانده نمی‌شود
VFS = {
    "/srv/lab/public/report.txt": "گزارش فروش ماه: ۱۲۴ سفارش. همه‌چیز عادی است.",
    "/srv/lab/public/about.txt": "CodePad Lab: فروشگاه آموزشی.",
    "/srv/lab/private/flag.txt": FLAGS["6"] + "\n",
    "/srv/lab/secret/flag.txt": FLAGS["10"] + "\n",
    "/etc/passwd": "root:x:0:0:root:/root:/bin/sh\nlab:x:1000:1000::/srv/lab:/bin/sh\n",
}
BACKUP_SQL = "-- backup قدیمی (نباید اینجا می‌بود!)\n" + "\n".join(
    "INSERT INTO users(username,password) VALUES('%s','%s');" % (u, p)
    for u, p in DB.execute("SELECT username, password FROM users").fetchall()
)
STORE_SIGN_KEY = "dev-key-123"  # ضعف عمدی: همان کلیدی که در /debug لو می‌رود، برای امضای کوپن مدیر هم استفاده شده (مرحلهٔ ۲۱)
DEBUG_INFO = {"app": "CodePad Lab", "debug": True, "secret_key": STORE_SIGN_KEY, "flag": FLAGS["13"], "python": sys.version.split()[0]}


def store_sign(code):
    import hmac as _hmac

    return _hmac.new(STORE_SIGN_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()[:8]


# ───────────────────────── کمک‌ها ─────────────────────────
STYLE = """
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:15px/1.8 Vazirmatn,Tahoma,system-ui,sans-serif;background:#04100c;color:#d6fff0}
header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 18px;border-bottom:1px solid #0f4a35;background:#020807}
header b{color:#00ff9c;letter-spacing:.12em;font-family:monospace}nav a{margin-inline-end:12px;color:#9ad8c0;text-decoration:none}nav a:hover{color:#00ff9c}
main{max-width:860px;margin:0 auto;padding:18px}h1,h2{color:#00ff9c}a{color:#19e6ff}
input,textarea,select,button{font:inherit;padding:8px 12px;border:1px solid #1f7a58;border-radius:8px;background:#082019;color:#d6fff0}
button,.btn{background:#00ff9c;color:#00160d;border:0;font-weight:700;cursor:pointer;display:inline-block;text-decoration:none;padding:8px 14px;border-radius:8px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #0f4a35;padding:6px 10px;text-align:start}
.card{border:1px solid #0f4a35;border-radius:12px;padding:12px 16px;margin:10px 0;background:#04100c}
.ok{color:#00ff9c}.bad{color:#ff3b6b}.muted{color:#6fb59a}code,pre{background:#082019;padding:2px 6px;border-radius:6px;direction:ltr;unicode-bidi:plaintext;word-break:break-all}
pre{padding:10px;white-space:pre-wrap}.warn{border:1px solid #6a5a1a;color:#ffd23f;padding:8px 12px;border-radius:8px}
</style>
"""
NAV = [("/", "خانه"), ("/shop", "جست‌وجوی فروشگاه"), ("/login", "ورود"), ("/guestbook", "دفتر مهمان"), ("/notes?id=1", "یادداشت‌ها"), ("/tools/ping?host=127.0.0.1", "ابزار"), ("/upload", "آپلود"), ("/bank", "بانک"), ("/store", "🛒 فروشگاه CP-Coin"), ("/flags", "🚩 پرچم‌ها")]


def page(title, body, status=200):
    nav = "".join('<a href="%s">%s</a>' % (u, t) for u, t in NAV)
    doc = (
        '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>%s · CodePad Lab</title>%s</head><body><header><b>CODEPAD LAB</b><nav>%s</nav></header><main>%s</main></body></html>" % (html.escape(title), STYLE, nav, body)
    )
    return status, "text/html; charset=utf-8", doc.encode("utf-8"), {}


def parse_cookies(header):
    out = {}
    for part in (header or "").split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            out[k] = v
    return out


def award(n):
    with LOCK:
        if n not in STATE["solved"]:
            STATE["solved"].append(n)
            save_state()


def session_user(cookies):
    """کوکی نشست: base64(JSON) بدون امضا؛ ضعف عمدی (مرحلهٔ ۷)."""
    raw = cookies.get("session", "")
    try:
        return json.loads(base64.b64decode(raw + "=" * (-len(raw) % 4)).decode())
    except Exception:
        return {"user": "guest", "role": "user"}


def new_session(user, role):
    return base64.b64encode(json.dumps({"user": user, "role": role}, separators=(",", ":")).encode()).decode().rstrip("=")


# شبیه‌ساز پوستهٔ مرحلهٔ ۱۰ (هرگز فرمان واقعی اجرا نمی‌شود)
def fake_shell(cmdline):
    out = []
    for cmd in re.split(r"\s*(?:;|&&|\|\||\||\n)\s*", cmdline):
        cmd = cmd.strip()
        if not cmd:
            continue
        parts = cmd.split()
        if parts[0] == "whoami":
            out.append("lab")
        elif parts[0] == "id":
            out.append("uid=1000(lab) gid=1000(lab)")
        elif parts[0] == "pwd":
            out.append("/srv/lab/public")
        elif parts[0] == "ls":
            path = parts[1] if len(parts) > 1 else "/srv/lab/public"
            names = sorted({p[len(path.rstrip("/")) + 1 :].split("/")[0] for p in VFS if p.startswith(path.rstrip("/") + "/")})
            out.append("\n".join(names) if names else "ls: cannot access '%s'" % path)
        elif parts[0] == "cat" and len(parts) > 1:
            out.append(VFS.get(posixpath.normpath("/" + parts[1].lstrip("/")), "cat: %s: No such file" % parts[1]).rstrip("\n"))
        elif parts[0] == "ping":
            out.append("PING %s: 64 bytes, time=0.04 ms (شبیه‌سازی‌شده)" % (parts[1] if len(parts) > 1 else ""))
        else:
            out.append("sh: %s: command not found (پوستهٔ شبیه‌سازی‌شده فقط whoami/id/pwd/ls/cat/ping را بلد است)" % parts[0])
    return "\n".join(out)


# ───────────────────────── مسیرها ─────────────────────────
def home(h):
    solved = set(STATE["solved"])
    rows = "".join(
        '<tr><td>%d</td><td><a href="%s">%s</a></td><td class="%s">%s</td><td><a href="/hints/%d">راهنما</a> · <a href="/walkthrough/%d">راه‌حل</a></td></tr>'
        % (n, url, html.escape(title), "ok" if n in solved else "muted", "✔ حل شد" if n in solved else "—", n, n)
        for n, slug, title, url, goal in LEVELS
    )
    body = (
        "<h1>آزمایشگاه تست نفوذ CodePad</h1>"
        '<div class="warn">⚠ این سایت عمداً آسیب‌پذیر است و فقط روی دستگاه تو (127.0.0.1) اجرا می‌شود. هرگز آن را روی اینترنت یا شبکه باز نکن.</div>'
        "<p>هدف: در هر مرحله آسیب‌پذیری را پیدا و بهره‌برداری کن تا پرچم <code>CP{...}</code> را بگیری و در <a href=\"/flags\">صفحهٔ پرچم‌ها</a> ثبت کنی. "
        "اول خودت امتحان کن؛ فقط وقتی گیر کردی راهنما را باز کن.</p>"
        "<p>پیشرفت: <b>%d / %d</b></p><table><tr><th>#</th><th>مرحله</th><th>وضعیت</th><th>کمک</th></tr>%s</table>" % (len(solved), len(LEVELS), rows)
    )
    return page("خانه", body)


def route_shop(h, q):
    term = q.get("q", [""])[0]
    # SQLi (مرحلهٔ ۲): ورودی مستقیم داخل پرسوجو
    sql = "SELECT id, name, price, description FROM products WHERE name LIKE '%" + term + "%'"
    msg = ""
    rows = []
    try:
        rows = DB.execute(sql).fetchall()
    except Exception as e:
        msg = '<p class="bad">خطای پایگاه داده: %s</p>' % html.escape(str(e))
    cells = "".join("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % tuple(html.escape(str(x)) for x in r) for r in rows)
    body = (
        "<h1>فروشگاه</h1><form><input name=\"q\" placeholder=\"جست‌وجوی محصول\" value=\"%s\"> <button>جست‌وجو</button></form>%s"
        "<table><tr><th>#</th><th>نام</th><th>قیمت</th><th>توضیح</th></tr>%s</table>"
        % (html.escape(term, quote=True), msg, cells)
    )
    return page("فروشگاه", body)


def route_login(h, method, form, cookies):
    msg = ""
    cookie = {}
    if method == "POST":
        u, p = form.get("username", ""), form.get("password", "")
        # SQLi (مرحلهٔ ۱): نام کاربری مستقیم داخل پرسوجو می‌رود؛ رمز با MD5 بدون salt هش می‌شود (مرحلهٔ ۸)
        sql = "SELECT username, role FROM users WHERE username = '%s' AND password = '%s'" % (u, md5(p))
        try:
            row = DB.execute(sql).fetchone()
        except Exception as e:
            row = None
            msg = '<p class="bad">خطای SQL: %s</p>' % html.escape(str(e))
        if row:
            user, role = row
            cookie["Set-Cookie"] = "session=%s; Path=/" % new_session(user, role)
            if role == "admin":
                award(1)
                msg = '<p class="ok">خوش آمدی مدیر! 🚩 %s</p>' % FLAGS["1"]
            elif user == "ali":
                award(8)
                msg = '<p class="ok">ورود موفق به‌عنوان علی. 🚩 %s</p>' % FLAGS["8"]
            else:
                msg = '<p class="ok">ورود موفق: %s</p>' % html.escape(user)
        elif not msg:
            msg = '<p class="bad">نام کاربری یا رمز اشتباه است.</p>'
    body = "<h1>ورود</h1>%s<form method=\"post\"><p><input name=\"username\" placeholder=\"نام کاربری\"></p><p><input name=\"password\" type=\"password\" placeholder=\"رمز\"></p><button>ورود</button></form><p class=\"muted\">کاربران نمونه: guest / guest</p>" % msg
    status, ctype, data, extra = page("ورود", body)
    extra.update(cookie)
    return status, ctype, data, extra


def route_search(h, q):
    term = q.get("q", [""])[0]
    # XSS بازتابی (مرحلهٔ ۳): خروجی بدون escape. پرچم در کوکی غیر HttpOnly است
    body = "<h1>نتیجهٔ جست‌وجو</h1><p>برای: <b>%s</b></p><p class=\"muted\">۰ نتیجه</p><form><input name=\"q\"> <button>جست‌وجو</button></form>" % term
    status, ctype, data, extra = page("جست‌وجو", body)
    extra["Set-Cookie"] = "lab_flag=%s; Path=/" % FLAGS["3"]
    if "<script" in term.lower() or "onerror" in term.lower() or "onload" in term.lower() or "javascript:" in term.lower():
        award(3)
    return status, ctype, data, extra


def route_guestbook(h, method, form):
    if method == "POST":
        COMMENTS.append((form.get("name", "ناشناس")[:40], form.get("body", "")[:500]))
    items = "".join('<div class="card"><b>%s</b><div>%s</div></div>' % (n, b) for n, b in COMMENTS)  # XSS ذخیره‌شده (مرحلهٔ ۴)
    body = (
        "<h1>دفتر مهمان</h1>%s<form method=\"post\"><p><input name=\"name\" placeholder=\"نام\"></p><p><textarea name=\"body\" rows=\"3\" placeholder=\"نظر شما\"></textarea></p><button>ارسال</button></form>"
        "<form method=\"post\" action=\"/guestbook/clear\"><button>پاک‌کردن همهٔ نظرها</button></form>" % items
    )
    status, ctype, data, extra = page("دفتر مهمان", body)
    extra["Set-Cookie"] = "guest_flag=%s; Path=/" % FLAGS["4"]
    if any(re.search(r"<script|onerror=|onload=|<svg|<img", b, re.I) for _, b in COMMENTS):
        award(4)
    return status, ctype, data, extra


def route_notes(h, q):
    nid = q.get("id", ["1"])[0]
    # IDOR (مرحلهٔ ۵): هیچ بررسی مالکیتی نیست
    try:
        row = DB.execute("SELECT id, owner, body FROM notes WHERE id = ?", (int(nid),)).fetchone()
    except ValueError:
        row = None
    if row and row[1] == "admin" and FLAGS["5"] in row[2]:
        award(5)
    cur = '<p class="muted">شما به‌عنوان <b>guest</b> وارد شده‌اید.</p>'
    if row:
        note = '<div class="card"><b>یادداشت #%d</b> (مالک: %s)<p>%s</p></div>' % (row[0], html.escape(row[1]), html.escape(row[2]))
    else:
        note = '<p class="bad">یادداشتی با این شناسه نیست.</p>'
    return page("یادداشت‌ها", "<h1>یادداشت‌های من</h1>%s%s<p>یادداشت‌های من: <a href=\"/notes?id=1\">#1</a></p>" % (cur, note))


def route_download(h, q):
    name = q.get("file", ["report.txt"])[0]
    # پیمایش مسیر (مرحلهٔ ۶): فیلتر ضعیف که فقط یک‌بار "../" را حذف می‌کند
    cleaned = name.replace("../", "")
    path = posixpath.normpath("/srv/lab/public/" + cleaned)
    data = VFS.get(path)
    if data is None:
        return 404, "text/plain; charset=utf-8", ("پیدا نشد: %s" % path).encode(), {}
    if path.endswith("private/flag.txt"):
        award(6)
    return 200, "text/plain; charset=utf-8", data.encode("utf-8"), {}


def route_admin(h, cookies):
    s = session_user(cookies)
    if s.get("role") == "admin":
        award(7)
        return page("مدیریت", '<h1>پنل مدیریت</h1><p class="ok">🚩 %s</p>' % FLAGS["7"])
    return page("مدیریت", '<h1>دسترسی ممنوع</h1><p class="bad">فقط مدیر. شما: <code>%s</code></p><p class="muted">کوکی نشست شما چیست؟</p>' % html.escape(json.dumps(s)), 403)


def route_go(h, q):
    url = q.get("url", ["/"])[0]
    # Open Redirect (مرحلهٔ ۹)
    extra = {"Location": url}
    host = urllib.parse.urlparse(url).netloc
    if host and host not in ("127.0.0.1:%d" % PORT, "localhost:%d" % PORT):
        extra["X-Flag"] = FLAGS["9"]
        award(9)
        body = ("<p>در حال انتقال به %s … 🚩 %s</p>" % (html.escape(url), FLAGS["9"])).encode()
        return 302, "text/html; charset=utf-8", body, extra
    return 302, "text/html; charset=utf-8", b"redirect", extra


def route_ping(h, q):
    host = q.get("host", ["127.0.0.1"])[0]
    # تزریق فرمان (مرحلهٔ ۱۰): ولی فقط به پوستهٔ شبیه‌سازی‌شده می‌رود
    out = fake_shell("ping " + host)
    if FLAGS["10"] in out:
        award(10)
    return page("ابزار ping", "<h1>ابزار شبکه</h1><form><input name=\"host\" value=\"%s\"> <button>ping</button></form><pre>%s</pre><p class=\"muted\">پوستهٔ این صفحه شبیه‌سازی‌شده است؛ فرمان واقعی اجرا نمی‌شود.</p>" % (html.escape(host, quote=True), html.escape(out)))


def route_fetch(h, q):
    url = q.get("url", [""])[0]
    if not url:
        return page("fetch", '<h1>دریافت تصویر از آدرس</h1><form><input name="url" size="40" placeholder="http://..."> <button>دریافت</button></form><p class="muted">برای امنیت، فقط به همین سرور اجازهٔ دریافت داده می‌شود.</p>')
    p = urllib.parse.urlparse(url)
    # SSRF (مرحلهٔ ۱۱): فقط به خودِ آزمایشگاه (loopback) اجازه می‌دهد؛ به اینترنت هرگز درخواست نمی‌فرستد
    if p.scheme != "http" or p.hostname not in ("127.0.0.1", "localhost") or p.port != PORT:
        return page("fetch", '<h1>دریافت تصویر</h1><p class="bad">این آدرس مجاز نیست (آزمایشگاه به اینترنت وصل نمی‌شود).</p>', 400)
    req = urllib.request.Request(url, headers={"X-Lab-Internal": "1"})
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            body = r.read(20000).decode("utf-8", "replace")
    except Exception as e:
        body = "خطا: %s" % e
    return page("fetch", "<h1>پاسخ سرور</h1><pre>%s</pre>" % html.escape(body))


def route_internal(h):
    if h.headers.get("X-Lab-Internal") != "1":
        return 403, "text/plain; charset=utf-8", "فقط از داخل سرور".encode(), {}
    award(11)
    return 200, "text/plain; charset=utf-8", ("پنل داخلی. " + FLAGS["11"]).encode(), {}


def route_upload(h, method, form_raw):
    msg = ""
    if method == "POST":
        try:
            data = json.loads(form_raw.decode("utf-8", "replace"))
            name, content = str(data.get("name", ""))[:80], str(data.get("content", ""))[:20000]
        except Exception:
            name, content = "", ""
        safe = posixpath.basename(name.replace("\\", "/"))
        # آپلود ناامن (مرحلهٔ ۱۲): سرور هیچ بررسی‌ای ندارد؛ فقط جاوااسکریپت صفحه پسوند را چک می‌کند
        if safe:
            UPLOADS[safe] = content
            msg = '<p class="ok">ذخیره شد: <a href="/uploads/%s">/uploads/%s</a></p>' % (urllib.parse.quote(safe), html.escape(safe))
            if safe.lower().endswith((".php", ".jsp", ".phtml", ".aspx")):
                award(12)
                msg += '<p class="ok">🚩 %s (سرور واقعی این فایل را اجرا می‌کرد!)</p>' % FLAGS["12"]
    body = (
        "<h1>آپلود تصویر پروفایل</h1>%s<p>فقط .png و .jpg پذیرفته می‌شود (!)</p><input id=\"f\" type=\"file\"> <button onclick=\"up()\">ارسال</button><pre id=\"o\"></pre>"
        "<script>async function up(){const f=document.getElementById('f').files[0];if(!f)return;"
        "if(!/\\.(png|jpe?g)$/i.test(f.name)){document.getElementById('o').textContent='فقط png/jpg';return}"
        "const r=await fetch('/upload',{method:'POST',body:JSON.stringify({name:f.name,content:await f.text()})});document.open();document.write(await r.text());document.close()}</script>" % msg
    )
    return page("آپلود", body)


def route_bank(h, q, cookies):
    amount = q.get("amount", [None])[0]
    to = q.get("to", [None])[0]
    note = ""
    if to and amount:  # CSRF (مرحلهٔ ۱۴): تغییر وضعیت با GET، بدون توکن
        try:
            amt = int(amount)
        except ValueError:
            amt = 0
        if 0 < amt <= BANK["guest"] and to in BANK:
            BANK["guest"] -= amt
            BANK[to] += amt
            note = '<p class="ok">%d واحد به %s منتقل شد.</p>' % (amt, html.escape(to))
    flag = ""
    if BANK["mallory"] >= 500:
        award(14)
        flag = '<p class="ok">🚩 %s</p>' % FLAGS["14"]
    body = "<h1>بانک</h1>%s<p>حساب شما (guest): <b>%d</b><br>حساب mallory (مهاجم): <b>%d</b></p>%s<p class=\"muted\">شما با کوکی نشست وارد شده‌اید؛ مرورگر هر درخواست به این سایت را با کوکی می‌فرستد.</p>" % (note, BANK["guest"], BANK["mallory"], flag)
    return page("بانک", body)


def route_store(h, cookies):
    s = session_user(cookies)
    me = s.get("user", "guest")
    bal = COINS.get(me, 0)
    rows = "".join('<tr><td>%d</td><td>%s</td><td>%d</td><td>%d</td></tr>' % (pid, html.escape(p["name"]), p["price"], p["stock"]) for pid, p in sorted(STORE_PRODUCTS.items()))
    body = (
        "<h1>🛒 فروشگاه CP-Coin</h1>"
        '<div class="warn">این فروشگاه یک ارز کاملاً الکیِ داخلی به‌نام <b>CP-Coin</b> دارد؛ پول واقعی نیست و هیچ تراکنش واقعی انجام نمی‌شود. هدف: با کد (نه کلیک‌کردن) آسیب‌پذیری‌های خرید را پیدا کنی.</div>'
        '<p>شما (<b>%s</b>) اکنون <b>%d</b> CP-Coin دارید. سفارش شمارهٔ <code>1</code> یک سفارشِ در-انتظارِ مدیر است (کالای #1).</p>'
        "<table><tr><th>#</th><th>کالا</th><th>قیمت (CP-Coin)</th><th>موجودی</th></tr>%s</table>"
        "<h2>خرید</h2>"
        '<form method="post" action="/store/buy"><p>شناسهٔ کالا: <input name="product_id" value="1" size="4"> '
        'تعداد: <input name="qty" value="1" size="4"> قیمت واحد (اگر خالی بماند، قیمت واقعی کاتالوگ است): <input name="price" size="8" placeholder="اختیاری"></p>'
        '<p>کد تخفیف (اختیاری): <input name="coupon" placeholder="کد یا CODE.SIG"></p><button>خرید</button></form>'
        "<h2>بررسی/استفادهٔ کد تخفیف</h2>"
        '<form method="post" action="/store/redeem"><input name="code" placeholder="کد تخفیف"> <button>استفاده</button></form>'
        "<h2>کیف‌پول یک کاربر</h2>"
        '<form action="/store/wallet"><input name="user" value="admin"> <button>نمایش موجودی</button></form>'
        '<p class="muted">کاربران نمونه: guest · mallory · admin</p>'
    ) % (html.escape(me), bal, rows)
    return page("فروشگاه", body)


def route_store_wallet(h, q):
    user = q.get("user", ["guest"])[0]
    bal = COINS.get(user)
    if bal is None:
        return page("کیف‌پول", '<h1>کیف‌پول</h1><p class="bad">چنین کاربری نیست.</p>', 404)
    flag = ""
    if user != "guest":
        award(15)
        flag = '<p class="ok">🚩 %s</p>' % FLAGS["15"]
    body = "<h1>کیف‌پول: %s</h1><p>موجودی: <b>%d</b> CP-Coin</p>%s<p class=\"muted\">این صفحه بدون ورود، موجودی هر کاربری را نشان می‌دهد؛ هیچ بررسی هویتی ندارد.</p>" % (html.escape(user), bal, flag)
    return page("کیف‌پول", body)


def route_store_buy(h, method, form, cookies):
    if method != "POST":
        return page("خرید", "<h1>خرید</h1><p class=\"bad\">با POST بخر.</p>", 405)
    s = session_user(cookies)
    me = s.get("user", "guest")
    try:
        pid = int(form.get("product_id", "0"))
    except ValueError:
        pid = 0
    try:
        qty = int(form.get("qty", "1"))
    except ValueError:
        qty = 1
    product = STORE_PRODUCTS.get(pid)
    if not product:
        return page("خرید", "<h1>خرید</h1><p class=\"bad\">کالا پیدا نشد.</p>", 404)

    # دستکاری قیمت (مرحلهٔ ۱۶): سرور به‌جای خواندن قیمت از کاتالوگ، فیلد price را که کلاینت فرستاده باور می‌کند
    client_price = (form.get("price") or "").strip()
    unit_price = product["price"]
    tampered = False
    if client_price:
        try:
            unit_price = int(client_price)
            tampered = True
        except ValueError:
            pass

    # کد تخفیف: فقط خوانده می‌شود (مصرف/شمارنده در /store/redeem است)
    coupon = (form.get("coupon") or "").strip()
    pct = 0
    if coupon:
        if "." in coupon:
            code, _, sig = coupon.rpartition(".")
            if sig and code and sig == store_sign(code):
                pct = 100
                award(21)
        elif coupon in COUPONS:
            pct = COUPONS[coupon]["pct"]

    # تعداد منفی (مرحلهٔ ۲۰): qty منفی یعنی cost منفی یعنی موجودی به‌جای کم‌شدن زیاد می‌شود
    cost = unit_price * qty
    if pct:
        cost = cost * (100 - pct) // 100
    flag_bits = []
    if qty < 0:
        award(20)
        flag_bits.append('<p class="ok">🚩 %s</p>' % FLAGS["20"])
    if tampered and qty > 0 and cost < product["price"] * qty:
        award(16)
        flag_bits.append('<p class="ok">🚩 %s</p>' % FLAGS["16"])
    if pct == 100 and "." in coupon:
        flag_bits.append('<p class="ok">🚩 %s (با کوپن جعلی‌ات خرید کردی)</p>' % FLAGS["21"])

    bal_before = COINS.get(me, 0)
    COINS[me] = bal_before - cost
    oid = store_new_order(me, pid, qty, cost, "paid")

    note = "<p>سفارش #%d ثبت شد: %d عدد «%s» به قیمت واحد %d (%s) ← جمع %d CP-Coin. موجودی جدید شما: %d</p>%s" % (
        oid, qty, html.escape(product["name"]), unit_price, ("کوپن %d%% تخفیف" % pct if pct else "بدون کوپن"), cost, COINS[me], "".join(flag_bits)
    )
    if coupon and not pct:
        note += '<p class="bad">کد تخفیف نامعتبر بود؛ بدون تخفیف حساب شد.</p>'
    body = "<h1>نتیجهٔ خرید</h1>%s<p><a href=\"/store\">بازگشت به فروشگاه</a> · <a href=\"/store/order/%d/mark-paid\">سفارش #%d</a></p>" % (note, oid, oid)
    return page("خرید", body)


def route_store_redeem(h, method, form):
    if method != "POST":
        return page("کد تخفیف", '<h1>کد تخفیف</h1><form method="post"><input name="code" placeholder="کد تخفیف"> <button>استفاده</button></form><p class="muted">بدون محدودیت تعداد تلاش؛ هیچ کدی اینجا نشان داده نمی‌شود.</p>')
    coupon = (form.get("code") or "").strip()
    if not coupon:
        return page("کد تخفیف", '<h1>کد تخفیف</h1><p class="bad">کدی وارد نشد.</p>')
    if "." in coupon:
        # کد امضاشدهٔ مدیر (مرحلهٔ ۲۱): CODE.SIG با کلیدی که از /debug لو می‌رود
        code, _, sig = coupon.rpartition(".")
        if sig and code and sig == store_sign(code):
            award(21)
            return page("کد تخفیف", '<h1>کد تخفیف</h1><p class="ok">کد مدیرِ ۱۰۰٪ تخفیف معتبر است! 🚩 %s</p><p>همین کد را هنگام خرید در فیلد «کد تخفیف» بگذار: <code>%s</code></p>' % (FLAGS["21"], html.escape(coupon)))
        return page("کد تخفیف", '<h1>کد تخفیف</h1><p class="bad">امضای کد نامعتبر است.</p>')
    c = COUPONS.get(coupon)
    if not c:
        return page("کد تخفیف", '<h1>کد تخفیف</h1><p class="bad">کد نامعتبر است.</p>', 404)
    # عمداً بدون قفل دور کل عملیات: «بررسی موجودبودن» و «کاهش شمارنده» دو قدم جدا هستند
    # و بین‌شان یک مکث هست — دقیقاً مسابقهٔ هم‌زمانی کلاسیک (TOCTOU) (مرحلهٔ ۱۸)
    avail = c["uses_left"] is None or c["uses_left"] > 0
    if avail:
        time.sleep(0.05)
        with COUPON_LOCK:
            if c["uses_left"] is not None:
                c["uses_left"] -= 1
            c["used"] += 1
    flag = ""
    if coupon == STORE_HIDDEN_COUPON:
        award(17)
        flag += '<p class="ok">🚩 %s</p>' % FLAGS["17"]
    if coupon == "VIP-ONE-TIME" and c["used"] > 1:
        award(18)
        flag += '<p class="ok">🚩 %s (این کد %d بار مصرف شد؛ سهمیه فقط ۱ بود)</p>' % (FLAGS["18"], c["used"])
    if not avail and not flag:
        return page("کد تخفیف", '<h1>کد تخفیف</h1><p class="bad">این کد قبلاً تمام شده (uses_left=0).</p>')
    body = '<h1>کد تخفیف</h1><p>کد <code>%s</code> اعمال شد: <b>%d%%</b> تخفیف.</p>%s<p class="muted">موجودیِ باقی‌ماندهٔ این کد: %s</p>' % (
        html.escape(coupon), c["pct"], flag, ("نامحدود" if c["uses_left"] is None else c["uses_left"])
    )
    return page("کد تخفیف", body)


def route_store_order_pay(h, oid, cookies):
    order = STORE_ORDERS.get(oid)
    if not order:
        return 404, "text/plain; charset=utf-8", b"order not found", {}
    s = session_user(cookies)
    me = s.get("user", "guest")
    was_pending = order["status"] != "paid"
    not_mine = order["user"] != me
    order["status"] = "paid"  # IDOR (مرحلهٔ ۱۹): هیچ بررسی مالکیتی روی این مسیر نیست
    flag19 = ""
    if not_mine and was_pending:
        award(19)
        flag19 = '<p class="ok">🚩 %s</p>' % FLAGS["19"]
    flag22 = ""
    if any(o["product_id"] == 3 and o["status"] == "paid" and o["paid_amount"] <= 50 for o in STORE_ORDERS.values()):
        award(22)
        flag22 = '<p class="ok">🚩 %s</p>' % FLAGS["22"]
    product = STORE_PRODUCTS.get(order["product_id"], {})
    body = "<h1>سفارش #%d</h1><p>کاربر: %s · کالا: %s · هزینهٔ پرداختی: %d · وضعیت: <b>%s</b></p>%s%s<p><a href=\"/store\">بازگشت به فروشگاه</a></p>" % (
        oid, html.escape(order["user"]), html.escape(product.get("name", "?")), order["paid_amount"], order["status"], flag19, flag22
    )
    return page("سفارش", body)


def route_flags(h, method, form):
    msg = ""
    if method == "POST":
        sub = form.get("flag", "").strip()
        hit = [n for n, f in FLAGS.items() if f == sub]
        if hit:
            award(int(hit[0]))
            msg = '<p class="ok">✔ درست! مرحلهٔ %s حل شد.</p>' % hit[0]
        else:
            msg = '<p class="bad">پرچم اشتباه است.</p>'
    solved = set(STATE["solved"])
    body = "<h1>🚩 ثبت پرچم</h1>%s<form method=\"post\"><input name=\"flag\" size=\"36\" placeholder=\"CP{...}\"> <button>ثبت</button></form><p>حل‌شده: <b>%d / %d</b></p>" % (msg, len(solved), len(LEVELS))
    return page("پرچم‌ها", body)


HINTS = {
    1: ["فرم ورود یک پرسوجوی SQL می‌سازد. یک ' چه می‌کند؟", "شرط را همیشه درست کن: بعد از نام کاربری یک کامنت SQL بگذار.", "نام کاربری: admin'--   (رمز هر چیزی)"],
    2: ["جست‌وجو هم یک پرسوجوست. ستون‌ها چندتا هستند؟ ORDER BY امتحان کن.", "UNION SELECT باید همان تعداد ستون را برگرداند (۴ تا).", "فروشگاه: q=zzz' UNION SELECT 1,username,0,secret FROM users--"],
    3: ["ورودی q بدون تغییر در HTML می‌آید.", "تگ script یا یک رویداد مثل onerror امتحان کن.", "q=<img src=x onerror=alert(document.cookie)>  ← پرچم در کوکی lab_flag است"],
    4: ["نظرها ذخیره و برای همه نمایش داده می‌شوند.", "همان ایدهٔ XSS اما در متن نظر.", "<img src=x onerror=alert(document.cookie)>  → کوکی guest_flag"],
    5: ["شناسهٔ یادداشت در آدرس است.", "مدیر هم یادداشت دارد. شناسه‌ها را بشمار.", "/notes?id=7"],
    6: ["فیلتر فقط رشتهٔ ../ را یک بار حذف می‌کند.", "اگر بعد از حذف دوباره ../ بماند چه؟  ....//", "file=....//private/flag.txt"],
    7: ["کوکی session را با ابزار توسعه ببین.", "base64 است. JSON دارد.", "base64 از {\"user\":\"guest\",\"role\":\"admin\"} بساز و کوکی را عوض کن."],
    8: ["robots.txt چه چیزی را پنهان می‌کند؟", "پشتیبان پایگاه داده هش MD5 رمزها را دارد.", "هش رمز علی را (md5 sunshine) پیدا و با رمز sunshine وارد شو."],
    9: ["پارامتر url هر مقصدی را می‌پذیرد.", "آدرس بیرونی بده.", "/go?url=http://evil.example/"],
    10: ["host مستقیم به پوسته می‌رود.", "با ; یا && فرمان دوم اضافه کن.", "host=127.0.0.1; cat /srv/lab/secret/flag.txt"],
    11: ["سرور می‌تواند به خودش درخواست بزند. چه صفحه‌ای فقط داخلی است؟", "robots یا حدس: /internal", "/fetch?url=http://127.0.0.1:%d/internal" % PORT],
    12: ["بررسی پسوند فقط در جاوااسکریپت صفحه است.", "مستقیم به سرور درخواست بفرست.", "curl -X POST /upload -d '{\"name\":\"shell.php\",\"content\":\"x\"}'"],
    13: ["robots.txt را بخوان.", "مسیرهای Disallow جالب‌اند.", "/debug"],
    14: ["انتقال پول با GET انجام می‌شود.", "کافی است یک لینک یا تصویر در سایت دیگری به این آدرس اشاره کند.", "/bank?to=mallory&amount=500  (در واقعیت: <img src=...> در صفحهٔ مهاجم)"],
    15: ["صفحهٔ کیف‌پول پارامتر user می‌گیرد.", "اصلاً وارد نشو؛ فقط نام یک کاربر دیگر را بده.", "/store/wallet?user=admin"],
    16: ["فرم خرید یک فیلد price هم دارد که اختیاری است.", "سرور قیمت کلاینت را به‌جای کاتالوگ باور می‌کند.", "curl -X POST http://127.0.0.1:%d/store/buy -d 'product_id=1&qty=1&price=1'" % PORT],
    17: ["کد تخفیف پنهان یک عدد ۴ رقمی است؛ هیچ‌جا نوشته نشده.", "هیچ محدودیت تلاشی نیست؛ یک حلقه بنویس.", "for i in range(10000): requests.post(url,{'code':'%04d'%i})  روی /store/redeem"],
    18: ["کد VIP-ONE-TIME فقط یک‌بار مصرف است؛ ولی سرور اول چک می‌کند بعد کم می‌کند.", "اگر چند درخواست دقیقاً هم‌زمان برسند، همه می‌توانند «قبل از کم‌شدن» را ببینند.", "با threading چند درخواست هم‌زمان به /store/redeem با code=VIP-ONE-TIME بفرست؛ باید بیشتر از ۱ بار موفق شود."],
    19: ["سفارش #۱ متعلق به admin و در-انتظار است.", "مسیر mark-paid هیچ بررسی مالکیتی ندارد.", "curl -X POST http://127.0.0.1:%d/store/order/1/mark-paid" % PORT],
    20: ["qty لازم نیست مثبت باشد.", "اگر cost منفی شود، موجودی به‌جای کم‌شدن زیاد می‌شود.", "curl -X POST .../store/buy -d 'product_id=2&qty=-10'  (موجودی‌ات زیاد می‌شود)"],
    21: ["/debug یک secret_key لو می‌دهد؛ همان کلید برای امضای کوپن مدیر هم استفاده شده.", "امضا = hmac_sha256(secret_key, CODE) با ۸ کاراکتر اول هگز.", "python3 -c \"import hmac,hashlib;print('FREE100.'+hmac.new(b'dev-key-123',b'FREE100',hashlib.sha256).hexdigest()[:8])\"  → بفرست به /store/redeem یا در خرید به‌عنوان coupon"],
    22: ["این یکی ترکیبی است: باید هزینهٔ واقعیِ ثبت‌شدهٔ خرید کالای #۳ (قیمت واقعی ۹۹۹۹۹۹) را به ۵۰ یا کمتر برسانی.", "چند راه داری: کد مدیرِ جعلی (مرحلهٔ ۲۱) برای ۱۰۰٪ تخفیف، یا دستکاری قیمت (مرحلهٔ ۱۶)، یا تعداد منفی (مرحلهٔ ۲۰) روی همین کالا.", "curl -X POST .../store/buy -d 'product_id=3&qty=1&price=1'  یا با کوپن جعلی‌ات؛ بعد پرچم در پاسخ /store/order/<id>/mark-paid ظاهر می‌شود."],
}
WALK = {
    1: "در فرم ورود نام کاربری را admin'-- بگذار. پرسوجو می‌شود … WHERE username = 'admin'--' AND ... و بقیه کامنت است. دفاع: پرسوجوی پارامتری (? یا :name).",
    2: "q=zzz' UNION SELECT 1,username,0,secret FROM users-- . دفاع: پرسوجوی پارامتری، حداقل دسترسی، پنهان‌کردن خطاهای SQL.",
    3: "ورودی بدون escape در HTML قرار می‌گیرد. دفاع: html.escape، CSP، کوکی HttpOnly.",
    4: "همان XSS ولی ذخیره می‌شود و برای هر بازدیدکننده اجرا می‌شود (خطرناک‌تر). دفاع: escape خروجی، CSP.",
    5: "فقط id را عوض می‌کنی. دفاع: بررسی مالکیت در سرور، شناسهٔ غیرقابل‌حدس (UUID) به‌تنهایی کافی نیست.",
    6: "replace('../','') فقط یک‌بار حذف می‌کند: ....// تبدیل به ../ می‌شود. دفاع: normpath + بررسی که مسیر داخل پوشهٔ پایه است، allow-list.",
    7: "کوکی بدون امضا است. دفاع: نشست سمت سرور یا کوکی امضاشده (HMAC)، هرگز نقش را از کلاینت باور نکن.",
    8: "robots.txt ← /backup/db.sql.txt ← MD5 ضعیف و بدون salt ← با فرهنگ‌لغت بشکن. دفاع: bcrypt/argon2 با salt، محدودیت تلاش.",
    9: "آدرس مقصد بدون اعتبارسنجی است. دفاع: فقط مسیرهای نسبی یا allow-list.",
    10: "ورودی به پوسته می‌رود. ; فرمان بعدی را اجرا می‌کند. دفاع: هرگز رشته به پوسته نده؛ از آرگومان‌های جدا (subprocess بدون shell) و اعتبارسنجی.",
    11: "سرور به آدرسی که تو می‌دهی درخواست می‌زند و هدر داخلی را اضافه می‌کند. دفاع: allow-list مقصد، بلاک آدرس‌های داخلی، احراز هویت واقعی برای پنل داخلی.",
    12: "اعتبارسنجی فقط سمت کلاینت است. دفاع: بررسی نوع/پسوند/محتوا در سرور، ذخیره خارج از webroot، نام تصادفی.",
    13: "robots.txt آدرس /debug را لو می‌دهد. دفاع: دیباگ را در تولید خاموش کن، robots.txt محافظ نیست.",
    14: "GET وضعیت را تغییر می‌دهد و بدون توکن است. دفاع: توکن CSRF، SameSite، فقط POST برای تغییر.",
    15: "/store/wallet فقط از پارامتر user می‌خواند و هیچ احراز هویتی نمی‌خواهد. دفاع: فقط موجودی کاربر واردشده (session) را نشان بده، هرگز بر اساس پارامتر دلخواه.",
    16: "فرم خرید فیلد price را هم می‌فرستد و سرور آن را به‌جای قیمت واقعیِ کاتالوگ باور می‌کند. دفاع: قیمت را هرگز از کلاینت نگیر؛ همیشه از پایگاه‌داده/کاتالوگ سرور بخوان.",
    17: "کد تخفیف فقط ۴ رقم (۱۰هزار حالت) است و نرخ تلاش محدود نشده؛ با یک حلقهٔ ساده در چند ثانیه پیدا می‌شود. دفاع: کدهای طولانی‌تر/تصادفی، محدودیت نرخ (rate limit)، قفل بعد از چند تلاش.",
    18: "سرور «بررسی موجودبودن» و «کم‌کردن شمارنده» را در دو قدم جدا انجام می‌دهد؛ بین آن دو یک تأخیر کوچک هست. اگر چند درخواست هم‌زمان برسند، همه قدم اول را با uses_left=1 می‌بینند. دفاع: کاهش اتمیک (مثلاً UPDATE ... WHERE uses_left>0 در یک پرسوجو، یا قفل درست دور کل عملیات).",
    19: "مسیر mark-paid فقط شناسهٔ سفارش را می‌گیرد و هیچ‌وقت چک نمی‌کند سفارش مال کیست. دفاع: همیشه session_user را با owner سفارش مقایسه کن.",
    20: "cost = قیمت × تعداد است؛ تعداد منفی، cost منفی می‌سازد و از موجودی «کم‌کردنِ منفی» یعنی زیادکردن می‌شود. دفاع: qty باید همیشه عدد صحیح مثبت باشد (اعتبارسنجی سمت سرور).",
    21: "امضای کوپن مدیر با همان secret_key ساخته می‌شود که در /debug افشا شده (استفادهٔ دوباره از یک کلید حساس در دو سیستم مختلف). هرکس آن کلید را ببیند می‌تواند با hmac.new همان امضا را برای هر کد دلخواه بسازد. دفاع: کلیدهای متفاوت برای هر سیستم، هرگز اطلاعات حساس در پاسخ دیباگ، چرخش کلید در صورت افشا.",
    22: "این مرحله «اثبات مفهوم» ترکیبی است: باید نشان بدهی کالای ویژه (که قیمت واقعی‌اش ۹۹۹۹۹۹ است) را با هزینهٔ واقعیِ ثبت‌شده در سفارش، ۵۰ یا کمتر بخری — از طریق کد تخفیف جعلی (۲۱)، دستکاری قیمت (۱۶) یا تعداد منفی (۲۰) روی همان کالا. دفاع: هر لایه باید مستقل درست باشد؛ یک باگ در یک لایه کل زنجیره را می‌شکند (دفاع در عمق).",
}


def route_hint(h, n, walk):
    if n not in HINTS:
        return 404, "text/plain; charset=utf-8", b"not found", {}
    title = [t for k, _, t, *_ in LEVELS if k == n][0]
    if walk:
        body = "<h1>راه‌حل %d: %s</h1><p>%s</p>" % (n, html.escape(title), html.escape(WALK[n]))
    else:
        items = "".join("<li>%s</li>" % html.escape(x) for x in HINTS[n][:2]) + '<li><details><summary>راهنمای کامل (اسپویلر)</summary>%s</details></li>' % html.escape(HINTS[n][2])
        body = "<h1>راهنما %d: %s</h1><ol>%s</ol>" % (n, html.escape(title), items)
    return page("راهنما", body)


ROUTES_DESCR = "robots"


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "CodePadLab/1"

    def log_message(self, fmt, *args):  # لاگ کوتاه فارسی
        print("  ", self.command, self.path[:90], "←", args[1] if len(args) > 1 else "")

    def _send(self, status, ctype, data, extra):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _host_ok(self):
        # محافظ DNS rebinding: فقط نام‌های محلی پذیرفته می‌شوند
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        return host in ("127.0.0.1", "localhost", "[::1]")

    def _handle(self, method):
        if not self._host_ok():
            return self._send(403, "text/plain; charset=utf-8", b"host not allowed", {})
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query, keep_blank_values=True)
        raw = b""
        if method == "POST":
            n = min(int(self.headers.get("Content-Length") or 0), 200000)
            raw = self.rfile.read(n) if n else b""
        form = {}
        if raw and "json" not in (self.headers.get("Content-Type") or "") and method == "POST":
            form = {k: v[0] for k, v in urllib.parse.parse_qs(raw.decode("utf-8", "replace"), keep_blank_values=True).items()}
        cookies = parse_cookies(self.headers.get("Cookie"))
        p = u.path
        try:
            if p == "/":
                r = home(self)
            elif p == "/shop":
                r = route_shop(self, q)
            elif p == "/login":
                r = route_login(self, method, form, cookies)
            elif p == "/search":
                r = route_search(self, q)
            elif p == "/guestbook":
                r = route_guestbook(self, method, form)
            elif p == "/guestbook/clear" and method == "POST":
                del COMMENTS[1:]
                r = 302, "text/plain", b"", {"Location": "/guestbook"}
            elif p == "/notes":
                r = route_notes(self, q)
            elif p == "/download":
                r = route_download(self, q)
            elif p == "/admin":
                r = route_admin(self, cookies)
            elif p == "/go":
                r = route_go(self, q)
            elif p == "/tools/ping":
                r = route_ping(self, q)
            elif p == "/fetch":
                r = route_fetch(self, q)
            elif p == "/internal":
                r = route_internal(self)
            elif p == "/upload":
                r = route_upload(self, method, raw)
            elif p.startswith("/uploads/"):
                name = urllib.parse.unquote(p[len("/uploads/"):])
                r = (200, "text/html; charset=utf-8", UPLOADS[name].encode(), {}) if name in UPLOADS else (404, "text/plain", b"not found", {})
            elif p == "/bank":
                r = route_bank(self, q, cookies)
            elif p == "/store":
                r = route_store(self, cookies)
            elif p == "/store/wallet":
                r = route_store_wallet(self, q)
            elif p == "/store/buy":
                r = route_store_buy(self, method, form, cookies)
            elif p == "/store/redeem":
                r = route_store_redeem(self, method, form)
            elif p.startswith("/store/order/") and p.endswith("/mark-paid"):
                seg = p.split("/")
                oid = int(seg[3]) if len(seg) > 4 and seg[3].isdigit() else -1
                r = route_store_order_pay(self, oid, cookies)
            elif p == "/flags":
                r = route_flags(self, method, form)
            elif p == "/robots.txt":
                r = 200, "text/plain; charset=utf-8", b"User-agent: *\nDisallow: /backup/\nDisallow: /debug\nDisallow: /internal\n", {}
            elif p == "/backup/db.sql.txt":
                r = 200, "text/plain; charset=utf-8", BACKUP_SQL.encode(), {}
            elif p == "/debug":
                award(13)
                r = 200, "application/json", json.dumps(DEBUG_INFO, ensure_ascii=False, indent=1).encode(), {}
            elif p.startswith("/hints/") or p.startswith("/walkthrough/"):
                r = route_hint(self, int(p.rsplit("/", 1)[1]) if p.rsplit("/", 1)[1].isdigit() else 0, p.startswith("/walkthrough/"))
            else:
                r = page("۴۰۴", '<h1>پیدا نشد</h1><p>مسیرهای پنهان را هم جست‌وجو کن 😉</p>', 404)
        except Exception as e:  # خطای عمداً پرجزئیات (برای تمرین)
            r = 500, "text/plain; charset=utf-8", ("Traceback (lab): %r" % (e,)).encode(), {}
        self._send(*r)

    do_GET = lambda self: self._handle("GET")  # noqa: E731
    do_POST = lambda self: self._handle("POST")  # noqa: E731
    do_HEAD = lambda self: self._handle("GET")  # noqa: E731


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    try:
        server = None
        for port in range(PORT, PORT + 12):
            try:
                server = Server((HOST, port), Handler)
                globals()["PORT"] = port
                break
            except OSError:
                continue
        if server is None:
            raise OSError("هیچ پورت آزادی پیدا نشد")
    except OSError as e:
        print("نتوانستم سرور محلی را راه بیندازم:", e)
        print("اگر این برنامه در نسخهٔ وب (بدون Python واقعی) اجرا شده، سوکت در دسترس نیست؛ از نسخهٔ ویندوز یا اندروید CodePad استفاده کن.")
        return
    print("=" * 60)
    print(" CodePad Vuln Lab روشن شد  ✔")
    print(" آدرس در مرورگر:  http://127.0.0.1:%d/" % PORT)
    print(" فقط روی همین دستگاه؛ به شبکه و اینترنت وصل نیست.")
    print(" ۲۲ مرحله (شامل فروشگاه CP-Coin)، پرچم‌ها را در /flags ثبت کن. توقف: دکمهٔ Stop")
    print("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("آزمایشگاه خاموش شد.")


main()
