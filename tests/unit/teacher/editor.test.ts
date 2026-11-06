import { describe, expect, test } from "vitest";
import type { DraftQuestion, Question, ReadyDraft } from "@/lib/teacher/api/types";
import { BANK, bankQuestions } from "@/lib/teacher/api/mock-bank";
import {
  addOption,
  addQuestion,
  blankQuestion,
  canAdd,
  canDelete,
  canRefine,
  changeKind,
  contentOf,
  contentProblems,
  editedSince,
  lessonOf,
  moveQuestion,
  normalizeNumber,
  nudgeTimer,
  parseTolerance,
  parseWhole,
  questionProblems,
  removeOption,
  removeQuestion,
  restoreQuestion,
  setOption,
  type DraftContent,
} from "@/lib/teacher/editor";
import { isValidContent } from "@/lib/teacher/lessons";

/** The first `n` questions of the demo lessons, put one after the other (a single lesson has five to seven). */
const questions = (n = 6): Question[] => BANK.flatMap((b, i) => bankQuestions(b, `b${i}`)).slice(0, n).map((q, order) => ({ ...q, order }));
const content = (patch: Partial<DraftContent> = {}): DraftContent => ({ title: "Низи", review_summary: "Резиме.", questions: questions(), ...patch });

const mc = (patch: Record<string, unknown> = {}): DraftQuestion => ({ ...blankQuestion("multiple_choice", "q-mc", 0, "Тема"), prompt: "Прашање?", options: ["а", "б", "в"], correct: "1", ...patch }) as DraftQuestion;
const tf = (patch: Record<string, unknown> = {}): DraftQuestion => ({ ...blankQuestion("true_false", "q-tf", 1, "Тема"), prompt: "Точно?", correct: "true", ...patch }) as DraftQuestion;
const num = (patch: Record<string, unknown> = {}): DraftQuestion => ({ ...blankQuestion("numeric", "q-num", 2, "Тема"), prompt: "Колку?", correct: "12", ...patch }) as DraftQuestion;

const codes = (q: DraftQuestion, raw = {}) => questionProblems(q, 1, raw).map((p) => p.code);

describe("how many questions (BR-Q-02)", () => {
  test("up to eight may be added, down to five may be deleted", () => {
    expect([4, 5, 7, 8].map(canAdd)).toEqual([true, true, true, false]);
    expect([4, 5, 6, 8].map(canDelete)).toEqual([false, false, true, true]);
  });

  test("a question is added at the end, of the kind chosen, about what the one before it is about, and open to be written", () => {
    const list = questions(5);
    const added = addQuestion(list, "numeric", "new-1");
    expect(added).toHaveLength(6);
    expect(added[5]).toMatchObject({ id: "new-1", order: 5, kind: "numeric", prompt: "", correct: "", tolerance: 0, unit: null, allow_negative: false, topic: list[4].topic });
    expect(added.slice(0, 5)).toEqual(list);
  });

  test("past eight nothing is added", () => {
    const eight = questions(8);
    expect(addQuestion(eight, "true_false", "n")).toEqual(eight);
  });

  test("each kind starts with its own empty fields and the timer that kind usually takes (BR-TIME-01)", () => {
    expect(blankQuestion("multiple_choice", "a", 0, "T")).toMatchObject({ options: ["", ""], correct: "", timer_seconds: 25 });
    expect(blankQuestion("true_false", "a", 0, "T")).toMatchObject({ correct: "", timer_seconds: 15 });
    expect(blankQuestion("numeric", "a", 0, "T")).toMatchObject({ correct: "", timer_seconds: 45 });
  });
});

describe("deleting and bringing back", () => {
  test("a question is taken out and renumbered, and what was taken out can be put back where it was", () => {
    const list = questions();
    const out = removeQuestion(list, list[2].id)!;
    expect(out.questions).toHaveLength(list.length - 1);
    expect(out.questions.map((q) => q.order)).toEqual(out.questions.map((_, i) => i));
    expect(out.removed).toEqual({ question: list[2], index: 2 });
    const back = restoreQuestion(out.questions, out.removed);
    expect(back.map((q) => q.id)).toEqual(list.map((q) => q.id));
    expect(back.map((q) => q.order)).toEqual(back.map((_, i) => i));
  });

  test("down to five and no further: the fifth is not deleted", () => {
    const five = questions(5);
    expect(removeQuestion(five, five[0].id)).toBeNull();
    const six = questions(6);
    expect(removeQuestion(six, six[0].id)).not.toBeNull();
  });

  test("a question that is not in the list is not deleted, and one already back is not put back twice", () => {
    const list = questions();
    expect(removeQuestion(list, "nope")).toBeNull();
    const out = removeQuestion(list, list[0].id)!;
    const back = restoreQuestion(out.questions, out.removed);
    expect(restoreQuestion(back, out.removed)).toEqual(back);
  });

  test("a deleted question comes back at the end when the list has got shorter, and not at all past eight", () => {
    const list = questions(6);
    const out = removeQuestion(list, list[5].id)!;
    const shorter = out.questions.slice(0, 5);
    expect(restoreQuestion(shorter, out.removed).at(-1)?.id).toBe(list[5].id);
    const eight = questions(8);
    expect(restoreQuestion(eight, out.removed)).toEqual(eight);
  });
});

describe("moving a question", () => {
  test("up and down one place, renumbered; at either end it stays", () => {
    const list = questions();
    const down = moveQuestion(list, list[0].id, "down");
    expect(down.map((q) => q.id).slice(0, 2)).toEqual([list[1].id, list[0].id]);
    expect(down.map((q) => q.order)).toEqual(down.map((_, i) => i));
    const up = moveQuestion(down, list[0].id, "up");
    expect(up.map((q) => q.id)).toEqual(list.map((q) => q.id));
    expect(moveQuestion(list, list[0].id, "up").map((q) => q.id)).toEqual(list.map((q) => q.id));
    expect(moveQuestion(list, list.at(-1)!.id, "down").map((q) => q.id)).toEqual(list.map((q) => q.id));
    expect(moveQuestion(list, "nope", "down").map((q) => q.id)).toEqual(list.map((q) => q.id));
  });

  test("the list that was moved is not changed in place", () => {
    const list = questions();
    const copy = JSON.stringify(list);
    moveQuestion(list, list[0].id, "down");
    removeQuestion(list, list[0].id);
    addQuestion(list, "true_false", "n");
    expect(JSON.stringify(list)).toBe(copy);
  });
});

describe("changing the kind of a question", () => {
  test("keeps the prompt, the explanation, the topic and the place; the old kind's fields go", () => {
    const q = { ...mc(), explanation: "Затоа.", topic: "Низи" } as DraftQuestion;
    for (const kind of ["true_false", "numeric"] as const) {
      const changed = changeKind(q, kind);
      expect(changed).toMatchObject({ id: "q-mc", order: 0, kind, prompt: "Прашање?", explanation: "Затоа.", topic: "Низи", correct: "" });
      expect(changed).not.toHaveProperty("options");
    }
    expect(changeKind(q, "numeric")).toMatchObject({ tolerance: 0, unit: null, allow_negative: false });
    expect(changeKind(num(), "multiple_choice")).toMatchObject({ options: ["", ""], correct: "" });
    expect(changeKind(num(), "multiple_choice")).not.toHaveProperty("tolerance");
  });

  test("a timer the teacher never set follows the kind; one they set stays", () => {
    expect(changeKind(mc(), "true_false").timer_seconds).toBe(15);
    expect(changeKind(mc({ timer_seconds: 40 }), "true_false").timer_seconds).toBe(40);
  });

  test("the same kind is the same question", () => {
    const q = mc();
    expect(changeKind(q, "multiple_choice")).toBe(q);
  });
});

describe("the answers of a multiple-choice question (BR-Q-01)", () => {
  const choice = () => mc() as Extract<DraftQuestion, { kind: "multiple_choice" }>;

  test("two to four: one is added up to four, and one is removed down to two", () => {
    let q = choice();
    q = addOption(q);
    expect(q.options).toHaveLength(4);
    expect(addOption(q)).toBe(q);
    q = removeOption(removeOption(q, 3), 2);
    expect(q.options).toEqual(["а", "б"]);
    expect(removeOption(q, 0)).toBe(q);
  });

  test("removing the right answer leaves none right; removing one before it moves it up", () => {
    expect(removeOption(choice(), 1).correct).toBe("");
    expect(removeOption(choice(), 0)).toMatchObject({ options: ["б", "в"], correct: "0" });
    expect(removeOption(choice(), 2)).toMatchObject({ options: ["а", "б"], correct: "1" });
  });

  test("an answer is set by place", () => {
    expect(setOption(choice(), 2, "г").options).toEqual(["а", "б", "г"]);
  });
});

describe("numbers the teacher types", () => {
  test("the timer is a whole number of up to four digits", () => {
    expect(["12", " 45 ", "300", "0", "9999"].map(parseWhole)).toEqual([12, 45, 300, 0, 9999]);
    expect(["", "1.5", "-5", "12 s", "abc", "10000", "1,5"].map(parseWhole)).toEqual([null, null, null, null, null, null, null]);
  });

  test("the tolerance is a number of zero or more, with a comma or a point", () => {
    expect(["0", "0,5", "0.5", ".5", "2"].map(parseTolerance)).toEqual([0, 0.5, 0.5, 0.5, 2]);
    expect(["", "-1", "abc", "1e3", "2,5,1"].map(parseTolerance)).toEqual([null, null, null, null, null]);
  });

  test("the answer is written the API's way: a point, a zero before it", () => {
    expect(["3,5", " 12 ", "-2,5", ".5", "-,5", "7"].map(normalizeNumber)).toEqual(["3.5", "12", "-2.5", "0.5", "-0.5", "7"]);
  });

  test("the timer buttons move it by five and stay inside 5 to 300 (BR-TIME-05)", () => {
    expect(nudgeTimer(25, 5)).toBe(30);
    expect(nudgeTimer(25, -5)).toBe(20);
    expect(nudgeTimer(7, -5)).toBe(5);
    expect(nudgeTimer(5, -5)).toBe(5);
    expect(nudgeTimer(298, 5)).toBe(300);
    expect(nudgeTimer(300, 5)).toBe(300);
  });
});

describe("what is wrong with one question", () => {
  test("a finished question of each kind has nothing wrong", () => {
    expect(codes(mc())).toEqual([]);
    expect(codes(tf())).toEqual([]);
    expect(codes(num())).toEqual([]);
  });

  test("the prompt must be written, and spaces are not words", () => {
    expect(codes(mc({ prompt: "" }))).toEqual(["prompt_empty"]);
    expect(codes(tf({ prompt: "   " }))).toEqual(["prompt_empty"]);
  });

  test("multiple choice: every answer written, and exactly one right (BR-Q-01)", () => {
    expect(codes(mc({ options: ["а", "", "в"] }))).toEqual(["option_empty"]);
    expect(questionProblems(mc({ options: ["", "б", " "] }), 3).map((p) => [p.code, p.option, p.field])).toEqual([
      ["option_empty", 1, "option-0"],
      ["option_empty", 3, "option-2"],
    ]);
    expect(codes(mc({ correct: "" }))).toEqual(["correct_none"]);
    // A right answer that points at an answer that is not there is none.
    expect(codes(mc({ correct: "3" }))).toEqual(["correct_none"]);
  });

  test("true or false: one of them must be chosen", () => {
    expect(codes(tf({ correct: "" }))).toEqual(["correct_none"]);
    expect(codes(tf({ correct: "false" }))).toEqual([]);
  });

  test("numeric: the answer is a number, and a negative one needs the minus key (BR-ANS-03, BR-ANS-04)", () => {
    expect(codes(num({ correct: "" }))).toEqual(["answer_empty"]);
    expect(codes(num({ correct: "двајсет" }))).toEqual(["answer_number"]);
    expect(codes(num({ correct: "3,5" }))).toEqual([]);
    expect(codes(num({ correct: "-3" }))).toEqual(["answer_negative"]);
    expect(codes(num({ correct: "-3", allow_negative: true }))).toEqual([]);
    expect(codes(num({ correct: "-0" }))).toEqual([]);
  });

  test("a tolerance or a timer that is typed and is not a number yet is a problem, whatever the question holds", () => {
    expect(codes(num(), { tolerance: "0," })).toEqual(["tolerance_number"]);
    expect(codes(mc(), { timer: "abc" })).toEqual(["timer_number"]);
    expect(codes(num({ tolerance: -1 }))).toEqual(["tolerance_number"]);
  });

  test("the timer is from 5 to 300 seconds, edges included (BR-TIME-05)", () => {
    for (const ok of [5, 300, 45]) expect(codes(mc({ timer_seconds: ok }))).toEqual([]);
    for (const bad of [4, 301, 0]) expect(codes(mc({ timer_seconds: bad }))).toEqual(["timer_range"]);
    expect(codes(mc({ timer_seconds: 12.5 }))).toEqual(["timer_number"]);
  });

  test("every problem names the field to put the focus on", () => {
    const fields = questionProblems(mc({ prompt: "", options: ["", "б"], correct: "", timer_seconds: 1 }), 1).map((p) => p.field);
    expect(fields).toEqual(["prompt", "option-0", "right", "timer"]);
  });
});

describe("what is wrong with a lesson (BR-Q-04)", () => {
  test("a lesson that is finished has nothing wrong", () => {
    expect(contentProblems(content())).toEqual([]);
  });

  test("the title, then the count, then each question in order", () => {
    const list = questions();
    const broken = [{ ...list[0], prompt: "" }, ...list.slice(1, 4)];
    const found = contentProblems(content({ title: " ", questions: broken as DraftQuestion[] }));
    expect(found.map((p) => p.code)).toEqual(["title_empty", "count_low", "prompt_empty"]);
    expect(found[1]).toMatchObject({ count: 4, field: "add", question: null });
    expect(found[2]).toMatchObject({ n: 1, question: list[0].id });
  });

  test("fewer than 5 and more than 8 are both said", () => {
    const list = questions();
    expect(contentProblems(content({ questions: list.slice(0, 4) })).map((p) => p.code)).toEqual(["count_low"]);
    expect(contentProblems(content({ questions: list.slice(0, 5) }))).toEqual([]);
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...list[0], id: `n${i}`, order: i }));
    expect(contentProblems(content({ questions: nine })).map((p) => p.code)).toEqual(["count_high"]);
  });

  test("a number typed that is not a number yet is found through the question it belongs to", () => {
    const list = questions();
    const found = contentProblems(content(), { [list[1].id]: { timer: "x" } });
    expect(found).toMatchObject([{ code: "timer_number", n: 2, question: list[1].id }]);
  });
});

describe("a lesson as the API takes it", () => {
  test("is trimmed, numbered from the start, and passes the check the server makes", () => {
    const list = questions() as DraftQuestion[];
    const lesson = lessonOf({ title: "  Низи  ", review_summary: "  Резиме  ", questions: list.map((q, i) => ({ ...q, prompt: ` ${q.prompt} `, order: 7 - i })) })!;
    expect(lesson.title).toBe("Низи");
    expect(lesson.review_summary).toBe("Резиме");
    expect(lesson.questions.map((q) => q.order)).toEqual(list.map((_, i) => i));
    expect(lesson.questions.every((q) => q.prompt === q.prompt.trim())).toBe(true);
    expect(isValidContent(lesson)).toBe(true);
  });

  test("numbers are written with a point, an empty unit and an empty explanation are none", () => {
    const list = [num({ correct: "3,5", unit: " ", explanation: "  " }), tf(), mc(), tf({ id: "b" }), tf({ id: "c" })] as DraftQuestion[];
    const lesson = lessonOf(content({ questions: list }))!;
    expect(lesson.questions[0]).toMatchObject({ correct: "3.5", unit: null, explanation: null });
  });

  test("is nothing while anything is wrong", () => {
    expect(lessonOf(content({ title: "" }))).toBeNull();
    expect(lessonOf(content({ questions: questions().slice(0, 4) }))).toBeNull();
    const numeric = questions().find((q) => q.kind === "numeric")!;
    expect(lessonOf(content(), { [numeric.id]: { tolerance: "0," } })).toBeNull();
  });

  test("the content of a ready draft is read in order", () => {
    const list = questions();
    const draft = { title: "Т", review_summary: "Р", questions: [list[1], list[0]] } as ReadyDraft;
    expect(contentOf(draft).questions.map((q) => q.order)).toEqual([0, 1]);
  });
});

describe("refinements", () => {
  test("more questions has nothing to add to a lesson that has eight; the others always can", () => {
    expect(canRefine("more_questions", 7)).toBe(true);
    expect(canRefine("more_questions", 8)).toBe(false);
    for (const r of ["easier", "harder", "shorter_timers"] as const) expect(canRefine(r, 8)).toBe(true);
  });

  test("a draft edited after it was made is known by its two times", () => {
    expect(editedSince({ created_at: "2026-10-31T10:00:00.000Z", updated_at: "2026-10-31T10:00:00.000Z" })).toBe(false);
    expect(editedSince({ created_at: "2026-10-31T10:00:00.000Z", updated_at: "2026-10-31T10:02:00.000Z" })).toBe(true);
  });
});
