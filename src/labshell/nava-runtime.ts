// موتور اجرای «نوا» داخل صفحهٔ ساخته‌شده (iframe).
// دو تابع خودبسنده‌اند و با toString() داخل صفحه گذاشته می‌شوند؛ پس نباید به هیچ چیزِ بیرون از خودشان ارجاع بدهند.
// - navaEngine: مفسر بی‌نیاز از DOM (متغیرها، شرط، حلقه، کنش، زمان‌سنج، ذخیره، فراخوانی هوش مصنوعی…)؛ در آزمون node هم اجرا می‌شود.
// - navaDom: اتصال موتور به صفحه (دکمه‌ها، ورودی‌ها، فهرست، بوم دوبعدی، صحنهٔ سه‌بعدی WebGL، صدا، پیام).
// هیچ eval یا new Function در کار نیست: برنامه به‌صورت درخت JSON داده می‌شود و فقط تفسیر می‌شود.

export function navaEngine(P: any, io: any): any {
  const S: any = Object.create(null);
  const MAXLOOP = 100000;
  const MAXSTEPS = 3000000;
  const root: any = { v: S, p: null };
  const has = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  let steps = 0;
  let depth = 0;
  let timers: any[] = [];
  let running = false;
  let lastSaved = "";
  let t0 = io.now();
  let reported = false;

  const fail = (line: number, msg: string): never => {
    const e: any = new Error(msg);
    e.navaLine = line;
    throw e;
  };
  const digits = (s: string) =>
    String(s)
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/٫/g, ".")
      .replace(/[٬,\s]/g, "");
  const numish = (v: any) => typeof v === "number" || (typeof v === "string" && /^\s*[-+]?[\d۰-۹٠-٩٬,]+(?:[.٫][\d۰-۹٠-٩]+)?\s*$/.test(v));
  const toNum = (v: any): number => {
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (Array.isArray(v)) return v.length;
    const n = Number(digits(String(v ?? "")));
    return Number.isFinite(n) ? n : 0;
  };
  const fmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });
  const str = (v: any): string =>
    typeof v === "number"
      ? Number.isFinite(v) ? fmt.format(v) : "∞"
      : typeof v === "boolean"
        ? v ? "درست" : "نادرست"
        : Array.isArray(v)
          ? v.map((x) => (Array.isArray(x) ? `[${str(x)}]` : str(x))).join("، ")
          : v == null ? "" : String(v);
  const truthy = (v: any) => (Array.isArray(v) ? v.length > 0 : !!v);
  const same = (a: any, b: any): boolean => {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((x, i) => same(x, b[i]));
    }
    if (typeof a === typeof b) return a === b;
    if (numish(a) && numish(b) && typeof a !== "boolean" && typeof b !== "boolean") return toNum(a) === toNum(b);
    return false;
  };
  const add = (a: any, b: any) => {
    if (Array.isArray(a)) return a.concat(Array.isArray(b) ? b : [b]);
    if (typeof a === "number" && typeof b === "number") return a + b;
    if ((typeof a === "string" || typeof b === "string") && !(numish(a) && numish(b))) return str(a) + str(b);
    return toNum(a) + toNum(b);
  };
  const compare = (op: string, a: any, b: any) => {
    const x = numish(a) && numish(b) ? toNum(a) : str(a);
    const y = numish(a) && numish(b) ? toNum(b) : str(b);
    return op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y;
  };
  const rnd = (a?: any, b?: any) => {
    if (a === undefined) return io.random();
    let lo = 1, hi = toNum(a);
    if (b !== undefined) { lo = toNum(a); hi = toNum(b); }
    if (hi < lo) { const t = lo; lo = hi; hi = t; }
    return Math.floor(io.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) + Math.ceil(lo);
  };
  const nums = (xs: any[]) => xs.flatMap((x) => (Array.isArray(x) ? x : [x])).map(toNum);
  const rad = (d: any) => (toNum(d) * Math.PI) / 180;
  const B: any = {
    تصادفی: rnd,
    طول: (x: any) => (Array.isArray(x) || typeof x === "string" ? x.length : str(x).length),
    گرد: (x: any, d?: any) => { const k = Math.pow(10, d === undefined ? 0 : toNum(d)); return Math.round(toNum(x) * k) / k; },
    صحیح: (x: any) => Math.trunc(toNum(x)),
    قدرمطلق: (x: any) => Math.abs(toNum(x)),
    جذر: (x: any) => Math.sqrt(toNum(x)),
    توان: (a: any, b: any) => Math.pow(toNum(a), toNum(b)),
    حداقل: (...xs: any[]) => Math.min(...nums(xs)),
    حداکثر: (...xs: any[]) => Math.max(...nums(xs)),
    جمع: (...xs: any[]) => nums(xs).reduce((s, x) => s + x, 0),
    سینوس: (d: any) => Math.sin(rad(d)),
    کسینوس: (d: any) => Math.cos(rad(d)),
    فاصله: (x1: any, y1: any, x2: any, y2: any) => Math.hypot(toNum(x2) - toNum(x1), toNum(y2) - toNum(y1)),
    عدد: (x: any) => toNum(x),
    متن: (x: any) => str(x),
    زمان: () => (io.now() - t0) / 1000,
    ساعت: () => new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
    تاریخ: () => new Date().toLocaleDateString("fa-IR"),
    شامل: (a: any, b: any) => (Array.isArray(a) ? a.some((x) => same(x, b)) : str(a).includes(str(b))),
    جای: (a: any, b: any) => (Array.isArray(a) ? a.findIndex((x) => same(x, b)) : str(a).indexOf(str(b))) + 1,
    جدا: (s: any, sep?: any) => (sep === undefined ? str(s).split(/\s+/) : str(s).split(str(sep))).filter((x) => x !== ""),
    چسب: (l: any, sep?: any) => (Array.isArray(l) ? l : [l]).map(str).join(sep === undefined ? "، " : str(sep)),
    خطوط: (s: any) => str(s).split(/\r?\n/).filter((x) => x.trim() !== ""),
    برعکس: (l: any) => (Array.isArray(l) ? [...l].reverse() : [...str(l)].reverse().join("")),
    مرتب: (l: any) => (Array.isArray(l) ? [...l].sort((a, b) => (numish(a) && numish(b) ? toNum(a) - toNum(b) : str(a).localeCompare(str(b), "fa"))) : l),
    بخش: (l: any, from: any, to?: any) => { const a = Array.isArray(l) ? l : str(l); const f = Math.max(0, toNum(from) - 1); return a.slice(f, to === undefined ? undefined : toNum(to)); },
    فایل: (name: any) => io.fileText(str(name)),
  };

  const lookup = (env: any, name: string, line: number) => {
    for (let e = env; e; e = e.p) if (has(e.v, name)) return e.v[name];
    return fail(line, `متغیر «${name}» تعریف نشده است.`);
  };
  const assign = (env: any, name: string, val: any, line: number) => {
    for (let e = env; e; e = e.p) if (has(e.v, name)) { e.v[name] = val; return; }
    fail(line, `متغیر «${name}» تعریف نشده است.`);
  };
  const slot = (list: any, i: any, line: number) => {
    if (!Array.isArray(list) && typeof list !== "string") fail(line, "فقط لیست یا متن شماره دارد؛ مثل کارها[۱].");
    const n = Math.trunc(toNum(i));
    const pos = n < 0 ? list.length + n : n - 1;
    if (n === 0 || pos < 0 || pos >= list.length) fail(line, `شمارهٔ ${str(n)} در لیست نیست (طول لیست ${str(list.length)} است؛ شماره از ۱ شروع می‌شود).`);
    return pos;
  };

  const ev = (e: any, env: any, line: number): any => {
    switch (e.k) {
      case "v": return e.v;
      case "n": return lookup(env, e.n, line);
      case "t": return e.parts.map((p: any) => (typeof p === "string" ? p : str(ev(p, env, line)))).join("");
      case "l": return e.items.map((x: any) => ev(x, env, line));
      case "i": { const base = ev(e.a, env, line); return base[slot(base, ev(e.i, env, line), line)]; }
      case "u": { const v = ev(e.a, env, line); return e.op === "!" ? !truthy(v) : e.op === "-" ? -toNum(v) : toNum(v); }
      case "c": {
        const args = e.args.map((x: any) => ev(x, env, line));
        const f = B[e.f];
        return f ? f(...args) : callUser(e.f, args, line);
      }
      case "b": {
        if (e.op === "&&") return truthy(ev(e.a, env, line)) ? truthy(ev(e.b, env, line)) : false;
        if (e.op === "||") return truthy(ev(e.a, env, line)) ? true : truthy(ev(e.b, env, line));
        const a = ev(e.a, env, line), b = ev(e.b, env, line);
        switch (e.op) {
          case "+": return add(a, b);
          case "-": return toNum(a) - toNum(b);
          case "*": return toNum(a) * toNum(b);
          case "/": if (toNum(b) === 0) fail(line, "تقسیم بر صفر ممکن نیست."); return toNum(a) / toNum(b);
          case "%": if (toNum(b) === 0) fail(line, "باقی‌ماندهٔ تقسیم بر صفر ممکن نیست."); return ((toNum(a) % toNum(b)) + toNum(b)) % toNum(b);
          case "==": return same(a, b);
          case "!=": return !same(a, b);
          default: return compare(e.op, a, b);
        }
      }
    }
    return fail(line, "عبارت نامعتبر است.");
  };

  const listOf = (env: any, name: string, line: number) => {
    const v = lookup(env, name, line);
    if (!Array.isArray(v)) fail(line, `«${name}» لیست نیست؛ آن را با «لیست ${name}» بساز.`);
    return v;
  };
  const child = (env: any) => ({ v: Object.create(null), p: env });
  const callUser = (name: string, args: any[], line: number): any => {
    const a = P.actions[name];
    if (!a) return fail(line, `کنش یا تابع «${name}» تعریف نشده است.`);
    if (++depth > 200) fail(line, "کنش‌ها بیش از حد همدیگر را صدا زده‌اند (بیش از ۲۰۰ لایه).");
    const env = child(root);
    a.params.forEach((p: string, i: number) => { env.v[p] = args[i] === undefined ? "" : args[i]; });
    try { exec(a.body, env); return ""; }
    catch (err: any) { if (err && err.navaRet) return err.value === undefined ? "" : err.value; throw err; }
    finally { depth--; }
  };

  const exec = (body: any[], env: any): void => {
    for (const s of body) {
      if (++steps > MAXSTEPS) fail(s.line, "اجرای برنامه بیش از حد طول کشید (شاید یک حلقهٔ بی‌پایان داری).");
      const E = (x: any) => ev(x, env, s.line);
      switch (s.k) {
        case "let": env.v[s.n] = E(s.e); break;
        case "set": {
          let val = E(s.e);
          if (s.idx && s.idx.length) {
            let target = lookup(env, s.n, s.line);
            for (let i = 0; i < s.idx.length - 1; i++) target = target[slot(target, E(s.idx[i]), s.line)];
            if (!Array.isArray(target)) fail(s.line, "فقط خانهٔ لیست را می‌شود عوض کرد.");
            const pos = slot(target, E(s.idx[s.idx.length - 1]), s.line);
            if (s.op === "+=") val = add(target[pos], val);
            else if (s.op === "-=") val = toNum(target[pos]) - toNum(val);
            target[pos] = val;
          } else {
            if (s.op === "+=") val = add(lookup(env, s.n, s.line), val);
            else if (s.op === "-=") val = toNum(lookup(env, s.n, s.line)) - toNum(val);
            assign(env, s.n, val, s.line);
          }
          break;
        }
        case "if": {
          let done = false;
          for (const br of s.br) if (truthy(E(br.c))) { exec(br.body, child(env)); done = true; break; }
          if (!done && s.els) exec(s.els, child(env));
          break;
        }
        case "rep": {
          const n = Math.trunc(toNum(E(s.n)));
          if (n > MAXLOOP) fail(s.line, "حداکثر ۱۰۰٬۰۰۰ بار تکرار مجاز است.");
          for (let i = 1; i <= n; i++) { const c = child(env); if (s.v) c.v[s.v] = i; exec(s.body, c); }
          break;
        }
        case "each": {
          const list = E(s.e);
          const items = Array.isArray(list) ? [...list] : typeof list === "string" ? [...list] : fail(s.line, "«برای هر» روی لیست یا متن کار می‌کند.");
          for (const x of items) { const c = child(env); c.v[s.v] = x; exec(s.body, c); }
          break;
        }
        case "for": {
          const from = toNum(E(s.from)), to = toNum(E(s.to));
          if (Math.abs(to - from) > MAXLOOP) fail(s.line, "حداکثر ۱۰۰٬۰۰۰ بار تکرار مجاز است.");
          const step = from <= to ? 1 : -1;
          for (let i = from; step > 0 ? i <= to : i >= to; i += step) { const c = child(env); c.v[s.v] = i; exec(s.body, c); }
          break;
        }
        case "while": {
          let guard = 0;
          while (truthy(E(s.c))) {
            if (++guard > MAXLOOP) fail(s.line, "حلقهٔ «تا وقتی» تمام نمی‌شود (بیش از ۱۰۰٬۰۰۰ دور).");
            exec(s.body, child(env));
          }
          break;
        }
        case "push": { const list = listOf(env, s.n, s.line); const v = E(s.e); if (s.front) list.unshift(v); else list.push(v); break; }
        case "del": {
          const list = listOf(env, s.n, s.line);
          if (s.which === "first") list.shift();
          else if (s.which === "last") list.pop();
          else if (s.which === "at") list.splice(slot(list, E(s.e), s.line), 1);
          else { const v = E(s.e); const i = list.findIndex((x: any) => same(x, v)); if (i >= 0) list.splice(i, 1); }
          break;
        }
        case "clear": listOf(env, s.n, s.line).length = 0; break;
        case "msg": io.toast(str(E(s.e))); break;
        case "tone": {
          const a = E(s.a[0]);
          if (typeof a === "string" && !numish(a)) io.play(a);
          else io.tone(toNum(a), s.a[1] ? toNum(E(s.a[1])) : 150);
          break;
        }
        case "melody": io.melody(s.a.map((x: any) => toNum(E(x))), 180); break;
        case "say": io.say(str(E(s.e))); break;
        case "ask": {
          const prompt = str(E(s.e));
          const target = s.n;
          S[target] = "… در حال فکر کردن";
          Promise.resolve()
            .then(() => io.ask(prompt))
            .then(
              (text: any) => { S[target] = String(text ?? ""); after(); },
              (err: any) => { S[target] = `⚠️ ${err && err.message ? err.message : String(err)}`; after(); },
            );
          break;
        }
        case "draw": io.draw(s.op, s.a.map(E), s.line); break;
        case "obj": io.obj(s.op, s.n, s.a.map(E), s.line); break;
        case "cam": io.cam(...(s.a ? s.a.map((x: any) => toNum(E(x))) : [toNum(E(s.e))])); break;
        case "scene": io.scene(s.op, s.a.map(E), s.line); break;
        case "call": callUser(s.n, s.a.map(E), s.line); break;
        case "stop": stopTimers(); break;
        case "resume": startTimers(); break;
        case "ret": throw { navaRet: true, value: s.e ? E(s.e) : undefined };
      }
    }
  };

  const pick = () => { const o: any = {}; for (const n of P.persist) o[n] = S[n]; return o; };
  const persist = () => {
    if (!P.persist.length) return;
    const snap = JSON.stringify(pick());
    if (snap === lastSaved) return;
    lastSaved = snap;
    try { Promise.resolve(io.save(JSON.parse(snap))).catch(() => {}); } catch { /* ذخیره ممکن نشد */ }
  };
  function after() { io.render(); persist(); }
  const report = (err: any) => {
    const msg = (err && err.navaLine ? `خط ${err.navaLine}: ` : "") + (err && err.message ? err.message : String(err));
    stopTimers();
    if (!reported) { reported = true; io.error(msg); }
  };
  const handle = (body: any[] | null | undefined) => {
    if (!body) return;
    steps = 0; depth = 0;
    try { exec(body, child(root)); } catch (err: any) { if (!(err && err.navaRet)) report(err); }
    after();
  };
  let animationFrame = 0, frameTime: number | null = null;
  const nextFrame = (time: number) => {
    animationFrame = 0;
    if (!running) return;
    const dt = frameTime === null ? 0 : Math.min(.05, Math.max(0, (time - frameTime) / 1000));
    frameTime = time; S["دلتا"] = dt; handle(P.onFrame);
    if (running && !reported) animationFrame = io.requestFrame(nextFrame);
  };
  function stopTimers() { if (animationFrame) io.cancelFrame(animationFrame); animationFrame = 0; frameTime = null; for (const t of timers) io.clearInterval(t); timers = []; running = false; }
  function startTimers() {
    if (running) return;
    running = true;
    if (P.onFrame && io.requestFrame) animationFrame = io.requestFrame(nextFrame);
    for (const t of P.timers) {
      if (t.once) continue;
      let sec = 1;
      try { sec = toNum(ev(t.sec, root, t.line)); } catch (err) { report(err); return; }
      timers.push(io.setInterval(() => handle(t.body), Math.max(16, sec * 1000)));
    }
  }

  const api = {
    S, str, toNum, truthy,
    get running() { return running; },
    value: (name: string) => S[name],
    text: (e: any, line: number) => { try { return str(ev(e, root, line)); } catch (err) { report(err); return ""; } },
    truth: (e: any, line: number) => { try { return truthy(ev(e, root, line)); } catch (err) { report(err); return false; } },
    click: (i: number) => handle(P.buttons[i]),
    key: (k: string) => { S["کلید"] = k; handle(P.onKey); },
    touch: (x: number, y: number) => { S["ایکس"] = Math.round(x); S["ایگرگ"] = Math.round(y); handle(P.onTouch); },
    input: (name: string, value: any) => { S[name] = value; after(); },
    removeAt: (name: string, index: number) => { const l = S[name]; if (Array.isArray(l) && index >= 0 && index < l.length) l.splice(index, 1); after(); },
    stop: stopTimers,
    run: handle,
    start: async () => {
      t0 = io.now();
      S["ایکس"] = 0; S["ایگرگ"] = 0; S["کلید"] = ""; S["دلتا"] = 0;
      try { for (const d of P.vars) { steps = 0; S[d.n] = ev(d.e, root, d.line); } } catch (err) { report(err); io.render(); return; }
      if (P.persist.length) {
        try {
          const saved = await io.load();
          if (saved && typeof saved === "object") for (const n of P.persist) if (has(saved, n) && saved[n] !== null && saved[n] !== undefined) S[n] = saved[n];
        } catch { /* حافظه در دسترس نبود */ }
        lastSaved = JSON.stringify(pick());
      }
      try { for (const sh of P.shapes) if (sh.at) io.obj("جابجا", sh.n, sh.at.map((x: any) => toNum(ev(x, root, sh.line))), sh.line); } catch (err) { report(err); }
      if (io.ready) await io.ready();
      handle(P.start);
      if (!reported) {
        startTimers();
        for (const t of P.timers) if (t.once) { let sec = 1; try { sec = toNum(ev(t.sec, root, t.line)); } catch { /* */ } io.setTimeout(() => handle(t.body), Math.max(0, sec * 1000)); }
      }
    },
  };
  return api;
}

export function navaDom(P: any, engine: any, sceneFactory: any): void {
  const doc = document;
  const $ = (s: string) => doc.querySelector(s) as any;
  const errBox = $(".nv-error");
  const toastBox = $(".nv-toast");
  const lineErr = (line: number, msg: string): never => { const e: any = new Error(msg); e.navaLine = line; throw e; };
  const J: any = (window as any).jibos;

  // ── صدا (Web Audio داخل همین قاب) ──
  let ac: any = null;
  const audio = () => { const A = (window as any).AudioContext || (window as any).webkitAudioContext; if (!A) return null; if (!ac) ac = new A(); if (ac.state === "suspended") ac.resume(); return ac; };
  const tone = (f: number, ms: number) => {
    try {
      const c = audio(); if (!c || !(f > 0)) return;
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime, d = Math.max(20, Math.min(5000, ms || 150)) / 1000;
      o.type = "square"; o.frequency.value = Math.min(8000, f);
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.03);
    } catch { /* صدا در دسترس نیست */ }
  };

  // ── بوم دوبعدی ──
  const cv: any = doc.getElementById("nv-canvas");
  const cw = P.canvas ? P.canvas.w : 0, ch = P.canvas ? P.canvas.h : 0;
  let g2: any = null;
  if (cv) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    g2 = cv.getContext("2d");
    if (g2) { g2.scale(dpr, dpr); g2.textAlign = "center"; g2.textBaseline = "middle"; }
  }
  const images: any = {};
  const image = (src: string) => { if (!images[src]) { const im = new Image(); im.src = src; images[src] = im; } return images[src]; };
  const draw = (op: string, a: any[], line: number) => {
    if (!g2) lineErr(line, "برای نقاشی اول یک «بوم» بساز؛ مثل: بوم ۳۲۰، ۳۲۰");
    const n = (i: number, d = 0) => (a[i] === undefined ? d : api.toNum(a[i]));
    const col = (i: number, d: string) => (a[i] === undefined ? d : String(a[i]));
    g2.save();
    if (op === "پاک") {
      if (a[0] === undefined) g2.clearRect(0, 0, cw, ch); else { g2.fillStyle = col(0, "#000"); g2.fillRect(0, 0, cw, ch); }
    } else if (op === "دایره") {
      g2.fillStyle = col(3, P.accent); g2.beginPath(); g2.arc(n(0), n(1), Math.max(0, n(2, 10)), 0, Math.PI * 2); g2.fill();
    } else if (op === "مستطیل") {
      g2.fillStyle = col(4, P.accent); g2.fillRect(n(0), n(1), n(2, 10), n(3, 10));
    } else if (op === "خط") {
      g2.strokeStyle = col(4, P.accent); g2.lineWidth = n(5, 3); g2.lineCap = "round"; g2.beginPath(); g2.moveTo(n(0), n(1)); g2.lineTo(n(2), n(3)); g2.stroke();
    } else if (op === "نوشته") {
      g2.fillStyle = col(3, "#ffffff"); g2.font = `700 ${n(4, 18)}px Vazirmatn, Tahoma, sans-serif`; g2.fillText(api.str(a[0]), n(1), n(2));
    } else if (op === "تصویر") {
      const im = image(String(a[0] ?? ""));
      if (im.complete && im.naturalWidth) g2.drawImage(im, n(1), n(2), a[3] === undefined ? im.naturalWidth : n(3), a[4] === undefined ? (a[3] === undefined ? im.naturalHeight : n(3)) : n(4));
    }
    g2.restore();
  };

  // Offline scene renderer is injected into generated previews as a self-contained function.
  const sc: any = doc.getElementById("nv-scene");
  const sw = P.scene ? P.scene.w : 0, sh = P.scene ? P.scene.h : 0;

  // ── پیام، خطا، حافظه، هوش مصنوعی ──
  let toastTimer = 0;
  const toast = (text: string) => {
    if (!toastBox) return;
    toastBox.textContent = text; toastBox.hidden = false;
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toastBox.hidden = true; }, 2400);
  };
  const error = (msg: string) => {
    if (errBox) { errBox.textContent = `⚠️ ${msg}`; errBox.hidden = false; }
    try { console.error(`نوا — ${msg}`); } catch { /* */ }
  };
  let memory: any = null;
  const lsKey = `nava:${P.title}`;
  const load = async () => {
    if (J && J.storage) { try { return await J.storage.get("nava"); } catch { /* به حافظهٔ محلی می‌رویم */ } }
    try { const raw = localStorage.getItem(lsKey); return raw ? JSON.parse(raw) : null; } catch { return memory; }
  };
  const save = async (data: any) => {
    memory = data;
    if (J && J.storage) { try { await J.storage.set("nava", data); return; } catch { /* */ } }
    try { localStorage.setItem(lsKey, JSON.stringify(data)); } catch { /* فقط در حافظهٔ موقت */ }
  };
  const ask = (prompt: string) => {
    if (J && typeof J.call === "function") return J.call("ai", prompt);
    return Promise.reject(new Error("هوش مصنوعی فقط داخل CodePad (ویرایشگر یا لانچر) و با «اتصال Gemini» کار می‌کند."));
  };
  const fileText = (v: string) => {
    if (!v.startsWith("data:")) throw new Error(`پیوست «${v}» پیدا نشد؛ فایل را به پروژه پیوست کن و نامش را دقیق بنویس.`);
    const comma = v.indexOf(","), meta = v.slice(0, comma), body = v.slice(comma + 1);
    if (!/;base64/i.test(meta)) return decodeURIComponent(body);
    const bin = atob(body), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };
  const ready = () => Promise.all(
    (P.images as string[]).map((src) => new Promise((done) => { const im = image(src); if (im.complete) done(true); else { im.onload = im.onerror = () => done(true); setTimeout(() => done(false), 3000); } })),
  );

  const scene3d = sceneFactory(P, sc, error);
  const obj = scene3d.obj;
  const want3d = () => scene3d.requestDraw?.();

  const io = {
    now: () => performance.now(),
    random: Math.random,
    setInterval: (f: any, ms: number) => window.setInterval(f, ms),
    clearInterval: (id: number) => window.clearInterval(id),
    setTimeout: (f: any, ms: number) => window.setTimeout(f, ms),
    toast, tone, error, load, save, ask, fileText, ready, draw, obj,
    cam: scene3d.cam, scene: scene3d.scene,
    requestFrame: (fn: any) => requestAnimationFrame(fn),
    cancelFrame: (id: number) => cancelAnimationFrame(id),
    melody: (fs: number[], ms: number) => fs.forEach((f, i) => window.setTimeout(() => tone(f, ms), i * ms)),
    play: (src: string) => { try { void new Audio(src).play().catch(() => {}); } catch { /* */ } },
    say: (text: string) => {
      // پیام «بگو» روی صفحه هم دیده می‌شود (حتی بدون پشتیبانی گفتار) و اگر ممکن باشد خوانده هم می‌شود
      const msg = doc.querySelector(".nv-message") as any;
      if (msg) { msg.textContent = text; msg.hidden = false; }
      try { const u = new SpeechSynthesisUtterance(text); u.lang = /[\u0600-\u06ff]/.test(text) ? "fa-IR" : "en-US"; speechSynthesis.speak(u); }
      catch { if (J && J.speak) void J.speak(text).catch(() => {}); }
    },
    render: () => render(),
  };
  const api = engine(P, io);

  function render() {
    doc.querySelectorAll("[data-nv-show]").forEach((el: any) => {
      const spec = P.shows[Number(el.getAttribute("data-nv-show"))];
      const visible = spec.when ? api.truth(spec.when, spec.line) : true;
      el.hidden = !visible;
      if (visible) { const t = api.text(spec.e, spec.line); if (el.textContent !== t) el.textContent = t; }
    });
    doc.querySelectorAll("[data-nv-input]").forEach((el: any) => {
      if (doc.activeElement === el) return;
      const name = el.getAttribute("data-nv-input");
      const v = api.value(name);
      const t = v === "" || v === undefined ? "" : api.str(v).replace(/٬/g, "");
      if (el.value !== t && !(el.value === "" && v === 0 && el.getAttribute("data-nv-type") === "number")) el.value = t;
    });
    doc.querySelectorAll("[data-nv-list]").forEach((el: any) => {
      const spec = P.lists[Number(el.getAttribute("data-nv-list"))];
      const items = api.value(spec.n);
      const arr = Array.isArray(items) ? items : [];
      const sig = JSON.stringify(arr);
      if (el.getAttribute("data-sig") === sig) return;
      el.setAttribute("data-sig", sig);
      el.replaceChildren();
      if (!arr.length) { const li = doc.createElement("li"); li.className = "nv-empty"; li.textContent = "— خالی —"; el.append(li); }
      arr.forEach((item: any, i: number) => {
        const li = doc.createElement("li");
        const span = doc.createElement("span"); span.textContent = api.str(item); li.append(span);
        if (spec.del) { const b = doc.createElement("button"); b.type = "button"; b.className = "nv-del"; b.textContent = "✕"; b.setAttribute("aria-label", "حذف"); b.setAttribute("data-nv-del", String(i)); li.append(b); }
        el.append(li);
      });
    });
    want3d();
  }

  doc.querySelectorAll("[data-nv-btn]").forEach((el: any) => el.addEventListener("click", () => { audio(); api.click(Number(el.getAttribute("data-nv-btn"))); }));
  doc.querySelectorAll("[data-nv-input]").forEach((el: any) => el.addEventListener("input", () => {
    const type = el.getAttribute("data-nv-type");
    const raw = el.value;
    api.input(el.getAttribute("data-nv-input"), type === "number" ? (raw.trim() === "" ? 0 : api.toNum(raw)) : raw);
  }));
  doc.querySelectorAll("[data-nv-list]").forEach((el: any) => el.addEventListener("click", (e: any) => {
    const b = e.target && e.target.closest ? e.target.closest("[data-nv-del]") : null;
    if (b) api.removeAt(P.lists[Number(el.getAttribute("data-nv-list"))].n, Number(b.getAttribute("data-nv-del")));
  }));
  const touchable = (el: any, w: number, h: number) => {
    if (!el) return;
    let sx = 0, sy = 0;
    el.addEventListener("pointerdown", (e: any) => { sx = e.clientX; sy = e.clientY; audio(); });
    el.addEventListener("pointerup", (e: any) => {
      if (el === sc && scene3d.orbit) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (P.onKey && Math.hypot(dx, dy) > 28) { api.key(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "راست" : "چپ") : dy > 0 ? "پایین" : "بالا"); return; }
      const r = el.getBoundingClientRect();
      api.touch(((e.clientX - r.left) * w) / (r.width || 1), ((e.clientY - r.top) * h) / (r.height || 1));
    });
  };
  touchable(cv, cw, ch);
  touchable(sc, sw, sh);
  if (P.onKey) {
    const names: any = { ArrowUp: "بالا", ArrowDown: "پایین", ArrowLeft: "چپ", ArrowRight: "راست", " ": "فاصله", Enter: "اینتر", Escape: "خروج" };
    doc.addEventListener("keydown", (e: any) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (names[e.key]) e.preventDefault();
      api.key(names[e.key] || e.key);
    });
  }
  window.addEventListener("pagehide", () => { api.stop(); scene3d.dispose(); });
  void api.start();
}
