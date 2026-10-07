// پوستهٔ ترموکس‌مانند: دستورهای ساده روی فایل‌های پروژهٔ فعال. محیط مجازی = یک فضای کار جدا به نام .venv-نام
import { createFile, createProject } from "@/labshell/samples";
import { activeFile, activeProject, useLab } from "@/labshell/store";
import type { Lang, Project } from "@/labshell/types";

const EXT: Record<string, Lang> = { mix: "mix", fa: "farsi", jib: "english", bit: "binary", py: "python", js: "javascript", c: "c", cpp: "cpp", css: "css" };

const HELP = [
  "help                 این راهنما",
  "ls / pwd             فهرست فایل‌ها / مسیر",
  "cat f / touch f / rm f   خواندن / ساختن / حذف فایل (پسوند: mix fa jib bit py js c cpp css)",
  "run [f]  (python f، node f)   اجرای فایل",
  "venv create|ls|activate|deactivate <name>   محیط مجازی جدا",
  "pkg list             زبان‌ها و موتورهای موجود",
  "echo / date / uname / clear",
];

export function runShell(input: string, run: () => void): string[] {
  const [cmd = "", ...args] = input.trim().split(/\s+/);
  const st = useLab.getState();
  const project = activeProject(st);
  const find = (name?: string) => project.files.find((f) => f.name === name);
  const patch = (fn: (p: Project) => Project) =>
    useLab.setState((s) => ({ projects: s.projects.map((p) => (p.id === s.activeProjectId ? fn(p) : p)) }));
  const venvs = () => st.projects.filter((p) => p.name.startsWith(".venv-"));

  switch (cmd) {
    case "":
      return [];
    case "help":
      return HELP;
    case "pwd":
      return [`~/${project.name}`];
    case "ls":
      return project.files.map((f) => f.name);
    case "cat": {
      const f = find(args[0]);
      return f ? f.content.split("\n") : [`cat: ${args[0] ?? ""}: No such file`];
    }
    case "touch": {
      const name = args[0];
      if (!name) return ["touch: file name missing"];
      if (find(name)) return [];
      const lang = EXT[name.split(".").pop() ?? ""];
      if (!lang) return ["touch: unknown extension. Use: " + Object.keys(EXT).join(" ")];
      patch((p) => ({ ...p, files: [...p.files, { ...createFile(lang, []), name, content: "" }] }));
      return [];
    }
    case "rm": {
      const f = find(args[0]);
      if (!f) return [`rm: ${args[0] ?? ""}: No such file`];
      if (project.files.length < 2) return ["rm: a project must keep at least one file"];
      st.removeFile(f.id);
      return [];
    }
    case "run":
    case "python":
    case "node": {
      const f = args[0] ? find(args[0]) : activeFile(project);
      if (!f) return [`${cmd}: ${args[0]}: No such file`];
      st.setActiveFile(f.id);
      window.setTimeout(run, 0);
      return [];
    }
    case "venv": {
      const [sub, name] = args;
      if (sub === "ls") return venvs().map((p) => p.name).concat(venvs().length ? [] : ["(no venv yet: venv create <name>)"]);
      if (sub === "create" && name) {
        if (st.projects.some((p) => p.name === `.venv-${name}`)) return ["venv: already exists"];
        const p = { ...createProject("python", st.projects.map((x) => x.name)), name: `.venv-${name}` };
        useLab.setState((s) => ({ projects: [...s.projects, p], activeProjectId: p.id }));
        return [`created .venv-${name} (isolated workspace, listed in Projects)`];
      }
      if (sub === "activate" && name) {
        const p = st.projects.find((x) => x.name === `.venv-${name}`);
        if (!p) return [`venv: ${name}: not found`];
        st.setActiveProject(p.id);
        return [`(${name}) active`];
      }
      if (sub === "deactivate") {
        const p = st.projects.find((x) => !x.name.startsWith(".venv-"));
        if (p) st.setActiveProject(p.id);
        return ["deactivated"];
      }
      return ["usage: venv create|ls|activate|deactivate <name>"];
    }
    case "pkg":
      return ["python (Pyodide)", "javascript", "c, c++ (JSCPP interpreter)", "css", "jib, jib-fa, 0/1 machine", "mix (auto language detection)"];
    case "echo":
      return [args.join(" ")];
    case "date":
      return [new Date().toString()];
    case "uname":
      return ["JibCode 3 (browser)"];
    case "clear":
      st.clearLines();
      return [];
    default:
      return [`${cmd}: command not found. Type help.`];
  }
}
