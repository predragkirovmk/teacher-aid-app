import { describe, expect, it } from "vitest";
import type { PracticeAttempt, PracticeQuestion, PracticeSet } from "@/lib/app/api/types";
import { answeredIn, localVerdicts, openSets, practiceStatus, practiceView } from "@/lib/app/practice";

const q = (id: string, answer: PracticeQuestion["answer"] = null): PracticeQuestion => ({
  id,
  kind: "multiple_choice",
  prompt: id,
  options: ["a", "b", "c", "d"],
  numeric: null,
  answer,
});
const given = (response: string, correct: boolean) => ({ response, correct, correctAnswer: "1", explanation: null });

const set = (questions: PracticeQuestion[], over: Partial<PracticeSet> = {}): PracticeSet => ({
  id: "ps1",
  sessionId: "s1",
  courseId: "math",
  subjectId: "math",
  lessonTitle: "Fractions",
  createdAt: 1,
  completedAt: null,
  score: null,
  questions,
  ...over,
});

describe("where a set stands", () => {
  it("is new with no answer, started with some, done once finished", () => {
    expect(practiceStatus(set([q("a"), q("b")]))).toBe("new");
    expect(practiceStatus(set([q("a", given("1", true)), q("b")]))).toBe("started");
    expect(practiceStatus(set([q("a", given("1", true)), q("b", given("0", false))], { completedAt: 5 }))).toBe("done");
  });

  it("counts the answers the server holds, and offers only what is not done", () => {
    const started = set([q("a", given("1", true)), q("b")]);
    expect(answeredIn(started)).toBe(1);
    const done = set([q("a", given("1", true))], { id: "ps2", completedAt: 9 });
    expect(openSets([started, done]).map((s) => s.id)).toEqual(["ps1"]);
  });
});

describe("the view of a set while it is answered", () => {
  it("starts at the first question with nothing answered", () => {
    const v = practiceView(set([q("a"), q("b")]), {}, {});
    expect(v).toMatchObject({ next: 0, answered: 0, checked: 0, right: 0, finished: false, waiting: false });
  });

  it("resumes at the first unanswered question from what the server holds", () => {
    const s = set([q("a", given("1", true)), q("b", given("0", false)), q("c"), q("d")]);
    const v = practiceView(s, {}, {});
    expect(v.next).toBe(2);
    expect(v).toMatchObject({ answered: 2, checked: 2, right: 1, finished: false });
  });

  it("resumes past an answer saved on the phone that the server has not confirmed", () => {
    const v = practiceView(set([q("a"), q("b"), q("c")]), { a: "1" }, {});
    expect(v.items[0]).toEqual({ status: "saved", response: "1" });
    expect(v.next).toBe(1);
    expect(v).toMatchObject({ answered: 1, checked: 0 });
  });

  it("prefers the server's record, then a verdict just heard, then the phone's own answer", () => {
    const told = { response: "2", verdict: { correct: false, correctAnswer: "1", explanation: "why" } };
    const v = practiceView(
      set([q("a", given("1", true)), q("b"), q("c")]),
      { a: "0", b: "3", c: "2" },
      { a: { response: "9", verdict: { correct: false, correctAnswer: "0", explanation: null } }, b: told },
    );
    expect(v.items[0]).toMatchObject({ status: "checked", response: "1", verdict: { correct: true } });
    expect(v.items[1]).toMatchObject({ status: "checked", response: "2", verdict: { correct: false, explanation: "why" } });
    expect(v.items[2]).toEqual({ status: "saved", response: "2" });
  });

  it("scores the right answers among the checked ones", () => {
    const attempt: PracticeAttempt = {
      score: 2,
      total: 3,
      completed: true,
      results: [{ questionId: "c", duplicate: false, correct: true, correctAnswer: "2", explanation: null }],
    };
    const v = practiceView(
      set([q("a", given("1", true)), q("b", given("0", false)), q("c")]),
      {},
      localVerdicts(attempt, { c: "2" }),
    );
    expect(v).toMatchObject({ right: 2, checked: 3, finished: true, next: null });
    expect(v).not.toHaveProperty("points");
  });

  it("is waiting, not finished, while every question is answered but some verdicts are still to come", () => {
    const v = practiceView(set([q("a", given("1", true)), q("b")]), { b: "2" }, {});
    expect(v).toMatchObject({ next: null, answered: 2, checked: 1, finished: false, waiting: true });
  });

  it("is never finished with no questions", () => {
    expect(practiceView(set([]), {}, {})).toMatchObject({ finished: false, waiting: false, next: null });
  });
});

describe("verdicts heard from the server", () => {
  const attempt: PracticeAttempt = {
    score: 1,
    total: 2,
    completed: false,
    results: [
      { questionId: "a", duplicate: false, correct: true, correctAnswer: "1", explanation: "because" },
      { questionId: "zz", duplicate: false, correct: false, correctAnswer: "0", explanation: null },
    ],
  };

  it("are kept with the response they were for", () => {
    expect(localVerdicts(attempt, { a: "1" })).toEqual({
      a: { response: "1", verdict: { correct: true, correctAnswer: "1", explanation: "because" } },
    });
  });

  it("skip a result for a question the phone did not ask about", () => {
    expect(Object.keys(localVerdicts(attempt, { a: "1" }))).toEqual(["a"]);
  });
});
