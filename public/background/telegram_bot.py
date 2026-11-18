"""CodePad 2.10: enter your own BotFather token, then press Run.
Uses HTTPS via Pyodide's pyfetch and CodePad's native network bridge.
No external package install is required. Stop from CodePad or its notification.
"""
import asyncio
import json
from pyodide.http import pyfetch

TOKEN = "PUT_YOUR_BOT_TOKEN_HERE"


class TelegramError(Exception):
    def __init__(self, code, retry=0):
        self.code, self.retry = code, retry


async def api(method, **parameters):
    response = await pyfetch(
        "https://api.telegram.org/bot" + TOKEN + "/" + method,
        method="POST",
        headers={"Content-Type": "application/json"},
        body=json.dumps(parameters),
    )
    result = await response.json()
    if not result.get("ok"):
        raise TelegramError(result.get("error_code", response.status), result.get("parameters", {}).get("retry_after", 0))
    return result["result"]


async def main():
    if TOKEN == "PUT_YOUR_BOT_TOKEN_HERE" or ":" not in TOKEN:
        print("توکن ربات خودت را در متغیر TOKEN وارد کن.")
        return
    identity = await api("getMe")
    webhook = await api("getWebhookInfo")
    if webhook.get("url"):
        print("این ربات webhook فعال دارد؛ قبل از اجرای polling آن را در تنظیمات ربات خودت غیرفعال کن.")
        return
    print("ربات روشن شد: @" + identity.get("username", ""), flush=True)
    offset, backoff = 0, 1
    while True:
        try:
            updates = await api("getUpdates", offset=offset, timeout=25, allowed_updates=["message"])
            for update in updates:
                message = update.get("message", {})
                text = message.get("text", "")
                if text and message.get("chat", {}).get("type") == "private":
                    await api("sendMessage", chat_id=message["chat"]["id"], text="سلام! خوبی؟")
                    print("یک پیام پاسخ داده شد.", flush=True)
                offset = update["update_id"] + 1
            backoff = 1
        except TelegramError as error:
            if error.code in (401, 409):
                print("توکن نامعتبر است یا یک نسخهٔ دیگر از همین ربات در حال اجراست.")
                return
            if error.code == 403:
                # A blocked/deleted chat must not prevent processing later updates.
                offset = update["update_id"] + 1
                continue
            print("تلگرام موقتاً پاسخ نداد؛ تلاش دوباره…", flush=True)
            await asyncio.sleep(max(error.retry, backoff))
            backoff = min(backoff * 2, 30)
        except Exception:
            # Never log request URLs: they contain the private bot token.
            print("اتصال قطع شد؛ تلاش دوباره…", flush=True)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


asyncio.run(main())
