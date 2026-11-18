// ذخیرهٔ متن به‌صورت فایل از داخل مرورگر/WebView
/** دانلود متن به‌صورت فایل (در WebView اندروید ممکن است پشتیبانی نشود؛ دکمهٔ «کپی» جایگزین است) */
export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
