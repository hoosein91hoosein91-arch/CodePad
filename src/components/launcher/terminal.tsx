import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { assetsOf } from "@/labshell/assets";
import { caesar, entropyBits, fromB64, fromHex, passgen, sha, toB64, toHex, xorHex } from "@/labshell/crypto-utils";
import { assetKey, type App } from "@/labshell/launcher";
import { THEMES, type Preferences } from "@/labshell/launcher-prefs";
import { formatScan, simulateScan } from "@/labshell/netsim";
import { buildTree, HOME, isWritable, lookup, newVfs, resolvePath, type VfsApp } from "@/labshell/vfs";
import { openExternalBrowser, runTermuxCommand } from "@/lib/termux-bridge";

// کنسول جیب‌کد OS: پوستهٔ شبیه‌سازی‌شدهٔ POSIX + ابزارهای امنیت/رمزنگاری.
// همه‌چیز داخل خود برنامه (WebView) اجرا می‌شود؛ باینری واقعی لینوکس اجرا نمی‌شود.
// «termux …» فقط در نسخهٔ نصب‌شدهٔ اندروید و اگر Termux نصب و اجازه داده شده باشد کار می‌کند.

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
  openBrowser?: (url?: string) => void;
};

type Line = { text: string; tone?: "in" | "err" | "ok" | "dim" };

const HELP = `فرمان‌ها (پوستهٔ شبیه‌سازی‌شده، داخل برنامه):
  help                 همین راهنما
  pwd | cd <مسیر>      مسیر فعلی / تغییر مسیر (/apps فقط‌خواندنی، /home/user نوشتنی)
  ls [مسیر] | tree     فهرست فایل‌ها / درخت مسیر فعلی
  cat <فایل>           نمایش محتوای فایل
  head <فایل> [n]      n خط اول (پیش‌فرض ۱۰)
  grep <الگو> <فایل>   جست‌وجوی خط‌ها
  wc <فایل>            شمارش خط/کلمه/نویسه
  touch <فایل> | mkdir <مسیر> | rm <فایل>   (فقط زیر /home/user)
  echo <متن> [> فایل | >> فایل]   چاپ یا نوشتن در فایل
  apps                 فهرست برنامه‌های نصب‌شده
  open <نام>           اجرای برنامه
  browser [نشانی]      مرورگر امن درون‌برنامه‌ای
  nmap <میزبان> | scan <میزبان>   اسکن پورت «شبیه‌سازی‌شده» (آموزشی، بدون شبکهٔ واقعی)
  termux <دستور>       فرستادن دستور به Termux واقعی (فقط اندروید نصب‌شده)
  theme [نام] | accent #00ff9c | matrix on|off
  hash [sha1|sha256|sha512] <متن> | b64 | unb64 | hex | unhex
  xor <کلید> <متن> | rot13 <متن> | caesar <n> <متن>
  entropy <رمز> | passgen [طول]
  net | neofetch | whoami | dev on|off | date | beep | gemini <پرسش>
  js <عبارت>           اجرای جاوااسکریپت با شیء api (فقط حالت توسعه‌دهنده)
  clear | exit`;

export function Terminal({ api, hostname, devMode, setDevMode, onClose, accent }: { api: LauncherApi; hostname: string; devMode: boolean; setDevMode: (on: boolean) => void; onClose: () => void; accent: string }) {
  const user = devMode ? "dev" : "user";
  const vfs = useRef(newVfs());
  const [cwd, setCwd] = useState(vfs.current.cwd);
  const prompt = useMemo(() => `${user}@${hostname}:${cwd === HOME ? "~" : cwd}$`, [user, hostname, cwd]);
  const [lines, setLines] = useState<Line[]>([{ text: `JibOS ${api.version} (WebView sandbox) — پوستهٔ شبیه‌سازی‌شده؛ برای راهنما بنویس help`, tone: "dim" }]);
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

  const snapshot = (): VfsApp[] =>
    api.apps().map((a) => ({ name: a.name, files: a.files, assets: assetsOf(assetKey(a.id)).map((m) => m.name) }));
  const tree = () => buildTree(snapshot(), vfs.current.scratch);
  const resolve = (arg?: string) => resolvePath(vfs.current.cwd, arg ?? "");

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
        case "pwd":
          return print(vfs.current.cwd);
        case "cd": {
          const target = resolve(rest[0] ?? HOME);
          const node = lookup(tree(), target);
          if (!node) return print(`cd: ${rest[0] ?? ""}: مسیری نیست`, "err");
          if (node.type !== "dir") return print(`cd: ${rest[0]}: پوشه نیست`, "err");
          vfs.current.cwd = target;
          return setCwd(target);
        }
        case "ls": {
          const target = resolve(rest[0]);
          const node = lookup(tree(), target);
          if (!node) return print(`ls: ${rest[0] ?? ""}: مسیری نیست`, "err");
          if (node.type === "file") return print(node.name);
          if (!node.children.length) return print("(خالی)", "dim");
          return print(node.children.map((c) => (c.type === "dir" ? `${c.name}/` : c.name)).join("\n"));
        }
        case "tree": {
          const node = lookup(tree(), resolve(rest[0]));
          if (!node) return print(`tree: مسیری نیست`, "err");
          const out: string[] = [];
          const walk = (n: typeof node, depth: number) => {
            out.push(`${"  ".repeat(depth)}${n.type === "dir" ? `${n.name || "/"}/` : n.name}`);
            if (n.type === "dir") for (const c of n.children) walk(c, depth + 1);
          };
          walk(node, 0);
          return print(out.join("\n"));
        }
        case "cat": {
          if (!rest[0]) return print("cat: نام فایل لازم است", "err");
          const node = lookup(tree(), resolve(rest[0]));
          if (!node) return print(`cat: ${rest[0]}: فایلی نیست`, "err");
          if (node.type !== "file") return print(`cat: ${rest[0]}: پوشه است`, "err");
          return print(node.content || "(خالی)");
        }
        case "head": {
          const node = lookup(tree(), resolve(rest[0]));
          if (!node || node.type !== "file") return print(`head: ${rest[0] ?? ""}: فایلی نیست`, "err");
          const n = Math.max(1, Number(rest[1]) || 10);
          return print(node.content.split("\n").slice(0, n).join("\n"));
        }
        case "grep": {
          if (rest.length < 2) return print("مثال: grep import /apps/…/index.html", "err");
          const node = lookup(tree(), resolve(rest.slice(1).join(" ")));
          if (!node || node.type !== "file") return print(`grep: فایلی نیست`, "err");
          const hits = node.content.split("\n").filter((l) => l.includes(rest[0]));
          return print(hits.length ? hits.join("\n") : "(بدون نتیجه)", hits.length ? undefined : "dim");
        }
        case "wc": {
          const node = lookup(tree(), resolve(rest[0]));
          if (!node || node.type !== "file") return print(`wc: ${rest[0] ?? ""}: فایلی نیست`, "err");
          const t = node.content;
          return print(`${t.split("\n").length}  ${t.split(/\s+/).filter(Boolean).length}  ${t.length}  ${rest[0]}`);
        }
        case "touch":
        case "mkdir": {
          const p = resolve(rest[0]);
          if (!isWritable(p)) return print(`${cmd}: فقط زیر /home/user می‌توان نوشت`, "err");
          vfs.current.scratch[cmd === "mkdir" ? `${p}/.keep` : p] = cmd === "mkdir" ? "" : vfs.current.scratch[p] ?? "";
          return;
        }
        case "rm": {
          const p = resolve(rest[0]);
          if (!isWritable(p)) return print("rm: فقط زیر /home/user می‌توان حذف کرد", "err");
          if (!(p in vfs.current.scratch)) return print(`rm: ${rest[0]}: فایلی نیست`, "err");
          delete vfs.current.scratch[p];
          return;
        }
        case "echo": {
          const m = arg.match(/^(.*?)\s*(>>|>)\s*(\S+)\s*$/);
          if (m) {
            const p = resolve(m[3]);
            if (!isWritable(p)) return print("echo: فقط زیر /home/user می‌توان نوشت", "err");
            const text = m[1].replace(/^"|"$/g, "");
            vfs.current.scratch[p] = m[2] === ">>" ? (vfs.current.scratch[p] ?? "") + text + "\n" : text + "\n";
            return;
          }
          return print(arg);
        }
        case "date":
          return print(new Date().toLocaleString("fa-IR") + "  |  " + new Date().toISOString());
        case "whoami":
          return print(devMode ? "dev (حالت توسعه‌دهندهٔ لانچر روشن است)" : "user");
        case "dev": {
          const on = rest[0] !== "off";
          setDevMode(on);
          return print(on ? "[✓] حالت توسعه‌دهنده روشن شد.\n[i] این فقط کنترل کامل داخل خود لانچر است؛ دسترسی سیستمی (root) به اندروید نمی‌دهد." : "حالت توسعه‌دهنده خاموش شد.", "ok");
        }
        case "apps": {
          const apps = api.apps();
          return print(apps.length ? apps.map((a) => `${a.icon}  ${a.name}   (${a.files.length} فایل)`).join("\n") : "هنوز برنامه‌ای نصب نشده.");
        }
        case "open":
        case "run":
          if (!arg) return print("نام برنامه را بنویس: open <نام>", "err");
          return api.launch(arg) ? print(`در حال باز کردن ${arg}…`, "ok") : print(`برنامه‌ای با نام «${arg}» پیدا نشد.`, "err");
        case "browser": {
          if (!api.openBrowser) return print("مرورگر درون‌برنامه‌ای در دسترس نیست.", "err");
          api.openBrowser(arg || undefined);
          return print("در حال باز کردن مرورگر امن (حالت ناشناس)…", "ok");
        }
        case "nmap":
        case "scan": {
          if (!arg) return print(`مثال: ${cmd} 192.168.1.1`, "err");
          print("[!] شبیه‌سازی آموزشی — هیچ بسته‌ای روی شبکه فرستاده نمی‌شود.", "dim");
          return print(formatScan(arg.split(/\s+/).pop() ?? arg, simulateScan(arg.split(/\s+/).pop() ?? arg)).join("\n"));
        }
        case "termux": {
          if (!arg) return print("مثال: termux ls -la", "err");
          print("در حال فرستادن به Termux…", "dim");
          try {
            const r = await runTermuxCommand(arg);
            if (r.stdout) print(r.stdout);
            if (r.stderr) print(r.stderr, "err");
            return print(r.message, "ok");
          } catch (e) {
            return print(e instanceof Error ? e.message : String(e), "err");
          }
        }
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
        case "open-url":
          try {
            await openExternalBrowser(arg);
            return print("باز شد.", "ok");
          } catch (e) {
            return print(e instanceof Error ? e.message : String(e), "err");
          }
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
        {["help", "ls /apps", "tree", "nmap 192.168.1.1", "hash sha256 hello", "passgen", "browser", devMode ? "dev off" : "dev on"].map((c) => (
          <button key={c} type="button" className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/80" onClick={() => void run(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
