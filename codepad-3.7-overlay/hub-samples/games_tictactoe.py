# title: دوز (دو نفره)
# desc: خانه‌ها را ۱ تا ۹ بزن؛ تشخیص برد و مساوی
# cat: games
# level: 2
# stdin: 1
# stdin: 2
# stdin: 5
# stdin: 3
# stdin: 9
board = [" "] * 9
wins = [(0,1,2),(3,4,5),(6,7,8),(0,3,6),(1,4,7),(2,5,8),(0,4,8),(2,4,6)]
def show():
    for r in range(3):
        print(" | ".join(board[r*3:r*3+3]))
        if r < 2: print("--+---+--")
player = "X"
for turn in range(9):
    show()
    while True:
        try:
            s = input(f"\nنوبت {player} (۱-۹): ")
        except EOFError:
            print("\n(جواب‌های آماده تمام شد؛ حرکت‌های بیشتری در کادر «جواب‌های آماده» بنویس.)"); raise SystemExit
        if s.isdigit() and 1 <= int(s) <= 9 and board[int(s)-1] == " ":
            board[int(s)-1] = player; break
        print("خانهٔ نامعتبر.")
    if any(all(board[i] == player for i in w) for w in wins):
        show(); print(f"\n🏆 {player} برد!"); break
    player = "O" if player == "X" else "X"
else:
    show(); print("\nمساوی!")
