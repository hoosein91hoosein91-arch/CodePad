export type Lang = "nava" | "mix" | "farsi" | "english" | "binary" | "python" | "javascript" | "c" | "cpp" | "css" | "html";

export type LabFile = {
  id: string;
  name: string;
  lang: Lang;
  content: string;
  stdin: string;
};

export type Project = {
  id: string;
  name: string;
  files: LabFile[];
  activeFileId: string;
};

export type TermStream = "cmd" | "sys" | "out" | "err";

export type TermLine = {
  id: string;
  stream: TermStream;
  text: string;
};

export type TemplateKind = "mix" | Lang;

export const LANG_ORDER: Lang[] = ["nava", "mix", "farsi", "english", "binary", "python", "javascript", "c", "cpp", "css", "html"];

export const LANG_META: Record<Lang, { label: string; ext: string; short: string }> = {
  nava: { label: "نوا", ext: "nava", short: "NAVA" },
  mix: { label: "ترکیبی", ext: "mix", short: "MIX" },
  farsi: { label: "جیب فارسی", ext: "fa", short: "FA" },
  english: { label: "جیب", ext: "jib", short: "JIB" },
  binary: { label: "ماشین ۰ و ۱", ext: "bit", short: "01" },
  python: { label: "پایتون", ext: "py", short: "PY" },
  javascript: { label: "جاوااسکریپت", ext: "js", short: "JS" },
  c: { label: "سی", ext: "c", short: "C" },
  cpp: { label: "سی‌پلاس‌پلاس", ext: "cpp", short: "C++" },
  css: { label: "سی‌اس‌اس", ext: "css", short: "CSS" },
  html: { label: "اچ‌تی‌ام‌ال", ext: "html", short: "HTML" },
};
