# title: ماشین‌حساب امن (بدون eval)
# desc: پارس عبارت با ast؛ تمرین امنیتی در برابر تزریق کد
# cat: tools
# level: 3
# stdin: 2+3*4
# stdin: sqrt(144)+2**10
# stdin: __import__('os').system('id')
import ast, math, operator as op

OPS = {ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv, ast.Pow: op.pow, ast.Mod: op.mod, ast.USub: op.neg}
FUNCS = {"sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "log": math.log, "abs": abs}
def ev(n):
    if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)): return n.value
    if isinstance(n, ast.BinOp) and type(n.op) in OPS: return OPS[type(n.op)](ev(n.left), ev(n.right))
    if isinstance(n, ast.UnaryOp) and type(n.op) in OPS: return OPS[type(n.op)](ev(n.operand))
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in FUNCS: return FUNCS[n.func.id](*map(ev, n.args))
    raise ValueError("عبارت مجاز نیست")
while True:
    try:
        s = input("عبارت (خالی = خروج): ")
    except EOFError:
        break
    if not s: break
    try:
        print("=", ev(ast.parse(s, mode="eval").body))
    except Exception as e:
        print("خطا:", e)
