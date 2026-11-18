# Real Pillow graphics and the Python os module. Run in CodePad 3.4.
import os
from pathlib import Path
from PIL import Image, ImageDraw
from codepad import display

folder = Path('my_graphics')
folder.mkdir(exist_ok=True)
image = Image.new('RGB', (900, 540), '#080e0c')
draw = ImageDraw.Draw(image)
for n in range(7):
    x = 60 + n * 115
    height = 80 + n * 40
    draw.rounded_rectangle((x, 440-height, x+72, 440), radius=12, fill='#58eda5')
draw.text((60, 50), 'CODEPAD / PILLOW + CPYTHON', fill='#dfebe4', font_size=32)
output = folder / 'chart.png'
image.save(output)
print('Python:', os.sys.version.split()[0])
print('Project:', os.getcwd())
print('Files:', os.listdir(folder))
print('Saved:', output)
display(image, title='Pillow Studio')
