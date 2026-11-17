# title: ماشین‌حساب شبکه و ساب‌نت
# desc: CIDR، محدودهٔ میزبان‌ها و تقسیم شبکه با ipaddress
# cat: security
# level: 2
# stdin: 192.168.1.0/24
def ask(prompt, default=""):
    """جواب را از «جواب‌های آماده» می‌خواند؛ اگر نبود، مقدار پیش‌فرض."""
    try:
        return input(prompt)
    except EOFError:
        print()
        return default

import ipaddress
net = ipaddress.ip_network(ask("شبکه (مثلاً 192.168.1.0/24): ") or "192.168.1.0/24", strict=False)
print("نوع:", "خصوصی" if net.is_private else "عمومی")
print("ماسک:", net.netmask, "| بُرودکست:", net.broadcast_address)
print("تعداد میزبان:", net.num_addresses - 2, "| اولی:", net[1], "| آخری:", net[-2])
if net.prefixlen <= 28:
    print("تقسیم به ۴ زیرشبکه:")
    for s in net.subnets(prefixlen_diff=2):
        print("  ", s)
print("آیا 192.168.1.77 داخل شبکه است؟", ipaddress.ip_address("192.168.1.77") in net)
