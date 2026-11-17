# title: سلام دنیا + ورودی
# desc: اولین برنامه: ورودی گرفتن، متن فرمت‌شده و حلقهٔ ساده
# cat: basics
# level: 1
name = input("اسمت چیه؟ ") or "دوست من"
print(f"سلام {name}! 👋")
for i in range(1, 6):
    print("⭐" * i)
age = int(input("چند سالته؟ ") or 18)
print(f"سال بعد {age + 1} ساله می‌شی.")
