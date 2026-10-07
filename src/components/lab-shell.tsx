import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, Download, Eye, Maximize2, Menu, Minimize2, Play, Plus, Redo2, Square, Terminal, Trash2, Undo2, X } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { APP_KICKER, APP_NAME } from "@/labshell/brand";
import { compileFarsi, FARSI_BAR, type FarsiPage } from "@/labshell/farsi";
import { compileEnglish, ENGLISH_BAR } from "@/labshell/english";
import { BINARY_BAR, runBinary, type MachineSnap } from "@/labshell/binary";
import { TEMPLATE_CHOICES } from "@/labshell/samples";
import { buildHtmlDoc, buildWebDoc } from "@/labshell/html-doc";
import { stageSrcDoc } from "@/labshell/stage-doc";
import { activeFile, activeProject, termLine, useLab } from "@/labshell/store";
import { runMix } from "@/labshell/mix";
import { isPythonWarm, runCpp, runFarsi, runJavaScript, runPython, stopRuntimes, type RunResult } from "@/labshell/runtime";
import { LANG_META, LANG_ORDER, type Lang, type TermLine, type TermStream } from "@/labshell/types";
import { CodeEditor, editHistory, hotkeys, insertAtCursor, moveCursor, pressTab } from "@/components/code-editor";
import { ThemePanel } from "@/components/theme-panel";
import { runShell } from "@/labshell/shell";
import { MachineView } from "@/components/machine-view";

const iconBtn =
  "grid size-10 shrink-0 place-items-center rounded-lab text-paper outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-40";

const MIX_BAR = [
  { label: "@@ پایتون", insert: "\n@@ پایتون\n" },
  { label: "@@ جاوااسکریپت", insert: "\n@@ جاوااسکریپت\n" },
  { label: "@@ جیب", insert: "\n@@ جیب\n" },
  { label: "@@ سی", insert: "\n@@ سی\n" },
  { label: "@@ ماشین", insert: "\n@@ ماشین\n" },
];

const KEYS: { label: string; insert?: string; move?: "left" | "right" | "up" | "down" }[] = [
  { label: "←", move: "left" },
  { label: "→", move: "right" },
  { label: "↑", move: "up" },
  { label: "↓", move: "down" },
  { label: "Tab", insert: "  " },
  { label: "{", insert: "{" },
  { label: "}", insert: "}" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "[", insert: "[" },
  { label: "]", insert: "]" },
  { label: "<", insert: "<" },
  { label: ">", insert: ">" },
  { label: "=", insert: "=" },
  { label: ";", insert: ";" },
  { label: ":", insert: ":" },
  { label: '"', insert: '"' },
  { label: "'", insert: "'" },
  { label: "/", insert: "/" },
  { label: "*", insert: "*" },
  { label: "+", insert: "+" },
  { label: "-", insert: "-" },
  { label: "_", insert: "_" },
  { label: "|", insert: "|" },
  { label: "&", insert: "&" },
  { label: "!", insert: "!" },
  { label: ",", insert: "," },
  { label: ".", insert: "." },
];

const STREAM_CLASS: Record<TermStream, string> = {
  cmd: "text-lime",
  sys: "text-mist",
  out: "text-paper",
  err: "text-coral",
};

export function LabShell() {
  const projects = useLab((state) => state.projects);
  const activeProjectId = useLab((state) => state.activeProjectId);
  const panel = useLab((state) => state.panel);
  const lines = useLab((state) => state.lines);
  const running = useLab((state) => state.running);
  const setPanel = useLab((state) => state.setPanel);
  const setActiveProject = useLab((state) => state.setActiveProject);
  const setActiveFile = useLab((state) => state.setActiveFile);
  const updateContent = useLab((state) => state.updateContent);
  const updateStdin = useLab((state) => state.updateStdin);
  const addFile = useLab((state) => state.addFile);
  const removeFile = useLab((state) => state.removeFile);
  const addProject = useLab((state) => state.addProject);
  const removeProject = useLab((state) => state.removeProject);
  const clearLines = useLab((state) => state.clearLines);
  const pushLines = useLab((state) => state.pushLines);

  const project = activeProject({ projects, activeProjectId });
  const file = activeFile(project);
  const cssFile = file.lang === "css" ? file : project.files.find((item) => item.lang === "css");
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [composer, setComposer] = useState<"file" | "project" | null>(null);
  const [copied, setCopied] = useState(false);
  const [shellInput, setShellInput] = useState("");
  const [outOpen, setOutOpen] = useState(true);
  const [liveCss, setLiveCss] = useState(cssFile?.content ?? "");
  const [scene, setScene] = useState<(FarsiPage & { lines: string[] }) | null>(null);
  const [machine, setMachine] = useState<MachineSnap | null>(null);
  const token = useRef(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const htmlToken = useRef("");
  const [reload, setReload] = useState(0);
  const [htmlDoc, setHtmlDoc] = useState("");
  const [mixDoc, setMixDoc] = useState("");
  const [mixWeb, setMixWeb] = useState<{ html: string; css: string; js: string } | null>(null);
  const [split, setSplit] = useState(0.58);
  const [full, setFull] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const wantsInput = file.lang === "mix" || file.lang === "farsi" || file.lang === "english" || file.lang === "binary" || file.lang === "python" || file.lang === "c" || file.lang === "cpp";

  useEffect(() => {
    void Promise.resolve(useLab.persist.rehydrate()).then(() => setReady(true));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setLiveCss(cssFile?.content ?? ""), 80);
    return () => window.clearTimeout(timer);
  }, [cssFile?.content]);

  useEffect(() => {
    if (file.lang !== "html") return;
    const timer = window.setTimeout(() => {
      const fresh = Math.random().toString(36).slice(2);
      htmlToken.current = fresh;
      setHtmlDoc(buildHtmlDoc(file.content, project.files, fresh));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [file.lang, file.content, project.files, reload]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { jib?: string; k?: string; t?: unknown } | null;
      if (!data || typeof data !== "object" || !htmlToken.current || data.jib !== htmlToken.current || typeof data.t !== "string") return;
      if (event.source !== frameRef.current?.contentWindow) return;
      useLab.getState().pushLines([termLine(data.k === "error" || data.k === "warn" ? "err" : "out", data.t.slice(0, 2000))]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, panel]);

  const stop = useCallback(() => {
    token.current += 1;
    stopRuntimes();
    useLab.getState().setRunning(false);
    useLab.getState().pushLines([termLine("sys", "متوقف شد.")]);
  }, []);

  const runActive = useCallback(async () => {
    const mine = ++token.current;
    const state = useLab.getState();
    const current = activeFile(activeProject(state));
    state.setRunning(true);
    state.setPanel(current.lang === "css" || current.lang === "html" || current.lang === "binary" ? "stage" : "out");
    const intro = [termLine("cmd", current.name)];
    if (current.lang === "farsi") intro.push(termLine("sys", "در حال خواندن جیب فارسی…"));
    if (current.lang === "english") intro.push(termLine("sys", "در حال اجرای جیب…"));
    if (current.lang === "binary") intro.push(termLine("sys", "ماشین: هر دستور ۸ بیت است."));
    if (current.lang === "python" && !isPythonWarm()) {
      intro.push(termLine("sys", "پایتون در حال راه‌اندازی است. اجرای اول چند ثانیه طول می‌کشد."));
    }
    if (current.lang === "javascript" && /\b(document|window)\b/.test(current.content)) {
      intro.push(termLine("sys", "این اجرا کنسول است نه صفحه. برای صفحه از page { } در جیب استفاده کن."));
    }
    state.pushLines(intro);
    if (current.lang === "mix") {
      const jib = async (code: string, stdin: string, farsi: boolean): Promise<RunResult> => {
        const compiled = farsi ? compileFarsi(code) : compileEnglish(code);
        if (!compiled.ok) return { stdout: "", stderr: compiled.error, aborted: false };
        return runFarsi(compiled.js, stdin);
      };
      const bits = async (code: string, stdin: string): Promise<RunResult> => {
        const r = runBinary(code, stdin);
        if (!r.ok) return { stdout: "", stderr: r.error, aborted: false };
        return { stdout: r.lines.join("\n"), stderr: "", aborted: false, machine: r.snap };
      };
      const result = await runMix(current.content, current.stdin, {
        python: runPython,
        javascript: runJavaScript,
        jib,
        c: runCpp,
        cpp: runCpp,
        binary: bits,
      });
      if (token.current !== mine || result.aborted) return;
      const next: TermLine[] = [];
      for (const line of result.stdout.replace(/\s+$/, "").split("\n")) if (line) next.push(termLine("out", line));
      for (const line of result.stderr.replace(/\s+$/, "").split("\n")) if (line) next.push(termLine("err", line));
      if (!next.length) next.push(termLine("sys", "خروجی‌ای نبود."));
      if (result.machine) setMachine(result.machine);
      if (result.page) {
        setScene({ ...result.page, title: result.page.title || "جیب", text: result.page.text || "", mark: result.page.mark || "JIB", lines: [] });
      }
      if (result.web) {
        const fresh = Math.random().toString(36).slice(2);
        htmlToken.current = fresh;
        setMixWeb(result.web);
        setMixDoc(buildWebDoc(result.web, fresh));
      } else {
        setMixWeb(null);
        setMixDoc("");
      }
      useLab.getState().pushLines(next);
      useLab.getState().setPanel(result.page || result.machine || result.web ? "stage" : "out");
      useLab.getState().setRunning(false);
      return;
    }
    if (current.lang === "html") {
      if (token.current !== mine) return;
      setReload((n) => n + 1);
      state.pushLines([termLine("sys", "صفحه دوباره بارگذاری شد. خروجی کنسول صفحه همین‌جا نشان داده می‌شود.")]);
      state.setRunning(false);
      return;
    }
    if (current.lang === "css") {
      if (token.current !== mine) return;
      state.pushLines([termLine("sys", "صفحه با این سی‌اس‌اس زنده است.")]);
      state.setRunning(false);
      return;
    }
    if (current.lang === "farsi" || current.lang === "english") {
      const compiled = current.lang === "english" ? compileEnglish(current.content) : compileFarsi(current.content);
      if (token.current !== mine) return;
      if (!compiled.ok) {
        state.pushLines([termLine("err", compiled.error)]);
        state.setRunning(false);
        return;
      }
      const result = await runFarsi(compiled.js, current.stdin);
      if (token.current !== mine || result.aborted) return;
      const next: TermLine[] = [];
      const printed = result.stdout.replace(/\s+$/, "");
      if (printed) {
        for (const line of printed.split("\n")) next.push(termLine("out", line));
      }
      if (result.stderr) {
        for (const line of result.stderr.replace(/\s+$/, "").split("\n")) next.push(termLine("err", line));
      }
      if (!printed && !result.stderr.trim()) next.push(termLine("sys", "خروجی‌ای نبود."));
      const page = result.page ?? { title: "", text: "", mark: "", css: "" };
      setScene({
        ...page,
        title: page.title || "Jib",
        text: page.text || "This page was built by the program.",
        mark: page.mark || "JIB",
        lines: printed ? printed.split("\n") : [],
      });
      if (result.machine) setMachine(result.machine);
      useLab.getState().pushLines(next);
      useLab.getState().setPanel("stage");
      useLab.getState().setRunning(false);
      return;
    }
    if (current.lang === "binary") {
      const result = runBinary(current.content, current.stdin);
      if (token.current !== mine) return;
      if (!result.ok) {
        state.pushLines([termLine("err", result.error)]);
        state.setRunning(false);
        return;
      }
      setMachine(result.snap);
      const next = result.lines.map((line) => termLine("out", line));
      next.push(termLine("sys", `${result.snap.gloss} — ${result.snap.bits}`));
      useLab.getState().pushLines(next);
      useLab.getState().setPanel("stage");
      useLab.getState().setRunning(false);
      return;
    }
    const result =
      current.lang === "python"
        ? await runPython(current.content, current.stdin)
        : current.lang === "javascript"
          ? await runJavaScript(current.content)
          : await runCpp(current.content, current.stdin);
    if (token.current !== mine || result.aborted) return;
    const next: TermLine[] = [];
    if (result.stdout) {
      for (const line of result.stdout.replace(/\s+$/, "").split("\n")) next.push(termLine("out", line));
    }
    if (result.stderr) {
      for (const line of result.stderr.replace(/\s+$/, "").split("\n")) next.push(termLine("err", line));
    }
    if (!result.stdout.trim() && !result.stderr.trim()) next.push(termLine("sys", "خروجی‌ای نبود."));
    useLab.getState().pushLines(next);
    useLab.getState().setRunning(false);
  }, []);

  useEffect(() => {
    hotkeys.run = () => {
      if (useLab.getState().running) return;
      void runActive();
    };
  }, [runActive]);

  function openFile(id: string, lang: Lang) {
    setActiveFile(id);
    setPanel(lang === "css" || lang === "html" || lang === "binary" ? "stage" : "out");
  }

  function exportWeb() {
    const doc = file.lang === "html" ? buildHtmlDoc(file.content, project.files, null) : mixWeb ? buildWebDoc(mixWeb, null) : "";
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file.name.replace(/\.[^.]+$/, "") || "app"}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyOutput() {
    const text = useLab
      .getState()
      .lines.map((line) => line.text)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      pushLines([termLine("sys", "کپی نشد.")]);
    }
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-ink pt-[env(safe-area-inset-top)] text-paper">
      <div className="h-0.5 shrink-0 bg-lime" />
      <header className="flex h-12 shrink-0 items-center gap-0.5 border-b border-line bg-panel pe-1.5 ps-1">
        <Dialog.Root
          open={menu}
          onOpenChange={(open) => {
            setMenu(open);
            if (!open) setComposer(null);
          }}
        >
          <Dialog.Trigger asChild>
            <button type="button" className={iconBtn} aria-label="پروژه‌ها">
              <Menu className="size-5" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/80" />
            <Dialog.Content className="fixed inset-y-0 start-0 z-50 flex w-80 max-w-full flex-col bg-panel outline-none">
              <div className="flex items-start justify-between gap-3 border-b border-line p-4">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-balance">{APP_NAME}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm leading-relaxed text-pretty text-mist">
                    چند زبان برنامه‌نویسی در یک برنامه، از پایتون و جاوااسکریپت تا صفر و یک. لامپ‌ها همان رجیستر هستند.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" className={iconBtn} aria-label="بستن">
                    <X className="size-5" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold text-mist">پروژه‌ها</h2>
                  {projects.map((item) => (
                    <div key={item.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        className={`h-11 min-w-0 flex-1 truncate rounded-lab px-3 text-start text-sm ${
                          item.id === project.id ? "bg-ink text-paper" : "text-paper hover:bg-panel-2"
                        }`}
                        onClick={() => {
                          setActiveProject(item.id);
                          setMenu(false);
                        }}
                      >
                        {item.name}
                      </button>
                      <button
                        type="button"
                        className="h-11 shrink-0 rounded-lab px-3 text-sm text-coral disabled:opacity-40"
                        disabled={projects.length < 2}
                        onClick={() => removeProject(item.id)}
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                  {composer === "project" ? (
                    <div className="flex flex-col gap-1">
                      {TEMPLATE_CHOICES.map((choice) => (
                        <button
                          key={choice.kind}
                          type="button"
                          className="flex min-h-11 flex-col items-start justify-center rounded-lab bg-ink px-3 py-2 text-start"
                          onClick={() => {
                            addProject(choice.kind);
                            setComposer(null);
                            setMenu(false);
                          }}
                        >
                          <span className="text-sm">{choice.title}</span>
                          <span className="text-xs text-mist">{choice.detail}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="h-11 rounded-lab bg-lime px-3 text-sm font-semibold text-lime-ink"
                      onClick={() => setComposer("project")}
                    >
                      پروژهٔ تازه
                    </button>
                  )}
                </section>
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold text-mist">فایل‌ها</h2>
                  {project.files.map((item) => (
                    <div key={item.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        className={`flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lab px-3 text-sm ${
                          item.id === file.id ? "bg-ink" : "hover:bg-panel-2"
                        }`}
                        onClick={() => {
                          openFile(item.id, item.lang);
                          setMenu(false);
                        }}
                      >
                        <span className="font-mono text-xs text-lime">{LANG_META[item.lang].short}</span>
                        <span className="min-w-0 truncate" dir="ltr">
                          {item.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        aria-label={`Delete ${item.name}`}
                        disabled={project.files.length < 2}
                        onClick={() => removeFile(item.id)}
                      >
                        <Trash2 className="size-5" />
                      </button>
                    </div>
                  ))}
                  {composer === "file" ? (
                    <div className="grid grid-cols-2 gap-1">
                      {LANG_ORDER.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          className="h-11 rounded-lab bg-ink px-3 text-sm"
                          onClick={() => {
                            addFile(lang);
                            setComposer(null);
                            setMenu(false);
                          }}
                        >
                          {LANG_META[lang].label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="h-11 rounded-lab border border-line px-3 text-sm"
                      onClick={() => setComposer("file")}
                    >
                      فایل تازه
                    </button>
                  )}
                </section>
                <p className="text-sm leading-relaxed text-pretty text-mist">
                  Jib can add, branch, loop, call functions, keep lists, and run an 8-bit machine block.
                  Python, JavaScript, C, C++, and CSS are still available as extra files. The machine is a
                  teaching CPU, not a phone processor.
                </p>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold leading-tight">{project.name}</p>
          <p className="truncate font-mono text-[11px] leading-tight text-mist" dir="ltr">
            {file.name}
          </p>
        </div>
        <ThemePanel />
        <button type="button" className={iconBtn} aria-label="بازگردانی" onClick={() => editHistory("undo")}>
          <Undo2 className="size-5" />
        </button>
        <button type="button" className={iconBtn} aria-label="ازنو" onClick={() => editHistory("redo")}>
          <Redo2 className="size-5" />
        </button>
        <button
          type="button"
          className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-lime ${
            running ? "bg-coral text-ink" : "bg-lime text-lime-ink"
          }`}
          onClick={() => {
            if (running) stop();
            else {
              setOutOpen(true);
              void runActive();
            }
          }}
        >
          {running ? <Square className="size-4" /> : <Play className="size-4" />}
          {running ? "توقف" : "اجرا"}
        </button>
      </header>
      <div className="flex min-w-0 shrink-0 items-center overflow-x-auto border-b border-line bg-panel/60 px-1">
        {project.files.map((item) => {
          const current = item.id === file.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={current ? "true" : undefined}
              dir="ltr"
              className={`flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 font-mono text-[13px] ${
                current ? "border-lime text-paper" : "border-transparent text-mist"
              }`}
              onClick={() => openFile(item.id, item.lang)}
            >
              <span className="text-xs text-lime">{LANG_META[item.lang].short}</span>
              {item.name}
            </button>
          );
        })}
        <button
          type="button"
          className={iconBtn}
          aria-label="فایل تازه"
          onClick={() => {
            setComposer("file");
            setMenu(true);
          }}
        >
          <Plus className="size-5" />
        </button>
      </div>
      <div
        ref={splitRef}
        className={`grid min-h-0 flex-1 lg:grid-cols-3 lg:grid-rows-1 ${outOpen ? "grid-rows-[var(--rows)]" : "grid-rows-[1fr_auto]"}`}
        style={outOpen ? ({ "--rows": full ? "0fr 1fr" : `${split}fr ${1 - split}fr` } as CSSProperties) : undefined}
      >
        <section className="min-h-0 min-w-0 overflow-hidden lg:col-span-2" dir="ltr">
          {ready ? (
            <CodeEditor fileId={file.id} lang={file.lang} content={file.content} onChange={updateContent} />
          ) : (
            <pre className="m-0 min-h-0 flex-1 overflow-auto p-3 font-mono text-base leading-relaxed text-paper">
              {file.content}
            </pre>
          )}
        </section>
        <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-line bg-panel/40 lg:col-span-1 lg:border-s lg:border-t-0 ${outOpen ? "" : "max-h-10 lg:max-h-none"}`}>
          <div
            className="flex h-4 shrink-0 cursor-row-resize touch-none items-center justify-center lg:hidden"
            role="separator"
            aria-label="تغییر اندازهٔ پنل"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setFull(false);
              setOutOpen(true);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const box = splitRef.current?.getBoundingClientRect();
              if (!box || box.height <= 0) return;
              setSplit(Math.min(0.85, Math.max(0.15, (event.clientY - box.top) / box.height)));
            }}
          >
            <span className="h-1 w-12 rounded-full bg-line" />
          </div>
          <div className="flex shrink-0 items-center gap-1 px-2">
            <button
              type="button"
              aria-pressed={panel === "out"}
              className={`inline-flex h-10 items-center gap-1 rounded-lab px-3 text-sm ${
                panel === "out" ? "bg-panel-2 text-paper" : "text-mist"
              }`}
              onClick={() => setPanel("out")}
            >
              <Terminal className="size-4" />
              خروجی
            </button>
            <button
              type="button"
              aria-pressed={panel === "stage"}
              className={`inline-flex h-10 items-center gap-1 rounded-lab px-3 text-sm ${
                panel === "stage" ? "bg-panel-2 text-paper" : "text-mist"
              }`}
              onClick={() => setPanel("stage")}
            >
              <Eye className="size-4" />
              {file.lang === "binary" ? "ماشین" : "صفحه"}
            </button>
            <span className="flex-1" />
            <button type="button" className="h-10 px-2 text-sm text-mist" onClick={clearLines}>
              پاک‌کردن
            </button>
            <button type="button" className="h-10 px-2 text-sm text-mist" onClick={() => void copyOutput()}>
              {copied ? "کپی شد" : "کپی"}
            </button>
            {file.lang === "html" || (file.lang === "mix" && mixWeb) ? (
              <button type="button" className="grid size-10 place-items-center text-mist" aria-label="ذخیره به‌صورت صفحهٔ مستقل (HTML)" onClick={exportWeb}>
                <Download className="size-5" />
              </button>
            ) : null}
            <button
              type="button"
              className="grid size-10 place-items-center text-mist lg:hidden"
              aria-label={full ? "اندازهٔ معمولی" : "تمام‌صفحه‌کردن پنل"}
              onClick={() => {
                setOutOpen(true);
                setFull((value) => !value);
              }}
            >
              {full ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
            </button>
            <button
              type="button"
              className="grid size-10 place-items-center text-mist lg:hidden"
              aria-label={outOpen ? "کوچک‌کردن خروجی" : "باز‌کردن خروجی"}
              onClick={() => setOutOpen((open) => !open)}
            >
              {outOpen ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
            </button>
          </div>
          {wantsInput ? (
            <label className="flex shrink-0 items-start gap-2 border-t border-line px-3 py-2">
              <span className="mt-1 font-mono text-xs text-lime">ورودی</span>
              <textarea
                value={file.stdin}
                onChange={(event) => updateStdin(event.target.value)}
                rows={2}
                dir="ltr"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="ورودی برنامه"
                placeholder={file.lang === "binary" ? "0" : "12\n30"}
                className="max-h-16 min-h-11 min-w-0 flex-1 resize-none bg-transparent font-mono text-sm leading-5 text-paper outline-none placeholder:text-mist"
              />
            </label>
          ) : null}
          {panel === "stage" ? (
            file.lang === "binary" ? (
              <MachineView snap={machine} />
            ) : file.lang === "html" || (file.lang === "mix" && mixDoc !== "") ? (
              <iframe
                ref={frameRef}
                title="پیش‌نمایش صفحه"
                sandbox="allow-scripts allow-modals allow-forms"
                className="min-h-0 w-full flex-1 border-0 bg-white"
                srcDoc={file.lang === "html" ? htmlDoc : mixDoc}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                {machine ? (
                  <div className="max-h-40 shrink-0 overflow-hidden border-b border-line">
                    <MachineView snap={machine} />
                  </div>
                ) : null}
                <iframe
                  title="صفحهٔ جیب"
                  sandbox="allow-same-origin"
                  className="min-h-0 w-full flex-1 border-0 bg-ink"
                  srcDoc={stageSrcDoc(file.lang === "css" ? liveCss : (scene?.css ?? ""), file.lang === "css" ? undefined : (scene ?? undefined))}
                />
              </div>
            )
          ) : (
            <div
              ref={scroller}
              className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-sm leading-6"
              aria-live="polite"
              dir="ltr"
            >
              {lines.length === 0 ? <p className="text-mist">خروجی اینجا نشان داده می‌شود.</p> : null}
              {lines.map((line) => (
                <p key={line.id} dir="auto" className={`whitespace-pre-wrap break-words ${STREAM_CLASS[line.stream]}`}>
                  {line.text}
                </p>
              ))}
            </div>
          )}
          {panel === "out" ? (
            <form
              className="flex shrink-0 items-center gap-2 border-t border-line px-3"
              dir="ltr"
              onSubmit={(event) => {
                event.preventDefault();
                const text = shellInput.trim();
                setShellInput("");
                if (!text) return;
                const out = runShell(text, () => hotkeys.run());
                pushLines([termLine("cmd", `$ ${text}`), ...out.map((row) => termLine("out", row))]);
              }}
            >
              <span className="font-mono text-lime">$</span>
              <input
                value={shellInput}
                onChange={(event) => setShellInput(event.target.value)}
                placeholder="help"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="ترمینال"
                className="h-10 min-w-0 flex-1 bg-transparent font-mono text-sm text-paper outline-none"
              />
            </form>
          ) : null}
        </section>
      </div>
      <div className="pb-safe flex min-w-0 shrink-0 gap-1 overflow-x-auto border-t border-line bg-panel px-2 py-1">
        {[...(file.lang === "mix" ? MIX_BAR : file.lang === "farsi" ? FARSI_BAR : file.lang === "english" ? ENGLISH_BAR : file.lang === "binary" ? BINARY_BAR : []), ...KEYS].map((key) => (
          <button
            key={`${file.lang}-${key.label}`}
            type="button"
            className={`h-10 shrink-0 rounded-lab bg-panel-2 px-3 text-sm text-paper ${/[\u0600-\u06FF]/.test(key.label) ? "font-sans" : "min-w-11 font-mono"}`}
            onClick={() => {
              if (key.label === "Tab") pressTab();
              else if ("move" in key && key.move) moveCursor(key.move);
              else if (key.insert) insertAtCursor(key.insert);
            }}
          >
            {key.label}
          </button>
        ))}
      </div>
    </main>
  );
}
