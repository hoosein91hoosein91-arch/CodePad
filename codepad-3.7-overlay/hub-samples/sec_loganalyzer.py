# title: تحلیل لاگ ورود (تشخیص حملهٔ brute-force)
# desc: با regex و Counter، آی‌پی‌های مشکوک را از لاگ نمونه پیدا کن
# cat: security
# level: 3
import re
from collections import Counter

log = """\
Nov 17 10:01:02 srv sshd[411]: Failed password for root from 203.0.113.9 port 51022 ssh2
Nov 17 10:01:04 srv sshd[411]: Failed password for root from 203.0.113.9 port 51024 ssh2
Nov 17 10:01:05 srv sshd[411]: Failed password for admin from 203.0.113.9 port 51026 ssh2
Nov 17 10:02:10 srv sshd[418]: Accepted password for ali from 192.168.1.20 port 40022 ssh2
Nov 17 10:03:44 srv sshd[420]: Failed password for invalid user test from 198.51.100.7 port 38888 ssh2
Nov 17 10:03:47 srv sshd[420]: Failed password for root from 203.0.113.9 port 51030 ssh2
Nov 17 10:03:49 srv sshd[420]: Failed password for root from 203.0.113.9 port 51032 ssh2
"""
fails = Counter(re.findall(r"Failed password for (?:invalid user )?\S+ from (\d+\.\d+\.\d+\.\d+)", log))
users = Counter(re.findall(r"Failed password for (?:invalid user )?(\S+) from", log))
print("تلاش‌های ناموفق به ازای IP:", dict(fails))
print("نام‌کاربری‌های هدف:", dict(users))
for ip, n in fails.items():
    if n >= 4:
        print(f"🚨 {ip}: {n} تلاش ناموفق → مسدود کن یا fail2ban بگذار")
