# title: برج هانوی و بازگشت
# desc: توابع بازگشتی: هانوی، فیبوناچی با کش و جایگشت
# cat: basics
# level: 2
from functools import lru_cache
from itertools import permutations

def hanoi(n, a="A", b="B", c="C"):
    if n == 0:
        return 0
    return hanoi(n - 1, a, c, b) + 1 + hanoi(n - 1, c, b, a)

@lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print("حرکت‌های هانوی با ۱۰ دیسک:", hanoi(10))
print("فیبوناچی ۹۰:", fib(90))
print("جایگشت‌های abc:", ["".join(p) for p in permutations("abc")])
