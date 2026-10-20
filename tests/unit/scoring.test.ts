import { describe, expect, it } from "vitest";
import {
  CLASSMATES,
  CORRECT_POINTS,
  DURATION,
  QUIZZES,
  SPEED_POINTS,
  initial,
  rankOf,
  reducer,
  speedBonus,
  type State,
} from "@/lib/app/api/mock/quiz";

// Spec 13.1: 10 for a right answer plus up to 5 for speed; a wrong or missing answer earns nothing.
const quiz = QUIZZES.math!;
const first = quiz.questions[0];
const dur = DURATION[first.kind];
const run = reducer(quiz);
const OPENED = 1_000;

/** The first question open, no classmate right yet, and nobody about to answer before the clock runs out. */
const open = (over: Partial<State> = {}): State => ({
  ...initial(),
  stage: "question",
  index: 0,
  stageAt: OPENED,
  now: OPENED,
  joined: CLASSMATES.length,
  answerAt: CLASSMATES.map(() => dur + 5_000),
  rightness: CLASSMATES.map(() => false),
  ...over,
});

const wrong = ((first.answer + 1) % 2) as 0 | 1;
const right = first.answer;

/** Answer after `afterMs` of the question, then let the clock run out. */
function answered(option: number, afterMs: number, over: Partial<State> = {}) {
  const picked = run(open(over), { type: "pick", option, now: OPENED + afterMs });
  return run(picked, { type: "tick", now: OPENED + dur });
}

describe("the points", () => {
  it("are 10 and 5", () => {
    expect([CORRECT_POINTS, SPEED_POINTS]).toEqual([10, 5]);
  });

  it("give the whole speed bonus for an instant answer, none at the buzzer, and round in between", () => {
    expect(speedBonus(dur, dur)).toBe(5);
    expect(speedBonus(0, dur)).toBe(0);
    expect(speedBonus(dur / 2, dur)).toBe(3);
    expect(speedBonus(dur / 4, dur)).toBe(1);
    expect(speedBonus(dur * 0.9, dur)).toBe(5);
  });
});

describe("answering a question", () => {
  it("earns 15 for a right answer at once", () => {
    const s = answered(right, 0);
    expect(s).toMatchObject({ stage: "reveal", correct: true, bonus: 5, gain: 15, mine: 15, right: 1 });
  });

  it("earns less bonus the later the answer", () => {
    const half = answered(right, dur / 2);
    expect(half).toMatchObject({ bonus: 3, gain: 13, mine: 13 });
    const late = answered(right, dur - 1);
    expect(late).toMatchObject({ bonus: 0, gain: 10 });
  });

  it("earns nothing for a wrong answer, however fast", () => {
    const s = answered(wrong, 0);
    expect(s).toMatchObject({ stage: "reveal", correct: false, bonus: 0, gain: 0, mine: 0, right: 0 });
  });

  it("earns nothing for no answer", () => {
    const s = run(open(), { type: "tick", now: OPENED + dur });
    expect(s).toMatchObject({ stage: "reveal", picked: null, correct: false, gain: 0, mine: 0 });
  });

  it("keeps the first answer: a second pick changes nothing", () => {
    const once = run(open(), { type: "pick", option: wrong, now: OPENED + 100 });
    const twice = run(once, { type: "pick", option: right, now: OPENED + 200 });
    expect(twice).toBe(once);
    expect(run(twice, { type: "tick", now: OPENED + dur })).toMatchObject({ correct: false, gain: 0 });
  });

  it("refuses an answer once the question has closed", () => {
    const closed = run(open(), { type: "tick", now: OPENED + dur });
    expect(run(closed, { type: "pick", option: right, now: OPENED + dur + 1 })).toBe(closed);
  });

  it("adds to the points already earned", () => {
    const s = answered(right, 0, { mine: 30, right: 2 });
    expect(s.mine).toBe(45);
    expect(s.right).toBe(3);
  });

  it("closes early when the student and everyone else have answered", () => {
    const picked = run(open({ answerAt: CLASSMATES.map(() => 500) }), { type: "pick", option: right, now: OPENED + 1_000 });
    const s = run(picked, { type: "tick", now: OPENED + 2_000 });
    expect(s.stage).toBe("reveal");
  });

  it("keeps the question open while a classmate has not answered", () => {
    const picked = run(open(), { type: "pick", option: right, now: OPENED + 1_000 });
    const s = run(picked, { type: "tick", now: OPENED + 2_000 });
    expect(s.stage).toBe("question");
  });

  it("scores the classmates by the same rule", () => {
    const s = run(
      open({
        rightness: CLASSMATES.map((_, i) => i < 3),
        answerAt: CLASSMATES.map((_, i) => (i === 0 ? 0 : i === 1 ? dur / 2 : dur)),
      }),
      { type: "tick", now: OPENED + dur },
    );
    expect(s.theirs.slice(0, 4)).toEqual([15, 13, 10, 0]);
  });

  it("remembers where the student stood before this question", () => {
    const s = answered(right, 0, { theirs: CLASSMATES.map(() => 12) });
    expect(s.rankBefore).toBe(CLASSMATES.length + 1);
    expect(rankOf(s.mine, s.theirs)).toBe(1);
  });
});

describe("rank", () => {
  it("is one plus the number of classmates strictly ahead, so a tie goes to the student", () => {
    expect(rankOf(10, [20, 15, 10, 5])).toBe(3);
    expect(rankOf(10, [10, 10])).toBe(1);
    expect(rankOf(0, [])).toBe(1);
    expect(rankOf(0, [1, 2, 3])).toBe(4);
  });
});

describe("the quizzes", () => {
  it("have a title and a right answer inside the options, in both languages", () => {
    const quizzes = Object.values(QUIZZES);
    expect(quizzes.length).toBeGreaterThanOrEqual(4);
    for (const q of quizzes) {
      expect(q!.title.mk && q!.title.en).toBeTruthy();
      expect(q!.questions.length).toBeGreaterThan(0);
      for (const question of q!.questions) {
        expect(question.text.mk && question.text.en).toBeTruthy();
        if (question.kind === "mc") {
          expect(question.options).toHaveLength(4);
          question.options.forEach((o) => expect(o.mk && o.en).toBeTruthy());
          expect([0, 1, 2, 3]).toContain(question.answer);
        } else {
          expect([0, 1]).toContain(question.answer);
        }
      }
    }
  });

  it("give a question 20 seconds, a true-or-false 15", () => {
    expect(DURATION).toEqual({ mc: 20_000, tf: 15_000 });
  });
});
