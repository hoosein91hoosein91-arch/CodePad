# title: آزمایشگاه هش
# desc: MD5/SHA، HMAC، و تشخیص نوع هش از روی طول
# cat: security
# level: 2
# stdin: CodePad 3.7
def ask(prompt, default=""):
    """جواب را از «جواب‌های آماده» می‌خواند؛ اگر نبود، مقدار پیش‌فرض."""
    try:
        return input(prompt)
    except EOFError:
        print()
        return default

import hashlib, hmac
text = ask("متن: ") or "CodePad"
for algo in ("md5", "sha1", "sha256", "sha512", "blake2b"):
    print(f"{algo:<8}", hashlib.new(algo, text.encode()).hexdigest()[:64])
print("HMAC-SHA256:", hmac.new(b"secret-key", text.encode(), hashlib.sha256).hexdigest())

def identify(h):
    kinds = {32: "MD5 / NTLM", 40: "SHA-1", 56: "SHA-224", 64: "SHA-256", 96: "SHA-384", 128: "SHA-512"}
    return kinds.get(len(h), "نامشخص") if all(c in "0123456789abcdefABCDEF" for c in h) else "هگز نیست"
print("\nتشخیص:", identify(hashlib.sha256(b"x").hexdigest()), "|", identify("5d41402abc4b2a76b9719d911017c592"))
