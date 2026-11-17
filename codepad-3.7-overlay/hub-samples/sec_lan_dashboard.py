# title: داشبورد شبکهٔ خانه: چه دستگاه‌هایی وصل‌اند و چه پورتی باز است؟
# desc: اسکن شبکهٔ خودت (فقط بازهٔ خصوصی) و پیشنهاد سخت‌سازی؛ بدون ابزار خارجی
# cat: security
# level: 3
"""
داشبورد شبکهٔ خانه
==================
دستگاه‌های روشن شبکهٔ محلی خودت (یک بازهٔ /24) را با اتصال TCP به پورت‌های رایج پیدا می‌کند و پورت‌های پرخطر را گزارش می‌دهد.
فقط برای شبکهٔ خودت! اسکن شبکهٔ دیگران بدون اجازه ممنوع و غیرقانونی است.
• فقط بازه‌های خصوصی (192.168.x.x، 10.x.x.x، 172.16-31.x.x) و حداکثر ۲۵۶ آدرس پذیرفته می‌شود؛ آی‌پی عمومی رد می‌شود.
• قبل از شروع باید تأیید کنی که شبکه مال خودت است.
• لازم: Python واقعی (نسخهٔ ویندوز یا اندروید CodePad). در نسخهٔ وب سوکت در دسترس نیست.
تنظیم دستی: متغیر CP_NET (مثلاً 192.168.1.0/24) و CP_PORTS.
"""
import concurrent.futures
import ipaddress
import os
import re
import socket
import time

PORTS = [21, 22, 23, 25, 53, 80, 110, 139, 443, 445, 554, 1883, 3306, 3389, 5900, 8000, 8008, 8080, 8443, 9100]
if os.environ.get("CP_PORTS"):
    PORTS = [int(p) for p in os.environ["CP_PORTS"].split(",") if p.strip().isdigit()][:60]
TIMEOUT = float(os.environ.get("CP_TIMEOUT", "0.5"))
WORKERS = 160

ADVICE = {
    21: ("FTP", "high", "رمز و فایل بدون رمزنگاری می‌رود؛ از SFTP استفاده کن یا ببند."),
    22: ("SSH", "info", "اگر لازم نیست ببند؛ رمز قوی یا کلید + غیرفعال‌کردن ورود با رمز."),
    23: ("Telnet", "critical", "کاملاً ناامن و قدیمی؛ فوراً غیرفعال کن."),
    25: ("SMTP", "medium", "روی دستگاه خانگی معمولاً لازم نیست."),
    53: ("DNS", "info", "طبیعی روی مودم/روتر."),
    80: ("HTTP", "info", "صفحهٔ وب بدون رمزنگاری؛ اگر پنل مدیریت است رمز پیش‌فرض را عوض کن."),
    110: ("POP3", "medium", "ایمیل بدون رمزنگاری."),
    139: ("NetBIOS", "medium", "اشتراک فایل قدیمی ویندوز؛ اگر لازم نیست ببند."),
    443: ("HTTPS", "info", "وب رمزنگاری‌شده."),
    445: ("SMB", "high", "اشتراک فایل ویندوز؛ هدف رایج باج‌افزار. فقط در شبکهٔ مطمئن و به‌روز."),
    554: ("RTSP", "medium", "دوربین/استریم؛ رمز پیش‌فرض دوربین را عوض کن."),
    1883: ("MQTT", "high", "اغلب بدون رمز در دستگاه‌های IoT."),
    3306: ("MySQL", "high", "پایگاه داده نباید روی شبکه باز باشد."),
    3389: ("RDP", "high", "دسترسی راه دور ویندوز؛ هدف حملهٔ حدس رمز. NLA و رمز قوی یا VPN."),
    5900: ("VNC", "high", "دسکتاپ راه دور اغلب با رمز ضعیف."),
    8000: ("HTTP-alt", "info", "سرویس وب (شاید اشتراک CodePad یا یک پنل)."),
    8008: ("HTTP-alt", "info", "سرویس وب (مثلاً Chromecast)."),
    8080: ("HTTP-alt", "medium", "پنل مدیریت/پروکسی؛ رمز پیش‌فرض را عوض کن."),
    8443: ("HTTPS-alt", "info", "پنل رمزنگاری‌شده."),
    9100: ("JetDirect", "medium", "چاپگر؛ دسترسی بدون احراز."),
}
NON_HTTP = {21, 22, 23, 25, 53, 110, 139, 445, 554, 1883, 3306, 3389, 5900, 9100}
RANK = {"critical": 4, "high": 3, "medium": 2, "info": 1}


def own_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # چیزی ارسال نمی‌شود
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


def choose_network():
    spec = os.environ.get("CP_NET", "").strip()
    if not spec:
        ip = own_ip()
        if not ip:
            raise SystemExit("به شبکه وصل نیستی (وای‌فای یا هات‌اسپات را روشن کن) یا CP_NET را بده.")
        spec = ip + "/24"
    net = ipaddress.ip_network(spec, strict=False)
    return net


def validate_target(net):
    """فقط شبکهٔ خصوصی/محلی و حداکثر ۲۵۶ آدرس."""
    if net.version != 4:
        raise ValueError("فقط IPv4.")
    if not (net.is_private or net.is_loopback or net.is_link_local):
        raise ValueError("%s عمومی است. فقط شبکهٔ خصوصی خودت مجاز است." % net)
    if net.num_addresses > 256:
        raise ValueError("بازه خیلی بزرگ است (حداکثر /24).")
    return True


def probe(ip, port):
    try:
        with socket.create_connection((ip, port), timeout=TIMEOUT) as s:
            banner = ""
            if port not in NON_HTTP and port not in (443, 8443):
                try:
                    s.settimeout(1.0)
                    s.sendall(b"GET / HTTP/1.0\r\nHost: " + ip.encode() + b"\r\nUser-Agent: CodePad-LanCheck\r\n\r\n")
                    data = s.recv(4096).decode("latin-1", "replace")
                    if data.startswith("HTTP/"):
                        server = re.search(r"(?im)^Server:\s*(.+)$", data)
                        title = re.search(r"(?is)<title>(.*?)</title>", data)
                        banner = " ".join(x for x in [server and server.group(1).strip(), title and ("«" + title.group(1).strip()[:40] + "»")] if x)
                except OSError:
                    pass
            return port, banner
    except OSError:
        return None


def scan_host(ip):
    opened = []
    for p in PORTS:
        r = probe(ip, p)
        if r:
            opened.append(r)
    return ip, opened


def report(results):
    lines = ["گزارش شبکه  (%s)" % time.strftime("%Y-%m-%d %H:%M"), "=" * 60]
    worst = 0
    for ip, opened in results:
        lines.append("")
        lines.append("● %s   (%d پورت باز)" % (ip, len(opened)))
        for port, banner in opened:
            name, sev, tip = ADVICE.get(port, ("?", "info", ""))
            worst = max(worst, RANK[sev])
            mark = {"critical": "🔴", "high": "🟠", "medium": "🟡", "info": "🟢"}[sev]
            lines.append("   %s %5d  %-10s %s" % (mark, port, name, banner))
            if sev != "info":
                lines.append("        ↳ " + tip)
    lines.append("")
    lines.append("=" * 60)
    grade = {0: "هیچ دستگاهی با این پورت‌ها پیدا نشد", 1: "وضع خوب 🟢", 2: "نیاز به توجه 🟡", 3: "ریسک بالا 🟠", 4: "بحرانی 🔴"}[worst]
    lines.append("نتیجه: " + grade)
    lines.append("توصیه‌ها: رمز پیش‌فرض مودم/دوربین را عوض کن، سرویس‌های بی‌استفاده را ببند، سیستم‌عامل و firmware را به‌روز نگه دار، WPS را خاموش و WPA2/WPA3 را روشن کن.")
    return "\n".join(lines)


def main():
    try:
        net = choose_network()
        validate_target(net)
    except (ValueError, SystemExit) as e:
        print("✖", e)
        return
    print("شبکهٔ هدف:", net, "(%d آدرس)" % net.num_addresses, "· پورت‌ها:", len(PORTS))
    try:
        ans = input("تأیید می‌کنم که این شبکه مال خودم است یا اجازهٔ کتبی دارم (بله/y): ").strip().lower()
    except EOFError:
        print("برای شروع اسکن باید تأیید کنی که شبکه مال خودت است: در کادر «جواب‌های آماده» فقط حرف y را بنویس و دوباره اجرا کن.")
        return
    if ans not in ("y", "yes", "بله", "ب"):
        print("لغو شد. اسکن شبکهٔ دیگران ممنوع است.")
        return
    hosts = [str(h) for h in (net.hosts() if net.num_addresses > 2 else net)]
    t0 = time.time()
    results = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
            for ip, opened in ex.map(scan_host, hosts):
                if opened:
                    results.append((ip, opened))
    except OSError as e:
        print("سوکت در دسترس نیست:", e, "(نسخهٔ وب؟ از ویندوز/اندروید CodePad استفاده کن)")
        return
    text = report(results)
    print(text)
    print("\nزمان: %.1f ثانیه · %d آدرس بررسی شد" % (time.time() - t0, len(hosts)))
    try:
        with open("network_report.txt", "w", encoding="utf-8") as f:
            f.write(text)
    except OSError:
        return
    try:
        import codepad
        codepad.share_file("network_report.txt", title="گزارش شبکهٔ خانه")   # کارت «ذخیره / اشتراک» باز می‌شود
        print("کارت ذخیره/اشتراک گزارش باز شد (ذخیره ← پوشهٔ عمومی).")
    except Exception:
        print("گزارش در network_report.txt ذخیره شد (در پوشهٔ کاری برنامه).")


if __name__ == "__main__":
    main()
