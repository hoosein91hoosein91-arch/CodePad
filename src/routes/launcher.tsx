import * as Dialog from "@radix-ui/react-dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { compileEnglish } from "@/labshell/english";
import { compileFarsi } from "@/labshell/farsi";
import { runBinary } from "@/labshell/binary";
import { assetUrlsFor, loadAssets } from "@/labshell/assets";
import { buildHtmlDoc, buildWebDoc, webText, withAssets } from "@/labshell/html-doc";
import { assetKey, installPack, uninstall, useLauncher, type App } from "@/labshell/launcher";
import { runMix } from "@/labshell/mix";
import { langFromName } from "@/labshell/open-files";
import { parsePack } from "@/labshell/pack";
import { runCpp, runFarsi, runJavaScript, runPython, stopRuntimes, type RunResult } from "@/labshell/runtime";
import { stageSrcDoc } from "@/labshell/stage-doc";
import { applyTheme, useTheme } from "@/labshell/theme";
import type { Lang } from "@/labshell/types";

export const Route = createFileRoute("/launcher")({ component: Launcher });

const KIND: Partial<Record<Lang, string>> = { python: "python", javascript: "javascript", english: "jib", farsi: "farsi", c: "c", cpp: "cpp", binary: "binary" };

function entryOf(app: App) {
  const by = (test: (n: string, l: Lang) => boolean) => app.files.find((f) => test(f.name, langFromName(f.name)));
  return by((n) => /^main\./i.test(n)) ?? by((_, l) => l === "mix") ?? by((_, l) => l === "html") ?? by((_, l) => l !== "css");
}

type View = { kind: "busy" } | { kind: "web"; doc: string } | { kind: "page"; doc: string } | { kind: "text"; out: string; err: string };

function AppWindow({ app, onClose }: { app: App; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "busy" });
  useEffect(() => {
    let dead = false;
    const show = (v: View) => !dead && setView(v);
    (async () => {
      await loadAssets();
      const key = assetKey(app.id);
      const entry = entryOf(app);
      if (!entry) return show({ kind: "text", out: "", err: "فایل قابل اجرا در این برنامه نیست." });
      const lang = langFromName(entry.name);
      if (lang === "html") {
        const files = app.files.map((f) => ({ id: f.name, name: f.name, lang: langFromName(f.name), content: f.content, stdin: "" }));
        const urls = await assetUrlsFor(key, files.map((f) => f.content).join("\n"));
        return show({ kind: "web", doc: buildHtmlDoc(entry.content, files, null, urls) });
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
        return show({ kind: "web", doc: buildWebDoc(web, null) });
      }
      // کارت «صفحه» فقط وقتی برنامه واقعاً page { } ساخته باشد؛ چاپ‌ها هم روی کارت می‌آیند (لانچر ترمینال ندارد)
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
  }, [app]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ink pt-[env(safe-area-inset-top)]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <button type="button" className="grid size-10 place-items-center" aria-label="بازگشت به خانه" onClick={onClose}>
          <ArrowRight className="size-5" />
        </button>
        <span className="truncate text-sm font-semibold">{app.name}</span>
      </header>
      {view.kind === "busy" ? <p className="p-4 text-mist">در حال اجرا…</p> : null}
      {view.kind === "web" ? <iframe title={app.name} className="min-h-0 flex-1 bg-white" sandbox="allow-scripts allow-modals allow-forms" srcDoc={view.doc} /> : null}
      {view.kind === "page" ? <iframe title={app.name} className="min-h-0 flex-1" sandbox="allow-same-origin" srcDoc={view.doc} /> : null}
      {view.kind === "text" ? (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm">
          {view.out}
          {view.err ? <span className="text-[#ff6a3d]">{"\n" + view.err}</span> : null}
        </pre>
      ) : null}
    </div>
  );
}

function InstallDialog() {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const done = async (text: string) => {
    const pack = parsePack(text);
    if (!pack) return setMsg("این فایل بستهٔ جیب (.jibpack) نیست.");
    const app = await installPack(pack);
    setMsg(`«${app.name}» نصب شد.` + (pack.problems.length ? ` مشکل: ${pack.problems.join("، ")}` : ""));
  };
  const field = "h-11 w-full rounded-lab bg-panel-2 px-3 text-sm outline-none";
  return (
    <Dialog.Root onOpenChange={() => setMsg("")}>
      <Dialog.Trigger asChild>
        <button type="button" className="grid size-14 place-items-center rounded-full bg-lime text-ink" aria-label="نصب برنامه">
          <Plus className="size-7" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-2xl bg-panel p-4 outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">نصب برنامه</Dialog.Title>
            <Dialog.Close className="grid size-10 place-items-center" aria-label="بستن">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-mist">فایل بستهٔ جیب (.jibpack) را انتخاب کن یا نشانی دانلودش را بده.</Dialog.Description>
          <input
            type="file"
            accept=".jibpack,.txt,text/plain"
            className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await done(await f.text()).catch((x) => setMsg(String(x)));
              e.target.value = "";
            }}
          />
          <input className={field} dir="ltr" placeholder="https://…/app.jibpack" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button
            type="button"
            className="h-11 rounded-lab bg-panel-2 text-sm"
            onClick={async () => {
              try {
                setMsg("در حال دانلود…");
                const r = await fetch(url);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                await done(await r.text());
              } catch (e) {
                setMsg(`دانلود نشد (${e instanceof Error ? e.message : e}). اگر سایت اجازهٔ دسترسی نمی‌دهد، فایل را دانلود کن و از «انتخاب فایل» نصب کن.`);
              }
            }}
          >
            دانلود و نصب
          </button>
          {msg ? <p className="text-sm">{msg}</p> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Launcher() {
  const apps = useLauncher((s) => s.apps);
  const [running, setRunning] = useState<App | null>(null);
  const [edit, setEdit] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    void Promise.resolve(useLauncher.persist.rehydrate());
    void loadAssets();
    void Promise.resolve(useTheme.persist.rehydrate()).then(() => applyTheme(useTheme.getState()));
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-ink pt-[env(safe-area-inset-top)] text-paper">
      <div className="flex h-10 shrink-0 items-center justify-between px-5 text-sm">
        <span>{now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
        <Link to="/" className="text-mist">
          جیب‌کد
        </Link>
      </div>
      <div className="flex shrink-0 items-center justify-between px-5 py-2">
        <h1 className="text-xl font-bold">برنامه‌ها</h1>
        <button type="button" className="h-9 rounded-full bg-panel px-4 text-sm" onClick={() => setEdit((v) => !v)}>
          {edit ? "تمام" : "ویرایش"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {apps.length === 0 ? (
          <p className="p-6 text-center text-mist">هنوز برنامه‌ای نصب نشده. با دکمهٔ + یک بستهٔ جیب نصب کن، یا از ویرایشگر پروژه را نصب کن.</p>
        ) : (
          <div className="grid grid-cols-4 gap-y-6 pt-2">
            {apps.map((app) => {
              const hue = [...app.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
              return (
                <div key={app.id} className="relative flex flex-col items-center gap-1">
                  <button type="button" className={`grid size-16 place-items-center rounded-2xl text-3xl font-bold text-white ${edit ? "animate-pulse" : ""}`} style={{ background: `hsl(${hue} 55% 38%)` }} onClick={() => (edit ? undefined : setRunning(app))}>
                    {app.icon}
                  </button>
                  <span className="w-full truncate text-center text-xs">{app.name}</span>
                  {edit ? (
                    <button
                      type="button"
                      aria-label="حذف"
                      className="absolute -top-2 end-1 grid size-6 place-items-center rounded-full bg-red-600 text-white"
                      onClick={() => window.confirm(`«${app.name}» حذف شود؟`) && void uninstall(app.id)}
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 justify-center bg-panel/70 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <InstallDialog />
      </div>
      {running ? <AppWindow app={running} onClose={() => setRunning(null)} /> : null}
    </main>
  );
}
