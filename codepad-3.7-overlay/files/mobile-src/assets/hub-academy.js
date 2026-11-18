// موتور «آکادمی امنیت»: پیشرفت، اجرای واقعی کد تمرین کاربر و نمرهٔ آزمون. UI در پایین همین فایل است.
import { CHAPTERS } from "./hub-academy-data.js";
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
export function viewAcademy(ui) {
  const { h } = ui;
  const root = h("div", { class: "hb-acad" });
  let openId = null;
  const render = () => root.replaceChildren(openId ? chapterView(CHAPTERS.find((c) => c.id === openId)) : roadmap());

  function roadmap() {
    const { passed, total } = progressSummary();
    const pct = Math.round((passed / total) * 100);
    return h("div", { class: "hb-acad-roadmap" },
      h("div", { class: "hb-acad-hero" },
        h("div", { class: "hb-acad-hero-i" }, "🎓"),
        h("div", {}, h("h2", {}, "آکادمی امنیت"), h("p", {}, "هر فصل: یک درس کوتاه → یک تمرین کد واقعی → یک آزمون. برای رفتن به فصل بعد، باید آزمون را پاس کنی."))),
      h("div", { class: "hb-acad-bar" }, h("div", { class: "hb-acad-bar-fill", style: `width:${pct}%` })),
      h("p", { class: "hb-acad-barlabel" }, `${passed} از ${total} فصل گذرانده شد`),
      h("div", { class: "hb-acad-path" }, CHAPTERS.map((c, i) => {
        const st = chapterState(c.id).stage;
        const unlocked = isUnlocked(i);
        const status = !unlocked ? "locked" : st === "passed" ? "passed" : "open";
        return h("button", { type: "button", class: "hb-acad-node " + status, disabled: !unlocked, onclick: () => { openId = c.id; render(); } },
          h("span", { class: "hb-acad-node-i" }, status === "locked" ? "🔒" : status === "passed" ? "✅" : c.icon),
          h("span", { class: "hb-acad-node-t" }, c.title),
          h("span", { class: "hb-acad-node-s" }, status === "locked" ? "قفل" : status === "passed" ? "گذرانده شد" : "برو"));
      })));
  }

  function chapterView(c) {
    const st = chapterState(c.id);
    const stage = st.stage || "lesson";
    const wrap = h("div", { class: "hb-acad-chapter" },
      h("button", { type: "button", class: "hb-acad-back", onclick: () => { openId = null; render(); } }, "← بازگشت به مسیر"),
      h("h2", {}, c.icon + " " + c.title));
    if (stage === "lesson") wrap.append(lessonBox(c));
    else if (stage === "exercise") wrap.append(exerciseBox(c));
    else wrap.append(quizBox(c));
    return wrap;
  }

  function lessonBox(c) {
    return h("div", { class: "hb-acad-card" },
      h("p", { class: "hb-acad-intro" }, c.lesson.intro),
      h("ul", { class: "hb-acad-points" }, c.lesson.points.map((p) => h("li", {}, p))),
      h("div", { class: "hb-acad-example" }, h("div", { class: "hb-acad-example-h" }, "نمونه"), h("pre", {}, c.lesson.example.code), h("small", {}, c.lesson.example.note)),
      h("button", { type: "button", class: "hb-acad-btn pri", onclick: () => { setChapterState(c.id, { stage: "exercise" }); render(); } }, "برو به تمرین کد ▶"));
  }

  function exerciseBox(c) {
    const box = h("div", { class: "hb-acad-card" });
    const code = h("textarea", { class: "hb-acad-code", spellcheck: "false", "aria-label": "کد تمرین" }, c.exercise.starter);
    const out = h("div", { class: "hb-acad-results" });
    const status = h("p", { class: "hb-acad-status", role: "status" });
    const hintBox = h("div", {});
    let hintShown = false;
    const run = async () => {
      status.textContent = "در حال اجرای کدت…";
      out.replaceChildren();
      const r = await runExercise(c, code.value);
      if (r.error) { status.textContent = ""; out.append(h("p", { class: "hb-acad-fail" }, "⛔ " + r.error)); return; }
      out.append(...r.results.map((t) => h("div", { class: "hb-acad-case " + (t.pass ? "ok" : "bad") },
        h("span", {}, t.pass ? "✔" : "✖"), h("code", {}, `${c.exercise.starter.match(/function\s+(\w+)/)?.[1]}(${t.in.map((x) => JSON.stringify(x)).join(", ")})`),
        h("span", {}, "→ " + JSON.stringify(t.got ?? null) + (t.pass ? "" : `  (باید: ${JSON.stringify(t.expected)})`)))));
      if (r.ok) { status.textContent = "✅ همهٔ آزمون‌ها پاس شد!"; markExercisePassed(c.id); setTimeout(() => render(), 700); }
      else status.textContent = "هنوز کامل نیست؛ موردهای ✖ را درست کن.";
    };
    box.append(h("p", {}, c.exercise.prompt), code,
      h("div", { class: "hb-row" }, h("button", { type: "button", class: "hb-acad-btn pri", onclick: run }, "▶ اجرا و بررسی"), h("button", { type: "button", class: "hb-acad-btn", onclick: () => { hintShown = !hintShown; hintBox.replaceChildren(hintShown ? h("p", { class: "hb-acad-hint" }, "💡 " + c.exercise.hint) : null); } }, "راهنما")),
      hintBox, status, out);
    return box;
  }

  function quizBox(c) {
    const answers = new Array(c.quiz.questions.length).fill(-1);
    const box = h("div", { class: "hb-acad-card" }, h("p", {}, `آزمون فصل — حداقل ${c.quiz.pass} از ${c.quiz.questions.length} سؤال را درست بزن.`));
    c.quiz.questions.forEach((q, qi) => {
      const group = h("div", { class: "hb-acad-q" }, h("b", {}, `${qi + 1}. ${q.q}`));
      q.options.forEach((opt, oi) => {
        const id = `aq-${c.id}-${qi}-${oi}`;
        const input = h("input", { type: "radio", name: "aq-" + qi, id, onchange: () => (answers[qi] = oi) });
        group.append(h("label", { class: "hb-acad-opt", for: id }, input, h("span", {}, opt)));
      });
      box.append(group);
    });
    const result = h("div", {});
    box.append(h("button", { type: "button", class: "hb-acad-btn pri", onclick: () => {
      if (answers.includes(-1)) { result.replaceChildren(h("p", { class: "hb-acad-fail" }, "به همهٔ سؤال‌ها جواب بده.")); return; }
      const r = gradeQuiz(c, answers);
      if (r.passed) { result.replaceChildren(h("p", { class: "hb-acad-pass" }, `🎉 ${r.correct} از ${r.total} درست! فصل بعد باز شد.`)); setTimeout(() => { openId = null; render(); }, 1200); }
      else if (r.reset) result.replaceChildren(h("p", { class: "hb-acad-fail" }, `✖ دوباره نیفتادی موفق نشدی (${r.correct}/${r.total}). طبق قانون، این فصل از اول شروع می‌شود.`), h("button", { type: "button", class: "hb-acad-btn", onclick: () => render() }, "شروع دوبارهٔ فصل"));
      else result.replaceChildren(h("p", { class: "hb-acad-fail" }, `✖ ${r.correct} از ${r.total} درست — کافی نیست. سؤال(های) ${r.wrong.map((i) => i + 1).join("، ")} را دوباره نگاه کن و یک‌بار دیگر امتحان کن.`));
    } }, "ثبت پاسخ‌ها"), result);
    return box;
  }

  render();
  return root;
}
