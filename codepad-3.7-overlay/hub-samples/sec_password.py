# title: قدرت رمز عبور + ساخت رمز
# desc: آنتروپی، الگوهای ضعیف و تولید رمز امن با secrets
# cat: security
# level: 2
import math, re, secrets, string

COMMON = {"123456", "password", "qwerty", "admin", "letmein", "111111", "iloveyou", "123456789"}
def strength(pw):
    pool = (26 if re.search("[a-z]", pw) else 0) + (26 if re.search("[A-Z]", pw) else 0) + (10 if re.search(r"\d", pw) else 0) + (32 if re.search(r"\W", pw) else 0)
    bits = len(pw) * math.log2(pool) if pool else 0
    notes = []
    if pw.lower() in COMMON: notes.append("جزو رمزهای لو رفته")
    if re.search(r"(.)\1\1", pw): notes.append("تکرار پشت‌سرهم")
    if len(pw) < 12: notes.append("کوتاه‌تر از ۱۲ کاراکتر")
    return round(bits), notes

for pw in ["123456", "Tr0ub4dor&3", "correct horse battery staple", secrets.token_urlsafe(14)]:
    print(f"{pw:<34} آنتروپی≈{strength(pw)[0]:>3} بیت  {', '.join(strength(pw)[1]) or 'خوب'}")
alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_"
print("\nرمز پیشنهادی:", "".join(secrets.choice(alphabet) for _ in range(18)))
