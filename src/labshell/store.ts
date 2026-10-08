import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { removeProjectAssets } from "@/labshell/assets";
import { freshName } from "@/labshell/open-files";
import { createFile, createProject, SEED_PROJECT, uid } from "@/labshell/samples";
import type { LabFile, Lang, Project, TemplateKind, TermLine } from "@/labshell/types";

const WELCOME: TermLine[] = [
  { id: "w1", stream: "sys", text: "نوا: زبان سادهٔ فارسی برای ساخت برنامه‌های تعاملی، بدون نوشتن HTML یا JavaScript." },
  { id: "w2", stream: "sys", text: "کد نمونه را اجرا کن؛ برای ساخت برنامه از عنوان، متن، متغیر، ورودی و دکمه استفاده کن." },
  { id: "w3", stream: "sys", text: "برای یادگیری دستورهای نوا، نمونهٔ شروع.nava را ببین یا فایل راهنمای NAVA-GUIDE.md را باز کن." },
  { id: "w4", stream: "sys", text: "جیب‌کد: چند زبان در یک برنامه. فایل ترکیبی را باز کن و اجرا بزن." },
  { id: "w5", stream: "sys", text: "با «@@ پایتون» و «@@ جاوااسکریپت» هر بلوک را به زبان خودش بنویس." },
  { id: "w6", stream: "sys", text: "پایتون و جاوااسکریپت با متغیر مشترک shared به هم داده می‌دهند." },
];

type Panel = "out" | "stage";

type LabState = {
  projects: Project[];
  activeProjectId: string;
  panel: Panel;
  lines: TermLine[];
  running: boolean;
  setPanel: (panel: Panel) => void;
  setRunning: (running: boolean) => void;
  pushLines: (lines: TermLine[]) => void;
  clearLines: () => void;
  setActiveProject: (id: string) => void;
  setActiveFile: (id: string) => void;
  updateContent: (content: string) => void;
  updateStdin: (stdin: string) => void;
  addFile: (lang: Lang) => void;
  importFiles: (items: { name: string; lang: Lang; content: string }[]) => void;
  importProject: (name: string, items: { name: string; lang: Lang; content: string }[]) => string;
  removeFile: (id: string) => void;
  addProject: (kind: TemplateKind) => void;
  removeProject: (id: string) => void;
};

function isFile(value: unknown): value is LabFile {
  if (!value || typeof value !== "object") return false;
  const file = value as LabFile;
  return (
    typeof file.id === "string" &&
    typeof file.name === "string" &&
    typeof file.content === "string" &&
    typeof file.stdin === "string" &&
    (file.lang === "nava" ||
      file.lang === "mix" ||
      file.lang === "farsi" ||
      file.lang === "english" ||
      file.lang === "binary" ||
      file.lang === "python" ||
      file.lang === "javascript" ||
      file.lang === "c" ||
      file.lang === "cpp" ||
      file.lang === "css" ||
      file.lang === "html")
  );
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Project;
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.activeFileId === "string" &&
    Array.isArray(project.files) &&
    project.files.length > 0 &&
    project.files.every(isFile) &&
    project.files.some((file) => file.id === project.activeFileId)
  );
}

function patchProject(projects: Project[], projectId: string, map: (project: Project) => Project): Project[] {
  return projects.map((project) => (project.id === projectId ? map(project) : project));
}

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useLab = create<LabState>()(
  persist(
    (set) => ({
      projects: [SEED_PROJECT],
      activeProjectId: SEED_PROJECT.id,
      panel: "out",
      lines: WELCOME,
      running: false,
      setPanel: (panel) => set({ panel }),
      setRunning: (running) => set({ running }),
      pushLines: (lines) => set((state) => ({ lines: [...state.lines, ...lines].slice(-300) })),
      clearLines: () => set({ lines: [] }),
      setActiveProject: (id) => set({ activeProjectId: id }),
      setActiveFile: (id) =>
        set((state) => ({
          projects: patchProject(state.projects, state.activeProjectId, (project) => ({
            ...project,
            activeFileId: project.files.some((file) => file.id === id) ? id : project.activeFileId,
          })),
        })),
      updateContent: (content) =>
        set((state) => ({
          projects: patchProject(state.projects, state.activeProjectId, (project) => ({
            ...project,
            files: project.files.map((file) =>
              file.id === project.activeFileId ? { ...file, content } : file,
            ),
          })),
        })),
      updateStdin: (stdin) =>
        set((state) => ({
          projects: patchProject(state.projects, state.activeProjectId, (project) => ({
            ...project,
            files: project.files.map((file) =>
              file.id === project.activeFileId ? { ...file, stdin } : file,
            ),
          })),
        })),
      addFile: (lang) =>
        set((state) => ({
          projects: patchProject(state.projects, state.activeProjectId, (project) => {
            const file = createFile(
              lang,
              project.files.map((item) => item.name),
            );
            return { ...project, files: [...project.files, file], activeFileId: file.id };
          }),
          panel: lang === "nava" || lang === "css" || lang === "html" || lang === "binary" ? "stage" : "out",
        })),
      importFiles: (items) =>
        set((state) => {
          if (!items.length) return state;
          let lastLang: Lang = items[items.length - 1].lang;
          return {
            projects: patchProject(state.projects, state.activeProjectId, (project) => {
              const names = project.files.map((item) => item.name);
              const added = items.map((item) => {
                const name = freshName(item.name, names);
                names.push(name);
                lastLang = item.lang;
                return { id: uid("file"), name, lang: item.lang, content: item.content, stdin: "" };
              });
              return { ...project, files: [...project.files, ...added], activeFileId: added[added.length - 1].id };
            }),
            panel: lastLang === "nava" || lastLang === "css" || lastLang === "html" || lastLang === "binary" ? "stage" : "out",
          };
        }),
      // پروژهٔ تازه از یک بسته (.jibpack): فایل اول فعال می‌شود. شناسهٔ پروژه برگردانده می‌شود تا پیوست‌ها به آن اضافه شوند
      importProject: (name, items) => {
        const project: Project = {
          id: uid("proj"),
          name: "",
          files: items.map((item) => ({ id: uid("file"), name: item.name, lang: item.lang, content: item.content, stdin: "" })),
          activeFileId: "",
        };
        project.activeFileId = project.files[0]?.id ?? "";
        set((state) => {
          project.name = freshName(name, state.projects.map((item) => item.name));
          const first = project.files[0]?.lang;
          return {
            projects: [...state.projects, project],
            activeProjectId: project.id,
            panel: first === "nava" || first === "css" || first === "html" || first === "binary" ? "stage" : "out",
          };
        });
        return project.id;
      },
      removeFile: (id) =>
        set((state) => ({
          projects: patchProject(state.projects, state.activeProjectId, (project) => {
            if (project.files.length <= 1) return project;
            const files = project.files.filter((file) => file.id !== id);
            const activeFileId = project.activeFileId === id ? (files[0]?.id ?? "") : project.activeFileId;
            return { ...project, files, activeFileId };
          }),
        })),
      addProject: (kind) =>
        set((state) => {
          const project = createProject(
            kind,
            state.projects.map((item) => item.name),
          );
          return {
            projects: [...state.projects, project],
            activeProjectId: project.id,
            panel: project.files[0]?.lang === "nava" || project.files[0]?.lang === "css" || project.files[0]?.lang === "html" || project.files[0]?.lang === "binary" ? "stage" : "out",
          };
        }),
      removeProject: (id) =>
        set((state) => {
          if (state.projects.length <= 1) return state;
          const projects = state.projects.filter((project) => project.id !== id);
          void removeProjectAssets(id); // پیوست‌های پروژهٔ حذف‌شده هم پاک می‌شوند
          const activeProjectId = state.activeProjectId === id ? (projects[0]?.id ?? "") : state.activeProjectId;
          return { projects, activeProjectId };
        }),
    }),
    {
      name: "jibcode-en",
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => (typeof window === "undefined" ? memoryStorage : localStorage)),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<Pick<LabState, "projects" | "activeProjectId">> | undefined;
        if (!saved?.projects || !saved.projects.every(isProject)) return current;
        const activeProjectId = saved.projects.some((project) => project.id === saved.activeProjectId)
          ? (saved.activeProjectId ?? current.activeProjectId)
          : (saved.projects[0]?.id ?? current.activeProjectId);
        return { ...current, projects: saved.projects, activeProjectId };
      },
    },
  ),
);

export function activeProject(state: Pick<LabState, "projects" | "activeProjectId">): Project {
  return state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0] ?? SEED_PROJECT;
}

export function activeFile(project: Project): LabFile {
  return project.files.find((file) => file.id === project.activeFileId) ?? project.files[0]!;
}

export function termLine(stream: TermLine["stream"], text: string): TermLine {
  return { id: uid("line"), stream, text };
}
