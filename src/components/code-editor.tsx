import { closeBrackets } from "@codemirror/autocomplete";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
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
import {
  cursorCharLeft,
  cursorCharRight,
  cursorLineDown,
  cursorLineUp,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { FARSI_KEYWORDS } from "@/labshell/farsi";
import { ENGLISH_KEYWORDS } from "@/labshell/english";
import type { Lang } from "@/labshell/types";

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
      fontSize: "1rem",
      lineHeight: rtl ? "1.75" : "1.55",
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

function languageOf(lang: Lang) {
  if (lang === "mix") return new LanguageSupport(mixLanguage);
  if (lang === "farsi") return new LanguageSupport(farsiLanguage);
  if (lang === "english") return new LanguageSupport(englishLanguage);
  if (lang === "binary") return new LanguageSupport(binaryLanguage);
  if (lang === "python") return python();
  if (lang === "javascript") return javascript();
  if (lang === "css") return css();
  return cpp();
}

let view: EditorView | null = null;

export const hotkeys = {
  run: () => {},
};

export function insertAtCursor(text: string) {
  if (!view) return;
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
  });
  view.focus();
}

export function moveCursor(direction: "left" | "right" | "up" | "down") {
  if (!view) return;
  const command = {
    left: cursorCharLeft,
    right: cursorCharRight,
    up: cursorLineUp,
    down: cursorLineDown,
  }[direction];
  command(view);
  view.focus();
}

export function editHistory(action: "undo" | "redo") {
  if (!view) return;
  (action === "undo" ? undo : redo)(view);
  view.focus();
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
          keymap.of([
            {
              key: "Mod-Enter",
              preventDefault: true,
              run() {
                hotkeys.run();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          syntaxHighlighting(highlight),
          themeFor(lang === "farsi"),
          languageOf(lang),
          ...(lang === "farsi" ? [bidiIsolates()] : []),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "ویرایشگر کد",
            dir: lang === "farsi" ? "rtl" : "ltr",
            spellcheck: "false",
            autocapitalize: "off",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view = next;
    return () => {
      next.destroy();
      if (view === next) view = null;
    };
  }, [fileId, lang]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" dir={lang === "farsi" ? "rtl" : "ltr"} />;
}
