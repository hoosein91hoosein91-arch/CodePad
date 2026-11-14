import asyncio
import random


async def main():
    for i in range(10):
        print(random.choice(["سلام", "خوبی"]), flush=True)
        if i < 9:
            await asyncio.sleep(1)


asyncio.run(main())
