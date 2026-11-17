"""Game data: weapons, enemy types, difficulty, shop, wave composition and all UI strings (Persian + English)."""
import random

# ---------------------------------------------------------------------------------------------- weapons
# rate = seconds between shots; spread / hip = half-cone in radians (ads / hip-fire); recoil = view kick (radians)
WEAPONS = {
    1: dict(name="M4A1 TACTICAL", mag=35, reserve=180, rate=0.090, dmg=34, pellets=1, spread=0.0045, hip=0.026, auto=True,
            ads_fov=46, recoil=0.0125, snd="ar", reload=1.35, bloom=0.0035, unlocked=True),
    2: dict(name="AK-47 KALASHNIKOV", mag=30, reserve=150, rate=0.128, dmg=48, pellets=1, spread=0.0065, hip=0.034, auto=True,
            ads_fov=48, recoil=0.021, snd="ak", reload=1.6, bloom=0.0055, unlocked=True),
    3: dict(name="DL-Q33 SNIPER", mag=6, reserve=36, rate=0.80, dmg=150, pellets=1, spread=0.0003, hip=0.07, auto=False,
            ads_fov=16, recoil=0.065, snd="sniper", reload=2.2, bloom=0.0, unlocked=True),
    4: dict(name="VECTOR SMG", mag=45, reserve=220, rate=0.056, dmg=25, pellets=1, spread=0.0075, hip=0.03, auto=True,
            ads_fov=52, recoil=0.0095, snd="smg", reload=1.45, bloom=0.0026, unlocked=False),
    5: dict(name="BY15 SHOTGUN (8x)", mag=8, reserve=48, rate=0.52, dmg=24, pellets=8, spread=0.032, hip=0.055, auto=False,
            ads_fov=54, recoil=0.05, snd="shotgun", reload=2.2, bloom=0.0, unlocked=False),
    6: dict(name="RPG-7 LAUNCHER", mag=2, reserve=10, rate=0.95, dmg=230, pellets=1, spread=0.003, hip=0.012, auto=False,
            ads_fov=50, recoil=0.08, snd="rpg", reload=2.6, bloom=0.0, unlocked=False, rocket=True),
    7: dict(name="M134 MINIGUN", mag=100, reserve=300, rate=0.048, dmg=28, pellets=1, spread=0.012, hip=0.034, auto=True,
            ads_fov=55, recoil=0.0085, snd="minigun", reload=3.3, bloom=0.0018, unlocked=False, minigun=True),
}
ZONE_MULT = {"head": 3.0, "chest": 1.25, "arms": 0.8, "legs": 0.65}

# ---------------------------------------------------------------------------------------------- AI weapons
AIW = {
    "SNIPER": dict(name="DL-Q33 SNIPER", dmg=46, burst=1, interval=2.3, gap=0.1, range=78, spread=0.004, snd="sniper", pellets=1),
    "AR": dict(name="AK-47 RIFLE", dmg=13, burst=3, interval=0.85, gap=0.11, range=48, spread=0.03, snd="ak", pellets=1),
    "SMG": dict(name="VECTOR SMG", dmg=9, burst=5, interval=0.62, gap=0.07, range=30, spread=0.05, snd="smg", pellets=1),
    "SHOTGUN": dict(name="BY15 SHOTGUN", dmg=9, burst=1, interval=1.2, gap=0.1, range=18, spread=0.09, snd="shotgun", pellets=6),
    "MINIGUN": dict(name="M134 MINIGUN", dmg=6, burst=16, interval=1.9, gap=0.055, range=44, spread=0.07, snd="minigun", pellets=1),
    "RPG": dict(name="RPG-7", dmg=0, burst=1, interval=3.6, gap=0.1, range=60, spread=0.0, snd="rpg", pellets=1),
}

# kind: hp, speed range, accuracy, score, primary / secondary AI weapon, sprite scale, first wave it can appear
ENEMY = {
    "grunt": dict(hp=105, spd=(4.6, 5.8), acc=0.45, score=100, prim="AR", sec="SMG", scale=1.0, armor=1.0),
    "rusher": dict(hp=82, spd=(6.6, 7.8), acc=0.40, score=130, prim="SMG", sec="SHOTGUN", scale=0.97, armor=1.0),
    "marksman": dict(hp=90, spd=(4.0, 4.8), acc=0.75, score=170, prim="SNIPER", sec="SMG", scale=1.0, armor=1.0),
    "heavy": dict(hp=340, spd=(3.3, 3.8), acc=0.40, score=340, prim="MINIGUN", sec="MINIGUN", scale=1.2, armor=0.55),
    "grenadier": dict(hp=118, spd=(4.6, 5.4), acc=0.42, score=190, prim="AR", sec="SHOTGUN", scale=1.0, armor=1.0),
    "boss": dict(hp=1700, spd=(4.2, 4.4), acc=0.55, score=1500, prim="RPG", sec="MINIGUN", scale=1.4, armor=0.45),
    "ally_ar": dict(hp=110, spd=(4.8, 6.0), acc=0.5, score=0, prim="AR", sec="SMG", scale=1.0, armor=1.0),
    "ally_sn": dict(hp=100, spd=(4.4, 5.2), acc=0.7, score=0, prim="SNIPER", sec="SMG", scale=1.0, armor=1.0),
    "ally_smg": dict(hp=105, spd=(5.4, 6.4), acc=0.48, score=0, prim="SMG", sec="SHOTGUN", scale=1.0, armor=1.0),
}
KIND_NAME = {"grunt": "GRUNT", "rusher": "RUSHER", "marksman": "MARKSMAN", "heavy": "HEAVY", "grenadier": "GRENADIER",
             "boss": "WARLORD"}

DIFFS = {
    "recruit": dict(edmg=0.62, eacc=0.72, ehp=0.80, lives=5, regen_delay=3.0, regen=15.0, espd=0.92, react=(0.9, 1.6)),
    "regular": dict(edmg=1.0, eacc=1.0, ehp=1.0, lives=3, regen_delay=5.0, regen=9.0, espd=1.0, react=(0.55, 1.1)),
    "hardened": dict(edmg=1.3, eacc=1.2, ehp=1.25, lives=2, regen_delay=6.0, regen=7.0, espd=1.06, react=(0.35, 0.8)),
    "veteran": dict(edmg=1.7, eacc=1.4, ehp=1.6, lives=1, regen_delay=8.0, regen=5.0, espd=1.12, react=(0.2, 0.55)),
}
DIFF_ORDER = ["recruit", "regular", "hardened", "veteran"]

# ---------------------------------------------------------------------------------------------- waves
def wave_composition(wave):
    n = min(8 + (wave - 1) * 2, 36)
    kinds = []
    if wave % 5 == 0:
        kinds += ["boss"] * (2 if (wave % 10 == 0 and wave >= 20) else 1)
        n = max(n - 3, 6)
    n_heavy = 0 if wave < 5 else min(1 + (wave - 5) // 2, 5)
    n_mark = 0 if wave < 3 else min(1 + (wave - 3) // 3, 4)
    n_gren = 0 if wave < 4 else min(1 + (wave - 4) // 3, 4)
    n_rush = 0 if wave < 2 else min(2 + wave // 2, 10)
    kinds += ["heavy"] * n_heavy + ["marksman"] * n_mark + ["grenadier"] * n_gren + ["rusher"] * n_rush
    kinds += ["grunt"] * max(0, n - len(kinds))
    # grunts / rushers open the fight as an 8v8, specials and the boss arrive later
    head = [k for k in kinds if k in ("grunt", "rusher")]
    tail = [k for k in kinds if k not in ("grunt", "rusher")]
    random.shuffle(head)
    random.shuffle(tail)
    k = max(4, len(head) // 2)
    return head[:k] + tail + head[k:]


def max_alive(wave):
    return min(8 + wave // 2, 14)


# ---------------------------------------------------------------------------------------------- shop
# id, price, max purchases (0 = unlimited)
SHOP = [
    ("smg", 150, 1), ("shotgun", 200, 1), ("rpg", 300, 1), ("minigun", 350, 1),
    ("turret", 200, 0), ("supply", 120, 0), ("grenade", 180, 0), ("upgrade", 250, 4),
    ("plates", 160, 3), ("hands", 140, 2), ("mags", 220, 2), ("focus", 150, 0),
]

# ---------------------------------------------------------------------------------------------- strings
STR = {
    "title": ("TACTICAL 8v8 : ULTRA", "تاکتیکال ۸ به ۸ : اولترا"),
    "subtitle": ("3D first-person squad shooter  -  waves, bosses, killstreaks, bullet-time",
                 "تیراندازی اول‌شخص سه‌بعدی  -  موج‌های دشمن، باس، کیل‌استریک و بولت‌تایم"),
    "start": ("DEPLOY TO THE BATTLEFIELD", "ورود به میدان نبرد"),
    "difficulty": ("DIFFICULTY", "سطح سختی"),
    "controls": ("CONTROLS", "راهنمای کنترل"),
    "language": ("LANGUAGE:  ENGLISH", "زبان:  فارسی"),
    "quality": ("RENDER QUALITY", "کیفیت تصویر"),
    "fullscreen": ("FULLSCREEN (F11)", "تمام‌صفحه (F11)"),
    "quit": ("QUIT", "خروج"),
    "resume": ("RESUME", "ادامه"),
    "restart": ("RESTART", "شروع دوباره"),
    "mainmenu": ("MAIN MENU", "منوی اصلی"),
    "back": ("BACK", "بازگشت"),
    "paused": ("PAUSED", "توقف بازی"),
    "best": ("BEST WAVE", "بهترین موج"),
    "wave": ("WAVE", "موج"),
    "get_ready": ("GET READY", "آماده باش"),
    "wave_clear": ("WAVE CLEARED", "موج پاک‌سازی شد"),
    "boss_in": ("WARLORD INBOUND", "فرمانده دشمن در راه است"),
    "next_wave": ("NEXT WAVE IN {n}  -  [B] SHOP  -  [ENTER] SKIP", "موج بعدی تا {n} ثانیه دیگر  -  [B] فروشگاه  -  [ENTER] شروع"),
    "enemies_left": ("HOSTILES", "دشمن"),
    "lives": ("LIVES", "جان"),
    "points": ("POINTS", "امتیاز"),
    "kills": ("KILLS", "کشته"),
    "streak": ("STREAK", "رگبار کشتن"),
    "focus": ("FOCUS", "تمرکز"),
    "reloading": ("RELOADING", "در حال پر کردن خشاب"),
    "no_ammo": ("NO AMMO", "مهمات تمام شد"),
    "low_ammo": ("LOW AMMO - PRESS R", "مهمات کم است - R"),
    "headshot": ("HEADSHOT", "هدشات"),
    "airstrike_in": ("AIRSTRIKE INBOUND!", "بمباران هوایی در راه است!"),
    "no_airstrike": ("NO AIRSTRIKES LEFT", "بمباران هوایی نداری"),
    "turret_on": ("SENTRY TURRET ONLINE", "تیربار خودکار فعال شد"),
    "uav_on": ("UAV ONLINE - ENEMIES MARKED", "پهپاد فعال شد - دشمنان نشان‌دار شدند"),
    "bt_on": ("BULLET TIME", "بولت‌تایم"),
    "bt_need": ("FOCUS TOO LOW", "تمرکز کافی نیست"),
    "stim_on": ("ADRENALINE +100%", "آدرنالین +۱۰۰٪"),
    "got_ammo": ("AMMO RESUPPLY", "مهمات تامین شد"),
    "got_med": ("MEDKIT", "کیت درمانی"),
    "got_armor": ("ARMOR PLATE", "صفحه زره"),
    "airdrop": ("CARE PACKAGE INBOUND - GRAB IT!", "بسته امدادی در راه است - بردار!"),
    "airdrop_got": ("CARE PACKAGE: FULL RESUPPLY", "بسته امدادی: تامین کامل"),
    "reinforce": ("ALLY REINFORCEMENT", "نیروی کمکی هم‌تیمی رسید"),
    "you_died": ("YOU WERE KILLED", "کشته شدی"),
    "respawn_in": ("REDEPLOYING IN {n}", "بازگشت به میدان تا {n}"),
    "game_over": ("MISSION FAILED", "ماموریت شکست خورد"),
    "new_best": ("NEW RECORD!", "رکورد جدید!"),
    "survived": ("WAVE REACHED", "موجی که به آن رسیدی"),
    "total_kills": ("TOTAL KILLS", "مجموع کشته‌ها"),
    "headshots": ("HEADSHOTS", "تعداد هدشات"),
    "score": ("SCORE", "امتیاز نهایی"),
    "press_enter": ("PRESS ENTER", "برای ادامه Enter بزن"),
    "laser": ("SNIPER LOCK!", "تک‌تیرانداز قفل کرد!"),
    "grenade_warn": ("GRENADE!", "نارنجک!"),
    "shop": ("ARMORY & TACTICAL GEAR", "زرادخانه و تجهیزات تاکتیکی"),
    "close_shop": ("CLOSE (B / ESC)", "بستن و بازگشت (B / ESC)"),
    "owned": ("OWNED", "خریداری شد"),
    "maxed": ("MAX", "حداکثر"),
    "need": ("NOT ENOUGH POINTS", "امتیاز کافی نیست"),
    "uav_kill": ("UAV", "پهپاد"),
    "ks3": ("3 KILLS: UAV", "۳ کشته: پهپاد"),
    "ks5": ("5 KILLS: AIRSTRIKE", "۵ کشته: بمباران هوایی"),
    "ks8": ("8 KILLS: SENTRY + ARMOR", "۸ کشته: تیربار خودکار + زره"),
    "ks12": ("12 KILLS: FOCUS OVERLOAD", "۱۲ کشته: شارژ کامل تمرکز"),
    "help_title": ("HOW TO PLAY", "راهنمای بازی"),
    "assist": ("AUTO-FIRE ASSIST", "کمک‌شلیک خودکار"),
    "on": ("ON", "روشن"),
    "off": ("OFF", "خاموش"),
    "sens": ("MOUSE SENSITIVITY", "حساسیت ماوس"),
}

HELP_ROWS = [
    ("W A S D", "Move", "حرکت"),
    ("MOUSE", "Aim", "هدف‌گیری"),
    ("LEFT CLICK", "Fire", "شلیک"),
    ("RIGHT CLICK", "Aim down sights / scope", "زوم و نشانه‌روی"),
    ("SHIFT", "Sprint (uses stamina)", "دویدن (انرژی مصرف می‌کند)"),
    ("CTRL / C", "Crouch   (sprint + crouch = SLIDE)", "نشستن   (دویدن + نشستن = سُرخوردن)"),
    ("SPACE", "Jump / vault over low cover", "پرش / رد شدن از سنگر کوتاه"),
    ("R", "Reload", "عوض کردن خشاب"),
    ("1-7 / WHEEL", "Switch weapon", "تعویض سلاح"),
    ("G", "Frag grenade", "نارنجک"),
    ("Q", "Adrenaline stim (full heal)", "آمپول آدرنالین (درمان کامل)"),
    ("T", "Deploy sentry turret", "کاشتن تیربار خودکار"),
    ("V", "Airstrike on your crosshair", "بمباران هوایی روی نشانه"),
    ("F", "BULLET TIME (needs focus)", "بولت‌تایم (نیاز به تمرکز)"),
    ("B", "Armory shop", "فروشگاه"),
    ("TAB", "Scoreboard", "جدول امتیاز"),
    ("X", "Auto-fire assist", "کمک‌شلیک خودکار"),
    ("ENTER", "Start next wave early", "شروع زودتر موج بعدی"),
    ("P / ESC", "Pause", "توقف بازی"),
    ("M / F11", "Mute / fullscreen", "بی‌صدا / تمام‌صفحه"),
]
HELP_TIPS = {
    "en": ["Headshots deal 3x damage and refill focus.  Crouch behind low barriers.  A red laser means a sniper is about to fire - break line of sight!",
           "Killstreaks:  3 = UAV   5 = airstrike   8 = sentry + armor   12 = full focus.   Shoot the red barrels to blow up whole squads."],
    "fa": ["هدشات ۳ برابر آسیب می‌زند و تمرکز را پر می‌کند. پشت سنگرهای کوتاه بنشین. لیزر قرمز یعنی تک‌تیرانداز می‌خواهد شلیک کند - از دیدش خارج شو!",
           "جایزه کشتن پشت‌سرهم:  ۳ = پهپاد   ۵ = بمباران   ۸ = تیربار + زره   ۱۲ = تمرکز کامل.   به بشکه‌های قرمز شلیک کن تا گروه دشمن منفجر شود."],
}

DIFF_NAMES = {
    "recruit": ("RECRUIT", "تازه‌کار"), "regular": ("REGULAR", "سرباز"),
    "hardened": ("HARDENED", "کهنه‌کار"), "veteran": ("VETERAN", "افسانه‌ای"),
}
DIFF_DESC = {
    "recruit": ("Weaker enemies, 5 lives, fast regen", "دشمن ضعیف‌تر، ۵ جان، ترمیم سریع"),
    "regular": ("Balanced fight, 3 lives", "نبرد متعادل، ۳ جان"),
    "hardened": ("Deadly accuracy, 2 lives", "دقت کشنده، ۲ جان"),
    "veteran": ("One life. Brutal. Good luck.", "فقط یک جان. بی‌رحمانه. موفق باشی."),
}

SHOP_TEXT = {
    "smg": (("VECTOR SMG", "Extreme fire rate for close quarters"), ("مسلسل دستی Vector SMG", "سرعت شلیک فوق‌العاده بالا برای درگیری نزدیک")),
    "shotgun": (("BY15 PUMP SHOTGUN (8 pellets)", "Devastating at short range"), ("شات‌گان تلمبه‌ای BY15 (۸ ساچمه)", "شلیک هم‌زمان ۸ ساچمه با تخریب ویرانگر")),
    "rpg": (("RPG-7 LAUNCHER", "Explosive rocket with blast radius"), ("راکت‌انداز سنگین RPG-7", "موشک انفجاری با موج تخریب شعاعی")),
    "minigun": (("M134 6-BARREL MINIGUN", "100-round belt, spins up as you fire"), ("مینی‌گان ۶ لوله‌ای M134", "رگبار سنگین ۱۰۰ تایی با چرخش لوله")),
    "turret": (("SENTRY TURRET +1", "Auto-targeting gun that holds a lane"), ("تیربار خودکار لیزری +۱", "تیربار هوشمند که خودش دشمن را می‌زند")),
    "supply": (("FULL RESUPPLY", "All ammo, armor, health and 2 stims"), ("خشاب کامل + آدرنالین + زره", "پر کردن فوری تمام مهمات، زره و آمپول احیا")),
    "grenade": (("2 GRENADES + 1 AIRSTRIKE", "Explosive support"), ("۲ نارنجک + ۱ بمباران هوایی", "پشتیبانی انفجاری و موشک هوایی")),
    "upgrade": (("URANIUM ROUNDS (+25% damage)", "Permanent damage boost for every weapon"), ("گلوله‌های اورانیومی (+۲۵٪ قدرت)", "افزایش دائمی قدرت تخریب تمام سلاح‌ها")),
    "plates": (("HEAVY ARMOR PLATES (+25 max armor)", "Also refills armor"), ("صفحات زره سنگین (+۲۵ زره)", "حداکثر زره بیشتر و پر شدن آن")),
    "hands": (("FAST HANDS (-25% reload time)", "Reload and swap quicker"), ("دست‌های سریع (۲۵٪ پر کردن سریع‌تر)", "تعویض خشاب سریع‌تر")),
    "mags": (("EXTENDED MAGS (+30% capacity)", "Bigger magazines for every gun"), ("خشاب‌های بزرگ (+۳۰٪ ظرفیت)", "خشاب بزرگ‌تر برای همه سلاح‌ها")),
    "focus": (("FOCUS BATTERY (+50 focus)", "Charge for bullet-time"), ("باتری تمرکز (+۵۰)", "شارژ برای بولت‌تایم")),
}

LANG_FA = 1
LANG_EN = 0
