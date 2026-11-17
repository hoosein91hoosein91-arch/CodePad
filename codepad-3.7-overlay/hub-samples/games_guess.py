# title: حدس عدد
# desc: بازی کنسولی با راهنمایی بالا/پایین و امتیاز
# cat: games
# level: 1
import random
secret = random.randint(1, 100)
tries = 0
print("یک عدد بین ۱ تا ۱۰۰ حدس بزن! (۷ فرصت داری)")
while tries < 7:
    try:
        g = int(input(f"حدس {tries + 1}: "))
    except ValueError:
        print("عدد وارد کن."); continue
    tries += 1
    if g == secret:
        print(f"🎉 درست بود! امتیاز: {(8 - tries) * 100}")
        break
    print("بالاتر ⬆️" if g < secret else "پایین‌تر ⬇️")
else:
    print("باختی؛ عدد", secret, "بود.")
