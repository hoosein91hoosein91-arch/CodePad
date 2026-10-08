import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, Download, Eye, File as FileIcon, FolderOpen, Maximize2, Menu, Minimize2, Paperclip, Play, Plus, Redo2, Square, Terminal, Trash2, Undo2, X } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { APP_NAME } from "@/labshell/brand";
import { compileFarsi, FARSI_BAR, type FarsiPage } from "@/labshell/farsi";
import { compileEnglish, ENGLISH_BAR } from "@/labshell/english";
import { BINARY_BAR, runBinary, type MachineSnap } from "@/labshell/binary";
import { TEMPLATE_CHOICES } from "@/labshell/samples";
import { addAssets, assetUrlsFor, loadAssets, readAssetBlob, removeAsset, useAssets, type AssetMeta } from "@/labshell/assets";
import { formatSize } from "@/labshell/asset-refs";
import { buildHtmlDoc, buildWebDoc, webText, withAssets } from "@/labshell/html-doc";
import { langFromName, listenLaunchFiles, readOpened, takeSharedFiles } from "@/labshell/open-files";
import { assetFile, parsePack, type Pack } from "@/labshell/pack";
import { PACK_SAMPLES } from "@/labshell/pack-samples";
import { stageSrcDoc } from "@/labshell/stage-doc";
import { activeFile, activeProject, termLine, useLab } from "@/labshell/store";
import { runMix } from "@/labshell/mix";
import { compileNava } from "@/labshell/nava";
import { packNavaSource } from "@/labshell/nava-lines";
import { injectHead, jibosClient, readAppStore, writeAppStore } from "@/labshell/jibos";
import { appAsk } from "@/labshell/gemini";
import { isPythonWarm, runCpp, runFarsi, runJavaScript, runPython, stopRuntimes, type RunResult } from "@/labshell/runtime";
import { LANG_META, LANG_ORDER, type Lang, type TermLine, type TermStream } from "@/labshell/types";
import { CodeEditor } from "@/components/code-editor";
import { editHistory, hotkeys, insertAtCursor, moveCursor, pressTab } from "@/components/editor-commands";
import { ThemePanel } from "@/components/theme-panel";
import { runShell } from "@/labshell/shell";
import { runTermuxCommand } from "@/lib/termux-bridge";
import type { LabFile } from "@/labshell/types";
import { MachineView } from "@/components/machine-view";
import { LauncherButton } from "@/components/launcher-button";

const iconBtn =
  "grid size-10 shrink-0 place-items-center rounded-lab text-paper outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-40";

const MIX_BAR = [
  { label: "@@ پایتون", insert: "\n@@ پایتون\n" },
  { label: "@@ جاوااسکریپت", insert: "\n@@ جاوااسکریپت\n" },
  { label: "@@ جیب", insert: "\n@@ جیب\n" },
  { label: "@@ سی", insert: "\n@@ سی\n" },
  { label: "@@ ماشین", insert: "\n@@ ماشین\n" },
  { label: "@@ html", insert: "\n@@ html\n" },
];

const NAVA_BAR = [
  { label: "Pg", insert: 'Pg "App"\n' },
  { label: "Scene", insert: 'G9 | Scene N360,N480 | Ball Orb "#67f5a5" | Orbit Tr\n' },
  { label: "Frame", insert: 'Frame | Rotate Orb N0,N30 * Dt,N0 | End\n' },
  { label: "Mat", insert: 'Mat Orb N0d2,N0d7,N0\n' },
  { label: "Torus", insert: 'Torus Ring "#b0a9ff"\n' },
  { label: "Bt", insert: 'Bt "Start" (Ru180Rn56Rr): Sy "Done"\n' },
  { label: "Cal", insert: 'Cal Mb\n' },
  { label: "Vx", insert: 'Vx Sz N24 Sd N7\n' },
  { label: "Num", insert: 'Num Score = N0\n' },
  { label: "Out", insert: 'Out "Score: {Score}"\n' },
  { label: "If", insert: 'If Score > N10\n  \nEnd\n' },
  { label: "End", insert: 'End\n' },
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

function isAllowedLocalNmap(command: string): boolean {
  const parts = command.trim().split(/\s+/);
  if (parts.length !== 3 || parts[0].toLowerCase() !== "nmap" || parts[1] !== "-sn") return false;
  const [address, mask, extra] = parts[2].split("/");
  if (extra !== undefined || (mask !== undefined && (!/^\d{1,2}$/.test(mask) || Number(mask) < 24 || Number(mask) > 32))) return false;
  const octets = address.split(".");
  if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [a, b] = octets.map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function isNmapInstall(command: string): boolean {
  return /^pkg\s+install\s+nmap(?:\s+-y)?$/i.test(command.trim());
}

// متنی که صفحهٔ html از آن ساخته می‌شود (خودش + css و js هم‌پروژه‌ای که داخلش گذاشته می‌شوند)؛ برای پیدا کردن نام پیوست‌ها
function htmlSourceText(file: LabFile, files: LabFile[]): string {
  return [file.content, ...files.filter((item) => item.lang === "css" || item.lang === "javascript").map((item) => item.content)].join("\n");
}

function AssetRow({ item, onInsert, onDelete }: { item: AssetMeta; onInsert: () => void; onDelete: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!item.type.startsWith("image/")) return;
    let url = "";
    let dead = false;
    void readAssetBlob(item.projectId, item.name).then((blob) => {
      if (!blob || dead) return;
      url = URL.createObjectURL(blob);
      setThumb(url);
    });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.projectId, item.name, item.stamp, item.type]);
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-lab px-2 text-sm hover:bg-panel-2" aria-label={`Insert ${item.name} into code`} onClick={onInsert}>
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded bg-ink text-mist">
          {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <FileIcon className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-col items-start">
          <span className="w-full truncate text-start" dir="ltr">{item.name}</span>
          <span className="text-xs text-mist" dir="ltr">{formatSize(item.size)}</span>
        </span>
      </button>
      <button type="button" className={iconBtn} aria-label={`Delete ${item.name}`} onClick={onDelete}>
        <Trash2 className="size-5" />
      </button>
    </div>
  );
}

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
  // صفحهٔ ساخته‌شده از بلوک‌های @@ html در آخرین اجرای فایل ترکیبی
  const [mixPage, setMixPage] = useState<{ fileId: string; doc: string; web: NonNullable<RunResult["web"]> } | null>(null);
  // اندازهٔ پنل‌ها روی گوشی: سهم ویرایشگر (کشیدنی) و حالت تمام‌صفحهٔ خروجی
  const [split, setSplit] = useState(0.58);
  const [full, setFull] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const showFrame = file.lang === "html" || ((file.lang === "mix" || file.lang === "nava") && mixPage?.fileId === file.id);
  // رمز یک‌بارمصرف پل jibos برای پیش‌نمایش برنامه‌های نوا (حافظه، پیام، هوش مصنوعی)
  const navaNonce = useRef("");
  const pickRef = useRef<HTMLInputElement>(null);
  const assetPickRef = useRef<HTMLInputElement>(null);
  const assetItems = useAssets((state) => state.items);
  const projectAssets = assetItems.filter((item) => item.projectId === project.id);

  // پیوست کردن عکس و فایل به پروژهٔ فعال (بدون محدودیت اندازه یا نوع)
  const attach = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const state = useLab.getState();
    const { added, replaced, failed } = await addAssets(state.activeProjectId, files);
    if (added.length) state.pushLines([termLine("sys", `${added.length} پیوست ذخیره شد: ${added.join("، ")}`)]);
    if (replaced.length) state.pushLines([termLine("sys", `جایگزین شد: ${replaced.join("، ")}`)]);
    if (failed.length) state.pushLines([termLine("err", `ذخیره نشد: ${failed.join("، ")}`)]);
  }, []);

  // «بستهٔ جیب»: هر بسته یک پروژهٔ تازه می‌شود؛ کدها داخل پروژه و عکس‌ها/فایل‌ها پیوست آن
  // (هم برای فایل .jibpack که باز می‌شود و هم برای نمونه‌های آمادهٔ منوی «پروژهٔ تازه»)
  const openPack = useCallback(async (pack: Pack) => {
    const state = useLab.getState();
    if (!pack.files.length) {
      state.pushLines([termLine("err", `بستهٔ «${pack.name}» فایل کد نداشت.`)]);
      return;
    }
    const projectId = state.importProject(
      pack.name,
      pack.files.map((item) => ({ name: item.name, lang: langFromName(item.name), content: item.content })),
    );
    const saved = await addAssets(projectId, pack.assets.map(assetFile));
    state.pushLines([
      termLine("sys", `بستهٔ «${pack.name}» باز شد: ${pack.files.length} فایل کد و ${saved.added.length + saved.replaced.length} پیوست. برای دیدن نتیجه «اجرا» را بزن.`),
    ]);
    const bad = [...pack.problems, ...saved.failed];
    if (bad.length) state.pushLines([termLine("err", `در بسته ذخیره نشد: ${bad.join("، ")}`)]);
  }, []);

  const bringIn = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const { opened, assets, packs } = await readOpened(files);
    const state = useLab.getState();
    for (const pack of packs) await openPack(pack);
    if (opened.length) {
      state.importFiles(opened);
      state.pushLines([termLine("sys", `${opened.length} فایل باز شد: ${opened.map((item) => item.name).join("، ")}`)]);
    }
    if (assets.length) await attach(assets);
  }, [attach, openPack]);
  const scroller = useRef<HTMLDivElement>(null);
  const wantsInput = file.lang === "mix" || file.lang === "farsi" || file.lang === "english" || file.lang === "binary" || file.lang === "python" || file.lang === "c" || file.lang === "cpp";

  useEffect(() => {
    void Promise.resolve(useLab.persist.rehydrate()).then(() => setReady(true));
    void loadAssets();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setLiveCss(cssFile?.content ?? ""), 80);
    return () => window.clearTimeout(timer);
  }, [cssFile?.content]);

  useEffect(() => {
    if (!ready) return;
    if (new URLSearchParams(window.location.search).has("shared")) {
      window.history.replaceState(null, "", window.location.pathname);
      void takeSharedFiles().then(bringIn).catch(() => {});
    }
    listenLaunchFiles((files) => void bringIn(files));
  }, [ready, bringIn]);

  useEffect(() => {
    if (file.lang !== "html") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void assetUrlsFor(project.id, htmlSourceText(file, project.files)).then((urls) => {
        if (cancelled) return;
        const fresh = Math.random().toString(36).slice(2);
        htmlToken.current = fresh;
        setHtmlDoc(buildHtmlDoc(file.content, project.files, fresh, urls));
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.lang, file.content, project.id, project.files, reload, assetItems]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { jib?: string; k?: string; t?: unknown } | null;
      if (!data || typeof data !== "object" || !htmlToken.current || data.jib !== htmlToken.current || typeof data.t !== "string") return;
      if (event.source !== frameRef.current?.contentWindow) return;
      useLab.getState().pushLines([termLine(data.k === "error" || data.k === "warn" ? "err" : "out", data.t.slice(0, 2000))]);
    };
    // پل jibos برای پیش‌نمایش نوا: فقط پیام همین قاب و با همین رمز؛ فقط حافظه، پیام کوتاه و پرسش از Gemini
    const onJibos = (event: MessageEvent) => {
      const d = event.data as { jibos?: string; id?: number; cmd?: string; args?: unknown } | null;
      const win = frameRef.current?.contentWindow;
      if (!d || typeof d !== "object" || !navaNonce.current || d.jibos !== navaNonce.current || !win || event.source !== win || typeof d.cmd !== "string") return;
      const reply = (ok: boolean, value?: unknown, error?: string) => win.postMessage({ jibosReply: navaNonce.current, id: d.id, ok, value, error }, "*");
      const state = useLab.getState();
      const storeName = `editor:${activeProject(state).name}`;
      const list = Array.isArray(d.args) ? d.args : [];
      (async () => {
        switch (d.cmd) {
          case "storage.get": return readAppStore(storeName)[String(d.args)] ?? null;
          case "storage.set": { const store = readAppStore(storeName); store[String(list[0])] = list[1]; writeAppStore(storeName, store); return true; }
          case "storage.remove": { const store = readAppStore(storeName); delete store[String(d.args)]; writeAppStore(storeName, store); return true; }
          case "storage.keys": return Object.keys(readAppStore(storeName));
          case "toast": state.pushLines([termLine("sys", `پیام برنامه: ${String(d.args).slice(0, 200)}`)]); return true;
          case "ai": {
            state.pushLines([termLine("sys", "برنامه از Gemini سؤال کرد…")]);
            return appAsk(activeProject(state).name, String(d.args ?? ""));
          }
          default: throw new Error(`فرمان «${d.cmd}» در پیش‌نمایش ویرایشگر در دسترس نیست؛ برنامه را در لانچر نصب کن.`);
        }
      })().then(
        (value) => reply(true, value),
        (err) => reply(false, undefined, err instanceof Error ? err.message : String(err)),
      );
    };
    window.addEventListener("message", onJibos);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("message", onJibos);
    };
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
    const projectId = state.activeProjectId;
    state.setRunning(true);
    state.setPanel(current.lang === "nava" || current.lang === "css" || current.lang === "html" || current.lang === "binary" ? "stage" : "out");
    const intro = [termLine("cmd", current.name)];
    if (current.lang === "farsi") intro.push(termLine("sys", "در حال خواندن جیب فارسی…"));
    if (current.lang === "english") intro.push(termLine("sys", "در حال اجرای جیب…"));
    if (current.lang === "binary") intro.push(termLine("sys", "ماشین: هر دستور ۸ بیت است."));
    if (current.lang === "python" && !isPythonWarm()) {
      intro.push(termLine("sys", "پایتون در حال راه‌اندازی است. اجرای اول چند ثانیه طول می‌کشد."));
    }
    if (current.lang === "javascript" && /\b(document|window)\b/.test(current.content)) {
      intro.push(termLine("sys", "این اجرا کنسول است نه صفحه. برای صفحه از فایل html یا page { } در جیب استفاده کن."));
    }
    state.pushLines(intro);
    if (current.lang === "nava") {
      const compiled = compileNava(current.content);
      if (!compiled.web) {
        setMixPage(null);
        state.pushLines([termLine("err", compiled.error ?? "برنامهٔ نوا ساخته نشد.")]);
        state.setPanel("out");
        state.setRunning(false);
        return;
      }
      const web = withAssets(compiled.web, await assetUrlsFor(projectId, webText(compiled.web)));
      if (token.current !== mine) return;
      const fresh = Math.random().toString(36).slice(2);
      htmlToken.current = fresh;
      const nonce = crypto.getRandomValues(new Uint32Array(4)).join("-");
      navaNonce.current = nonce;
      setMixPage({ fileId: current.id, doc: injectHead(buildWebDoc(web, fresh), jibosClient(nonce, activeProject(state).name)), web });
      state.pushLines([termLine("sys", "برنامهٔ نوا ساخته شد؛ نتیجه در «صفحه» است.")]);
      state.setPanel("stage");
      state.setRunning(false);
      return;
    }
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
        python: (code, stdin) => runPython(code, stdin, projectId),
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
      if (result.web) {
        // نام پیوست‌هایی که در html/css/js یا shared آمده با خود فایل عوض می‌شود
        const web = withAssets(result.web, await assetUrlsFor(projectId, webText(result.web)));
        if (token.current !== mine) return;
        const fresh = Math.random().toString(36).slice(2);
        htmlToken.current = fresh;
        setMixPage({ fileId: current.id, doc: buildWebDoc(web, fresh), web });
      } else setMixPage(null);
      if (result.page) {
        setScene({ ...result.page, title: result.page.title || "جیب", text: result.page.text || "", mark: result.page.mark || "JIB", lines: [] });
      }
      useLab.getState().pushLines(next);
      useLab.getState().setPanel(result.web || result.page || result.machine ? "stage" : "out");
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
        ? await runPython(current.content, current.stdin, projectId)
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
    setPanel(lang === "nava" || lang === "css" || lang === "html" || lang === "binary" ? "stage" : "out");
  }

  // ذخیرهٔ صفحه به‌صورت یک فایل HTML مستقل (بدون پل کنسول)
  async function exportWeb() {
    const doc =
      file.lang === "html"
        ? buildHtmlDoc(file.content, project.files, null, await assetUrlsFor(project.id, htmlSourceText(file, project.files)))
        : (file.lang === "mix" || file.lang === "nava") && mixPage?.fileId === file.id
          ? buildWebDoc(mixPage.web, null)
          : "";
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
                      {PACK_SAMPLES.map((sample) => (
                        <button
                          key={`pack-${sample.id}`}
                          type="button"
                          className="flex min-h-11 flex-col items-start justify-center rounded-lab bg-ink px-3 py-2 text-start"
                          onClick={() => {
                            setComposer(null);
                            setMenu(false);
                            const pack = parsePack(sample.text);
                            if (pack) void openPack(pack);
                          }}
                        >
                          <span className="text-sm">{sample.title}</span>
                          <span className="text-xs text-mist">{sample.detail}</span>
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
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold text-mist">عکس‌ها و فایل‌های پیوست</h2>
                  <p className="text-xs leading-relaxed text-pretty text-mist">
                    هر عکس یا فایلی (بدون محدودیت اندازه). با نامش در صفحه یا پایتون استفاده می‌شود: «photo.png» در html، open("data.csv") در پایتون. روی یک پیوست بزنی نامش در کد گذاشته می‌شود.
                  </p>
                  {projectAssets.map((item) => (
                    <AssetRow
                      key={`${item.projectId}/${item.name}`}
                      item={item}
                      onInsert={() => {
                        setMenu(false);
                        window.setTimeout(() => insertAtCursor(item.name), 0);
                      }}
                      onDelete={() => void removeAsset(item.projectId, item.name)}
                    />
                  ))}
                  <input
                    ref={assetPickRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const list = [...(event.target.files ?? [])];
                      event.target.value = "";
                      void attach(list);
                    }}
                  />
                  <button
                    type="button"
                    className="flex h-11 items-center justify-center gap-2 rounded-lab border border-line px-3 text-sm"
                    onClick={() => assetPickRef.current?.click()}
                  >
                    <Paperclip className="size-4" />
                    افزودن عکس یا فایل
                  </button>
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
        <LauncherButton />
        <input
          ref={pickRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const list = [...(event.target.files ?? [])];
            event.target.value = "";
            void bringIn(list);
          }}
        />
        <button type="button" className={iconBtn} aria-label="باز کردن فایل" onClick={() => pickRef.current?.click()}>
          <FolderOpen className="size-5" />
        </button>
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
            {file.lang === "html" || ((file.lang === "mix" || file.lang === "nava") && mixPage?.fileId === file.id) ? (
              <button type="button" className="grid size-10 place-items-center text-mist" aria-label="ذخیره به‌صورت صفحهٔ مستقل (HTML)" onClick={() => void exportWeb()}>
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
            ) : showFrame ? (
              <iframe
                ref={frameRef}
                title="پیش‌نمایش صفحه"
                sandbox="allow-scripts allow-modals allow-forms"
                className="min-h-0 w-full flex-1 border-0 bg-white"
                srcDoc={file.lang === "html" ? htmlDoc : mixPage?.doc}
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
                if (/^termux(?:\s|$)/i.test(text)) {
                  const command = text.replace(/^termux\s*/i, "").trim();
                  pushLines([termLine("cmd", `$ ${text}`)]);
                  if (!command) {
                    pushLines([termLine("sys", "کاربرد: termux <command> — دستور در نشست جداگانهٔ Termux باز می‌شود.")]);
                    return;
                  }
                  if (/\bnmap\b/i.test(command) && !isNmapInstall(command) && !isAllowedLocalNmap(command)) {
                    pushLines([termLine("err", "در این اتصال، nmap فقط با الگوی nmap -sn و برای IP خصوصیِ شبکهٔ محلی مجاز است؛ شبکهٔ CIDR باید /24 یا کوچک‌تر باشد.")]);
                    return;
                  }
                  if (!window.confirm("این دستور در Termux و با دسترسی همان برنامه اجرا می‌شود و نتیجه به کنسول برمی‌گردد. برای این کار Termux باید نصب باشد، مجوز RUN_COMMAND را بدهی و allow-external-apps=true را در تنظیماتش آگاهانه فعال کنی. فقط دستور بررسی‌شده را اجرا کن. ادامه می‌دهی؟")) {
                    pushLines([termLine("sys", "اجرا لغو شد.")]);
                    return;
                  }
                  void runTermuxCommand(command)
                    .then((result) => pushLines([
                      ...(result.stdout ? result.stdout.replace(/\s+$/, "").split("\n").map((line) => termLine("out", line)) : []),
                      ...(result.stderr ? result.stderr.replace(/\s+$/, "").split("\n").map((line) => termLine("err", line)) : []),
                      termLine("sys", `${result.message} کد خروج: ${result.exitCode ?? "نامشخص"}`),
                    ]))
                    .catch((error) => pushLines([termLine("err", error instanceof Error ? error.message : String(error))]));
                  return;
                }
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
        {file.lang === "nava" ? (
          <button type="button" className="h-10 shrink-0 rounded-lab border border-lime/30 bg-lime/10 px-3 text-sm text-lime" title="خط‌ها با | فشرده می‌شوند؛ متن و توضیحات حفظ می‌شوند" onClick={() => updateContent(packNavaSource(file.content))}>
            Pack |
          </button>
        ) : null}
        {[...(file.lang === "nava" ? NAVA_BAR : file.lang === "mix" ? MIX_BAR : file.lang === "farsi" ? FARSI_BAR : file.lang === "english" ? ENGLISH_BAR : file.lang === "binary" ? BINARY_BAR : []), ...KEYS].map((key) => (
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
