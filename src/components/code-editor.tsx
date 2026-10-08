import { acceptCompletion, autocompletion, closeBrackets, snippetCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  LanguageSupport,
  StreamLanguage,
  bidiIsolates,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, drawSelection, EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { FARSI_KEYWORDS } from "@/labshell/farsi";
import { NAVA_FUNCTIONS, NAVA_KEYWORDS } from "@/labshell/nava";
import { NAVA_SHORT_WORDS } from "@/labshell/nava-short";
import { ENGLISH_KEYWORDS } from "@/labshell/english";
import type { Lang } from "@/labshell/types";
import { detectKind, kindOf } from "@/labshell/mix";
import { useTheme } from "@/labshell/theme";
import { clearActiveView, hotkeys, setActiveView } from "@/components/editor-commands";

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-lime)" },
  { tag: tags.comment, color: "var(--color-mist)", fontStyle: "italic" },
  { tag: tags.string, color: "var(--color-coral)" },
  { tag: tags.number, color: "var(--color-lime)" },
  { tag: tags.bool, color: "var(--color-lime)" },
  { tag: tags.operator, color: "var(--color-paper)" },
  { tag: tags.bracket, color: "var(--color-mist)" },
  { tag: tags.function(tags.variableName), color: "var(--color-paper)" },
  { tag: tags.definition(tags.variableName), color: "var(--color-paper)" },
  { tag: tags.variableName, color: "var(--color-paper)" },
]);

const farsiWords = new Set<string>(FARSI_KEYWORDS);

const farsiLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/'(?:[^'\\]|\\.)*'/)) return "string";
    if (stream.match(/[0-9۰-۹]+(?:\.[0-9۰-۹]+)?/)) return "number";
    if (stream.match(/[\u0600-\u06FF\u200cA-Za-z_][\u0600-\u06FF\u200cA-Za-z0-9_۰-۹]*/)) {
      return farsiWords.has(stream.current()) ? "keyword" : "variableName";
    }
    stream.next();
    return "operator";
  },
  tokenTable: {
    comment: tags.comment,
    string: tags.string,
    number: tags.number,
    keyword: tags.keyword,
    variableName: tags.variableName,
    operator: tags.operator,
  },
});

function themeFor(rtl: boolean) {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--color-ink)",
      color: "var(--color-paper)",
      direction: rtl ? "rtl" : "ltr",
      textAlign: rtl ? "right" : "left",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: rtl ? 'Vazirmatn, "JetBrains Mono", ui-monospace, monospace' : "var(--font-mono)",
      fontSize: "var(--editor-font-size, 16px)",
      lineHeight: rtl ? "1.65" : "1.5",
    },
    ".cm-content": { padding: "0.75rem 0" },
    ".cm-gutters": {
      backgroundColor: "var(--color-ink)",
      color: "var(--color-mist)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--color-panel) 80%, transparent)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-lime)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-lime)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--color-lime) 28%, transparent)",
    },
  });
}

const englishWords = new Set<string>(ENGLISH_KEYWORDS);

const englishLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/'(?:[^'\\]|\\.)*'/)) return "string";
    if (stream.match(/[0-9]+(?:\.[0-9]+)?/)) return "number";
    if (stream.match(/[A-Za-z_]+/)) return englishWords.has(stream.current()) ? "keyword" : "variableName";
    stream.next();
    return "operator";
  },
  tokenTable: {
    comment: tags.comment,
    string: tags.string,
    number: tags.number,
    keyword: tags.keyword,
    variableName: tags.variableName,
    operator: tags.operator,
  },
});

const binaryLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/[01]+/)) return "number";
    stream.next();
    return "operator";
  },
  tokenTable: {
    comment: tags.comment,
    number: tags.number,
    operator: tags.operator,
  },
});

const mixLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.match(/^\s*@@.*$/)) return "keyword";
    if (stream.match(/^\s*#.*$/)) return "comment";
    stream.next();
    return null;
  },
});

const navaWords = new Set<string>([...NAVA_KEYWORDS, ...NAVA_SHORT_WORDS.map((word) => word.short), "جهان", "بلوکی", "بذر"]);
const navaFns = new Set(NAVA_FUNCTIONS);
const navaLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.sol() && stream.match(/^(#|\/\/)/)) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^«[^»]*»?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) return "string";
    // کپسول ظاهر دکمه: (ru240rn64yGi65G72)
    if (stream.match(/^\(ru[0-9۰-۹]+rn[0-9۰-۹]+y[A-Z][a-z]?[0-9۰-۹]{2}[A-Z][a-z]?[0-9۰-۹]{2}\)/)) return "number";
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) return "number";
    if (stream.match(/^[0-9۰-۹٠-٩]+(?:[.٫][0-9۰-۹٠-٩]+)?/)) return "number";
    if (stream.match(/^[\p{L}_][\p{L}\p{N}_\u200c]*/u)) {
      const word = stream.current();
      return navaWords.has(word) ? "keyword" : navaFns.has(word) ? "function" : "variableName";
    }
    stream.next();
    return "operator";
  },
  tokenTable: { comment: tags.comment, string: tags.string, number: tags.number, keyword: tags.keyword, function: tags.function(tags.variableName), variableName: tags.variableName, operator: tags.operator },
});

function languageOf(lang: Lang) {
  if (lang === "nava") return new LanguageSupport(navaLanguage);
  if (lang === "mix") return new LanguageSupport(mixLanguage);
  if (lang === "farsi") return new LanguageSupport(farsiLanguage);
  if (lang === "english") return new LanguageSupport(englishLanguage);
  if (lang === "binary") return new LanguageSupport(binaryLanguage);
  if (lang === "python") return python();
  if (lang === "javascript") return javascript();
  if (lang === "css") return css();
  if (lang === "html") return html();
  return cpp();
}

const split = (s: string) => s.split(" ");
const WORDS: Record<string, string[]> = {
  python: split("def class return if elif else for while in import from as try except finally with lambda yield pass break continue print len range input int str float list dict set tuple open enumerate zip map sorted True False None and or not is"),
  javascript: split("const let var function return if else for while of in switch case break continue class new this async await try catch throw import export console.log document.getElementById addEventListener JSON.stringify JSON.parse Math.floor setTimeout true false null undefined"),
  c: split("int float double char void long unsigned struct return if else for while do switch case break continue include define printf scanf main sizeof const static"),
  cpp: split("int float double char void long bool struct return if else for while do switch case break continue include cout cin endl std string vector using namespace class public private const static auto"),
  css: split("color background background-color font-size font-family margin padding border border-radius display flex grid align-items justify-content width height position top left right bottom opacity transform transition animation box-shadow text-align gap"),
  html: split("div span p a img ul ol li h1 h2 h3 button input form label section header footer main nav script style link meta title body head html class id href src type onclick"),
  farsi: [...FARSI_KEYWORDS],
  nava: [...NAVA_KEYWORDS, ...NAVA_FUNCTIONS],
  english: [...ENGLISH_KEYWORDS],
};
const SNIPPETS: Record<string, Completion[]> = {
  english: [
    snippetCompletion("fn ${name}(${args}) {\n  ${}\n}", { label: "fn", detail: "function", boost: 3 }),
    snippetCompletion("if ${cond} {\n  ${}\n}", { label: "if", detail: "branch", boost: 3 }),
    snippetCompletion("for ${i} from ${1} to ${10} {\n  ${}\n}", { label: "for", detail: "loop", boost: 3 }),
  ],
  farsi: [
    snippetCompletion("تابع ${نام}(${ورودی}) {\n  ${}\n}", { label: "تابع", detail: "تابع", boost: 3 }),
    snippetCompletion("اگر ${شرط} {\n  ${}\n}", { label: "اگر", detail: "شرط", boost: 3 }),
    snippetCompletion("برای ${i} از ${1} تا ${10} {\n  ${}\n}", { label: "برای", detail: "حلقه", boost: 3 }),
  ],
  nava: [
    snippetCompletion("اگر ${شرط}\n  ${}\nپایان", { label: "اگر", detail: "شرط", boost: 3 }),
    snippetCompletion("تکرار ${۳}\n  ${}\nپایان", { label: "تکرار", detail: "حلقه", boost: 3 }),
    snippetCompletion("برای هر ${x} در ${لیست}\n  ${}\nپایان", { label: "برای هر", detail: "حلقه روی لیست", boost: 3 }),
    snippetCompletion("کنش ${نام}\n  ${}\nپایان", { label: "کنش", detail: "کار چندمرحله‌ای", boost: 3 }),
    snippetCompletion("هر ${۱} ثانیه\n  ${}\nپایان", { label: "هر ثانیه", detail: "زمان‌سنج", boost: 3 }),
    snippetCompletion("دکمه \"${متن}\"\n  ${}\nپایان", { label: "دکمه", detail: "دکمه با چند کار", boost: 3 }),
    // مخفف‌های نوا ۰٫۴ (pg، bt، cal، …) — هر کدام همان دستور کامل است
    ...NAVA_SHORT_WORDS.filter((word) => !["bt", "pg", "num", "df", "cal", "vx", "tm"].includes(word.short)).map((word) => ({ label: word.short, detail: `${word.long} · ${word.meaning}`, type: "keyword", boost: 1 })),
    snippetCompletion('bt "${شروع}" (ru${240}rn${64}yGi65G72): sy "${آفرین}"', { label: "bt", detail: "دکمه: اندازه، رنگ و کار در یک خط", boost: 2 }),
    snippetCompletion('pg "${برنامهٔ من}"', { label: "pg", detail: "صفحه (نام + عنوان)", boost: 2 }),
    snippetCompletion("num ${امتیاز} = ${0}", { label: "num", detail: "متغیر عددی", boost: 2 }),
    snippetCompletion('df "${ابزار من}"\n${cal}\nend\nus "${ابزار من}"', { label: "df", detail: "تعریف بسته و استفاده", boost: 2 }),
    snippetCompletion("cal mb", { label: "cal", detail: "ماشین‌حساب آماده", boost: 2 }),
    snippetCompletion("vx sz ${24} sd ${7}", { label: "vx", detail: "دنیای بلوکی سه‌بعدی", boost: 2 }),
    snippetCompletion("tm ${60}", { label: "tm", detail: "تایمر ثانیه‌ای", boost: 2 }),
  ],
  python: [snippetCompletion("def ${name}(${args}):\n    ${}", { label: "def", detail: "function", boost: 3 }), snippetCompletion("for ${i} in range(${10}):\n    ${}", { label: "for", detail: "loop", boost: 3 })],
  javascript: [snippetCompletion("function ${name}(${args}) {\n  ${}\n}", { label: "function", detail: "function", boost: 3 })],
};
const KIND_LANG = { python: "python", javascript: "javascript", jib: "english", farsi: "farsi", c: "c", cpp: "cpp", binary: "binary", css: "css", html: "html" } as const;

function mixKindAt(text: string): Lang {
  const m = [...text.matchAll(/^\s*@@\s*([^:\n]*)/gm)].pop();
  const kind = (m ? kindOf(m[1]) : null) ?? detectKind(m ? text.slice((m.index ?? 0) + m[0].length) : text);
  return KIND_LANG[kind];
}

// پیشنهاد کد: کلیدواژه‌های زبان فعلی + قالب‌ها + واژه‌هایی که خودت در فایل نوشته‌ای
function completer(lang: Lang) {
  return (ctx: CompletionContext) => {
    const kind = lang === "mix" ? mixKindAt(ctx.state.doc.sliceString(0, ctx.pos)) : lang;
    const re = kind === "css" ? /[\w-]+/ : /[\w\u0600-\u06FF\u200c]+/;
    const w = ctx.matchBefore(re);
    if (!w && !ctx.explicit) return null;
    const word = w?.text ?? "";
    const seen = new Set<string>();
    const options: Completion[] = [];
    const add = (c: Completion) => {
      if (c.label !== word && !seen.has(c.label)) {
        seen.add(c.label);
        options.push(c);
      }
    };
    (SNIPPETS[kind] ?? []).forEach(add);
    (WORDS[kind] ?? []).forEach((label) => add({ label, type: "keyword", boost: 2 }));
    (ctx.state.doc.toString().match(/[\w\u0600-\u06FF\u200c]{3,}/g) ?? []).forEach((label) => add({ label, type: "variable" }));
    return { from: w ? w.from : ctx.pos, options, validFor: re };
  };
}

export function CodeEditor({
  fileId,
  lang,
  content,
  onChange,
}: {
  fileId: string;
  lang: Lang;
  content: string;
  onChange: (content: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const ac = useTheme((state) => state.autocomplete);
  const onChangeRef = useRef(onChange);
  const contentRef = useRef(content);
  onChangeRef.current = onChange;
  contentRef.current = content;

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const next = new EditorView({
      parent,
      state: EditorState.create({
        doc: contentRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          indentOnInput(),
          indentUnit.of("  "),
          bracketMatching(),
          closeBrackets(),
          ...(ac ? [autocompletion({ override: [completer(lang)], icons: false })] : []),
          keymap.of([
            {
              key: "Mod-Enter",
              preventDefault: true,
              run() {
                hotkeys.run();
                return true;
              },
            },
            { key: "Tab", run: acceptCompletion },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          syntaxHighlighting(highlight),
          themeFor(lang === "farsi" || lang === "nava"),
          languageOf(lang),
          ...(lang === "farsi" || lang === "nava" ? [bidiIsolates()] : []),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "ویرایشگر کد",
            dir: lang === "farsi" || lang === "nava" ? "rtl" : "ltr",
            spellcheck: "false",
            autocapitalize: "off",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = next;
    setActiveView(next);
    return () => {
      view.current = null;
      next.destroy();
      clearActiveView(next);
    };
  }, [fileId, lang, ac]);

  // وقتی متن از بیرون عوض شود (مثلاً «مخفف‌کردن کد» نوا)، ویرایشگر هم به‌روز می‌شود
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== content) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content } });
    }
  }, [content, fileId, lang, ac]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" dir={lang === "farsi" || lang === "nava" ? "rtl" : "ltr"} />;
}
