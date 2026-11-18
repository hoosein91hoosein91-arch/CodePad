# title: کدگذار: Base64 / Hex / ROT13 / سزار
# desc: تبدیل‌های رایج در CTF و تحلیل بدافزار
# cat: security
# level: 2
# stdin: Hello CodePad!
def ask(prompt, default=""):
    """جواب را از «جواب‌های آماده» می‌خواند؛ اگر نبود، مقدار پیش‌فرض."""
    try:
        return input(prompt)
    except EOFError:
        print()
        return default

import base64, binascii, codecs, string
msg = ask("متن: ") or "CodePad Cyber Lab"
print("Base64 :", base64.b64encode(msg.encode()).decode())
print("Base32 :", base64.b32encode(msg.encode()).decode())
print("Hex    :", binascii.hexlify(msg.encode()).decode())
print("ROT13  :", codecs.encode(msg, "rot13"))
print("Binary :", " ".join(f"{b:08b}" for b in msg.encode()[:6]), "…")

def caesar(s, k):
    a = string.ascii_lowercase
    return s.lower().translate(str.maketrans(a, a[k:] + a[:k]))
secret = caesar("meet me at the harbor", 7)
print("\nسزار ۷:", secret)
print("شکستن با ۲۵ کلید:")
for k in range(26):
    cand = caesar(secret, -k)
    if "meet" in cand:
        print(f"  کلید {k}: {cand}")
