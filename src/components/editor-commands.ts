// فرمان‌های ویرایشگر که از بیرون (نوار کلید، دکمه‌های بالا) صدا زده می‌شوند.
// جدا از code-editor.tsx تا آن فایل فقط کامپوننت صادر کند.
import { acceptCompletion } from "@codemirror/autocomplete";
import { cursorCharLeft, cursorCharRight, cursorLineDown, cursorLineUp, redo, undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";

let view: EditorView | null = null;

export function setActiveView(next: EditorView) {
  view = next;
}

export function clearActiveView(old: EditorView) {
  if (view === old) view = null;
}

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

export function pressTab() {
  if (view && !acceptCompletion(view)) insertAtCursor("  ");
  else view?.focus();
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
