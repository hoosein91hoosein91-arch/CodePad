// «مرجع پایتون»: کتابخانهٔ مرجع برای مرور سریع سینتکس و کتابخانهٔ استاندارد، هنگام کدنویسی.
// هر مدخل کد واقعی و قابل‌اجراست (نه مثال نمایشی)؛ با دکمهٔ «▶ اجرا» مستقیم در ویرایشگر باز و اجرا می‌شود.

export const REFERENCE_CATEGORIES = [
  ["all", "همه"], ["basics", "نحو پایه"], ["strings", "رشته‌ها"], ["collections", "لیست/دیکشنری"],
  ["builtins", "توابع پرکاربرد"], ["files", "فایل و استثنا"], ["stdlib", "کتابخانهٔ استاندارد"], ["errors", "خطاهای رایج"],
];

export const REFERENCE_ITEMS = [
  // ───────── نحو پایه ─────────
  { id: "ref-vars", cat: "basics", title: "متغیر و نوع داده", desc: "تعریف متغیر، نوع‌ها، و تابع type()",
    code: 'name = "سارا"\nage = 23\nheight = 1.68\nis_student = True\nprint(type(name), type(age), type(height), type(is_student))\nprint(f"{name} {age} ساله است.")' },
  { id: "ref-if", cat: "basics", title: "شرط if/elif/else", desc: "شاخه‌بندی با شرط",
    code: 'score = 72\nif score >= 90:\n    grade = "A"\nelif score >= 70:\n    grade = "B"\nelif score >= 50:\n    grade = "C"\nelse:\n    grade = "F"\nprint("نمره:", grade)' },
  { id: "ref-for", cat: "basics", title: "حلقهٔ for و range", desc: "پیمایش با for، range(start, stop, step)",
    code: 'for i in range(1, 10, 2):\n    print(i, end=" ")\nprint()\nfor ch in "abc":\n    print(ch.upper(), end="")\nprint()' },
  { id: "ref-while", cat: "basics", title: "حلقهٔ while و break/continue", desc: "تکرار تا برقراری شرط",
    code: 'n = 0\ntotal = 0\nwhile n < 20:\n    n += 1\n    if n % 2 == 0:\n        continue  # عدد زوج را رد کن\n    if total > 50:\n        break\n    total += n\nprint("مجموع اعداد فرد تا رسیدن به ۵۰:", total)' },
  { id: "ref-func", cat: "basics", title: "تعریف تابع، آرگومان پیش‌فرض و *args/**kwargs", desc: "ساخت تابع با انواع آرگومان",
    code: 'def greet(name, greeting="سلام", *extra, **info):\n    msg = f"{greeting} {name}!"\n    if extra:\n        msg += " (" + ", ".join(extra) + ")"\n    if info:\n        msg += " " + str(info)\n    return msg\n\nprint(greet("علی"))\nprint(greet("سارا", "درود", "خوش‌آمدی", city="تهران"))' },
  { id: "ref-class", cat: "basics", title: "کلاس ساده و وراثت", desc: "تعریف کلاس، __init__، متد و ارث‌بری",
    code: 'class Animal:\n    def __init__(self, name):\n        self.name = name\n    def speak(self):\n        return f"{self.name} صدایی تولید می‌کند."\n\nclass Dog(Animal):\n    def speak(self):\n        return f"{self.name} پارس می‌کند."\n\nfor a in [Animal("حیوان"), Dog("رکس")]:\n    print(a.speak())' },
  { id: "ref-lambda", cat: "basics", title: "تابع لامبدا", desc: "تابع یک‌خطی بی‌نام",
    code: 'square = lambda x: x * x\nadd = lambda a, b=10: a + b\nprint(square(7))\nprint(add(5))\nprint(sorted([3, -1, 4, -2], key=lambda n: abs(n)))' },

  // ───────── رشته‌ها ─────────
  { id: "ref-fstring", cat: "strings", title: "f-string و فرمت‌دهی عدد", desc: "رشته‌های قالب‌بندی‌شده با f\"...\"",
    code: 'pi = 3.14159265\nname = "کدپد"\nprint(f"{name} نسخهٔ {3.7}")\nprint(f"عدد پی با ۲ رقم اعشار: {pi:.2f}")\nprint(f"عدد با جداکنندهٔ هزار: {1234567:,}")\nprint(f"{42:05d}")  # پر کردن با صفر' },
  { id: "ref-slice", cat: "strings", title: "برش رشته (Slicing)", desc: "s[start:stop:step]",
    code: 's = "سلام دنیای پایتون"\nprint(s[:4])      # از اول تا اندیس ۴\nprint(s[5:])      # از اندیس ۵ تا آخر\nprint(s[::-1])    # برعکس‌کردن رشته\nprint(s[::2])     # هر کاراکتر دوم' },
  { id: "ref-strmethods", cat: "strings", title: "متدهای پرکاربرد رشته", desc: "strip, split, join, replace, find",
    code: 's = "  Hello, World, Python  "\nprint(s.strip())\nprint(s.strip().split(", "))\nprint("-".join(["a", "b", "c"]))\nprint(s.replace("World", "CodePad"))\nprint(s.lower().find("python"))' },
  { id: "ref-strcheck", cat: "strings", title: "بررسی نوع رشته", desc: "isdigit, isalpha, startswith, in",
    code: 'items = ["123", "abc", "abc123", "", "علی"]\nfor x in items:\n    print(x or "(خالی)", "-> digit:", x.isdigit(), "alpha:", x.isalpha())\nprint("py" in "python")\nprint("python".startswith("py"), "python".endswith("on"))' },
  { id: "ref-regex", cat: "strings", title: "عبارت باقاعده (regex) پایه", desc: "جست‌وجو، جایگزینی و استخراج با re",
    code: 'import re\ntext = "تماس با 09123456789 یا 02112345678"\nphones = re.findall(r"0\\d{10}", text)\nprint(phones)\nclean = re.sub(r"\\d", "#", text)\nprint(clean)\nm = re.search(r"(\\d{4})(\\d{7})", phones[0])\nprint(m.group(1), m.group(2))' },

  // ───────── لیست/دیکشنری ─────────
  { id: "ref-list", cat: "collections", title: "لیست: append, sort, slicing", desc: "عملیات پایهٔ لیست",
    code: 'nums = [5, 2, 8, 1, 9]\nnums.append(3)\nnums.sort()\nprint(nums)\nnums.sort(reverse=True)\nprint(nums)\nprint(nums[1:4])\nprint(sum(nums), max(nums), min(nums))' },
  { id: "ref-listcomp", cat: "collections", title: "List/Dict Comprehension", desc: "ساخت لیست/دیکشنری در یک خط",
    code: 'squares = [n * n for n in range(1, 8)]\nevens = [n for n in range(20) if n % 2 == 0]\nword_len = {w: len(w) for w in ["python", "hub", "codepad"]}\nprint(squares)\nprint(evens)\nprint(word_len)' },
  { id: "ref-dict", cat: "collections", title: "دیکشنری: get, keys, items", desc: "عملیات پایهٔ دیکشنری",
    code: 'user = {"name": "علی", "age": 30, "city": "تهران"}\nprint(user.get("name"))\nprint(user.get("email", "ثبت نشده"))\nfor key, value in user.items():\n    print(f"{key}: {value}")\nuser["age"] += 1\nprint(user)' },
  { id: "ref-set", cat: "collections", title: "مجموعه (set) و عملیات آن", desc: "اشتراک، اجتماع و تفاضل",
    code: 'a = {1, 2, 3, 4}\nb = {3, 4, 5, 6}\nprint("اشتراک:", a & b)\nprint("اجتماع:", a | b)\nprint("تفاضل a-b:", a - b)\nprint("فقط یکی از دو:", a ^ b)' },
  { id: "ref-tuple", cat: "collections", title: "تاپل و باز‌کردن مقادیر (unpacking)", desc: "تاپل غیرقابل‌تغییر، چندمقداری برگرداندن",
    code: 'def min_max(nums):\n    return min(nums), max(nums)\n\nlow, high = min_max([4, 1, 9, 3])\nprint(f"کمترین: {low}, بیشترین: {high}")\npoint = (3, 4)\nx, y = point\nprint(x, y)' },
  { id: "ref-zipenum", cat: "collections", title: "zip و enumerate با هم", desc: "پیمایش هم‌زمان چند لیست با شمارنده",
    code: 'names = ["علی", "سارا", "رضا"]\nscores = [85, 92, 78]\nfor i, (name, score) in enumerate(zip(names, scores), start=1):\n    print(f"{i}. {name}: {score}")' },

  // ───────── توابع پرکاربرد ─────────
  { id: "ref-mapfilter", cat: "builtins", title: "map و filter", desc: "اعمال تابع روی هر عضو، فیلترکردن",
    code: 'nums = [1, 2, 3, 4, 5, 6, 7, 8]\ndoubled = list(map(lambda n: n * 2, nums))\nevens = list(filter(lambda n: n % 2 == 0, nums))\nprint(doubled)\nprint(evens)' },
  { id: "ref-sorted", cat: "builtins", title: "sorted با key", desc: "مرتب‌سازی سفارشی بدون تغییر لیست اصلی",
    code: 'people = [{"name": "علی", "age": 30}, {"name": "سارا", "age": 23}, {"name": "رضا", "age": 41}]\nby_age = sorted(people, key=lambda p: p["age"])\nfor p in by_age:\n    print(p["name"], p["age"])' },
  { id: "ref-anyall", cat: "builtins", title: "any و all", desc: "بررسی سریع شرط روی مجموعه‌ای از مقادیر",
    code: 'nums = [4, 8, 15, 16, 23, 42]\nprint(all(n > 0 for n in nums))\nprint(any(n > 40 for n in nums))\nprint(all(n % 2 == 0 for n in nums))' },
  { id: "ref-counter", cat: "builtins", title: "شمارش با collections.Counter", desc: "شمردن تکرار عناصر",
    code: 'from collections import Counter\nwords = "گربه سگ گربه مرغ سگ گربه".split()\ncounts = Counter(words)\nprint(counts)\nprint(counts.most_common(2))' },
  { id: "ref-numfmt", cat: "builtins", title: "round، abs و تبدیل نوع", desc: "گرد کردن، قدر مطلق، int/float/str",
    code: 'print(round(3.14159, 2))\nprint(round(2.5), round(3.5))  # گرد کردن بانکی\nprint(abs(-7))\nprint(int("42"), float("3.14"), str(99))' },

  // ───────── فایل و استثنا ─────────
  { id: "ref-tryexcept", cat: "files", title: "try/except/else/finally", desc: "مدیریت خطا به‌شکل کامل",
    code: 'def safe_div(a, b):\n    try:\n        result = a / b\n    except ZeroDivisionError:\n        print("خطا: تقسیم بر صفر!")\n        return None\n    except TypeError:\n        print("خطا: نوع ورودی نادرست است.")\n        return None\n    else:\n        print("بدون خطا اجرا شد.")\n        return result\n    finally:\n        print("این خط همیشه اجرا می‌شود.")\n\nprint(safe_div(10, 2))\nprint(safe_div(10, 0))' },
  { id: "ref-raise", cat: "files", title: "raise و استثنای سفارشی", desc: "ساخت و پرتاب خطای دلخواه",
    code: 'class NegativeAgeError(Exception):\n    pass\n\ndef set_age(age):\n    if age < 0:\n        raise NegativeAgeError("سن نمی‌تواند منفی باشد.")\n    return age\n\ntry:\n    set_age(-5)\nexcept NegativeAgeError as e:\n    print("گرفته شد:", e)' },
  { id: "ref-file", cat: "files", title: "خواندن/نوشتن فایل با with", desc: "باز و بسته شدن خودکار فایل",
    code: 'with open("note.txt", "w", encoding="utf-8") as f:\n    f.write("سلام از CodePad!\\nخط دوم.")\n\nwith open("note.txt", encoding="utf-8") as f:\n    for line in f:\n        print("خط:", line.strip())' },
  { id: "ref-json", cat: "files", title: "کار با JSON", desc: "تبدیل بین دیکشنری پایتون و متن JSON",
    code: 'import json\ndata = {"name": "کدپد", "version": 3.7, "tags": ["python", "security"]}\ntext = json.dumps(data, ensure_ascii=False, indent=2)\nprint(text)\nparsed = json.loads(text)\nprint(parsed["tags"])' },

  // ───────── کتابخانهٔ استاندارد ─────────
  { id: "ref-datetime", cat: "stdlib", title: "تاریخ و زمان با datetime", desc: "گرفتن زمان فعلی، محاسبه با timedelta",
    code: 'from datetime import datetime, timedelta\nnow = datetime.now()\nprint("اکنون:", now.strftime("%Y-%m-%d %H:%M:%S"))\nnext_week = now + timedelta(days=7)\nprint("یک هفته بعد:", next_week.strftime("%Y-%m-%d"))' },
  { id: "ref-random", cat: "stdlib", title: "اعداد تصادفی با random", desc: "عدد تصادفی، انتخاب و جابه‌جایی لیست",
    code: 'import random\nprint(random.randint(1, 6))        # تاس شش‌وجهی\nprint(random.choice(["سنگ", "کاغذ", "قیچی"]))\nnums = [1, 2, 3, 4, 5]\nrandom.shuffle(nums)\nprint(nums)' },
  { id: "ref-math", cat: "stdlib", title: "math: جذر، توان، ثابت‌ها", desc: "توابع ریاضی پرکاربرد",
    code: 'import math\nprint(math.sqrt(144))\nprint(math.pow(2, 10))\nprint(math.pi, math.e)\nprint(math.ceil(4.1), math.floor(4.9))\nprint(math.gcd(48, 18))' },
  { id: "ref-os", cat: "stdlib", title: "os و pathlib برای مسیر فایل", desc: "کار امن با مسیر، بدون وابستگی به سیستم‌عامل",
    code: 'from pathlib import Path\np = Path("data") / "reports" / "out.txt"\nprint(p)\nprint(p.name, p.suffix, p.parent)\nprint(p.with_suffix(".json"))' },
  { id: "ref-itertools", cat: "stdlib", title: "itertools: ترکیب و چینش", desc: "permutations، combinations، product",
    code: 'from itertools import combinations, permutations\nitems = ["A", "B", "C"]\nprint(list(combinations(items, 2)))\nprint(list(permutations(items, 2)))' },

  // ───────── خطاهای رایج ─────────
  { id: "ref-err-indent", cat: "errors", title: "IndentationError", desc: "تورفتگی (indentation) ناهماهنگ",
    code: '# اشتباه رایج: فاصله/تب قاطی می‌شود یا یک خط بعد از : تورفتگی ندارد\n# if True:\n# print("بد")   <- این خط باید تورفته باشد\n\nif True:\n    print("درست: ۴ فاصله یکدست در کل فایل استفاده کن")' },
  { id: "ref-err-type", cat: "errors", title: "TypeError: نوع ناسازگار", desc: "جمع‌کردن رشته و عدد بدون تبدیل",
    code: 'age = 23\ntry:\n    print("سن: " + age)   # TypeError: str + int ممکن نیست\nexcept TypeError as e:\n    print("خطا:", e)\nprint("راه‌حل: " + str(age))  # تبدیل صریح به رشته' },
  { id: "ref-err-index", cat: "errors", title: "IndexError: اندیس خارج از محدوده", desc: "دسترسی به اندیسی که وجود ندارد",
    code: 'items = [10, 20, 30]\ntry:\n    print(items[5])\nexcept IndexError as e:\n    print("خطا:", e)\nprint("راه‌حل: طول را قبل از دسترسی بررسی کن:", len(items))\nif len(items) > 5:\n    print(items[5])\nelse:\n    print("اندیس ۵ وجود ندارد.")' },
  { id: "ref-err-key", cat: "errors", title: "KeyError: کلید وجود ندارد", desc: "دسترسی مستقیم به کلید نامعتبر دیکشنری",
    code: 'user = {"name": "علی"}\ntry:\n    print(user["email"])\nexcept KeyError as e:\n    print("خطا: کلید", e, "وجود ندارد")\nprint("راه‌حل: از get استفاده کن ->", user.get("email", "نامشخص"))' },
  { id: "ref-err-name", cat: "errors", title: "NameError: متغیر تعریف‌نشده", desc: "استفاده از متغیری که قبلش ساخته نشده",
    code: 'try:\n    print(total)  # هنوز تعریف نشده\nexcept NameError as e:\n    print("خطا:", e)\ntotal = 0  # راه‌حل: قبل از استفاده تعریفش کن\nprint("حالا درست است:", total)' },
  { id: "ref-err-zero", cat: "errors", title: "ZeroDivisionError", desc: "تقسیم بر صفر",
    code: 'a, b = 10, 0\ntry:\n    print(a / b)\nexcept ZeroDivisionError as e:\n    print("خطا:", e)\nprint("راه‌حل: قبل از تقسیم مخرج را بررسی کن ->", a / b if b != 0 else "تقسیم‌ناپذیر")' },
  { id: "ref-err-attr", cat: "errors", title: "AttributeError", desc: "استفاده از متدی که روی آن نوع وجود ندارد",
    code: 'num = 42\ntry:\n    num.append(1)  # append فقط برای list است، نه int\nexcept AttributeError as e:\n    print("خطا:", e)\nprint("راه‌حل: نوع واقعی را با type() چک کن ->", type(num))' },
];
