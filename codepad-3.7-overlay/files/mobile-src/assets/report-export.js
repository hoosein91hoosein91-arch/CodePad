// «ذخیره / اشتراک» برای گزارش‌ها و فایل‌هایی که برنامه می‌سازد (Python: codepad.share_file، تحلیل فایل، CTF…).
//  • ویندوز: بی‌پرسش در یک پوشهٔ عمومی کنار فایل‌های خودت ذخیره می‌شود: Documents\CodePad\Reports (و دکمهٔ «نمایش در پوشه»).
//  • اندروید: انتخابگر فایل خود سیستم باز می‌شود تا هر پوشهٔ عمومی (Download، Documents…) را انتخاب کنی؛ «اشتراک» برگهٔ اشتراک‌گذاری اندروید را باز می‌کند.
//  • مرورگر: دانلود معمولی؛ «اشتراک» اگر مرورگر Web Share داشته باشد.
const te = new TextEncoder();
const TEXT_RE = /^(text\/|application\/(json|xml|javascript))/;
export const isText = (mime, name = "") => TEXT_RE.test(mime || "") || /\.(txt|log|md|csv|json|html?|xml|ini|conf)$/i.test(name);
const cap = () => globalThis.Capacitor;
const isAndroid = () => cap()?.getPlatform?.() === "android";
const toB64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** نام فایل امن و خوانا: بدون مسیر، با تاریخ، بدون پسوند اجرایی. */
export function reportFileName(name, now = new Date()) {
  const base = String(name || "report.txt").split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^\.+/, "").trim().slice(0, 100) || "report.txt";
  const m = base.match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/), stem = m[1] || "report", ext = (m[2] || ".txt").toLowerCase();
  if (/^\.(exe|bat|cmd|ps1|vbs|js|jse|wsf|msi|dll|scr|com|lnk|hta|jar|sh|apk)$/.test(ext)) return `${stem}${ext}.txt`;
  const p = (n) => String(n).padStart(2, "0");
  return `${stem}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${ext}`;
}

export async function saveReport({ name, bytes, mime }) {
  const fileName = reportFileName(name);
  const d = globalThis.cpDesktop;
  if (d?.files?.save) { const r = await d.files.save(fileName, toB64(bytes)); return { where: "folder", path: r.path, dir: r.dir, name: r.name }; }
  if (isAndroid()) { const rt = await import("./runtime.js"); const ok = await rt.saveCodePadFile(fileName, bytes, mime || "application/octet-stream"); return { where: "picker", saved: !!ok, name: fileName }; }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || "application/octet-stream" })), a = document.createElement("a");
  a.href = url; a.download = fileName; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 6e4);
  return { where: "download", name: fileName };
}

export async function shareReport({ name, bytes, mime, title }) {
  const text = isText(mime, name) ? new TextDecoder().decode(bytes) : null;
  if (isAndroid() && text !== null && cap().nativePromise && cap().isPluginAvailable?.("CodePadSystem")) {
    try { await cap().nativePromise("CodePadSystem", "shareText", { text: text.slice(0, 200000), subject: title || name }); return { ok: true, how: "android" }; } catch (e) { /* ادامه با روش‌های دیگر */ }
  }
  if (typeof navigator.share === "function") {
    const file = new File([bytes], reportFileName(name), { type: mime || "application/octet-stream" });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: title || name }); return { ok: true, how: "files" }; } } catch (e) { if (e?.name === "AbortError") return { ok: false, cancelled: true }; }
    if (text !== null) try { await navigator.share({ title: title || name, text: text.slice(0, 50000) }); return { ok: true, how: "text" }; } catch (e) { if (e?.name === "AbortError") return { ok: false, cancelled: true }; }
  }
  return { ok: false, unsupported: true };
}

let dialog;
function ensureDialog() {
  if (dialog) return dialog;
  const style = document.createElement("style");
  style.textContent = `.cp-report{position:fixed;inset:0;margin:auto;height:fit-content;max-height:92dvh;overflow:auto;border:1px solid #1f7a58;border-radius:14px;padding:0;background:#04100c;color:#d6fff0;max-width:min(560px,94vw);width:100%;direction:rtl;font:14px/1.7 Vazirmatn,system-ui,sans-serif}
.cp-report::backdrop{background:rgba(0,0,0,.7)}.cp-report form{display:flex;flex-direction:column;gap:10px;padding:16px}
.cp-report h2{margin:0;font-size:16px;color:#00ff9c}.cp-report small{color:#6fb59a}.cp-report pre{margin:0;max-height:34vh;overflow:auto;padding:10px;border:1px solid #0f4a35;border-radius:8px;background:#020807;color:#9ef7cf;font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all;direction:ltr;text-align:left}
.cp-report .row{display:flex;flex-wrap:wrap;gap:8px}.cp-report button{min-height:44px;padding:8px 14px;border:1px solid #1f7a58;border-radius:10px;background:#082019;color:#d6fff0;font:600 13px inherit;cursor:pointer}
.cp-report button.pri{background:#00ff9c;color:#00160d;border-color:#00ff9c}.cp-report [role=status]{min-height:22px;color:#ffd23f;font-size:13px;word-break:break-all}`;
  document.head.append(style);
  dialog = document.createElement("dialog");
  dialog.className = "cp-report"; dialog.setAttribute("aria-label", "گزارش");
  dialog.innerHTML = `<form method="dialog"><div><h2></h2><small></small></div><pre hidden></pre><p role="status"></p><div class="row"><button type="button" class="pri" data-save>💾 ذخیره</button><button type="button" data-share>📤 اشتراک</button><button type="button" data-copy hidden>📋 کپی متن</button><button type="button" data-reveal hidden>📂 نمایش در پوشه</button><button type="submit">بستن</button></div></form>`;
  document.body.append(dialog);
  return dialog;
}

/** کارت گزارش را نشان می‌دهد. item: {name, bytes|b64|path, mime, title} */
export async function showReport(item) {
  let bytes = item.bytes;
  if (!bytes && item.b64) bytes = fromB64(item.b64);
  if (!bytes && item.path && cap()?.convertFileSrc) bytes = new Uint8Array(await (await fetch(cap().convertFileSrc("file://" + item.path))).arrayBuffer());
  if (!bytes && typeof item.text === "string") bytes = te.encode(item.text);
  if (!bytes) throw new Error("گزارشی برای نمایش نیست.");
  const name = item.name || "report.txt", mime = item.mime || "text/plain", d = ensureDialog();
  const status = d.querySelector("[role=status]"), pre = d.querySelector("pre"), reveal = d.querySelector("[data-reveal]"), copy = d.querySelector("[data-copy]");
  d.querySelector("h2").textContent = item.title || name;
  d.querySelector("small").textContent = `${name} · ${bytes.length < 1024 ? bytes.length + " B" : (bytes.length / 1024).toFixed(1) + " KB"}`;
  const text = isText(mime, name) ? new TextDecoder().decode(bytes) : null;
  pre.hidden = text === null; pre.textContent = text === null ? "" : text.slice(0, 4000) + (text.length > 4000 ? "\n…" : "");
  copy.hidden = text === null; reveal.hidden = true; status.textContent = "";
  let savedPath = null;
  const where = globalThis.cpDesktop?.files ? "Documents\\CodePad\\Reports" : isAndroid() ? "پوشه‌ای که انتخاب می‌کنی (مثلاً Download)" : "پوشهٔ دانلودها";
  d.querySelector("[data-save]").title = "ذخیره در: " + where;
  d.querySelector("[data-save]").onclick = async () => {
    try { const r = await saveReport({ name, bytes, mime });
      if (r.where === "folder") { savedPath = r.path; reveal.hidden = false; status.textContent = "ذخیره شد: " + r.path; }
      else if (r.where === "picker") status.textContent = r.saved ? "ذخیره شد." : "ذخیره لغو شد.";
      else status.textContent = "دانلود شد: " + r.name;
    } catch (e) { status.textContent = "ذخیره نشد: " + (e?.message || e); }
  };
  d.querySelector("[data-share]").onclick = async () => {
    const r = await shareReport({ name, bytes, mime, title: item.title });
    if (r.ok) status.textContent = "برگهٔ اشتراک‌گذاری باز شد.";
    else if (!r.cancelled) status.textContent = globalThis.cpDesktop?.files ? "ویندوز برگهٔ اشتراک برای برنامه‌های Electron ندارد؛ فایل را ذخیره کن (ذخیره ← «نمایش در پوشه») و از آنجا بفرست، یا «کپی متن» را بزن." : "این دستگاه اشتراک مستقیم ندارد؛ فایل را ذخیره یا متن را کپی کن.";
  };
  copy.onclick = async () => { try { await navigator.clipboard.writeText(text ?? ""); status.textContent = "متن کپی شد."; } catch { status.textContent = "کپی نشد."; } };
  reveal.onclick = () => globalThis.cpDesktop?.files?.reveal?.(savedPath).catch?.(() => {});
  if (!d.open) d.showModal();
  return d;
}

if (typeof window !== "undefined") {
  window.CodePadReports = { show: showReport, save: saveReport, share: shareReport, fileName: reportFileName };
  window.addEventListener("codepad-python-image", (event) => {
    const d = event.detail;
    if (d && d.kind === "file") showReport(d).catch((e) => alert("گزارش نشان داده نشد: " + (e?.message || e)));
  });
}
