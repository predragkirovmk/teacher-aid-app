import { describe, expect, test } from "vitest";
import type { MultipleChoiceQuestion, NumericQuestion, TrueFalseQuestion } from "@/lib/teacher/api/types";
import {
  ANSWER_GRACE_MS,
  answerInTime,
  defaultTimerSeconds,
  isCorrect,
  parseNumeric,
  POINTS_RIGHT,
  PRACTICE_MAX,
  rankRows,
  scoreAnswer,
  selectPracticeQuestions,
  speedBonus,
  withinTolerance,
  type PracticeCandidate,
} from "@/lib/teacher/scoring";

const base = { id: "q", order: 0, prompt: "p", media: null, explanation: null, timer_seconds: 20, topic: "t" };
const choice: MultipleChoiceQuestion = { ...base, kind: "multiple_choice", options: ["a", "b", "c"], correct: "1" };
const truth: TrueFalseQuestion = { ...base, kind: "true_false", correct: "false" };
const number = (patch: Partial<NumericQuestion> = {}): NumericQuestion => ({
  ...base,
  kind: "numeric",
  correct: "3.25",
  tolerance: 0.05,
  unit: null,
  allow_negative: false,
  ...patch,
});

describe("speed bonus (BR-PTS-04)", () => {
  test("is 5 at the moment the question opens and 0 when it closes", () => {
    expect(speedBonus(20_000, 20_000)).toBe(5);
    expect(speedBonus(0, 20_000)).toBe(0);
  });

  test("is round(5 x remaining / duration)", () => {
    expect(speedBonus(10_000, 20_000)).toBe(3); // 2.5 rounds up
    expect(speedBonus(15_000, 20_000)).toBe(4); // 3.75
    expect(speedBonus(5_000, 20_000)).toBe(1); // 1.25
    expect(speedBonus(2_000, 20_000)).toBe(1); // 0.5 rounds up
    expect(speedBonus(1_000, 20_000)).toBe(0); // 0.25
  });

  test("never leaves 0 to 5, whatever the clocks say", () => {
    expect(speedBonus(-500, 20_000)).toBe(0);
    expect(speedBonus(30_000, 20_000)).toBe(5);
    expect(speedBonus(1_000, 0)).toBe(0);
  });
});

describe("scoring an answer (BR-PTS-02)", () => {
  test("a right answer is 10 plus the speed bonus", () => {
    expect(scoreAnswer({ correct: true, remainingMs: 20_000, durationMs: 20_000, speedBonusOn: true })).toEqual({ points: 15, speed_bonus: 5 });
    expect(scoreAnswer({ correct: true, remainingMs: 10_000, durationMs: 20_000, speedBonusOn: true })).toEqual({ points: 13, speed_bonus: 3 });
  });

  test("a wrong answer scores nothing, however fast", () => {
    expect(scoreAnswer({ correct: false, remainingMs: 20_000, durationMs: 20_000, speedBonusOn: true })).toEqual({ points: 0, speed_bonus: 0 });
  });

  test("with the bonus off a right answer is just 10", () => {
    expect(scoreAnswer({ correct: true, remainingMs: 20_000, durationMs: 20_000, speedBonusOn: false })).toEqual({ points: POINTS_RIGHT, speed_bonus: 0 });
  });

  test("an answer in the grace window after the close still scores, with no bonus", () => {
    expect(scoreAnswer({ correct: true, remainingMs: 0, durationMs: 20_000, speedBonusOn: true })).toEqual({ points: 10, speed_bonus: 0 });
  });
});

describe("answer window (BR-NET-03)", () => {
  test("counts up to the grace after the close, by the time it was given", () => {
    const closes = 1_000_000;
    expect(answerInTime(closes - 1, closes)).toBe(true);
    expect(answerInTime(closes + ANSWER_GRACE_MS, closes)).toBe(true);
    expect(answerInTime(closes + ANSWER_GRACE_MS + 1, closes)).toBe(false);
  });
});

describe("numeric answers (BR-ANS-03, FR-ANS-02)", () => {
  test("reads a comma or a point, a minus, and nothing else", () => {
    expect(parseNumeric("3.25")).toBe(3.25);
    expect(parseNumeric("3,25")).toBe(3.25);
    expect(parseNumeric("-2.5")).toBe(-2.5);
    expect(parseNumeric(" 7 ")).toBe(7);
    expect(parseNumeric(".5")).toBe(0.5);
    expect(parseNumeric("1e3")).toBeNull();
    expect(parseNumeric("1 000")).toBeNull();
    expect(parseNumeric("1,000.5")).toBeNull();
    expect(parseNumeric("--1")).toBeNull();
    expect(parseNumeric("abc")).toBeNull();
    expect(parseNumeric("")).toBeNull();
  });

  test("has at most 15 digits", () => {
    expect(parseNumeric("123456789012345")).toBe(123456789012345);
    expect(parseNumeric("1234567890123456")).toBeNull();
  });

  test("the edges of the tolerance are right, even where binary arithmetic is a hair over", () => {
    expect(withinTolerance(0.4, 0.3, 0.1)).toBe(true);
    expect(withinTolerance(3.3, 3.25, 0.05)).toBe(true);
    expect(withinTolerance(3.2, 3.25, 0.05)).toBe(true);
    expect(withinTolerance(3.31, 3.25, 0.05)).toBe(false);
    expect(withinTolerance(7, 7, 0)).toBe(true);
    expect(withinTolerance(7.001, 7, 0)).toBe(false);
  });
});

describe("isCorrect (BR-ANS-01)", () => {
  test("multiple choice and true or false compare the encoded response", () => {
    expect(isCorrect(choice, "1")).toBe(true);
    expect(isCorrect(choice, "0")).toBe(false);
    expect(isCorrect(truth, "false")).toBe(true);
    expect(isCorrect(truth, "true")).toBe(false);
  });

  test("a number is right inside the tolerance, with a comma or a point", () => {
    expect(isCorrect(number(), "3.3")).toBe(true);
    expect(isCorrect(number(), "3,3")).toBe(true);
    expect(isCorrect(number(), "3.4")).toBe(false);
    expect(isCorrect(number(), "not a number")).toBe(false);
  });

  test("a minus is not right where the question does not allow one", () => {
    expect(isCorrect(number({ correct: "-2", tolerance: 0, allow_negative: true }), "-2")).toBe(true);
    expect(isCorrect(number({ correct: "2", tolerance: 5, allow_negative: false }), "-2")).toBe(false);
  });
});

describe("timers (BR-TIME-01)", () => {
  test("a recall or true or false question 15 s, multiple choice 25 s, a calculation 45 s", () => {
    expect(defaultTimerSeconds("true_false")).toBe(15);
    expect(defaultTimerSeconds("multiple_choice")).toBe(25);
    expect(defaultTimerSeconds("numeric")).toBe(45);
  });
});

describe("the session ranking (BR-PTS-09, OPEN-20)", () => {
  test("best first, and a tie shares a rank and skips the next", () => {
    const rows = rankRows([
      { student_id: "a", name: "Ана", points: 30 },
      { student_id: "b", name: "Борис", points: 45 },
      { student_id: "c", name: "Виктор", points: 30 },
      { student_id: "d", name: "Гоце", points: 12 },
    ]);
    expect(rows.map((r) => [r.student_id, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });
});

describe("the practice set (BR-PRA-01)", () => {
  const c = (id: string, order: number, missed: number, over: Partial<PracticeCandidate> = {}): PracticeCandidate => ({
    id,
    order,
    skipped: false,
    joined: 20,
    missed,
    ...over,
  });

  test("holds the questions missed by at least 40% of those who joined, in lesson order", () => {
    expect(selectPracticeQuestions([c("q1", 0, 3), c("q2", 1, 8), c("q3", 2, 12), c("q4", 3, 7)])).toEqual(["q2", "q3"]);
  });

  test("adds the next most missed when fewer than two qualify, but never one nobody missed", () => {
    expect(selectPracticeQuestions([c("q1", 0, 2), c("q2", 1, 10), c("q3", 2, 0), c("q4", 3, 4)])).toEqual(["q2", "q4"]);
    expect(selectPracticeQuestions([c("q1", 0, 0), c("q2", 1, 1), c("q3", 2, 0)])).toEqual(["q2"]);
  });

  test("never holds a skipped question", () => {
    expect(selectPracticeQuestions([c("q1", 0, 15, { skipped: true }), c("q2", 1, 9), c("q3", 2, 10)])).toEqual(["q2", "q3"]);
  });

  test("is empty when nothing was missed", () => {
    expect(selectPracticeQuestions([c("q1", 0, 0), c("q2", 1, 0)])).toEqual([]);
    expect(selectPracticeQuestions([])).toEqual([]);
  });

  test("holds at most eight, the most missed", () => {
    const many = Array.from({ length: 10 }, (_, i) => c(`q${i}`, i, 8 + i));
    const set = selectPracticeQuestions(many);
    expect(set).toHaveLength(PRACTICE_MAX);
    expect(set).toEqual(["q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"]);
  });
});
