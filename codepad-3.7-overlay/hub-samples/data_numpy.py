# title: numpy: ماتریس و آمار
# desc: ضرب ماتریس، حل دستگاه، و آمار تصادفی
# cat: data
# level: 3
import numpy as np
A = np.array([[2.0, 1, -1], [-3, -1, 2], [-2, 1, 2]])
b = np.array([8.0, -11, -3])
x = np.linalg.solve(A, b)
print("جواب دستگاه:", x.round(3), "| درستی:", np.allclose(A @ x, b))
print("دترمینان:", round(np.linalg.det(A), 3))
rng = np.random.default_rng(1)
s = rng.normal(100, 15, 10000)
print(f"میانگین {s.mean():.2f}  انحراف {s.std():.2f}  صدک ۹۰: {np.percentile(s, 90):.1f}")
print("هیستوگرام:", np.histogram(s, bins=8)[0])
