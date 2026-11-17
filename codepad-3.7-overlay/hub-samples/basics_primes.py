# title: اعداد اول و غربال
# desc: غربال اراتوستن، فاکتورگیری و عدد کامل
# cat: basics
# level: 2
def sieve(n):
    flags = [True] * (n + 1)
    flags[0:2] = [False, False]
    for i in range(2, int(n ** 0.5) + 1):
        if flags[i]:
            flags[i * i::i] = [False] * len(flags[i * i::i])
    return [i for i, ok in enumerate(flags) if ok]

def factors(n):
    out, d = [], 2
    while d * d <= n:
        while n % d == 0:
            out.append(d); n //= d
        d += 1
    return out + ([n] if n > 1 else [])

p = sieve(100000)
print("تعداد اول‌ها تا ۱۰۰۰۰۰:", len(p), "| آخرین:", p[-1])
print("فاکتورهای 360360:", factors(360360))
print("اعداد کامل زیر 10000:", [n for n in range(2, 10000) if sum(d for d in range(1, n) if n % d == 0) == n])
