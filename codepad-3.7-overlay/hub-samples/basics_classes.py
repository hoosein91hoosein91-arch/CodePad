# title: کلاس‌ها: حساب بانکی
# desc: شی‌گرایی، استثنا و __repr__
# cat: basics
# level: 2
class InsufficientFunds(Exception):
    pass

class Account:
    def __init__(self, owner, balance=0):
        self.owner, self.balance, self.history = owner, balance, []

    def deposit(self, amount):
        self.balance += amount
        self.history.append(("deposit", amount))

    def withdraw(self, amount):
        if amount > self.balance:
            raise InsufficientFunds(f"موجودی {self.balance} کافی نیست")
        self.balance -= amount
        self.history.append(("withdraw", amount))

    def __repr__(self):
        return f"<Account {self.owner}: {self.balance}>"

acc = Account("علی", 100)
acc.deposit(50)
try:
    acc.withdraw(500)
except InsufficientFunds as e:
    print("خطا:", e)
acc.withdraw(30)
print(acc, acc.history)
