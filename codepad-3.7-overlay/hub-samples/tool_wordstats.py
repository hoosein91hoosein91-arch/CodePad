# title: آمار متن
# desc: شمارش کلمه‌ها و پرتکرارترین‌ها، مناسب فارسی و انگلیسی
# cat: tools
# level: 2
def ask(prompt, default=""):
    """جواب را از «جواب‌های آماده» می‌خواند؛ اگر نبود، مقدار پیش‌فرض."""
    try:
        return input(prompt)
    except EOFError:
        print()
        return default

import re
from collections import Counter
text = ask("متن را بنویس یا paste کن: ") or "کد نویسی لذت بخش است و کد خوب ساده است. Code is fun, code is art!"
words = re.findall(r"[\w؀-ۿ]+", text.lower())
c = Counter(words)
print("کلمه‌ها:", len(words), "| یکتا:", len(c), "| حرف‌ها:", len(text))
print("پرتکرارها:", c.most_common(5))
print("طولانی‌ترین کلمه:", max(words, key=len) if words else "-")
