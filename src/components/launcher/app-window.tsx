import { useEffect, useMemo, useRef, useState } from "react";
import { compileEnglish } from "@/labshell/english";
import { compileFarsi } from "@/labshell/farsi";
import { runBinary } from "@/labshell/binary";
import { assetUrlsFor, loadAssets } from "@/labshell/assets";
import { buildHtmlDoc, buildWebDoc, webText, withAssets } from "@/labshell/html-doc";
import { injectHead, jibosClient, JIBOS_DEV, JIBOS_OPEN, readAppStore, writeAppStore } from "@/labshell/jibos";
import { assetKey, type App } from "@/labshell/launcher";
import { runMix } from "@/labshell/mix";
import { launcherEntry } from "@/labshell/launcher-entry";
import { compileNava } from "@/labshell/nava";
import { appAsk } from "@/labshell/gemini";
import { langFromName } from "@/labshell/open-files";
import { runCpp, runFarsi, runJavaScript, runPython, stopRuntimes, type RunResult } from "@/labshell/runtime";
import { stageSrcDoc } from "@/labshell/stage-doc";
import type { Lang } from "@/labshell/types";
import { ImmersiveToolbar } from "./immersive-toolbar";

// پنجرهٔ تمام‌صفحهٔ یک برنامهٔ نصب‌شده. برنامه‌های وب داخل iframe محدود (بدون allow-same-origin) اجرا می‌شوند
// و فقط از راه پل jibos (postMessage + رمز یک‌بارمصرف) با لانچر حرف می‌زنند.

const KIND: Partial<Record<Lang, string>> = { python: "python", javascript: "javascript", english: "jib", farsi: "farsi", c: "c", cpp: "cpp", binary: "binary" };


type View = { kind: "busy" } | { kind: "web"; doc: string } | { kind: "page"; doc: string } | { kind: "text"; out: string; err: string };

/** کارهایی که لانچر برای پل jibos انجام می‌دهد */
export type BridgeHost = {
  version: string;
  devMode: boolean;
  theme: string;
  toast: (msg: string) => void;
  apps: () => string[];
  launch: (name: string) => boolean;
  setWallpaper: (value: string) => void;
  setAccent: (hex: string) => void;
};

async function handle(cmd: string, args: unknown, app: App, host: BridgeHost): Promise<unknown> {
  if (!JIBOS_OPEN.has(cmd) && !JIBOS_DEV.has(cmd)) throw new Error(`فرمان ناشناخته: ${cmd}`);
  if (JIBOS_DEV.has(cmd) && !host.devMode) throw new Error("این کار فقط وقتی «حالت توسعه‌دهنده»ٔ لانچر روشن است مجاز است.");
  const list = Array.isArray(args) ? args : [];
  switch (cmd) {
    case "toast":
      host.toast(String(args).slice(0, 200));
      return true;
    case "info":
      return { app: app.name, version: host.version, devMode: host.devMode, theme: host.theme, online: navigator.onLine };
    case "vibrate":
      return typeof navigator.vibrate === "function" ? navigator.vibrate(args as number | number[]) : false;
    case "speak": {
      if (!("speechSynthesis" in window)) return false;
      const u = new SpeechSynthesisUtterance(String(list[0] ?? ""));
      if (list[1]) u.lang = String(list[1]);
      window.speechSynthesis.speak(u);
      return true;
    }
    case "storage.get":
      return readAppStore(app.name)[String(args)] ?? null;
    case "storage.set": {
      const store = readAppStore(app.name);
      store[String(list[0])] = list[1];
      writeAppStore(app.name, store);
      return true;
    }
    case "storage.remove": {
      const store = readAppStore(app.name);
      delete store[String(args)];
      writeAppStore(app.name, store);
      return true;
    }
    case "storage.keys":
      return Object.keys(readAppStore(app.name));
    case "ai":
      return appAsk(app.name, String(args ?? ""));
    case "clipboard":
      await navigator.clipboard.writeText(String(args));
      return true;
    case "apps":
      return host.apps();
    case "launch":
      return host.launch(String(args));
    case "wallpaper":
      host.setWallpaper(String(args));
      return true;
    case "accent":
      if (!/^#[0-9a-f]{3,8}$/i.test(String(args))) throw new Error("رنگ باید به شکل #00ff9c باشد");
      host.setAccent(String(args));
      return true;
  }
  return null;
}

export function AppWindow({ app, host, accent, onClose }: { app: App; host: BridgeHost; accent: string; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "busy" });
  const [closing, setClosing] = useState(false);
  const [run, setRun] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const nonce = useMemo(() => crypto.getRandomValues(new Uint32Array(4)).join("-"), []);
  const hostRef = useRef(host);
  hostRef.current = host;

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, 170);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // پل jibos: فقط پیام همین قاب و با همین رمز جواب داده می‌شود
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { jibos?: string; id?: number; cmd?: string; args?: unknown } | null;
      const win = frame.current?.contentWindow;
      if (!d || d.jibos !== nonce || !win || e.source !== win || typeof d.cmd !== "string") return;
      const reply = (ok: boolean, value?: unknown, error?: string) => win.postMessage({ jibosReply: nonce, id: d.id, ok, value, error }, "*");
      handle(d.cmd, d.args, app, hostRef.current).then(
        (v) => reply(true, v),
        (err) => reply(false, undefined, err instanceof Error ? err.message : String(err)),
      );
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [app, nonce]);

  useEffect(() => {
    let dead = false;
    const show = (v: View) => !dead && setView(v);
    setView({ kind: "busy" });
    const bridge = (doc: string) => injectHead(doc, jibosClient(nonce, app.name));
    (async () => {
      await loadAssets();
      const key = assetKey(app.id);
      const entry = launcherEntry(app);
      if (!entry) return show({ kind: "text", out: "", err: "فایل قابل اجرا در این برنامه نیست." });
      const lang = langFromName(entry.name);
      if (lang === "html") {
        const files = app.files.map((f) => ({ id: f.name, name: f.name, lang: langFromName(f.name), content: f.content, stdin: "" }));
        const urls = await assetUrlsFor(key, files.map((f) => f.content).join("\n"));
        return show({ kind: "web", doc: bridge(buildHtmlDoc(entry.content, files, null, urls)) });
      }
      if (lang === "nava") {
        const compiled = compileNava(entry.content);
        if (!compiled.web) return show({ kind: "text", out: "", err: compiled.error ?? "برنامهٔ نوا ساخته نشد." });
        const web = withAssets(compiled.web, await assetUrlsFor(key, webText(compiled.web)));
        return show({ kind: "web", doc: bridge(buildWebDoc(web, null)) });
      }
      const source = lang === "mix" ? entry.content : `@@ ${KIND[lang] ?? "jib"}\n${entry.content}`;
      const result = await runMix(source, "", {
        python: (code, stdin) => runPython(code, stdin, key),
        javascript: runJavaScript,
        jib: async (code, stdin, farsi): Promise<RunResult> => {
          const c = farsi ? compileFarsi(code) : compileEnglish(code);
          return c.ok ? runFarsi(c.js, stdin) : { stdout: "", stderr: c.error, aborted: false };
        },
        c: runCpp,
        cpp: runCpp,
        binary: async (code, stdin): Promise<RunResult> => {
          const r = runBinary(code, stdin);
          return r.ok ? { stdout: r.lines.join("\n"), stderr: "", aborted: false } : { stdout: "", stderr: r.error, aborted: false };
        },
      });
      if (dead || result.aborted) return;
      if (result.web) {
        const web = withAssets(result.web, await assetUrlsFor(key, webText(result.web)));
        return show({ kind: "web", doc: bridge(buildWebDoc(web, null)) });
      }
      // کارت «صفحه» فقط وقتی برنامه واقعاً page { } ساخته باشد؛ چاپ‌ها هم روی کارت می‌آیند
      const page = result.page;
      if (page && !result.stderr.trim() && (page.title || page.text || page.mark || page.css)) {
        const lines = result.stdout.split("\n").filter((line) => line && !line.startsWith("── "));
        return show({ kind: "page", doc: stageSrcDoc(page.css ?? "", { ...page, title: page.title || app.name, text: page.text || "", mark: page.mark || "JIB", lines }) });
      }
      show({ kind: "text", out: result.stdout, err: result.stderr });
    })().catch((e) => show({ kind: "text", out: "", err: String(e) }));
    return () => {
      dead = true;
      stopRuntimes();
    };
  }, [app, nonce, run]);

  return (
    <div role="dialog" data-state="open" aria-label={app.name} data-testid="app-window" className={`jibos-window fixed inset-0 z-30 flex flex-col bg-[#020604] ${closing ? "jibos-window-out" : ""}`}>
      <ImmersiveToolbar name={app.name} icon={app.icon} iconImage={app.iconImage} iconColor={app.iconColor} accent={accent} resetKey={app.id} onClose={close} onReload={() => setRun((n) => n + 1)} />
      {view.kind === "busy" ? (
        <div className="grid flex-1 place-items-center font-mono text-sm" style={{ color: accent }}>
          <span className="jibos-caret">در حال اجرا</span>
        </div>
      ) : null}
      {view.kind === "web" ? <iframe ref={frame} key={run} title={app.name} className="min-h-0 flex-1 bg-white" sandbox="allow-scripts allow-modals allow-forms allow-pointer-lock" allow="autoplay; fullscreen" srcDoc={view.doc} /> : null}
      {view.kind === "page" ? <iframe title={app.name} className="min-h-0 flex-1" sandbox="allow-same-origin" srcDoc={view.doc} /> : null}
      {view.kind === "text" ? (
        <pre dir="auto" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-black p-4 font-mono text-[13px] leading-6" style={{ color: accent }}>
          {view.out}
          {view.err ? <span className="text-rose-400">{"\n" + view.err}</span> : null}
        </pre>
      ) : null}
    </div>
  );
}
