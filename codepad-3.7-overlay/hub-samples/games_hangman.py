# title: مرد حلق‌آویز
# desc: کلمه‌های برنامه‌نویسی را حدس بزن
# cat: games
# level: 2
import random
words = ["python", "variable", "function", "network", "kernel", "compiler", "terminal", "algorithm", "binary", "pointer"]
word, found, wrong = random.choice(words), set(), set()
while len(wrong) < 6 and set(word) - found:
    print("\n" + " ".join(c if c in found else "_" for c in word), "| اشتباه:", " ".join(sorted(wrong)) or "-")
    g = input("حرف: ").lower()[:1]
    if not g.isalpha():
        continue
    (found if g in word else wrong).add(g)
print("\n🎉 برنده شدی!" if not set(word) - found else "\n💀 باختی؛ کلمه:", word)
