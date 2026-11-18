# title: حدس عدد
# desc: بازی کنسولی با راهنمایی بالا/پایین و امتیاز
# cat: games
# level: 1
# stdin: 50
# stdin: 25
# stdin: 12
# stdin: 18
import random
random.seed(1)   # عدد ثابت برای نمایش؛ seed را عوض کن تا عدد دیگری بیاید
secret = random.randint(1, 100)
tries = 0
print("یک عدد بین ۱ تا ۱۰۰ حدس بزن! (۷ فرصت داری)")
while tries < 7:
    try:
        g = int(input(f"حدس {tries + 1}: "))
    except ValueError:
        print("عدد وارد کن."); continue
    except EOFError:
        print("\n(جواب‌های آماده تمام شد؛ حدس‌های بیشتری در کادر «جواب‌های آماده» بنویس.)"); break
    tries += 1
    if g == secret:
        print(f"🎉 درست بود! امتیاز: {(8 - tries) * 100}")
        break
    print("بالاتر ⬆️" if g < secret else "پایین‌تر ⬇️")
else:
    print("باختی؛ عدد", secret, "بود.")
