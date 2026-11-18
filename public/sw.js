// سرویس‌ورکر جیب‌کد: بعد از اولین باز شدن، برنامه بدون اینترنت هم باز می‌شود.
const CACHE = "jibcode-v3";
const SHARE = "jibcode-share";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/favicon.svg", "/fonts/vazirmatn-arabic-400.woff2"]).catch(() => {}))); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE && x !== SHARE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  // «اشتراک‌گذاری ← جیب‌کد»: فایل‌ها را در کش می‌گذاریم و به برنامه برمی‌گردیم تا بخواندشان
  if (req.method === "POST" && new URL(req.url).origin === location.origin && new URL(req.url).pathname === "/_share") {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const cache = await caches.open(SHARE);
        for (const k of await cache.keys()) await cache.delete(k);
        let i = 0;
        for (const f of form.getAll("files")) {
          if (typeof f === "string") continue;
          await cache.put("/_shared/" + i++, new Response(f, { headers: { "x-name": encodeURIComponent(f.name) } }));
        }
      } catch { /* فرم خراب بود؛ فقط به برنامه برمی‌گردیم */ }
      return Response.redirect(new URL("/?shared=1", location.origin).href, 303);
    })());
    return;
  }
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
  );
});
