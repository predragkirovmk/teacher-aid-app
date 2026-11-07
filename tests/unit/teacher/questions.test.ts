import { describe, expect, test } from "vitest";
import type { AnonQuestionItem, ConsoleQuestion, LeaderboardRow, QuestionStatus, RevealCounts } from "@/lib/teacher/api/types";
import { rankRows } from "@/lib/teacher/scoring";
import {
  ADHOC_PROMPT_MAX,
  arrivedIds,
  barRows,
  canSendAnother,
  checkAdhoc,
  currentQuestion,
  emptyAdhoc,
  listStatus,
  NUDGE_AFTER_SECONDS,
  nextUnsent,
  nudgeIdle,
  nudgeMinutes,
  numericSummary,
  optionLetter,
  panelStep,
  projectedScreen,
  optionFit,
  promptSize,
  secondsLeft,
  shareLeft,
  sortInbox,
  topOfBoard,
  unansweredCount,
} from "@/lib/teacher/questions";

const T0 = Date.parse("2026-10-29T09:30:00Z");
const iso = (s: number) => new Date(T0 + s * 1000).toISOString();

let n = 0;
const q = (status: QuestionStatus, over: Partial<ConsoleQuestion> = {}): ConsoleQuestion => ({
  id: `q${++n}`,
  question: { id: `l${n}`, order: n, prompt: `P${n}`, media: null, explanation: null, timer_seconds: 20, topic: "", kind: "true_false", correct: "true" },
  status,
  adhoc: false,
  fired_at: status === "ready" ? null : iso(n),
  closes_at: null,
  closed_at: null,
  revealed_at: null,
  skipped_at: status === "skipped" ? iso(n) : null,
  answered: 0,
  joined: 0,
  counts: null,
  ...over,
});

describe("the panel's next step", () => {
  test("nothing sent yet: send the first, in the lesson's order", () => {
    const list = [q("ready"), q("ready")];
    const step = panelStep(list);
    expect(step).toMatchObject({ step: "send", skipped: null });
    expect(step.step === "send" && step.next).toBe(list[0]);
  });

  test("one open: the panel is about it, whatever else was done", () => {
    const list = [q("revealed"), q("open"), q("ready")];
    expect(panelStep(list)).toMatchObject({ step: "open", question: list[1] });
  });

  test("closed: show the answer; answer shown: send the next, and none left says so", () => {
    const closed = [q("revealed"), q("closed"), q("ready")];
    expect(panelStep(closed)).toMatchObject({ step: "closed", question: closed[1] });
    const shown = [q("revealed"), q("revealed"), q("ready")];
    expect(panelStep(shown)).toMatchObject({ step: "revealed", question: shown[1], next: shown[2] });
    const last = [q("revealed"), q("revealed")];
    expect(panelStep(last)).toMatchObject({ step: "revealed", next: null });
  });

  test("a question sent out of order leaves the earlier ones as the next to send", () => {
    const list = [q("ready"), q("ready"), q("revealed", { fired_at: iso(50) })];
    expect(nextUnsent(list)).toBe(list[0]);
    expect(panelStep(list)).toMatchObject({ step: "revealed", next: list[0] });
  });

  test("a skipped question is not the next, and when it was the last thing done the panel says so", () => {
    const list = [q("revealed"), q("skipped", { skipped_at: iso(99) }), q("ready")];
    const step = panelStep(list);
    expect(step).toMatchObject({ step: "send", skipped: list[1] });
    expect(step.step === "send" && step.next).toBe(list[2]);
  });

  test("all done: nothing to send, and the panel does not move on to the review", () => {
    const list = [q("revealed"), q("skipped")];
    expect(panelStep(list)).toMatchObject({ step: "send", next: null });
    expect(JSON.stringify(panelStep(list))).not.toContain("review");
  });

  test("a quick question is never the next one to send, and is the one the panel is about once it is sent", () => {
    const list = [q("revealed"), q("ready"), q("closed", { adhoc: true, fired_at: iso(200) })];
    expect(nextUnsent(list)).toBe(list[1]);
    expect(currentQuestion(list)).toBe(list[2]);
  });

  test("the list's words, and whether another may be sent", () => {
    expect(["ready", "open", "closed", "revealed", "skipped"].map((s) => listStatus(s as QuestionStatus))).toEqual(["not_sent", "sent", "sent", "shown", "skipped"]);
    expect(canSendAnother([q("revealed"), q("ready")])).toBe(true);
    expect(canSendAnother([q("open"), q("ready")])).toBe(false);
    expect(canSendAnother([q("closed"), q("ready")])).toBe(false);
  });
});

describe("the countdown, on the server's clock", () => {
  test("counts whole seconds up, never below zero, and reads the server's time through the offset", () => {
    const closes = iso(22);
    expect(secondsLeft(closes, 0, T0)).toBe(22);
    expect(secondsLeft(closes, 0, T0 + 8_200)).toBe(14);
    expect(secondsLeft(closes, 0, T0 + 22_000)).toBe(0);
    expect(secondsLeft(closes, 0, T0 + 99_000)).toBe(0);
    // This computer's clock is 5 s fast: the server's time is 5 s behind it.
    expect(secondsLeft(closes, -5000, T0 + 8_000)).toBe(19);
  });

  test("the bar's share is 1 at the start and 0 at the end", () => {
    expect(shareLeft(iso(0), iso(20), 0, T0)).toBe(1);
    expect(shareLeft(iso(0), iso(20), 0, T0 + 5000)).toBe(0.75);
    expect(shareLeft(iso(0), iso(20), 0, T0 + 30_000)).toBe(0);
    expect(shareLeft(iso(20), iso(20), 0, T0)).toBe(0);
  });
});

describe("the bars of a reveal", () => {
  const counts = (by: Record<string, number>, over: Partial<RevealCounts> = {}): RevealCounts => ({ by_response: by, right: 0, wrong: 0, unanswered: 0, ...over });

  test("a bar for each option with the count and a share, and the right one marked", () => {
    const rows = barRows("multiple_choice", 4, counts({ "0": 2, "1": 10, "2": 6, "3": 2 }), "1");
    expect(rows.map((r) => r.count)).toEqual([2, 10, 6, 2]);
    expect(rows.map((r) => r.percent)).toEqual([10, 50, 30, 10]);
    expect(rows.map((r) => r.right)).toEqual([false, true, false, false]);
  });

  test("the shares are whole numbers that add up to 100, by the largest remainder", () => {
    const rows = barRows("multiple_choice", 3, counts({ "0": 1, "1": 1, "2": 1 }), "0");
    expect(rows.map((r) => r.percent)).toEqual([34, 33, 33]);
    for (const by of [{ "0": 7, "1": 5, "2": 11 }, { "0": 1, "1": 2, "2": 4 }, { "0": 13, "1": 0, "2": 1 }]) {
      expect(barRows("multiple_choice", 3, counts(by), "0").reduce((a, r) => a + r.percent, 0)).toBe(100);
    }
  });

  test("nobody answered: every bar is empty and nothing divides by zero", () => {
    const rows = barRows("multiple_choice", 2, counts({}), "0");
    expect(rows.map((r) => r.percent)).toEqual([0, 0]);
  });

  test("true or false has its two bars, true first, with the right one marked", () => {
    const rows = barRows("true_false", 0, counts({ true: 15, false: 5 }), "false");
    expect(rows.map((r) => [r.key, r.count, r.percent, r.right])).toEqual([["true", 15, 75, false], ["false", 5, 25, true]]);
  });

  test("a numeric reveal is three counts and their sum", () => {
    expect(numericSummary(counts({}, { right: 12, wrong: 6, unanswered: 4 }))).toEqual({ right: 12, wrong: 6, unanswered: 4, total: 22 });
  });

  test("letters for the options", () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("the leaderboard", () => {
  const rows = (points: number[]): LeaderboardRow[] => rankRows(points.map((p, i) => ({ student_id: `s${i}`, name: `Ученик ${String(i).padStart(2, "0")}`, points: p })));

  test("the first five, best first, with their points", () => {
    const top = topOfBoard(rows([5, 40, 30, 20, 10, 25, 15]));
    expect(top.map((r) => r.points)).toEqual([40, 30, 25, 20, 15]);
    expect(top.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  test("a tie shares a place and the next place is skipped (BR-PTS-09), in the name's order", () => {
    const top = topOfBoard(rows([30, 30, 20, 10, 5]));
    expect(top.map((r) => r.rank)).toEqual([1, 1, 3, 4, 5]);
    expect(top.slice(0, 2).map((r) => r.name)).toEqual(["Ученик 00", "Ученик 01"]);
  });

  test("a tie at the last place is shown whole, and never more than seven rows", () => {
    expect(topOfBoard(rows([50, 40, 30, 20, 10, 10, 10])).map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 5, 5]);
    expect(topOfBoard(rows([50, 40, 30, 20, 10, 10, 10, 10, 10])).length).toBe(7);
  });

  test("nobody with no points is shown", () => {
    expect(topOfBoard(rows([0, 0, 0]))).toEqual([]);
    expect(topOfBoard(rows([10, 0, 0])).length).toBe(1);
  });
});

describe("what the projector shows", () => {
  const pq = (status: QuestionStatus) => ({ status }) as Parameters<typeof projectedScreen>[0];
  test("by the question's state, a skip first", () => {
    expect(projectedScreen(null, false, false)).toBe("between");
    expect(projectedScreen(pq("open"), false, false)).toBe("open");
    expect(projectedScreen(pq("closed"), false, false)).toBe("closed");
    expect(projectedScreen(pq("revealed"), false, true)).toBe("revealed");
    expect(projectedScreen(pq("revealed"), false, false)).toBe("closed");
    expect(projectedScreen(pq("open"), true, false)).toBe("skipped");
  });
  test("a prompt gets smaller the longer it is, in three sizes", () => {
    expect([10, 80, 81, 160, 161, 400].map(promptSize)).toEqual(["xl", "xl", "l", "l", "m", "m"]);
  });

  test("the options' size follows the longest answer, so four long answers still share one screen", () => {
    expect(optionFit([])).toBe("a");
    expect(optionFit(["600 денари", "650 денари"])).toBe("a");
    expect(optionFit(["x".repeat(24)])).toBe("a");
    expect(optionFit(["x".repeat(25), "кратко"])).toBe("b");
    expect(optionFit(["x".repeat(40)])).toBe("b");
    expect(optionFit(["x".repeat(41)])).toBe("c");
  });
});

describe("the quick question", () => {
  const ok = (over: Partial<ReturnType<typeof emptyAdhoc>>) => checkAdhoc({ ...emptyAdhoc(), prompt: "Дали е 12 парен број?", ...over });

  test("true or false: the prompt and the right answer, with the time of its kind", () => {
    expect(ok({ correct: "true" })).toEqual({ ok: true, request: { kind: "true_false", prompt: "Дали е 12 парен број?", correct: "true", timer_seconds: 15 } });
  });

  test("a form with nothing in it lists what is missing, in the order of the form", () => {
    const r = checkAdhoc(emptyAdhoc());
    expect(r).toEqual({ ok: false, problems: ["prompt", "correct"] });
  });

  test("choices: two to four, blanks ignored, the right one counted among the filled", () => {
    const r = ok({ kind: "multiple_choice", seconds: "25", options: ["Скопје", "", "Битола", ""], correct: "2" });
    expect(r).toMatchObject({ ok: true, request: { kind: "multiple_choice", options: ["Скопје", "Битола"], correct: "1", timer_seconds: 25 } });
    expect(ok({ kind: "multiple_choice", options: ["Само еден", "", "", ""], correct: "0" })).toMatchObject({ ok: false, problems: ["options"] });
    expect(ok({ kind: "multiple_choice", options: ["А", "Б", "", ""], correct: "2" })).toMatchObject({ ok: false, problems: ["correct"] });
    expect(ok({ kind: "multiple_choice", options: ["А", "Б", "", ""], correct: "" })).toMatchObject({ ok: false, problems: ["correct"] });
    expect(ok({ kind: "multiple_choice", options: ["А".repeat(61), "Б", "", ""], correct: "0" })).toMatchObject({ ok: false, problems: ["option_long"] });
  });

  test("a number: a comma or a point, a unit if any, a minus allows a minus", () => {
    expect(ok({ kind: "numeric", correct: "3,5", unit: " cm ", seconds: "45" })).toMatchObject({
      ok: true,
      request: { kind: "numeric", correct: "3.5", numeric: { unit: "cm", tolerance: 0, allow_negative: false } },
    });
    expect(ok({ kind: "numeric", correct: "-2" })).toMatchObject({ ok: true, request: { correct: "-2", numeric: { allow_negative: true } } });
    expect(ok({ kind: "numeric", correct: "двајсет" })).toMatchObject({ ok: false, problems: ["number"] });
  });

  test("the time is a whole number of seconds from 5 to 300", () => {
    for (const seconds of ["5", "300", " 40 "]) expect(ok({ correct: "true", seconds }).ok).toBe(true);
    for (const seconds of ["4", "301", "", "1.5", "abc", "-5"]) expect(ok({ correct: "true", seconds })).toMatchObject({ ok: false, problems: ["time"] });
  });

  test("a prompt of white space is empty, and a very long one is refused", () => {
    expect(ok({ prompt: "   \n ", correct: "true" })).toMatchObject({ ok: false, problems: ["prompt"] });
    expect(ok({ prompt: "а".repeat(ADHOC_PROMPT_MAX + 1), correct: "true" })).toMatchObject({ ok: false, problems: ["prompt_long"] });
  });
});

describe("the inbox", () => {
  const item = (id: string, at: number, answered = false): AnonQuestionItem => ({
    id,
    text: id,
    sender: { id: "s", name: "Ана" },
    created_at: iso(at),
    answered_at: answered ? iso(at + 5) : null,
  });

  test("newest first, and an answered one goes below the others and stays in time order", () => {
    const items = [item("a", 10), item("b", 20, true), item("c", 30), item("d", 40, true)];
    expect(sortInbox(items).map((i) => i.id)).toEqual(["c", "a", "d", "b"]);
  });

  test("taking an answer back puts the question where its time puts it", () => {
    const items = [item("a", 10), item("b", 20, true), item("c", 30)];
    expect(sortInbox(items).map((i) => i.id)).toEqual(["c", "a", "b"]);
    const undone = items.map((i) => (i.id === "b" ? { ...i, answered_at: null } : i));
    expect(sortInbox(undone).map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  test("how many are not answered, and what has just arrived", () => {
    const items = [item("a", 10), item("b", 20, true), item("c", 30)];
    expect(unansweredCount(items)).toBe(2);
    expect(arrivedIds(new Set(["a"]), items)).toEqual(["b", "c"]);
    expect(arrivedIds(new Set(["a", "b", "c"]), items)).toEqual([]);
  });

  test("sorting leaves the list it was given as it was", () => {
    const items = [item("a", 10), item("b", 20)];
    sortInbox(items);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("the nudge", () => {
  const base = { teaching: true, busy: false, unsent: true, idleSince: T0, afterMs: 90_000 };
  test("is due once the lesson has been quiet for the whole while, and says how long", () => {
    expect(nudgeIdle({ ...base, now: T0 + 89_999 })).toBeNull();
    expect(nudgeIdle({ ...base, now: T0 + 90_000 })).toBe(90);
    expect(nudgeIdle({ ...base, now: T0 + 8 * 60_000, afterMs: NUDGE_AFTER_SECONDS * 1000 })).toBe(480);
  });
  test("never while a question is open or waiting for its answer, when nothing is left to send, or outside teaching", () => {
    const later = { now: T0 + 600_000 };
    expect(nudgeIdle({ ...base, ...later, busy: true })).toBeNull();
    expect(nudgeIdle({ ...base, ...later, unsent: false })).toBeNull();
    expect(nudgeIdle({ ...base, ...later, teaching: false })).toBeNull();
  });
  test("the product waits eight minutes, and the line says whole minutes, at least one", () => {
    expect(NUDGE_AFTER_SECONDS).toBe(480);
    expect([60, 90, 480, 20].map(nudgeMinutes)).toEqual([1, 1, 8, 1]);
  });
});
