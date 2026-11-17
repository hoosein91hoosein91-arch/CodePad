# title: سنگ کاغذ قیچی
# desc: بازی با کامپیوتر؛ پایان با اولین ۳ برد
# cat: games
# level: 1
# stdin: قیچی
# stdin: قیچی
# stdin: قیچی
# stdin: قیچی
# stdin: سنگ
import random
beats = {"سنگ": "قیچی", "کاغذ": "سنگ", "قیچی": "کاغذ"}
random.seed(11)   # انتخاب‌های ثابت کامپیوتر برای نمایش
score = [0, 0]
while max(score) < 3:
    try:
        me = input("سنگ / کاغذ / قیچی؟ ").strip()
    except EOFError:
        print("\n(جواب‌های آماده تمام شد؛ حرکت‌های بیشتری در کادر «جواب‌های آماده» بنویس.)"); break
    if me not in beats:
        print("یکی از سه گزینه را بنویس."); continue
    cpu = random.choice(list(beats))
    if me == cpu:
        r = "مساوی"
    elif beats[me] == cpu:
        r = "بردی!"; score[0] += 1
    else:
        r = "باختی"; score[1] += 1
    print(f"تو: {me} | کامپیوتر: {cpu} → {r}   [{score[0]}-{score[1]}]")
print("برنده:", "تو 🏆" if score[0] > score[1] else "کامپیوتر 🤖")
