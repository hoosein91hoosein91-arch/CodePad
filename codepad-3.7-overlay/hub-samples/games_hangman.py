# title: مرد حلق‌آویز
# desc: کلمه‌های برنامه‌نویسی را حدس بزن
# cat: games
# level: 2
# stdin: e
# stdin: a
# stdin: p
# stdin: y
# stdin: t
# stdin: h
# stdin: o
# stdin: n
import random
words = ["python", "variable", "function", "network", "kernel", "compiler", "terminal", "algorithm", "binary", "pointer"]
random.seed(2)   # کلمهٔ ثابت برای نمایش؛ seed را عوض کن
word, found, wrong = random.choice(words), set(), set()
while len(wrong) < 6 and set(word) - found:
    print("\n" + " ".join(c if c in found else "_" for c in word), "| اشتباه:", " ".join(sorted(wrong)) or "-")
    try:
        g = input("حرف: ").lower()[:1]
    except EOFError:
        print("\n(جواب‌های آماده تمام شد؛ حرف‌های بیشتری در کادر «جواب‌های آماده» بنویس.)"); break
    if not g.isalpha():
        continue
    (found if g in word else wrong).add(g)
print("\n🎉 برنده شدی!" if not set(word) - found else "\n💀 باختی؛ کلمه:", word)
