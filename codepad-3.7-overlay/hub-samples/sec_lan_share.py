# title: اشتراک روی شبکه: فایل یا سایت برای دستگاه‌های دیگر
# desc: پوشهٔ پروژه را روی آدرس شبکهٔ محلی منتشر می‌کند تا هر کس روی همین وای‌فای فقط با مرورگر ببیند
# cat: security
# level: 2
"""
اشتراک روی شبکه (LAN Share)
===========================
فایل‌های همین پروژه (غیر از این اسکریپت) را روی شبکهٔ محلی منتشر می‌کند:
  • اگر index.html داشته باشی، همان سایت نمایش داده می‌شود؛ وگرنه فهرست فایل‌ها برای دانلود.
  • دستگاه‌های دیگر روی همین وای‌فای/هات‌اسپات فقط آدرسی را که این برنامه چاپ می‌کند در مرورگر باز می‌کنند؛ چیزی نصب نمی‌شود.
  • فقط خواندنی است (GET/HEAD). هیچ فایلی اجرا نمی‌شود؛ بیرون از پوشه دسترسی نیست.
  • به‌صورت پیش‌فرض یک «توکن» تصادفی در آدرس است تا فقط کسانی که لینک را دارند وارد شوند.
  • فقط درخواست از آی‌پی‌های شبکهٔ خصوصی (192.168.x، 10.x، 172.16-31.x) پذیرفته می‌شود؛ اگر روزی دستگاهت روی اینترنت باز بود، رد می‌شود.
برای توقف دکمهٔ Stop را بزن. توجه: ویندوز بار اول ممکن است برای دسترسی شبکه از تو اجازه بخواهد (Allow).
تنظیمات پایین‌تر را می‌توانی عوض کنی.
"""
import html
import http.server
import ipaddress
import mimetypes
import os
import re
import secrets
import socket
import socketserver
import sys
import time
import urllib.parse

SHARE_DIR = os.environ.get("CP_SHARE_DIR", ".")  # پوشه‌ای که منتشر می‌شود
PORT = int(os.environ.get("CP_SHARE_PORT", "8000"))
USE_TOKEN = os.environ.get("CP_SHARE_TOKEN", "1") != "0"  # False: آدرس ساده بدون توکن (برای مهمان‌های مطمئن)
ONLY_PRIVATE_CLIENTS = True  # فقط شبکهٔ خصوصی
HIDDEN_NAMES = {"mounted.json", "__pycache__", "cp_lab_progress.json"}
MAX_LISTING = 2000
TOKEN = secrets.token_urlsafe(6) if USE_TOKEN else ""
SELF_NAME = os.path.basename(sys.argv[0]) if sys.argv and sys.argv[0] else ""
SEEN = set()


def is_private_client(ip):
    try:
        a = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    return a.is_private or a.is_loopback or a.is_link_local


def is_hidden(name):
    return name.startswith(".") or name in HIDDEN_NAMES or name == SELF_NAME or name == "lan_share.py"


def local_urls(port, token):
    """آی‌پی‌های محلی این دستگاه (بدون فرستادن بسته به بیرون)."""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # UDP connect فقط مسیر را انتخاب می‌کند، چیزی ارسال نمی‌شود
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    suffix = "/" + token + "/" if token else "/"
    lan = sorted(ip for ip in ips if not ip.startswith("127.") and ipaddress.ip_address(ip).is_private)
    return ["http://%s:%d%s" % (ip, port, suffix) for ip in lan], "http://127.0.0.1:%d%s" % (port, suffix)


def resolve_inside(root, rel):
    """مسیر نسبی را امن به مسیر واقعی داخل root تبدیل می‌کند؛ در غیر این صورت None."""
    parts = [p for p in urllib.parse.unquote(rel).split("/") if p not in ("", ".")]
    if any(p == ".." or "\\" in p or "\x00" in p or is_hidden(p) for p in parts):
        return None
    path = os.path.realpath(os.path.join(root, *parts))
    root_real = os.path.realpath(root)
    if path != root_real and not path.startswith(root_real + os.sep):
        return None  # پیوند نمادین/پیمایش به بیرون
    return path


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return "%d %s" % (n, unit) if unit == "B" else "%.1f %s" % (n, unit)
        n /= 1024


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "CodePadShare/1"
    root = os.path.realpath(SHARE_DIR)

    def log_message(self, fmt, *args):
        ip = self.client_address[0]
        if ip not in SEEN:
            SEEN.add(ip)
            print("🔔 دستگاه تازه وصل شد:", ip)
        print("  ", time.strftime("%H:%M:%S"), ip, self.command, urllib.parse.unquote(self.path)[:80], "←", args[1] if len(args) > 1 else "")

    def _send(self, status, ctype, data, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _text(self, status, msg):
        self._send(status, "text/plain; charset=utf-8", msg.encode("utf-8"))

    def _serve(self):
        if ONLY_PRIVATE_CLIENTS and not is_private_client(self.client_address[0]):
            return self._text(403, "forbidden")
        u = urllib.parse.urlparse(self.path)
        path = u.path
        if TOKEN:
            prefix = "/" + TOKEN
            if path != prefix and not path.startswith(prefix + "/"):
                return self._text(404, "not found")
            rel = path[len(prefix):]
        else:
            rel = path
        full = resolve_inside(self.root, rel)
        if full is None or not os.path.exists(full):
            return self._text(404, "not found")
        if os.path.isdir(full):
            if not path.endswith("/"):
                return self._send(301, "text/plain", b"", {"Location": path + "/"})
            index = os.path.join(full, "index.html")
            if os.path.isfile(index):
                return self._file(index)
            return self._listing(full, path)
        return self._file(full)

    def _listing(self, full, urlpath):
        try:
            names = sorted(n for n in os.listdir(full) if not is_hidden(n))[:MAX_LISTING]
        except OSError:
            return self._text(403, "forbidden")
        rows = []
        if urlpath.count("/") > (2 if TOKEN else 1):
            rows.append('<li><a href="../">⬆ بالا</a></li>')
        for n in names:
            p = os.path.join(full, n)
            if os.path.islink(p) and not os.path.realpath(p).startswith(self.root):
                continue
            isdir = os.path.isdir(p)
            size = "" if isdir else " <small>(%s)</small>" % human(os.path.getsize(p))
            rows.append('<li><a href="%s%s">%s%s</a>%s</li>' % (urllib.parse.quote(n), "/" if isdir else "", "📁 " if isdir else "📄 ", html.escape(n), size))
        body = (
            '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            "<title>فایل‌های اشتراکی</title><style>body{font:16px/1.9 system-ui,Tahoma;background:#04100c;color:#d6fff0;margin:0;padding:20px;max-width:720px;margin-inline:auto}"
            "a{color:#19e6ff;text-decoration:none}li{margin:6px 0}small{color:#6fb59a}h1{color:#00ff9c}</style></head><body>"
            "<h1>فایل‌های اشتراکی</h1><p><small>از طریق CodePad روی همین شبکه به اشتراک گذاشته شده است.</small></p><ul style=\"list-style:none;padding:0\">%s</ul></body></html>" % "".join(rows)
        )
        self._send(200, "text/html; charset=utf-8", body.encode("utf-8"))

    def _file(self, full):
        try:
            size = os.path.getsize(full)
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
                ctype += "; charset=utf-8"
            start, end, status = 0, size - 1, 200
            m = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range", ""))
            if m and size:
                a, b = m.groups()
                if a == "" and b != "":
                    start = max(0, size - int(b))
                elif a != "":
                    start = int(a)
                    end = min(int(b), size - 1) if b else size - 1
                if start > end or start >= size:
                    return self._send(416, "text/plain", b"", {"Content-Range": "bytes */%d" % size})
                status = 206
            headers = {"Accept-Ranges": "bytes"}
            if status == 206:
                headers["Content-Range"] = "bytes %d-%d/%d" % (start, end, size)
            if not (ctype.startswith(("text/html", "image/", "audio/", "video/", "text/plain", "application/pdf"))):
                headers["Content-Disposition"] = 'attachment; filename*=UTF-8\'\'%s' % urllib.parse.quote(os.path.basename(full))
            length = end - start + 1 if size else 0
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(length))
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in headers.items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD" and size:
                with open(full, "rb") as f:
                    f.seek(start)
                    left = length
                    while left > 0:
                        chunk = f.read(min(65536, left))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            self._text(404, "not found")

    def do_GET(self):
        self._serve()

    def do_HEAD(self):
        self._serve()

    def _no(self):
        self._text(405, "فقط خواندنی است.")

    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = _no


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    server = None
    for port in range(PORT, PORT + 20):
        try:
            server = Server(("0.0.0.0", port), Handler)
            break
        except OSError:
            continue
    if server is None:
        print("هیچ پورت آزادی پیدا نشد. اگر این برنامه در نسخهٔ وب (بدون Python واقعی) اجرا شده، سوکت در دسترس نیست؛ از نسخهٔ ویندوز یا اندروید CodePad استفاده کن.")
        return
    port = server.server_address[1]
    lan, local = local_urls(port, TOKEN)
    files = [n for n in os.listdir(Handler.root) if not is_hidden(n)]
    print("=" * 62)
    print(" اشتراک روی شبکه روشن شد ✔")
    print(" پوشه:", Handler.root, "(%d مورد)" % len(files))
    print(" روی این دستگاه:", local)
    if lan:
        print(" برای دستگاه‌های دیگر روی همین شبکه (در مرورگر باز کنند):")
        for url in lan:
            print("    ", url)
    else:
        print(" آدرس شبکه پیدا نشد: به وای‌فای وصل شو یا هات‌اسپات را روشن کن.")
    if USE_TOKEN:
        print(" توکن تصادفی در آدرس است: فقط کسی که لینک را دارد وارد می‌شود.")
    else:
        print(" ⚠ توکن خاموش است: هر کس روی این شبکه آدرس را بداند وارد می‌شود.")
    print(" ⚠ هر کس لینک را داشته باشد می‌تواند این فایل‌ها را ببیند/دانلود کند. توقف: Stop")
    print("=" * 62)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("اشتراک متوقف شد.")


if __name__ == "__main__":
    main()
