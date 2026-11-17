# title: فیزباز و حلقه‌ها
# desc: شرط‌ها، باقی‌مانده و لیست‌های فشرده
# cat: basics
# level: 1
for n in range(1, 31):
    print("FizzBuzz" if n % 15 == 0 else "Fizz" if n % 3 == 0 else "Buzz" if n % 5 == 0 else n)
squares = [n * n for n in range(1, 11) if n % 2 == 0]
print("مربع‌های زوج:", squares)
print("مجموع:", sum(squares))
