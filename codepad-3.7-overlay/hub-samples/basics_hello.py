# title: سلام دنیا + ورودی
# desc: اولین برنامه: ورودی گرفتن، متن فرمت‌شده و حلقهٔ ساده
# cat: basics
# level: 1
# stdin: علی
# stdin: 25
def ask(prompt, default=""):
    """جواب را از «جواب‌های آماده» می‌خواند؛ اگر نبود، مقدار پیش‌فرض."""
    try:
        return input(prompt)
    except EOFError:
        print()
        return default

name = ask("اسمت چیه؟ ") or "دوست من"
print(f"سلام {name}! 👋")
for i in range(1, 6):
    print("⭐" * i)
age = int(ask("چند سالته؟ ") or 18)
print(f"سال بعد {age + 1} ساله می‌شی.")
