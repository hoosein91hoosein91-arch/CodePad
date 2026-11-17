# title: الگوریتم‌های مرتب‌سازی
# desc: حبابی، ادغام و سریع؛ مقایسهٔ زمان اجرا
# cat: basics
# level: 3
import random, time

def bubble(a):
    a = a[:]
    for i in range(len(a)):
        for j in range(len(a) - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
    return a

def merge_sort(a):
    if len(a) < 2:
        return a
    m = len(a) // 2
    l, r = merge_sort(a[:m]), merge_sort(a[m:])
    out = []
    while l and r:
        out.append(l.pop(0) if l[0] <= r[0] else r.pop(0))
    return out + l + r

def quick(a):
    if len(a) < 2:
        return a
    p = a[len(a) // 2]
    return quick([x for x in a if x < p]) + [x for x in a if x == p] + quick([x for x in a if x > p])

data = [random.randint(0, 9999) for _ in range(1500)]
for f in (bubble, merge_sort, quick, sorted):
    t = time.perf_counter()
    assert f(data) == sorted(data)
    print(f"{f.__name__:<11} {(time.perf_counter() - t) * 1000:8.1f} ms")
