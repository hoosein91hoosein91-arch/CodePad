// موتور «آکادمی امنیت»: پیشرفت، اجرای واقعی کد تمرین کاربر و نمرهٔ آزمون. UI در پایین همین فایل است.
import { CHAPTERS } from "./hub-academy-data.js";
import { h, icon, btn, row, chip, section } from "./ui-dom.js";
export { CHAPTERS };

const KEY = "codepad-academy-v1";
const ls = () => { try { return globalThis.localStorage; } catch { return null; } };
const load = (storage = ls()) => { try { const v = JSON.parse(storage?.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const save = (v, storage = ls()) => { try { storage?.setItem(KEY, JSON.stringify(v)); } catch { /* حافظه پر */ } };

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fnName(starter) {
  const m = starter.match(/function\s+(\w+)\s*\(/);
  return m ? m[1] : null;
}

/** کد تمرین کاربر را واقعاً اجرا می‌کند (نه شبیه‌سازی) و روی چند ورودی واقعی می‌سنجد. */
export async function runExercise(chapter, code) {
  const name = fnName(chapter.exercise.starter);
  if (!name) throw new Error("نام تابع در تمرین پیدا نشد.");
  if (!new RegExp(`function\\s+${name}\\s*\\(`).test(code)) return { ok: false, error: `باید تابعی به نام ${name} تعریف کنی.` };
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function("sha256", `"use strict";\n${code}\n;return ${name};`)(sha256);
  } catch (e) {
    return { ok: false, error: "خطای نحوی در کد: " + (e?.message || e) };
  }
  if (typeof fn !== "function") return { ok: false, error: `${name} یک تابع نیست.` };
  const results = [];
  for (const t of chapter.exercise.tests) {
    let got, error = null;
    try { got = await fn(...t.in); } catch (e) { error = e?.message || String(e); }
    const pass = error === null && JSON.stringify(got) === JSON.stringify(t.out);
    results.push({ in: t.in, expected: t.out, got, error, pass });
  }
  return { ok: results.every((r) => r.pass), results };
}

export function chapterState(id, storage = ls()) { return load(storage)[id] || { stage: "lesson", quizFails: 0 }; }
function setChapterState(id, patch, storage = ls()) { const all = load(storage); all[id] = { ...chapterState(id, storage), ...patch }; save(all, storage); }
export function resetChapter(id, storage = ls()) { setChapterState(id, { stage: "lesson", quizFails: 0 }, storage); }

export function isUnlocked(index, storage = ls()) {
  if (index === 0) return true;
  return chapterState(CHAPTERS[index - 1].id, storage).stage === "passed";
}
export function progressSummary(storage = ls()) {
  const passed = CHAPTERS.filter((c) => chapterState(c.id, storage).stage === "passed").length;
  return { passed, total: CHAPTERS.length };
}

export function markExercisePassed(id, storage = ls()) { setChapterState(id, { stage: "quiz" }, storage); }

/** نمرهٔ آزمون: پاس‌شدن، شکست اول (اجازهٔ تلاش دوباره)، یا شکست دوم پیاپی (بازنشانی کل فصل). */
export function gradeQuiz(chapter, answers, storage = ls()) {
  const qs = chapter.quiz.questions;
  const correct = qs.reduce((n, q, i) => n + (answers[i] === q.correct ? 1 : 0), 0);
  const wrong = qs.map((q, i) => ({ i, right: answers[i] === q.correct })).filter((x) => !x.right).map((x) => x.i);
  if (correct >= chapter.quiz.pass) {
    setChapterState(chapter.id, { stage: "passed", quizFails: 0 }, storage);
    return { passed: true, correct, total: qs.length, wrong, reset: false };
  }
  const st = chapterState(chapter.id, storage);
  const fails = (st.quizFails || 0) + 1;
  if (fails >= 2) { resetChapter(chapter.id, storage); return { passed: false, correct, total: qs.length, wrong, reset: true }; }
  setChapterState(chapter.id, { quizFails: fails }, storage);
  return { passed: false, correct, total: qs.length, wrong, reset: false };
}

// ───────────────────────── UI ─────────────────────────
export function viewAcademy() {
  const root = h("div", { class: "ui-stack" });
  let openId = null;
  const render = () => root.replaceChildren(openId ? chapterView(CHAPTERS.find((c) => c.id === openId)) : roadmap());

  function roadmap() {
    const { passed, total } = progressSummary();
    const pct = Math.round((passed / total) * 100);
    const next = CHAPTERS.findIndex((c, i) => isUnlocked(i) && chapterState(c.id).stage !== "passed");
    return h("div", { class: "ui-stack" },
      h("div", { class: "ui-hero" },
        h("h2", {}, "آکادمی امنیت"),
        h("p", {}, "هر فصل: یک درس کوتاه، یک تمرین کد واقعی و یک آزمون. برای رفتن به فصل بعد باید آزمون را پاس کنی."),
        h("div", { class: "ui-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": "پیشرفت آکادمی" }, h("i", { style: { width: pct + "%" } })),
        h("span", { class: "ui-caption" }, `${passed} از ${total} فصل گذرانده شد`),
        next >= 0 ? btn(passed ? "ادامهٔ درس" : "شروع درس", { icon: "play", kind: "primary", onclick: () => { openId = CHAPTERS[next].id; render(); } }) : null),
      h("ul", { class: "ui-list", "aria-label": "فصل‌ها" }, CHAPTERS.map((c, i) => {
        const st = chapterState(c.id).stage;
        const unlocked = isUnlocked(i);
        const status = !unlocked ? "locked" : st === "passed" ? "passed" : "open";
        const label = status === "locked" ? "قفل · اول فصل قبل را بگذران" : status === "passed" ? "گذرانده شد" : st === "quiz" ? "آزمون" : st === "exercise" ? "تمرین" : "درس";
        return h("li", {}, row({ icon: status === "locked" ? "lock" : status === "passed" ? "check" : "book", title: `${i + 1}. ${c.title}`, detail: label,
          onclick: unlocked ? () => { openId = c.id; render(); } : null,
          end: chip(status === "locked" ? "قفل" : status === "passed" ? "انجام شد" : "باز", status === "passed" ? "ok" : status === "open" ? "primary" : "") }));
      })));
  }

  function chapterView(c) {
    const st = chapterState(c.id);
    const stage = st.stage || "lesson";
    const wrap = h("div", { class: "ui-stack" },
      btn("بازگشت به مسیر", { icon: "back", kind: "quiet", onclick: () => { openId = null; render(); } }),
      h("h2", { class: "ui-title", style: { margin: 0 } }, c.title),
      chip(stage === "lesson" ? "درس" : stage === "exercise" ? "تمرین" : "آزمون", "primary"));
    if (stage === "lesson") wrap.append(lessonBox(c));
    else if (stage === "exercise") wrap.append(exerciseBox(c));
    else wrap.append(quizBox(c));
    return wrap;
  }

  function lessonBox(c) {
    const intros = String(c.lesson.intro).split("\n\n").map((t) => h("p", { style: { margin: 0 } }, t));
    const sections = (c.lesson.sections || []).map((s) =>
      h("div", { class: "ui-tile", style: { cursor: "default", alignItems: "flex-start" } }, h("strong", {}, s.h), h("p", { class: "ui-caption", style: { margin: 0 } }, s.body)));
    const examples = (c.lesson.examples || (c.lesson.example ? [c.lesson.example] : [])).map((ex) =>
      section(ex.label || "نمونه",
        h("pre", { class: "ui-code-block", style: ex.bad ? { borderInlineStart: "3px solid var(--ui-error)" } : ex.label ? { borderInlineStart: "3px solid var(--ui-ok)" } : {} }, ex.code),
        h("p", { class: "ui-caption", style: { margin: 0 } }, ex.note)));
    return h("div", { class: "ui-card ui-stack" },
      ...intros,
      h("ul", { class: "ui-stack", style: { margin: 0, paddingInlineStart: "20px" } }, c.lesson.points.map((p) => h("li", {}, p))),
      ...sections,
      ...examples,
      btn("برو به تمرین کد", { icon: "play", kind: "primary", onclick: () => { setChapterState(c.id, { stage: "exercise" }); render(); } }));
  }

  function exerciseBox(c) {
    const box = h("div", { class: "ui-card ui-stack" });
    const code = h("textarea", { class: "ui-input ui-area ui-ltr", spellcheck: "false", dir: "ltr", "aria-label": "کد تمرین", style: { minHeight: "200px" } }, c.exercise.starter);
    const out = h("div", { class: "ui-stack" });
    const status = h("p", { class: "ui-label", role: "status", style: { margin: 0 } });
    const hintBox = h("div", {});
    let hintShown = false;
    const run = async () => {
      status.textContent = "در حال اجرای کدت…";
      out.replaceChildren();
      const r = await runExercise(c, code.value);
      if (r.error) { status.textContent = ""; out.append(h("div", { class: "ui-notice ui-notice--err", role: "alert" }, r.error)); return; }
      out.append(...r.results.map((t) => h("div", { class: "ui-row", style: { alignItems: "flex-start", flexWrap: "wrap" } },
        icon(t.pass ? "check" : "x"), h("code", { class: "ui-ltr", dir: "ltr" }, `${c.exercise.starter.match(/function\s+(\w+)/)?.[1]}(${t.in.map((x) => JSON.stringify(x)).join(", ")})`),
        h("span", { class: "ui-caption", style: { color: t.pass ? "var(--ui-ok)" : "var(--ui-error)" } }, "← " + JSON.stringify(t.got ?? null) + (t.pass ? "" : `  (باید: ${JSON.stringify(t.expected)})`)))));
      if (r.ok) { status.textContent = "همهٔ آزمون‌ها پاس شد."; markExercisePassed(c.id); setTimeout(() => render(), 700); }
      else status.textContent = "هنوز کامل نیست؛ موردهای نادرست را درست کن.";
    };
    box.append(h("p", { style: { margin: 0 } }, c.exercise.prompt), code,
      h("div", { class: "ui-actions" }, btn("اجرا و بررسی", { icon: "play", kind: "primary", onclick: run }), btn("راهنما", { icon: "info", kind: "line", onclick: () => { hintShown = !hintShown; hintBox.replaceChildren(hintShown ? h("div", { class: "ui-notice" }, c.exercise.hint) : ""); } })),
      hintBox, status, out);
    return box;
  }

  function quizBox(c) {
    const answers = new Array(c.quiz.questions.length).fill(-1);
    const box = h("div", { class: "ui-card ui-stack" }, h("p", { style: { margin: 0 } }, `آزمون فصل: حداقل ${c.quiz.pass} از ${c.quiz.questions.length} سؤال را درست بزن.`));
    c.quiz.questions.forEach((q, qi) => {
      const group = h("fieldset", { class: "ui-stack", style: { border: 0, padding: 0, margin: 0 } }, h("legend", { class: "ui-label", style: { marginBottom: "8px" } }, `${qi + 1}. ${q.q}`));
      q.options.forEach((opt, oi) => {
        const id = `aq-${c.id}-${qi}-${oi}`;
        const input = h("input", { type: "radio", name: "aq-" + qi, id, onchange: () => (answers[qi] = oi) });
        group.append(h("label", { class: "ui-switch", for: id }, h("span", { dir: "auto" }, opt), input));
      });
      box.append(group);
    });
    const result = h("div", { class: "ui-stack" });
    box.append(btn("ثبت پاسخ‌ها", { icon: "check", kind: "primary", onclick: () => {
      if (answers.includes(-1)) { result.replaceChildren(h("div", { class: "ui-notice ui-notice--err", role: "alert" }, "به همهٔ سؤال‌ها جواب بده.")); return; }
      const r = gradeQuiz(c, answers);
      if (r.passed) { result.replaceChildren(h("div", { class: "ui-notice ui-notice--ok", role: "status" }, `${r.correct} از ${r.total} درست. فصل بعد باز شد.`)); setTimeout(() => { openId = null; render(); }, 1200); }
      else if (r.reset) result.replaceChildren(h("div", { class: "ui-notice ui-notice--err", role: "alert" }, `دوباره موفق نشدی (${r.correct} از ${r.total}). طبق قانون، این فصل از اول شروع می‌شود.`), btn("شروع دوبارهٔ فصل", { kind: "line", onclick: () => render() }));
      else result.replaceChildren(h("div", { class: "ui-notice ui-notice--err", role: "alert" }, `${r.correct} از ${r.total} درست؛ کافی نیست. سؤال‌های ${r.wrong.map((i) => i + 1).join("، ")} را دوباره نگاه کن و یک‌بار دیگر امتحان کن.`));
    } }), result);
    return box;
  }

  render();
  return root;
}
