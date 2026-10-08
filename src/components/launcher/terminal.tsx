import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { App } from "@/labshell/launcher";
import { caesar, entropyBits, fromB64, fromHex, passgen, sha, toB64, toHex, xorHex } from "@/labshell/crypto-utils";
import { THEMES, type Preferences } from "@/labshell/launcher-prefs";

// کنسول جیب‌کد OS: فرمان‌های کوچک که همه داخل خود برنامه اجرا می‌شوند (بدون دسترسی به سیستم‌عامل).
// «dev on» فقط «حالت توسعه‌دهنده»ٔ لانچر را روشن می‌کند.

export type LauncherApi = {
  version: string;
  apps: () => App[];
  launch: (name: string) => boolean;
  prefs: () => Preferences;
  setPrefs: (patch: Partial<Preferences>) => void;
  toast: (msg: string) => void;
  beep: (freq?: number, ms?: number) => void;
  install: (name: string, html: string, icon?: string) => App;
  uninstall: (name: string) => Promise<boolean>;
  gemini: (prompt: string) => Promise<string>;
};

type Line = { text: string; tone?: "in" | "err" | "ok" | "dim" };

const HELP = `فرمان‌ها:
  help                 همین راهنما
  neofetch             مشخصات لانچر با لوگو
  whoami               کاربر فعلی
  dev on | dev off     روشن/خاموش کردن حالت توسعه‌دهندهٔ لانچر
  ls | apps            فهرست برنامه‌ها
  open <نام>           اجرای برنامه
  theme [نام]          فهرست یا انتخاب پوسته
  matrix on|off        باران ماتریکس
  accent #00ff9c       رنگ تأکیدی
  hash [sha1|sha256|sha512] <متن>
  b64 <متن> | unb64 <base64>
  hex <متن> | unhex <hex>
  xor <کلید> <متن>     رمز XOR آموزشی (خروجی hex)
  rot13 <متن> | caesar <n> <متن>
  entropy <رمز>        تخمین قدرت رمز عبور (بیت)
  passgen [طول]        رمز تصادفی امن (crypto.getRandomValues)
  net                  وضعیت اتصال دستگاه
  beep [Hz] [ms]       پخش صدا
  gemini <پرسش>        پرسش از Gemini (با کلید خودت)
  js <عبارت>           اجرای جاوااسکریپت با شیء api (فقط حالت توسعه‌دهنده)
  date | echo | clear | exit`;

export function Terminal({ api, hostname, devMode, setDevMode, onClose, accent }: { api: LauncherApi; hostname: string; devMode: boolean; setDevMode: (on: boolean) => void; onClose: () => void; accent: string }) {
  const user = devMode ? "dev" : "user";
  const prompt = `${user}@${hostname}:~$`;
  const [lines, setLines] = useState<Line[]>([{ text: `JibOS ${api.version} (WebView sandbox) — برای راهنما بنویس help`, tone: "dim" }]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines]);
  useEffect(() => {
    field.current?.focus();
  }, []);
  const print = (text: string, tone?: Line["tone"]) => setLines((l) => [...l, ...text.split("\n").map((t) => ({ text: t, tone }))].slice(-600));

  const run = async (raw: string) => {
    const cmdLine = raw.trim();
    print(`${prompt} ${cmdLine}`, "in");
    if (!cmdLine) return;
    setHistory((h) => [cmdLine, ...h.filter((x) => x !== cmdLine)].slice(0, 50));
    const [cmd, ...rest] = cmdLine.split(/\s+/);
    const arg = cmdLine.slice(cmd.length).trim();
    try {
      switch (cmd.toLowerCase()) {
        case "help":
        case "?":
          return print(HELP, "dim");
        case "clear":
          return setLines([]);
        case "exit":
          return onClose();
        case "echo":
          return print(arg);
        case "date":
          return print(new Date().toLocaleString("fa-IR") + "  |  " + new Date().toISOString());
        case "whoami":
          return print(devMode ? "dev (حالت توسعه‌دهندهٔ لانچر روشن است)" : "user");
        case "dev": {
          const on = rest[0] !== "off";
          setDevMode(on);
          return print(on ? "[✓] حالت توسعه‌دهنده روشن شد: ویرایش کد برنامه‌ها، پیکربندی JSON، CSS/اسکریپت سفارشی و فرمان js.\n[i] این فقط کنترل کامل داخل خود لانچر است؛ دسترسی سیستمی (root) به اندروید نمی‌دهد." : "حالت توسعه‌دهنده خاموش شد.", "ok");
        }
        case "ls":
        case "apps": {
          const apps = api.apps();
          return print(apps.length ? apps.map((a) => `${a.icon}  ${a.name}   (${a.files.length} فایل)`).join("\n") : "هنوز برنامه‌ای نصب نشده.");
        }
        case "open":
        case "run":
          if (!arg) return print("نام برنامه را بنویس: open <نام>", "err");
          return api.launch(arg) ? print(`در حال باز کردن ${arg}…`, "ok") : print(`برنامه‌ای با نام «${arg}» پیدا نشد.`, "err");
        case "theme": {
          if (!arg) return print(THEMES.map((t) => `${t.id.padEnd(14)} ${t.name}${api.prefs().theme === t.id ? "  ←" : ""}`).join("\n"));
          const t = THEMES.find((x) => x.id === arg.toLowerCase());
          if (!t) return print("پوسته پیدا نشد. فهرست: theme", "err");
          const { id, name: _n, ...look } = t;
          api.setPrefs({ ...look, theme: id });
          return print(`پوستهٔ «${t.name}» فعال شد.`, "ok");
        }
        case "matrix":
          api.setPrefs({ matrix: rest[0] !== "off" });
          return print(`matrix ${rest[0] === "off" ? "off" : "on"}`, "ok");
        case "accent":
          if (!/^#[0-9a-f]{3,8}$/i.test(rest[0] ?? "")) return print("مثال: accent #00ff9c", "err");
          api.setPrefs({ accent: rest[0] });
          return print("رنگ تأکیدی عوض شد.", "ok");
        case "hash": {
          const algos: Record<string, "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512"> = { sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };
          const algo = algos[(rest[0] ?? "").toLowerCase()];
          const text = algo ? rest.slice(1).join(" ") : arg;
          return print(`${algo ?? "SHA-256"}: ${await sha(algo ?? "SHA-256", text)}`);
        }
        case "b64":
          return print(toB64(arg));
        case "unb64":
          return print(fromB64(arg));
        case "hex":
          return print(toHex(arg));
        case "unhex":
          return print(fromHex(arg));
        case "xor":
          if (rest.length < 2) return print("مثال: xor key سلام", "err");
          return print(xorHex(rest.slice(1).join(" "), rest[0]));
        case "rot13":
          return print(caesar(arg, 13));
        case "caesar":
          return print(caesar(rest.slice(1).join(" "), Number(rest[0]) || 3));
        case "entropy": {
          const bits = entropyBits(arg);
          return print(`${bits} بیت — ${bits < 40 ? "ضعیف" : bits < 60 ? "متوسط" : bits < 80 ? "خوب" : "قوی"}`, bits >= 60 ? "ok" : "err");
        }
        case "passgen":
          return print(passgen(Math.min(128, Math.max(6, Number(rest[0]) || 20))), "ok");
        case "net": {
          const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection;
          return print(`online: ${navigator.onLine}\nnetwork: ${c?.effectiveType ?? "نامشخص"}${c?.downlink ? ` (~${c.downlink}Mb/s)` : ""}\nنکته: برنامه‌های وب فقط HTTP(S) دارند؛ سوکت خام TCP/UDP در WebView نیست.`);
        }
        case "beep":
          api.beep(Number(rest[0]) || 880, Number(rest[1]) || 160);
          return print("♪", "ok");
        case "neofetch": {
          const p = api.prefs();
          const art = ["   ▄▄▄▄▄▄▄   ", "  █ ▄▄▄▄▄ █  ", "  █ █ J █ █  ", "  █ █▄▄▄█ █  ", "  █▄▄▄▄▄▄▄█  ", "   JibOS     "];
          const info = [`${user}@${hostname}`, `OS: JibOS ${api.version} (Capacitor WebView)`, `Theme: ${p.theme}  Accent: ${p.accent}`, `Apps: ${api.apps().length}`, `Screen: ${window.innerWidth}×${window.innerHeight}`, `Developer mode: ${devMode ? "ON" : "off"}`];
          return print(art.map((a, i) => `${a}  ${info[i] ?? ""}`).join("\n"), "ok");
        }
        case "gemini":
          if (!arg) return print("مثال: gemini یک تابع پایتون برای مرتب‌سازی بنویس", "err");
          print("در حال پرسیدن از Gemini…", "dim");
          return print(await api.gemini(arg));
        case "js": {
          if (!devMode) return print("فقط در حالت توسعه‌دهنده. اول بنویس: dev on", "err");
          const fn = new Function("api", `"use strict"; return (async () => (${arg}))()`) as (a: LauncherApi) => Promise<unknown>;
          const v = await fn(api);
          return print(typeof v === "string" ? v : (JSON.stringify(v, null, 2) ?? String(v)), "ok");
        }
        default:
          return print(`${cmd}: فرمان پیدا نشد (help)`, "err");
      }
    } catch (e) {
      print(`خطا: ${e instanceof Error ? e.message : String(e)}`, "err");
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const v = input;
      setInput("");
      setHi(-1);
      void run(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const n = Math.min(history.length - 1, hi + 1);
      setHi(n);
      setInput(history[n]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = hi - 1;
      setHi(Math.max(-1, n));
      setInput(n >= 0 ? history[n] : "");
    }
  };

  const tone = (t?: Line["tone"]) => (t === "err" ? "text-rose-400" : t === "ok" ? "" : t === "dim" ? "text-white/50" : t === "in" ? "text-white" : "text-white/85");
  return (
    <div className="jibos-window fixed inset-0 z-30 flex flex-col bg-black pt-[env(safe-area-inset-top)] font-mono" data-testid="terminal">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-2" style={{ borderColor: `${accent}44` }}>
        <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="بستن کنسول" onClick={onClose}>
          <ArrowRight className="size-5" />
        </button>
        <span className="text-sm" style={{ color: accent }}>
          console — {prompt}
        </span>
      </header>
      <div ref={box} dir="ltr" className="min-h-0 flex-1 overflow-auto p-3 text-[12.5px] leading-5" onClick={() => field.current?.focus()}>
        {lines.map((l, i) => (
          <div key={i} dir="auto" className={`whitespace-pre-wrap break-words ${tone(l.tone)}`} style={l.tone === "ok" ? { color: accent } : undefined}>
            {l.text || "\u00a0"}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span style={{ color: accent }}>{prompt}</span>
          <input
            ref={field}
            aria-label="فرمان کنسول"
            dir="auto"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-white outline-none"
            style={{ caretColor: accent }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-white/10 p-2 pb-[max(.5rem,env(safe-area-inset-bottom))]" dir="ltr">
        {["help", "neofetch", "ls", "hash sha256 hello", "entropy Tr0ub4dor&3", "passgen", "theme", devMode ? "dev off" : "dev on"].map((c) => (
          <button key={c} type="button" className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/80" onClick={() => void run(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
