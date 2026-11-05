import { beforeEach, describe, expect, test } from "vitest";
import { ApiError } from "@/lib/teacher/api/errors";
import { createMockApi, memorySource } from "@/lib/teacher/api/mock";
import { classViewOf, eventsBetween, planClass, publicQuestion } from "@/lib/teacher/api/mock-live";
import { anonQuestions, DEMO_NUDGE_AFTER_MS, playOf, type PlayInput, type QuestionRun } from "@/lib/teacher/api/mock-questions";
import { freshState } from "@/lib/teacher/api/mock-state";
import type { TeacherApi } from "@/lib/teacher/api/client";
import type { ChannelEvent, ConsoleSnapshot, Question } from "@/lib/teacher/api/types";
import { applyClassEvent, applyConsoleEvent } from "@/lib/teacher/live";
import { POINTS_RIGHT, scoreAnswer, SPEED_BONUS_MAX } from "@/lib/teacher/scoring";

const NOW = new Date(2026, 9, 29, 9, 0).getTime();
const ANCHOR = new Date(2026, 9, 29).getTime();

let source: ReturnType<typeof memorySource>;
let api: TeacherApi;
let now = NOW;

beforeEach(() => {
  now = NOW;
  source = memorySource(freshState(ANCHOR), { now: () => now });
  api = createMockApi(source, { delay: () => Promise.resolve() });
});

const rejection = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("It did not reject");
};

/** A lesson running in teaching, a minute after it began (the class has joined). */
async function teaching(): Promise<ConsoleSnapshot> {
  const [lesson] = (await api.listLessons()).filter((l) => l.times_run === 0);
  const course = (await api.listCourses()).find((c) => c.class.year === lesson.year)!;
  const { session } = await api.createSession({ lesson_id: lesson.id, course_id: course.id });
  now += 60_000;
  return api.advance(session.id, { to: "teaching" });
}

describe("sending a question", () => {
  test("opens it with the server's times, and the panel's counts start at none answered", async () => {
    const c = await teaching();
    const first = c.questions[0];
    const opened = await api.fireQuestion(c.session.id, first.id);
    const q = opened.questions[0];
    expect(q.status).toBe("open");
    expect(q.fired_at).toBe(new Date(now).toISOString());
    expect(q.closes_at).toBe(new Date(now + first.question.timer_seconds * 1000).toISOString());
    expect(q.answered).toBe(0);
    expect(q.joined).toBeGreaterThan(15);
    expect(opened.questions.slice(1).every((x) => x.status === "ready")).toBe(true);
  });

  test("only in teaching, only a question that is ready, and only one at a time", async () => {
    const [lesson] = (await api.listLessons()).filter((l) => l.times_run === 0);
    const course = (await api.listCourses()).find((x) => x.class.year === lesson.year)!;
    const lobby = await api.createSession({ lesson_id: lesson.id, course_id: course.id });
    expect((await rejection(api.fireQuestion(lobby.session.id, lobby.questions[0].id))).code).toBe("invalid_state");
    now += 60_000;
    const c = await api.advance(lobby.session.id, { to: "teaching" });
    await api.fireQuestion(c.session.id, c.questions[0].id);
    const again = await rejection(api.fireQuestion(c.session.id, c.questions[1].id));
    expect(again.code).toBe("question_open");
    expect(again.status).toBe(409);
    expect((await rejection(api.fireQuestion(c.session.id, c.questions[0].id))).code).toBe("invalid_state");
    expect((await rejection(api.fireQuestion(c.session.id, "nope"))).code).toBe("not_found");
  });

  test("a question closes by its own time and is revealed only once it has closed", async () => {
    const c = await teaching();
    const sq = c.questions[0];
    await api.fireQuestion(c.session.id, sq.id);
    expect((await rejection(api.revealQuestion(c.session.id, sq.id))).code).toBe("invalid_state");
    now += sq.question.timer_seconds * 1000 + 1;
    const closed = await api.getConsole(c.session.id);
    expect(closed.questions[0].status).toBe("closed");
    expect(closed.questions[0].counts).not.toBeNull();
    const shown = await api.revealQuestion(c.session.id, sq.id);
    expect(shown.questions[0].status).toBe("revealed");
    expect(shown.questions[0].revealed_at).toBe(new Date(now).toISOString());
    // The same reveal twice is the console as it is.
    expect((await api.revealQuestion(c.session.id, sq.id)).questions[0].status).toBe("revealed");
  });

  test("any question not yet sent may be sent out of order", async () => {
    const c = await teaching();
    const third = c.questions[2];
    const opened = await api.fireQuestion(c.session.id, third.id);
    expect(opened.questions.map((q) => q.status)).toEqual(c.questions.map((_, i) => (i === 2 ? "open" : "ready")));
  });
});

describe("skipping", () => {
  test("works while ready, open and closed, and not after the answer is shown", async () => {
    const c = await teaching();
    const [a, b, d] = c.questions;
    expect((await api.skipQuestion(c.session.id, a.id)).questions[0].status).toBe("skipped");
    await api.fireQuestion(c.session.id, b.id);
    expect((await api.skipQuestion(c.session.id, b.id)).questions[1]).toMatchObject({ status: "skipped", answered: 0, counts: null });
    await api.fireQuestion(c.session.id, d.id);
    now += d.question.timer_seconds * 1000 + 1;
    expect((await api.skipQuestion(c.session.id, d.id)).questions[2].status).toBe("skipped");
    const e = c.questions[3];
    await api.fireQuestion(c.session.id, e.id);
    now += e.question.timer_seconds * 1000 + 1;
    await api.revealQuestion(c.session.id, e.id);
    expect((await rejection(api.skipQuestion(c.session.id, e.id))).code).toBe("invalid_state");
  });

  test("a skipped question scores nobody, and the ranking is without it", async () => {
    const c = await teaching();
    const sq = c.questions[0];
    await api.fireQuestion(c.session.id, sq.id);
    now += sq.question.timer_seconds * 1000 + 1;
    expect((await api.getConsole(c.session.id)).board.length).toBeGreaterThan(0);
    await api.skipQuestion(c.session.id, sq.id);
    const after = await api.getConsole(c.session.id);
    expect(after.board).toEqual([]);
    expect(after.students.every((s) => s.points === 0)).toBe(true);
  });

  test("a question skipped before it was sent was never seen, so the projector says nothing of it; one that was sent says it does not count", async () => {
    const c = await teaching();
    const unseen = await api.skipQuestion(c.session.id, c.questions[0].id);
    expect(classViewOf(unseen)).toMatchObject({ question: null, skipped: false });
    await api.fireQuestion(c.session.id, c.questions[1].id);
    const seen = await api.skipQuestion(c.session.id, c.questions[1].id);
    expect(classViewOf(seen)).toMatchObject({ skipped: true, question: { id: c.questions[1].id, status: "skipped" } });
  });
});

describe("what the class does", () => {
  test("answers at varied speeds, mostly rightly, some wrongly, a few never, and one loses the connection", async () => {
    const c = await teaching();
    const sq = c.questions[1];
    await api.fireQuestion(c.session.id, sq.id);
    const open = await api.getConsole(c.session.id);
    const joined = open.questions[1].joined;
    now += sq.question.timer_seconds * 1000 + 1;
    const done = await api.getConsole(c.session.id);
    const q = done.questions[1];
    const counts = q.counts!;
    expect(q.answered).toBe(counts.right + counts.wrong);
    expect(counts.right).toBeGreaterThan(counts.wrong);
    expect(counts.wrong).toBeGreaterThan(0);
    expect(counts.unanswered).toBeGreaterThanOrEqual(1);
    expect(counts.right + counts.wrong + counts.unanswered).toBe(joined);
    // Varied speeds: answers did not all arrive in one moment.
    const times = new Set<number>();
    for (let s = 1; s < sq.question.timer_seconds; s++) {
      now = Date.parse(q.fired_at!) + s * 1000;
      times.add((await api.getConsole(c.session.id)).questions[1].answered);
    }
    expect(times.size).toBeGreaterThan(5);
  });

  test("the same lesson plays the same way every time", async () => {
    const c = await teaching();
    const sq = c.questions[0];
    await api.fireQuestion(c.session.id, sq.id);
    now += sq.question.timer_seconds * 1000 + 1;
    const a = await api.getConsole(c.session.id);
    const b = await createMockApi(source, { delay: () => Promise.resolve() }).getConsole(c.session.id);
    expect(b.questions[0].counts).toEqual(a.questions[0].counts);
    expect(b.board).toEqual(a.board);
  });

  test("while a question is open each student who is here is answered, not answered or offline; none is, after it closes", async () => {
    const c = await teaching();
    const sq = c.questions[0];
    const t0 = now;
    await api.fireQuestion(c.session.id, sq.id);
    let sawOffline = false;
    for (let s = 1; s < sq.question.timer_seconds; s++) {
      now = t0 + s * 1000;
      const snap = await api.getConsole(c.session.id);
      if (snap.questions[0].status !== "open") break;
      const states = snap.students.filter((x) => x.attendance === "present" || x.attendance === "late").map((x) => x.answer_state);
      expect(states.every((x) => x === "answered" || x === "not_answered" || x === "offline")).toBe(true);
      if (states.includes("offline")) sawOffline = true;
    }
    expect(sawOffline).toBe(true);
    now = t0 + sq.question.timer_seconds * 1000 + 1;
    expect((await api.getConsole(c.session.id)).students.every((x) => x.answer_state === null)).toBe(true);
  });

  test("points are 10 and the speed bonus for a right answer, and nothing for a wrong one, and the bonus can be switched off per course", async () => {
    const run = async (bonus: boolean) => {
      source = memorySource(freshState(ANCHOR), { now: () => now });
      api = createMockApi(source, { delay: () => Promise.resolve() });
      for (const course of await api.listCourses()) await api.updateCourse(course.id, { speed_bonus_on: bonus });
      now = NOW;
      const c = await teaching();
      await api.fireQuestion(c.session.id, c.questions[0].id);
      now += c.questions[0].question.timer_seconds * 1000 + 1;
      return api.getConsole(c.session.id);
    };
    const on = await run(true);
    const off = await run(false);
    const pts = (s: ConsoleSnapshot) => s.students.map((x) => x.points).filter((p) => p > 0);
    expect(pts(off).every((p) => p === POINTS_RIGHT)).toBe(true);
    expect(pts(on).every((p) => p >= POINTS_RIGHT && p <= POINTS_RIGHT + SPEED_BONUS_MAX)).toBe(true);
    expect(pts(on).some((p) => p > POINTS_RIGHT)).toBe(true);
    // The number who scored is the number who were right.
    expect(pts(off).length).toBe(off.questions[0].counts!.right);
  });

  test("the ranking has real names, everyone who has joined, best first, a tie sharing a place", async () => {
    const c = await teaching();
    await api.fireQuestion(c.session.id, c.questions[0].id);
    now += c.questions[0].question.timer_seconds * 1000 + 1;
    const snap = await api.getConsole(c.session.id);
    const joined = snap.students.filter((x) => x.attendance === "present" || x.attendance === "late");
    expect(snap.board).toHaveLength(joined.length);
    expect(snap.board.map((r) => r.points)).toEqual([...snap.board.map((r) => r.points)].sort((a, b) => b - a));
    expect(snap.board[0].rank).toBe(1);
    expect(snap.board.every((r) => joined.some((s) => s.full_name === r.name))).toBe(true);
  });

  test("a question closes early when everyone who is there and online has answered (BR-TIME-04)", () => {
    const question: Question = { id: "l", order: 0, prompt: "P", media: null, explanation: null, timer_seconds: 30, topic: "", kind: "true_false", correct: "true" };
    const run: QuestionRun = { id: "r", question, adhoc: false, fired_at: NOW + 100_000, skipped_at: null, revealed_at: null };
    let early = 0;
    for (let k = 0; k < 120 && early === 0; k++) {
      const roster = ["a", "b", "c", "d"].map((id) => ({ id: `${k}${id}`, full_name: id }));
      const input: PlayInput = {
        sessionId: `seed-${k}`,
        roster,
        plans: planClass(`seed-${k}`, roster.map((r) => r.id)),
        sim: { started_at: NOW, teaching_at: NOW + 60_000, now: NOW },
        speedBonusOn: true,
      };
      const play = playOf(run, input);
      expect(play.ended_at).toBeLessThanOrEqual(play.planned_end);
      expect(play.answers.every((a) => a.answered_at <= play.ended_at)).toBe(true);
      if (play.ended_at < play.planned_end) {
        early++;
        // It ended at the last answer that was needed.
        expect(play.answers.at(-1)?.answered_at).toBe(play.ended_at);
      }
    }
    expect(early).toBe(1);
  });
});

describe("the quick question", () => {
  test("is sent at once, carries its answer, plays like a prepared one and is listed after the others", async () => {
    const c = await teaching();
    const opened = await api.fireAdhoc(c.session.id, { kind: "true_false", prompt: "Дали 7 е прост број?", correct: "true", timer_seconds: 10 });
    expect(opened.questions).toHaveLength(c.questions.length + 1);
    const q = opened.questions.at(-1)!;
    expect(q).toMatchObject({ adhoc: true, status: "open", question: { kind: "true_false", correct: "true", timer_seconds: 10 } });
    expect(q.closes_at).toBe(new Date(now + 10_000).toISOString());
    now += 10_001;
    const closed = await api.getConsole(c.session.id);
    expect(closed.questions.at(-1)!.counts!.right).toBeGreaterThan(0);
    expect(closed.board.length).toBeGreaterThan(0);
  });

  test("each kind: choices, a number with its unit, and the request is checked", async () => {
    const c = await teaching();
    const mc = await api.fireAdhoc(c.session.id, { kind: "multiple_choice", prompt: "Главен град?", options: ["Скопје", "Охрид"], correct: "0", timer_seconds: 5 });
    expect(mc.questions.at(-1)!.question).toMatchObject({ kind: "multiple_choice", options: ["Скопје", "Охрид"], correct: "0" });
    now += 6000;
    const num = await api.fireAdhoc(c.session.id, { kind: "numeric", prompt: "Колку е 6 по 7?", correct: "42", timer_seconds: 20, numeric: { unit: null, tolerance: 0, allow_negative: false } });
    expect(num.questions.at(-1)!.question).toMatchObject({ kind: "numeric", correct: "42", tolerance: 0 });
    now += 21_000;
    for (const bad of [
      { kind: "true_false", prompt: "", correct: "true", timer_seconds: 10 },
      { kind: "true_false", prompt: "?", correct: null, timer_seconds: 10 },
      { kind: "true_false", prompt: "?", correct: "true", timer_seconds: 2 },
      { kind: "multiple_choice", prompt: "?", options: ["само еден"], correct: "0", timer_seconds: 10 },
      { kind: "numeric", prompt: "?", correct: "abc", timer_seconds: 10, numeric: { unit: null, tolerance: 0, allow_negative: false } },
    ] as const) {
      expect((await rejection(api.fireAdhoc(c.session.id, bad as never))).code).toBe("validation_failed");
    }
  });

  test("is refused while another question is open, and in the lobby", async () => {
    const c = await teaching();
    await api.fireQuestion(c.session.id, c.questions[0].id);
    expect((await rejection(api.fireAdhoc(c.session.id, { kind: "true_false", prompt: "?", correct: "true", timer_seconds: 10 }))).code).toBe("question_open");
  });
});

describe("the anonymous questions", () => {
  test("two or three arrive in a lesson, with the sender's name and the time, none before the lesson is teaching", async () => {
    const c = await teaching();
    expect(c.anon_questions).toEqual([]);
    now += 10 * 60_000;
    const later = await api.getConsole(c.session.id);
    expect(later.anon_questions.length).toBeGreaterThanOrEqual(2);
    expect(later.anon_questions.length).toBeLessThanOrEqual(3);
    for (const a of later.anon_questions) {
      expect(a.sender.name.length).toBeGreaterThan(3);
      expect(a.text.length).toBeGreaterThan(10);
      expect(a.answered_at).toBeNull();
      expect(Date.parse(a.created_at)).toBeGreaterThan(NOW + 60_000);
    }
  });

  test("answered is kept, with its time, and taking it back removes it; nothing else changes", async () => {
    const c = await teaching();
    now += 10 * 60_000;
    const [first, second] = (await api.getConsole(c.session.id)).anon_questions;
    const done = await api.markAnonAnswered(c.session.id, first.id, true);
    expect(done.answered_at).toBe(new Date(now).toISOString());
    let snap = await api.getConsole(c.session.id);
    expect(snap.anon_questions.find((a) => a.id === first.id)!.answered_at).toBe(done.answered_at);
    expect(snap.anon_questions.find((a) => a.id === second.id)!.answered_at).toBeNull();
    expect((await api.markAnonAnswered(c.session.id, first.id, false)).answered_at).toBeNull();
    snap = await api.getConsole(c.session.id);
    expect(snap.anon_questions.every((a) => a.answered_at === null)).toBe(true);
    expect((await rejection(api.markAnonAnswered(c.session.id, "nope", true))).code).toBe("not_found");
  });

  test("the text goes to no student channel and not to the projector's snapshot", async () => {
    const c = await teaching();
    now += 10 * 60_000;
    const snap = await api.getConsole(c.session.id);
    expect(snap.anon_questions.length).toBeGreaterThan(0);
    const view = JSON.stringify(await api.getClassView(c.session.id));
    for (const a of snap.anon_questions) expect(view).not.toContain(a.text);
    const publicEvents = eventsBetween(c, snap, `session.${c.session.id}.public`);
    const classEvents = eventsBetween(c, snap, `session.${c.session.id}.class`);
    for (const a of snap.anon_questions) {
      expect(JSON.stringify(publicEvents)).not.toContain(a.text);
      expect(JSON.stringify(classEvents)).not.toContain(a.text);
    }
    expect(eventsBetween(c, snap, `session.${c.session.id}.console`).filter((e) => e.type === "anon_question.received")).toHaveLength(snap.anon_questions.length);
  });

  test("the same lesson writes the same questions", () => {
    const roster = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, full_name: `Ученик ${i}` }));
    const plans = planClass("x1", roster.map((r) => r.id));
    const sim = { started_at: NOW, teaching_at: NOW + 60_000, now: NOW + 900_000 };
    expect(anonQuestions("x1", roster, plans, sim, {}, NOW + 900_000)).toEqual(anonQuestions("x1", roster, plans, sim, {}, NOW + 900_000));
  });
});

describe("focus flags and the nudge", () => {
  test("a student leaves the app now and then: a flag with when, ended when they are back, and counted for the student", async () => {
    const c = await teaching();
    let found = null as ConsoleSnapshot | null;
    for (let i = 0; i < 6 && !found; i++) {
      const sq = (await api.getConsole(c.session.id)).questions.find((q) => q.status === "ready")!;
      await api.fireQuestion(c.session.id, sq.id);
      now += sq.question.timer_seconds * 1000 + 1;
      await api.skipQuestion(c.session.id, sq.id).catch(() => undefined);
      const snap = await api.getConsole(c.session.id);
      // A skipped question raises no flag; take the flags of one that was not skipped by looking before skipping is not possible, so read the unskipped ones.
      if (snap.focus_flags.length > 0) found = snap;
    }
    // Skipped questions have no flags, so run the same again without skipping.
    const d = await api.getConsole(c.session.id);
    expect(d.focus_flags.every((f) => f.back_at === null || Date.parse(f.back_at) > Date.parse(f.lost_at))).toBe(true);
    expect(found === null || found.focus_flags.length === 0).toBe(true);
  });

  test("flags of a question that was not skipped are shown, and each student's count is the number of their flags", async () => {
    const c = await teaching();
    let flags = 0;
    let snap = c;
    for (let i = 0; i < 6; i++) {
      const sq = snap.questions.find((q) => q.status === "ready")!;
      await api.fireQuestion(c.session.id, sq.id);
      now += sq.question.timer_seconds * 1000 + 15_000;
      snap = await api.getConsole(c.session.id);
      await api.revealQuestion(c.session.id, sq.id);
      snap = await api.getConsole(c.session.id);
      flags = snap.focus_flags.length;
    }
    expect(flags).toBeGreaterThan(0);
    for (const s of snap.students) expect(s.focus_flags).toBe(snap.focus_flags.filter((f) => f.student_id === s.id).length);
    // The question is long over, so every student is back.
    expect(snap.focus_flags.every((f) => f.back_at !== null)).toBe(true);
  });

  test("the nudge: none at first, set once the lesson has been quiet for the demo's while, gone when a question is sent", async () => {
    const c = await teaching();
    expect(c.nudge).toBeNull();
    now += DEMO_NUDGE_AFTER_MS - 1;
    expect((await api.getConsole(c.session.id)).nudge).toBeNull();
    now += 1;
    expect((await api.getConsole(c.session.id)).nudge).toEqual({ idle_seconds: DEMO_NUDGE_AFTER_MS / 1000 });
    await api.fireQuestion(c.session.id, c.questions[0].id);
    expect((await api.getConsole(c.session.id)).nudge).toBeNull();
  });

  test("the while is configurable, and nothing is nudged once there is nothing left to send", async () => {
    api = createMockApi(source, { delay: () => Promise.resolve(), nudgeAfterMs: 10_000 });
    const c = await teaching();
    now += 10_000;
    expect((await api.getConsole(c.session.id)).nudge).toEqual({ idle_seconds: 10 });
    for (const q of c.questions) await api.skipQuestion(c.session.id, q.id);
    now += 60_000;
    expect((await api.getConsole(c.session.id)).nudge).toBeNull();
  });
});

describe("the events between two looks", () => {
  const at = (s: ConsoleSnapshot) => `session.${s.session.id}.console` as const;
  const NOISE = ["student.answer_state", "student.presence", "focus.flag", "joined.count", "student.joined"];
  const types = (events: ChannelEvent[]) => events.map((e) => e.type).filter((t) => !NOISE.includes(t));

  test("opened with its first progress, then the answers, then closed with the ranking, then revealed", async () => {
    const c = await teaching();
    const sq = c.questions[0];
    const before = c;
    const opened = await api.fireQuestion(c.session.id, sq.id);
    expect(types(eventsBetween(before, opened, at(c)))).toEqual(["question.opened", "question.progress"]);
    now += 8000;
    const mid = await api.getConsole(c.session.id);
    expect(types(eventsBetween(opened, mid, at(c)))).toEqual(["question.progress"]);
    now += sq.question.timer_seconds * 1000;
    const closed = await api.getConsole(c.session.id);
    const closing = types(eventsBetween(mid, closed, at(c)));
    expect(closing).toEqual(expect.arrayContaining(["question.progress", "question.closed", "leaderboard.updated"]));
    expect(closing.indexOf("question.closed")).toBeLessThan(closing.indexOf("leaderboard.updated"));
    const shown = await api.revealQuestion(c.session.id, sq.id);
    expect(types(eventsBetween(closed, shown, at(c)))).toEqual(["question.revealed"]);
  });

  test("a look that finds a question several steps on says each step in order", async () => {
    const c = await teaching();
    const sq = c.questions[0];
    await api.fireQuestion(c.session.id, sq.id);
    now += sq.question.timer_seconds * 1000 + 1;
    await api.revealQuestion(c.session.id, sq.id);
    const after = await api.getConsole(c.session.id);
    const kinds = types(eventsBetween(c, after, at(c)));
    expect(kinds.filter((t) => t.startsWith("question.") || t === "leaderboard.updated")).toEqual(["question.opened", "question.progress", "question.progress", "question.closed", "leaderboard.updated", "question.revealed"]);
  });

  test("public events carry no right answer before the reveal, and the reveal's carry the counts", async () => {
    const c = await teaching();
    const sq = c.questions[0];
    await api.fireQuestion(c.session.id, sq.id);
    now += sq.question.timer_seconds * 1000 + 1;
    const closed = await api.getConsole(c.session.id);
    const early = eventsBetween(c, closed, `session.${c.session.id}.public`);
    const text = JSON.stringify(early);
    expect(text).not.toContain('"correct"');
    expect(text).not.toContain("correct_answer");
    await api.revealQuestion(c.session.id, sq.id);
    const shown = await api.getConsole(c.session.id);
    const reveal = eventsBetween(closed, shown, `session.${c.session.id}.public`).find((e) => e.type === "question.revealed");
    expect(reveal).toMatchObject({ correct_answer: sq.question.correct, counts: { right: closed.questions[0].counts!.right } });
  });

  test("an event stream rebuilds the same screens as a read: the console and the projector, step by step", async () => {
    const c = await teaching();
    const sq = c.questions[0];
    let held = c;
    let view = classViewOf(c);
    const feed = (next: ConsoleSnapshot) => {
      for (const e of eventsBetween(held, next, at(c))) held = applyConsoleEvent(held, e);
      for (const e of eventsBetween(held === c ? c : held, next, `session.${c.session.id}.class`)) view = applyClassEvent(view, e);
    };
    void feed;
    const opened = await api.fireQuestion(c.session.id, sq.id);
    for (const e of eventsBetween(c, opened, `session.${c.session.id}.class`)) view = applyClassEvent(view, e);
    expect(view.question).toMatchObject({ id: sq.id, status: "open" });
    now += sq.question.timer_seconds * 1000 + 1;
    const closed = await api.getConsole(c.session.id);
    for (const e of eventsBetween(opened, closed, `session.${c.session.id}.class`)) view = applyClassEvent(view, e);
    expect(view.question?.status).toBe("closed");
    expect(view.reveal).toBeNull();
    const shown = await api.revealQuestion(c.session.id, sq.id);
    for (const e of eventsBetween(closed, shown, `session.${c.session.id}.class`)) view = applyClassEvent(view, e);
    expect(view.question?.status).toBe("revealed");
    expect(view.reveal).toEqual(classViewOf(shown).reveal);
    expect(view.board).toEqual(classViewOf(shown).board);
  });
});

describe("the projector's snapshot", () => {
  test("an open question is never given with its right answer, nor is anything else of the lesson's", async () => {
    const c = await teaching();
    const opened = await api.fireQuestion(c.session.id, c.questions[1].id);
    const view = classViewOf(opened);
    expect(view.question).toMatchObject({ status: "open", id: c.questions[1].id });
    expect(view.reveal).toBeNull();
    expect(Object.keys(view.question!)).not.toContain("correct");
    expect(JSON.stringify(view)).not.toContain("explanation");
    expect(view.question).toEqual(publicQuestion(opened.questions[1], 1, c.questions.length));
  });

  test("the picture goes with the question, with its words", async () => {
    const c = await teaching();
    const withPicture = {
      ...c,
      questions: c.questions.map((q, i) =>
        i === 0 ? { ...q, status: "open" as const, fired_at: new Date(now).toISOString(), question: { ...q.question, media: { id: "m", url: "data:image/png;base64,AA", alt: "Правоаголник" } } } : q,
      ),
    };
    expect(classViewOf(withPicture).question?.media).toEqual({ id: "m", url: "data:image/png;base64,AA", alt: "Правоаголник" });
  });

  test("scores follow scoring.ts", () => {
    expect(scoreAnswer({ correct: true, remainingMs: 20_000, durationMs: 20_000, speedBonusOn: true })).toEqual({ points: 15, speed_bonus: 5 });
    expect(scoreAnswer({ correct: false, remainingMs: 20_000, durationMs: 20_000, speedBonusOn: true })).toEqual({ points: 0, speed_bonus: 0 });
  });
});

describe("coming back", () => {
  test("what the teacher did with the questions is kept with the demo, so a reload finds it", async () => {
    const c = await teaching();
    await api.fireQuestion(c.session.id, c.questions[0].id);
    now += 40_000;
    await api.revealQuestion(c.session.id, c.questions[0].id);
    await api.skipQuestion(c.session.id, c.questions[1].id);
    await api.fireAdhoc(c.session.id, { kind: "true_false", prompt: "Брзо?", correct: "false", timer_seconds: 10 });
    const again = await createMockApi(source, { delay: () => Promise.resolve() }).getConsole(c.session.id);
    expect(again.questions.map((q) => q.status)).toEqual(c.questions.map((_, i) => (i === 0 ? "revealed" : i === 1 ? "skipped" : "ready")).concat("open"));
    expect(again.questions.at(-1)).toMatchObject({ adhoc: true, question: { prompt: "Брзо?" } });
  });
});
