// Cyber Lab: ترمینال Termux، اسکن شبکهٔ خودت (nmap)، git، نمونه‌کدهای ممیزی امنیتی و یادداشت‌ها.
// DOM ساده (بدون React) تا مستقل از باندل اصلی بماند. window.CodePadCyber.open() آن را باز می‌کند.
import { CYBER_SAMPLES, CYBER_CHEATS } from "./cyber-samples.js";
import { buildNmapCommand, validateScanTarget } from "./device-tools.js";

const OK_KEY = "codepad-cyber-ok";
const THEME_KEY = "codepad-hacker";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* حافظه در دسترس نیست */ } },
};

/** 2 = HYPER (پیش‌فرض)، 1 = ON، 0 = OFF */
export function hackerLevel() {
  const v = store.get(THEME_KEY);
  return v === "0" ? 0 : v === "1" ? 1 : 2;
}
export const hackerThemeOn = () => hackerLevel() > 0;
export function setHackerTheme(level) {
  const n = level === true ? 2 : level === false ? 0 : Math.max(0, Math.min(2, Number(level)));
  store.set(THEME_KEY, String(n));
  document.documentElement.classList.toggle("cp-hacker", n > 0);
  document.documentElement.classList.toggle("cp-hyper", n === 2);
}

/** فقط نویسه‌های بی‌خطر برای آرگومان‌های اسکریپت/نشانی؛ هیچ نقل‌قول یا عملگر shell */
export const SAFE_ARGS = /^[\w@%+=:,./\-؀-ۿ ]{0,300}$/;
const SAFE_WORD = /^[\w@%+=:,./\-~\\]+$/;
// دسکتاپ ویندوز: PowerShell به‌جای Termux؛ تکه‌های وابسته به bash در اینجا معادل ویندوزی می‌گیرند.
const desk = () => globalThis.cpDesktop;
export const isWin = () => desk()?.os === "win32";
export const onDesktop = () => !!desk()?.shell;
export const shellName = () => (isWin() ? "PowerShell" : onDesktop() ? "Shell" : "Termux");
export const q = (s) => (isWin() ? "'" + String(s).replaceAll("'", "''") + "'" : "'" + String(s).replaceAll("'", "'\\''") + "'");

export function sampleCommand(sample, args) {
  if (!SAFE_ARGS.test(args)) throw new Error("آرگومان فقط می‌تواند حروف، عدد و . , : / - _ @ = + % باشد.");
  if (sample.code.includes("\nCPEOF")) throw new Error("نمونهٔ نامعتبر.");
  if (isWin()) {
    if (sample.code.includes("\n'@")) throw new Error("نمونهٔ نامعتبر.");
    const list = args.split(/\s+/).filter(Boolean).map(q).join(" ");
    return `$f = Join-Path $env:TEMP 'cp_lab.py'\n$c = @'\n${sample.code}\n'@\n[IO.File]::WriteAllText($f, $c, (New-Object Text.UTF8Encoding($false)))\n& python -X utf8 $f ${list}`;
  }
  return `python3 - ${args} <<'CPEOF'\n${sample.code}\nCPEOF`;
}

export function gitCommand(action, { url = "", dir = "" } = {}) {
  const d = String(dir).trim() || ".";
  if (!SAFE_WORD.test(d)) throw new Error("نام پوشه نامعتبر است.");
  switch (action) {
    case "install": return isWin() ? "winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements" : "pkg install -y git";
    case "clone":
      if (!/^(https:\/\/|git@)[\w@.\-:/~]+$/.test(url.trim())) throw new Error("آدرس مخزن باید با https:// یا git@ شروع شود.");
      return `git clone ${q(url.trim())} ${d === "." ? "" : q(d)}`.trim();
    case "status": return `git -C ${q(d)} status -sb`;
    case "log": return `git -C ${q(d)} log --oneline -n 15`;
    case "diff": return `git -C ${q(d)} diff --stat`;
    case "pull": return `git -C ${q(d)} pull --rebase`;
    default: throw new Error("اقدام نامعتبر.");
  }
}

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
};

let root, log, tabsEl, paneEl, current = "maps", running = false, mapState = { id: null, off: [] };

function println(text, cls = "") {
  const line = h("div", { class: cls }, text);
  log.append(line);
  log.scrollTop = log.scrollHeight;
}

async function termux(command) {
  const core = await import("./studio-core.js");
  return core.runTermux(command);
}

async function run(command, { echo = command.split("\n")[0].slice(0, 160) } = {}) {
  if (running) return println("یک فرمان هنوز در حال اجراست…", "dim");
  running = true;
  root.classList.add("busy");
  println("$ " + echo, "cmd");
  try {
    const r = await termux(command);
    if (r.stdout) println(String(r.stdout).trimEnd());
    if (r.stderr) println(String(r.stderr).trimEnd(), "err");
    println(`[exit ${r.exitCode ?? "?"}]`, "dim");
  } catch (e) {
    println(e instanceof Error ? e.message : String(e), "err");
    println(onDesktop() ? "نکته: ابزار لازم (python، git، nmap) باید نصب و در PATH باشد؛ دکمهٔ «ابزارها» وضعیت را نشان می‌دهد." : "نکته: Termux باید نصب و بار اول باز شده باشد و در Termux مقدار allow-external-apps=true تنظیم شود (راهنمای Studio).", "dim");
  } finally {
    running = false;
    root.classList.remove("busy");
  }
}


// ───────── نقشهٔ حملات سایبری زنده ─────────
// دسکتاپ: داخل پنجره (نمای جدا و ایزوله، چون این سایت‌ها iframe را نمی‌پذیرند). اندروید: مرورگر داخلی برنامه. وب: تب جدید.
export const ATTACK_MAPS = [
  { id: "kaspersky", name: "Kaspersky", full: "Cyberthreat Real-time Map", url: "https://cybermap.kaspersky.com/" },
  { id: "checkpoint", name: "Check Point", full: "Live Cyber Threat Map", url: "https://threatmap.checkpoint.com/" },
  { id: "fortiguard", name: "FortiGuard", full: "Threat Map", url: "https://threatmap.fortiguard.com/" },
  { id: "radware", name: "Radware", full: "Live Threat Map", url: "https://livethreatmap.radware.com/" },
  { id: "digitalattack", name: "Digital Attack Map", full: "DDoS worldwide", url: "https://www.digitalattackmap.com/" },
  { id: "netscout", name: "NETSCOUT", full: "Cyber Threat Horizon", url: "https://horizon.netscout.com/" },
];

async function openInAppBrowser(url) {
  try {
    if (globalThis.Capacitor?.isNativePlatform?.()) return (await import("./studio-core.js")).openBrowser(url);
  } catch { /* برمی‌گردیم به window.open */ }
  window.open(url, "_blank", "noopener");
}

function hideMap() {
  mapState.off.forEach((f) => f());
  mapState.off = [];
  window.cpDesktop?.maps.hide().catch(() => {});
}

function mapsTab() {
  const desktop = !!window.cpDesktop?.maps;
  const slot = h("div", { class: "cy-map-slot" }, desktop ? "یک نقشه را انتخاب کن…" : "این سایت‌ها داخل صفحه نمایش داده نمی‌شوند؛ دکمهٔ باز کردن را بزن.");
  const status = h("div", { class: "cy-map-status", role: "status" });
  const bar = h("div", { class: "cy-map-bar" });
  const info = h("div", { class: "card" }, h("h3", {}, "LIVE ATTACK MAPS"), h("p", {}, "نقشه‌های زندهٔ حملات سایبری شرکت‌های امنیتی (داده‌ها مال خودِ آن سایت‌هاست و اینترنت لازم است؛ اگر یکی در منطقهٔ تو بسته بود، بعدی را بزن)."));

  const place = () => {
    const r = slot.getBoundingClientRect();
    window.cpDesktop.maps.show(mapState.id, { x: r.left, y: r.top, width: r.width, height: r.height });
  };
  const select = (m) => {
    mapState.id = m.id;
    for (const b of bar.querySelectorAll("button[data-id]")) b.classList.toggle("on", b.dataset.id === m.id);
    if (desktop) {
      slot.textContent = "";
      status.textContent = "در حال بارگذاری " + m.name + "…";
      place();
    } else {
      status.textContent = "";
      openInAppBrowser(m.url);
    }
  };
  for (const m of ATTACK_MAPS) bar.append(h("button", { type: "button", "data-id": m.id, title: m.full, onclick: () => select(m) }, m.name));
  if (desktop) {
    bar.append(
      h("button", { type: "button", onclick: () => window.cpDesktop.maps.reload() }, "↻"),
      h("button", { type: "button", onclick: () => mapState.id && window.cpDesktop.maps.external(mapState.id) }, "↗ مرورگر"));
    const ro = new ResizeObserver(() => mapState.id && place());
    ro.observe(slot);
    const onResize = () => mapState.id && place();
    window.addEventListener("resize", onResize);
    const offStatus = window.cpDesktop.maps.onStatus((st) => {
      status.textContent = st.state === "loading" ? "در حال بارگذاری…" : st.state === "error" ? "بارگذاری نشد: " + st.error + " — نقشهٔ دیگری را امتحان کن یا «↗ مرورگر» را بزن." : "";
    });
    mapState.off = [() => ro.disconnect(), () => window.removeEventListener("resize", onResize), offStatus];
    queueMicrotask(() => select(ATTACK_MAPS[0]));
  } else {
    slot.replaceChildren(h("div", {}, h("p", {}, "مرورگر داخلی برنامه نقشه را باز می‌کند."), h("button", { type: "button", class: "pri", onclick: () => select(ATTACK_MAPS.find((m) => m.id === mapState.id) ?? ATTACK_MAPS[0]) }, "OPEN MAP")));
    mapState.id = ATTACK_MAPS[0].id;
  }
  return [info, bar, status, slot];
}

const tools = {
  maps() { return mapsTab(); },
  terminal() {
    const input = h("input", { type: "text", dir: "ltr", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: isWin() ? "PS> فرمان PowerShell…" : "$ فرمان " + shellName() + "…", "aria-label": "فرمان " + shellName() });
    const go = () => { const v = input.value.trim(); if (v) { input.value = ""; run(v); } };
    input.addEventListener("keydown", (e) => e.key === "Enter" && go());
    const chip = (label, cmd) => h("button", { type: "button", class: "cy-chipbtn", onclick: () => run(cmd) }, h("span", { class: "cy-chipbtn-i" }, "❯"), label);
    if (isWin()) {
      const toolsHelp = () => { println("نصب ابزارها (در یک PowerShell با دسترسی Administrator؛ دکمهٔ «PowerShell جدا» را بزن):", "cmd"); println("winget install -e --id Python.Python.3.13\nwinget install -e --id Git.Git\nwinget install -e --id Insecure.Nmap", ""); };
      return [
        h("div", { class: "card" }, h("h3", {}, "WINDOWS POWERSHELL"), h("p", {}, "فرمان‌ها در PowerShell ویندوز اجرا می‌شوند و stdout/stderr/exit واقعی برمی‌گردد (غیرتعاملی). برای ترمینال تعاملی دکمهٔ «PowerShell جدا» را بزن."),
          h("div", { class: "row" }, input, h("button", { type: "button", class: "pri", onclick: go }, "اجرا"))),
        h("div", { class: "cy-chipgroup" }, h("small", { class: "cy-chiplabel" }, "دستورهای آماده"),
          h("div", { class: "row cy-chiprow" },
            h("button", { type: "button", class: "cy-chipbtn alt", onclick: () => desk().shell.external().catch((e) => println(e.message, "err")) }, h("span", { class: "cy-chipbtn-i" }, "↗"), "PowerShell جدا"),
            chip("ابزارها", "Get-Command python,git,nmap,winget -ErrorAction SilentlyContinue | Format-Table Name,Source -AutoSize | Out-String -Width 200"),
            h("button", { type: "button", class: "cy-chipbtn alt", onclick: toolsHelp }, h("span", { class: "cy-chipbtn-i" }, "⇩"), "نصب ابزارها"),
            chip("ipconfig", "ipconfig"), chip("arp -a", "arp -a"),
            chip("سیستم", "systeminfo | Select-String 'OS Name','OS Version','System Type'"))),
      ];
    }
    return [
      h("div", { class: "card" }, h("h3", {}, onDesktop() ? "SHELL" : "TERMUX SHELL"), h("p", {}, onDesktop() ? "فرمان‌ها در پوستهٔ سیستم اجرا می‌شوند و stdout/stderr/exit برمی‌گردد." : "فرمان‌ها در Termux واقعی اجرا می‌شوند و stdout/stderr/exit برمی‌گردد (بدون PTY تعاملی)."),
        h("div", { class: "row" }, input, h("button", { type: "button", class: "pri", onclick: go }, "اجرا"))),
      h("div", { class: "cy-chipgroup" }, h("small", { class: "cy-chiplabel" }, "دستورهای آماده"),
        h("div", { class: "row cy-chiprow" },
          chip("نصب ابزارها", "pkg install -y python git nmap curl openssl dnsutils"),
          chip("ip -4 addr", "ip -4 addr"), chip("uname -a", "uname -a"), chip("nmap --version", "nmap --version"))),
    ];
  },
  scan() {
    const target = h("input", { type: "text", dir: "ltr", value: "192.168.1.0/24", "aria-label": "هدف" });
    const mode = h("select", { "aria-label": "نوع اسکن" },
      h("option", { value: "ping" }, "ping · کشف دستگاه‌ها"), h("option", { value: "ports" }, "ports · اسکن پورت TCP"), h("option", { value: "services" }, "services · نسخهٔ سرویس‌ها"));
    const ports = h("input", { type: "text", dir: "ltr", placeholder: "22,80,443 یا 1-1024 (خالی = ۱۰۰ پورت رایج)", "aria-label": "پورت‌ها" });
    const preview = h("code", { class: "dim" }, "");
    const refresh = () => {
      try { preview.textContent = buildNmapCommand({ target: target.value, mode: mode.value, ports: ports.value }); preview.style.color = ""; }
      catch (e) { preview.textContent = e.message; preview.style.color = "#ff7a95"; }
    };
    for (const el of [target, mode, ports]) el.addEventListener("input", refresh);
    refresh();
    return [
      h("div", { class: "card" }, h("h3", {}, "NMAP · شبکهٔ خودت"),
        h("p", {}, "فقط 192.168.x.x ، 10.x.x.x ، 172.16-31.x.x و localhost تا ۱۰۲۴ آدرس. هدف عمومی عمداً رد می‌شود. بدون root از اسکن TCP connect استفاده می‌شود."),
        h("label", {}, "هدف", target), h("label", {}, "نوع", mode), h("label", {}, "پورت‌ها", ports),
        h("label", {}, "فرمان نهایی", preview),
        h("button", { type: "button", class: "pri", onclick: () => { try { run(buildNmapCommand({ target: target.value, mode: mode.value, ports: ports.value })); } catch (e) { println(e.message, "err"); } } }, "شروع اسکن")),
    ];
  },
  git() {
    const url = h("input", { type: "text", dir: "ltr", placeholder: "https://github.com/user/repo", "aria-label": "آدرس مخزن" });
    const dir = h("input", { type: "text", dir: "ltr", value: "repo", "aria-label": "پوشه" });
    const act = (a, label, cls = "") => h("button", { type: "button", class: cls, onclick: () => { try { run(gitCommand(a, { url: url.value, dir: dir.value })); } catch (e) { println(e.message, "err"); } } }, label);
    return [h("div", { class: "card" }, h("h3", {}, "GIT"), h("label", {}, "آدرس مخزن (برای clone)", url), h("label", {}, "پوشه", dir),
      h("div", { class: "row" }, act("install", "نصب git"), act("clone", "clone", "pri"), act("status", "status"), act("pull", "pull"), act("log", "log"), act("diff", "diff")))];
  },
  labs() {
    return CYBER_SAMPLES.map((s) => {
      const args = h("input", { type: "text", dir: "ltr", placeholder: s.args, "aria-label": "آرگومان‌ها " + s.title });
      return h("div", { class: "card" },
        h("h3", {}, s.title, h("span", { class: "lvl" }, s.level)), h("p", {}, s.about),
        h("label", {}, "آرگومان‌ها", args),
        h("div", { class: "row" },
          h("button", { type: "button", class: "pri", onclick: () => { try { run(sampleCommand(s, args.value.trim()), { echo: `${s.id}.py ${args.value}`.trim() }); } catch (e) { println(e.message, "err"); } } }, "اجرا در Termux"),
          h("button", { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(s.code); println(`کد ${s.id}.py کپی شد.`, "dim"); } catch { println(s.code); } } }, "کپی کد")));
    });
  },
  notes() {
    const winLine = (line) => line.replace(/^pkg install git\s+نصب/, "winget install -e --id Git.Git  نصب").replace(/^root لازم.*$/, "بدون Npcap و Administrator فقط -sT کار می‌کند؛ -sS و -O به Npcap و Administrator نیاز دارند");
    return CYBER_CHEATS.map((c) => h("div", { class: "card" }, h("h3", {}, isWin() ? c.title.replace("(Termux)", "(Windows)") : c.title), h("pre", { class: "cheat" }, (isWin() ? c.lines.map(winLine) : c.lines).join("\n"))));
  },
};

const TABS = [["maps", "ATTACK MAPS"], ["terminal", "TERMINAL"], ["scan", "NMAP"], ["git", "GIT"], ["labs", "LABS"], ["notes", "NOTES"]];

function renderTabs() {
  hideMap();
  root.classList.toggle("cy-maps", current === "maps");
  tabsEl.replaceChildren(...TABS.map(([id, label]) => h("button", { type: "button", role: "tab", "aria-selected": String(id === current), onclick: () => { current = id; renderTabs(); } }, label)));
  paneEl.replaceChildren(...tools[current]());
}

async function aiAnalyze() {
  const ai = window.CodePadAI;
  if (!ai?.ready()) return println("اول در لانچر ← Gemini، اتصال هوش مصنوعی را ذخیره کن.", "err");
  const text = log.innerText.slice(-6000);
  println("AI › در حال تحلیل خروجی…", "dim");
  try {
    println("AI › " + (await ai.ask("Explain this terminal/security output for a beginner in Persian. Point out risks and next safe steps. Only for the user's own devices.\n\n" + text)));
  } catch (e) { println(e.message, "err"); }
}

function build() {
  const gate = () => h("div", { class: "cy-gate card" }, h("h3", {}, "AUTHORIZED USE ONLY"),
    h("p", {}, "این ابزارها برای یادگیری و ارزیابی امنیتی دستگاه‌ها و شبکه‌هایی است که مالکشان هستی یا مجوز کتبی داری. اسکن شبکه فقط روی بازهٔ خصوصی خودت انجام می‌شود. تست سیستم دیگران بدون اجازه غیرقانونی است."),
    h("button", { type: "button", class: "pri", onclick: () => { store.set(OK_KEY, "1"); start(); } }, "تأیید می‌کنم و ادامه"));
  const aiChip = h("span", { class: "cy-chip" }, "AI");
  const termuxChip = h("span", { class: "cy-chip" }, "TERMUX");
  root = h("section", { id: "cp-cyber", role: "dialog", "aria-modal": "true", "aria-label": "Cyber Lab", hidden: true });
  tabsEl = h("div", { class: "cy-tabs", role: "tablist" });
  paneEl = h("div", { class: "cy-pane" });
  log = h("pre", { class: "cy-log", "aria-live": "polite" });
  const main = h("div", { class: "cy-main" }, paneEl,
    h("div", { class: "cy-out" },
      h("div", { class: "cy-outbar" },
        h("button", { type: "button", onclick: () => navigator.clipboard?.writeText(log.innerText).catch(() => {}) }, "کپی"),
        h("button", { type: "button", onclick: () => (log.textContent = "") }, "پاک"),
        h("button", { type: "button", onclick: aiAnalyze }, "تحلیل با AI")),
      log));
  const themeLabel = () => ["THEME OFF", "THEME ON", "HYPER"][hackerLevel()];
  const themeBtn = h("button", { type: "button", "aria-label": "تم هکری", onclick: () => { setHackerTheme((hackerLevel() + 2) % 3); themeBtn.textContent = themeLabel(); } }, themeLabel());
  root.append(
    h("div", { class: "cy-head" }, h("div", { class: "cy-title" }, "CYBER LAB", h("small", {}, "terminal · nmap · git · security labs")), termuxChip, aiChip, themeBtn, h("button", { type: "button", "aria-label": "بستن", onclick: close }, "✕")),
    tabsEl, main);
  root.__chips = { aiChip, termuxChip, gate, main };
  document.body.append(root);
  return root;
}

function start() {
  const { gate, main } = root.__chips;
  [...root.children].filter((el) => !el.classList.contains("cy-head") && !el.classList.contains("cy-rain")).forEach((el) => el.remove()); // keep header + rain canvas
  if (store.get(OK_KEY) !== "1") { root.append(gate()); return; }
  root.append(tabsEl, main);
  renderTabs();
  if (!log.childElementCount) {
    println("CODEPAD CYBER LAB ready.", "cmd");
    println("Termux: pkg install -y python git nmap curl  ← یک بار برای نصب ابزارها", "dim");
  }
}


// باران ماتریکسی پشت Cyber Lab: جریان‌های پیوسته و متراکم با دنبالهٔ محوشونده (نه نقطه‌های پراکنده)
let rainTimer = 0;
function startRain() {
  if (!root || rainTimer || matchMedia("(prefers-reduced-motion: reduce)").matches || hackerLevel() === 0) return;
  let canvas = root.querySelector(".cy-rain");
  if (!canvas) { canvas = h("canvas", { class: "cy-rain", "aria-hidden": "true" }); root.prepend(canvas); }
  const ctx = canvas.getContext("2d");
  const glyphs = "01アイウエオカキクケコサシスセソタチツテト{}[]<>/\\$#%&*=+-".split("");
  const size = 15;
  let drops = []; // هر عنصر = {y, speed, len, chars[]} یک رشتهٔ کامل در حال نزول
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    const colCount = Math.ceil(cssW / size);
    drops = Array.from({ length: colCount }, (_, i) => ({
      x: i * size,
      y: -Math.random() * cssH * 0.6, // شروع پراکنده کمی بالاتر از صفحه، نه یک صفحهٔ کامل آن‌طرف‌تر
      speed: size * (0.3 + Math.random() * 0.55), // پیکسل بر فریم (نه بر ثانیه)
      len: 10 + Math.floor(Math.random() * 14),
      chars: Array.from({ length: 24 }, () => glyphs[(Math.random() * glyphs.length) | 0]),
      flip: Math.random() * 400,
    }));
  };
  resize();
  let frame = 0;
  rainTimer = setInterval(() => {
    if (root.hidden) return;
    frame++;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (canvas.width !== Math.round(cssW * Math.min(devicePixelRatio || 1, 2))) resize();
    ctx.fillStyle = "rgba(1,6,4,.22)"; ctx.fillRect(0, 0, cssW, cssH);
    ctx.font = "700 " + size + "px " + (getComputedStyle(root).getPropertyValue("--font-mono") || "monospace");
    ctx.textBaseline = "top";
    for (const d of drops) {
      d.y += d.speed;
      if (frame % 3 === 0 && Math.random() > 0.85) d.chars[(Math.random() * d.chars.length) | 0] = glyphs[(Math.random() * glyphs.length) | 0];
      for (let j = 0; j < d.len; j++) {
        const cy = d.y - j * size;
        if (cy < -size || cy > cssH) continue;
        const t = 1 - j / d.len; // ۱ = سر رشته (روشن‌ترین)، ۰ = ته رشته (محوترین)
        ctx.globalAlpha = j === 0 ? 1 : Math.max(0.04, t * t);
        ctx.fillStyle = j === 0 ? "#eafff5" : "#00ff9c";
        ctx.fillText(d.chars[j % d.chars.length], d.x, cy);
      }
      ctx.globalAlpha = 1;
      if (d.y - d.len * size > cssH) { d.y = -Math.random() * 220; d.speed = size * (0.55 + Math.random() * 0.7); }
    }
  }, 42);
}
function stopRain() { clearInterval(rainTimer); rainTimer = 0; }

export function open() {
  if (!root) build();
  const ai = window.CodePadAI;
  root.__chips.aiChip.classList.toggle("on", !!ai?.ready());
  root.__chips.aiChip.textContent = ai?.ready() ? "AI ●" : "AI ○";
  root.__chips.termuxChip.textContent = isWin() ? "POWERSHELL" : onDesktop() ? "SHELL" : "TERMUX";
  root.__chips.termuxChip.classList.toggle("on", onDesktop() || !!globalThis.Capacitor?.isNativePlatform?.());
  root.hidden = false;
  start();
  startRain();
}
export function close() {
  if (root) { root.hidden = true; hideMap(); stopRain(); }
}

// دکمهٔ ورود در نوار کارگاه ویرایشگر (لانچر دکمهٔ خودش را در dock دارد)
function mountEntry() {
  const bar = document.querySelector(".cp-workspaces");
  if (!bar || bar.querySelector(".cp-cyber-entry")) return;
  bar.append(h("button", { type: "button", class: "cp-cyber-entry", "aria-label": "Cyber Lab", onclick: open }, "CYBER"));
}

if (typeof window !== "undefined") {
  window.CodePadCyber = { open, close, setHackerTheme, hackerThemeOn, hackerLevel, validateScanTarget, ATTACK_MAPS };
  setHackerTheme(hackerLevel());
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mountEntry(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  mountEntry();
  window.addEventListener("keydown", (e) => e.key === "Escape" && root && !root.hidden && close());
}
