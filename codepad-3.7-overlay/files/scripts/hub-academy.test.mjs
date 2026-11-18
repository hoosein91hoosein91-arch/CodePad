import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTERS, runExercise, gradeQuiz, chapterState, resetChapter, isUnlocked, progressSummary, markExercisePassed, sha256 } from "../mobile-src/assets/hub-academy.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const by = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

test("every chapter has a runnable solution that actually passes its own tests", async () => {
  // حل واقعی هر فصل، دقیقاً مثل یک یادگیرنده؛ هیچ قطعه‌کد از پیش فرض نمی‌شود درست است.
  const solutions = {
    encoding: "function decodeFlag(s) { return atob(s); }",
    hashing: "async function hashIt(text) { return await sha256(text); }",
    sqli: "function isSqliPayload(input) { return /'|--/.test(input) || /or\\s+1\\s*=\\s*1/i.test(input); }",
    xss: "function escapeHtml(str) { return str.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }",
    jwt: "function decodeJwtPayload(token) { const p = token.split('.')[1]; return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/'))); }",
    network: "function isPrivateIp(ip) { const p = ip.split('.').map(Number); if (p.length!==4||p.some(n=>Number.isNaN(n)||n<0||n>255)) return false; return p[0]===10||p[0]===127||(p[0]===192&&p[1]===168)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===169&&p[1]===254); }",
    race: "function claimSeat(pool, seatId) { return pool.delete(seatId); }",
    hmac: "function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }",
  };
  assert.deepEqual(Object.keys(solutions).sort(), CHAPTERS.map((c) => c.id).sort(), "every chapter needs a reference solution in this test");
  for (const c of CHAPTERS) {
    const r = await runExercise(c, solutions[c.id]);
    assert.ok(r.ok, `${c.id}: ${JSON.stringify(r.results?.filter((x) => !x.pass))}`);
  }
});

test("runExercise rejects code that doesn't define the required function name, syntax errors, and non-function values", async () => {
  const c = by.encoding;
  assert.match((await runExercise(c, "function wrongName(s){return s;}")).error, /decodeFlag/);
  assert.match((await runExercise(c, "function decodeFlag(s) { return ")).error, /خطای نحوی|Syntax/i);
  const r = await runExercise(c, "function decodeFlag(s){return s+1;}");
  assert.equal(r.ok, false);
  assert.equal(r.results[0].pass, false);
});

test("runExercise reports each test case's actual vs expected and a thrown error inside the user's function is caught, not fatal", async () => {
  const c = by.encoding;
  const r = await runExercise(c, "function decodeFlag(s){ if(s==='') throw new Error('boom'); return atob(s); }");
  assert.equal(r.ok, false);
  const empty = r.results.find((t) => t.in[0] === "");
  assert.equal(empty.pass, false);
  assert.match(empty.error, /boom/);
});

test("sha256 matches the well-known hash of the empty string", async () => {
  assert.equal(await sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("chapters unlock strictly in order; nothing after chapter 1 is open until the previous one is passed", () => {
  const st = mem();
  assert.equal(isUnlocked(0, st), true);
  for (let i = 1; i < CHAPTERS.length; i++) assert.equal(isUnlocked(i, st), false, CHAPTERS[i].id);
  markExercisePassed(CHAPTERS[0].id, st);
  assert.equal(chapterState(CHAPTERS[0].id, st).stage, "quiz");
  assert.equal(isUnlocked(1, st), false, "exercise passed is not the same as the quiz passed");
});

test("passing a quiz unlocks exactly the next chapter and counts toward progress", () => {
  const st = mem();
  const c0 = CHAPTERS[0];
  markExercisePassed(c0.id, st);
  const answers = c0.quiz.questions.map((q) => q.correct);
  const r = gradeQuiz(c0, answers, st);
  assert.deepEqual(r, { passed: true, correct: c0.quiz.questions.length, total: c0.quiz.questions.length, wrong: [], reset: false });
  assert.equal(chapterState(c0.id, st).stage, "passed");
  assert.equal(isUnlocked(1, st), true);
  assert.equal(isUnlocked(2, st), false);
  assert.deepEqual(progressSummary(st), { passed: 1, total: CHAPTERS.length });
});

test("first quiz failure allows a retry in place; a second consecutive failure resets the whole chapter back to the lesson", () => {
  const st = mem();
  const c = CHAPTERS[0];
  markExercisePassed(c.id, st);
  const wrongAnswers = c.quiz.questions.map((q) => (q.correct + 1) % q.options.length);
  const r1 = gradeQuiz(c, wrongAnswers, st);
  assert.equal(r1.passed, false);
  assert.equal(r1.reset, false, "first failure must not reset — the learner gets a retry");
  assert.equal(chapterState(c.id, st).stage, "quiz", "still mid-quiz after the first failure, exercise work is not lost");
  const r2 = gradeQuiz(c, wrongAnswers, st);
  assert.equal(r2.passed, false);
  assert.equal(r2.reset, true, "second consecutive failure must reset the chapter");
  assert.equal(chapterState(c.id, st).stage, "lesson", "back to the very beginning of the chapter");
  assert.equal(isUnlocked(1, st), false);
});

test("passing on the second attempt (after one failure) clears the failure counter", () => {
  const st = mem();
  const c = CHAPTERS[0];
  markExercisePassed(c.id, st);
  const wrong = c.quiz.questions.map((q) => (q.correct + 1) % q.options.length);
  gradeQuiz(c, wrong, st);
  const correct = c.quiz.questions.map((q) => q.correct);
  const r = gradeQuiz(c, correct, st);
  assert.equal(r.passed, true);
  assert.equal(chapterState(c.id, st).stage, "passed");
});

test("a partially-wrong quiz that still meets the pass threshold still passes, and 'wrong' lists only the missed questions", () => {
  const st = mem();
  const c = CHAPTERS.find((x) => x.quiz.pass < x.quiz.questions.length) || CHAPTERS[0];
  markExercisePassed(c.id, st);
  const answers = c.quiz.questions.map((q) => q.correct);
  answers[0] = (c.quiz.questions[0].correct + 1) % c.quiz.questions[0].options.length; // یک سؤال را عمداً غلط بزن
  const r = gradeQuiz(c, answers, st);
  assert.equal(r.passed, c.quiz.pass <= c.quiz.questions.length - 1);
  assert.deepEqual(r.wrong, [0]);
});

test("resetChapter puts a chapter back to its very start regardless of prior progress", () => {
  const st = mem();
  const c = CHAPTERS[0];
  markExercisePassed(c.id, st);
  gradeQuiz(c, c.quiz.questions.map((q) => q.correct), st);
  assert.equal(chapterState(c.id, st).stage, "passed");
  resetChapter(c.id, st);
  assert.deepEqual(chapterState(c.id, st), { stage: "lesson", quizFails: 0 });
});

test("state survives a broken storage without throwing", () => {
  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
  assert.equal(chapterState(CHAPTERS[0].id, broken).stage, "lesson");
  assert.doesNotThrow(() => markExercisePassed(CHAPTERS[0].id, broken));
  assert.doesNotThrow(() => resetChapter(CHAPTERS[0].id, broken));
});
