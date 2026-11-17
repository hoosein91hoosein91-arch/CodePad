# title: رمزگشایی JWT (آفلاین)
# desc: خواندن Header/Payload و بررسی انقضا و الگوریتم ضعیف
# cat: security
# level: 3
def ask(prompt, default=""):
    """جواب را از «جواب‌های آماده» می‌خواند؛ اگر نبود، مقدار پیش‌فرض."""
    try:
        return input(prompt)
    except EOFError:
        print()
        return default

import base64, json, time

def b64(s):
    return json.loads(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)))

token = ask("JWT (خالی = نمونه): ").strip() or (
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0IiwibmFtZSI6IkFsaSIsImV4cCI6MTcwMDAwMDAwMCwicm9sZSI6ImFkbWluIn0.")
h, p, *_ = token.split(".")
head, body = b64(h), b64(p)
print("Header :", head)
print("Payload:", body)
if head.get("alg", "").lower() == "none":
    print("⚠️ الگوریتم none: امضا بررسی نمی‌شود (آسیب‌پذیر)")
if "exp" in body:
    print("منقضی شده؟", "بله" if body["exp"] < time.time() else "خیر")
print("نکته: این ابزار فقط رمزگشایی می‌کند و امضا را اعتبارسنجی نمی‌کند.")
