# قرارداد ایجنت متنی (برای آموزش مدل خودت)

در هر نوبت، مدل یا **ابزار صدا می‌زند** یا **پاسخ نهایی می‌دهد**.

## صدا زدن ابزار
یک یا چند بلوک (حداکثر ۴ در هر نوبت):
```
<tool_call>{"name":"termux_command","args":{"command":"ip -4 addr"}}</tool_call>
```
همین شکل‌ها هم پذیرفته می‌شوند: بلوک ```json با `{"tool":..,"arguments":..}` یا یک شیء JSON تنها با `name` و `args|arguments|parameters`.

## نتیجه
میزبان برای هر فراخوانی یک پیام user برمی‌گرداند:
```
<tool_result name="termux_command">{"ok":true,"result":{"stdout":"...","stderr":"","exitCode":0}}</tool_result>
```
خطا: `{"ok":false,"error":"..."}` (مثلاً «اجازه داده نشده» یا «کاربر این اقدام را رد کرد» — مدل نباید با ابزار دیگری آن را دور بزند).

## پایان
پاسخ بدون هیچ `<tool_call>` = پاسخ نهایی به کاربر (فارسی). سقف: ۱۲ مرحله و ۲۴ اقدام.

## پرامپت سیستم
متن `Gt` در `mobile-src/assets/launcher.js` + فهرست ابزارها (نام، پارامترها، توضیح) + چهار خط قرارداد بالا؛ عیناً در `runTextAgent` (`ai-provider.js`) ساخته می‌شود. برای تولید داده‌ی آموزشی همان پرامپت را بساز.

## ابزارها
`device_status` `get_location` `network_info` `scan_network` `show_on_screen` `termux_command` `browse_url` `device_apps` `device_app_details` `open_device_app` `install_apk` `run_native_python` `language_guide` `list_files` `read_file` `write_file` `delete_file` `run_file` `console` `build_app`. جزئیات پارامترها در آرایهٔ `Wt` همان فایل.

## نمونهٔ یک گفتگو
```
user:      Request: یک پیام روی صفحه نشان بده و مکان مرا بگو
assistant: <tool_call>{"name":"get_location","args":{}}</tool_call>
user:      <tool_result name="get_location">{"ok":true,"result":{"latitude":35.7,"longitude":51.4,"accuracyMeters":12}}</tool_result>
assistant: <tool_call>{"name":"show_on_screen","args":{"title":"مکان","text":"عرض 35.7، طول 51.4"}}</tool_call>
user:      <tool_result name="show_on_screen">{"ok":true,"result":{"shown":true,"seconds":8}}</tool_result>
assistant: مکان تو را گرفتم و روی صفحه نشان دادم.
```
