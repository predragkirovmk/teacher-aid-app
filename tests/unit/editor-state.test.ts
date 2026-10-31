import { describe, expect, test } from "vitest";
import type { DraftQuestion, ReadyDraft } from "@/lib/teacher/api/types";
import { BANK, bankQuestions } from "@/lib/teacher/api/mock-bank";
import { hasUnfinishedNumber, initialState, isEmptyPatch, patchOf, reduce, type EditorAction, type EditorState } from "@/lib/teacher/editor-state";
import { contentOf } from "@/lib/teacher/editor";

const draft = (n = 6): ReadyDraft =>
  ({
    id: "d1",
    status: "ready",
    title: "Низи",
    review_summary: "Резиме",
    questions: BANK.flatMap((b, i) => bankQuestions(b, `b${i}`)).slice(0, n).map((q, order) => ({ ...q, order })),
  }) as ReadyDraft;

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(reduce, state);
const start = (n = 6) => initialState(draft(n));
const first = (s: EditorState) => s.content.questions[0];

describe("the editor's state", () => {
  test("starts with the draft's lesson, nothing open, nothing deleted", () => {
    const s = start();
    expect(s).toMatchObject({ open: null, removed: null, adding: false, raw: {} });
    expect(s.content.title).toBe("Низи");
    expect(s.content.questions).toHaveLength(6);
  });

  test("a change that changes nothing is the same state, so there is nothing to save", () => {
    const s = start();
    expect(reduce(s, { type: "title", text: "Низи" })).toBe(s);
    expect(reduce(s, { type: "summary", text: "Резиме" })).toBe(s);
    expect(reduce(s, { type: "close" })).toBe(s);
    expect(reduce(s, { type: "choosing", on: false })).toBe(s);
    expect(reduce(s, { type: "delete", id: "nope" })).toBe(s);
    expect(reduce(s, { type: "restore" })).toBe(s);
    expect(reduce(s, { type: "move", id: first(s).id, direction: "up" })).toBe(s);
    expect(reduce(s, { type: "timer", id: first(s).id, text: String(first(s).timer_seconds) })).toBe(s);
    expect(reduce(s, { type: "kind", id: first(s).id, kind: first(s).kind })).toBe(s);
  });

  test("a change makes a new lesson and leaves the old one as it was", () => {
    const s = start();
    const before = JSON.stringify(s.content);
    const next = reduce(s, { type: "title", text: "Нов" });
    expect(next.content).not.toBe(s.content);
    expect(next.content.title).toBe("Нов");
    expect(next.content.questions).toBe(s.content.questions);
    expect(JSON.stringify(s.content)).toBe(before);
  });

  test("one question is open at a time", () => {
    const s = start();
    const [a, b] = s.content.questions;
    expect(run(s, { type: "open", id: a.id }).open).toBe(a.id);
    expect(run(s, { type: "open", id: a.id }, { type: "open", id: b.id }).open).toBe(b.id);
    expect(run(s, { type: "open", id: a.id }, { type: "close" }).open).toBeNull();
  });
});

describe("editing a question", () => {
  test("a question is replaced by id and the rest are left alone", () => {
    const s = start();
    const q = first(s);
    const next = reduce(s, { type: "question", question: { ...q, prompt: "Друго?" } });
    expect(first(next).prompt).toBe("Друго?");
    expect(next.content.questions[1]).toBe(s.content.questions[1]);
  });

  test("a timer that is a number goes into the draft; one that is not stays in the box and in no draft", () => {
    const s = start();
    const q = first(s);
    const typing = run(s, { type: "timer", id: q.id, text: "4x" });
    expect(typing.content).toBe(s.content);
    expect(typing.raw).toEqual({ [q.id]: { timer: "4x" } });
    expect(hasUnfinishedNumber(typing.raw)).toBe(true);
    const fixed = reduce(typing, { type: "timer", id: q.id, text: "40" });
    expect(first(fixed).timer_seconds).toBe(40);
    expect(fixed.raw).toEqual({});
    expect(hasUnfinishedNumber(fixed.raw)).toBe(false);
  });

  test("an out-of-range timer is still a number: it goes in, and is a problem when the lesson is saved", () => {
    const s = start();
    expect(first(run(s, { type: "timer", id: first(s).id, text: "3" })).timer_seconds).toBe(3);
  });

  test("the tolerance works the same way and only for a numeric question", () => {
    const s = start();
    const numeric = s.content.questions.find((q) => q.kind === "numeric")!;
    const choice = s.content.questions.find((q) => q.kind === "multiple_choice")!;
    const typing = run(s, { type: "tolerance", id: numeric.id, text: "0," });
    expect(typing.raw[numeric.id]).toEqual({ tolerance: "0," });
    const fixed = reduce(typing, { type: "tolerance", id: numeric.id, text: "0,5" });
    expect(fixed.content.questions.find((q) => q.id === numeric.id)).toMatchObject({ tolerance: 0.5 });
    expect(fixed.raw).toEqual({});
    expect(reduce(s, { type: "tolerance", id: choice.id, text: "1" })).toBe(s);
  });

  test("changing the kind forgets what was typed for the old one", () => {
    const s = start();
    const numeric = s.content.questions.find((q) => q.kind === "numeric")!;
    const typing = run(s, { type: "tolerance", id: numeric.id, text: "x" });
    const changed = reduce(typing, { type: "kind", id: numeric.id, kind: "true_false" });
    expect(changed.raw).toEqual({});
    expect(changed.content.questions.find((q) => q.id === numeric.id)).toMatchObject({ kind: "true_false", correct: "", prompt: numeric.prompt });
  });
});

describe("the list", () => {
  test("a question moves, and the list is renumbered", () => {
    const s = start();
    const q = first(s);
    const next = reduce(s, { type: "move", id: q.id, direction: "down" });
    expect(next.content.questions[1].id).toBe(q.id);
    expect(next.content.questions.map((x) => x.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("deleting remembers the question for one undo, and brings it back where it was", () => {
    const s = start();
    const q = s.content.questions[2];
    const gone = reduce(s, { type: "delete", id: q.id });
    expect(gone.content.questions).toHaveLength(5);
    expect(gone.removed).toEqual({ question: q, index: 2 });
    const back = reduce(gone, { type: "restore" });
    expect(back.content.questions.map((x) => x.id)).toEqual(s.content.questions.map((x) => x.id));
    expect(back.removed).toBeNull();
    expect(back.open).toBe(q.id);
  });

  test("the last question that may go does not: five stay", () => {
    const s = start(5);
    expect(reduce(s, { type: "delete", id: first(s).id })).toBe(s);
  });

  test("an open question that is deleted closes, and what was typed for it is forgotten", () => {
    const s = start();
    const q = first(s);
    const next = run(s, { type: "open", id: q.id }, { type: "timer", id: q.id, text: "zz" }, { type: "delete", id: q.id });
    expect(next.open).toBeNull();
    expect(next.raw).toEqual({});
  });

  test("only the last deletion can be undone: moving or adding afterwards forgets it", () => {
    const s = start(7);
    const gone = reduce(s, { type: "delete", id: first(s).id });
    expect(reduce(gone, { type: "move", id: gone.content.questions[0].id, direction: "down" }).removed).toBeNull();
    expect(reduce(gone, { type: "add", kind: "true_false", id: "n1" }).removed).toBeNull();
    const twice = reduce(gone, { type: "delete", id: gone.content.questions[0].id });
    expect(twice.removed?.question.id).toBe(gone.content.questions[0].id);
  });

  test("a question is added at the end, opened, with the choice of kind closed; past eight nothing is added", () => {
    const s = run(start(), { type: "choosing", on: true });
    expect(s.adding).toBe(true);
    const next = reduce(s, { type: "add", kind: "numeric", id: "n1" });
    expect(next.content.questions).toHaveLength(7);
    expect(next.content.questions.at(-1)).toMatchObject({ id: "n1", kind: "numeric", prompt: "" });
    expect(next).toMatchObject({ open: "n1", adding: false });
    const eight = run(start(8));
    expect(reduce(eight, { type: "add", kind: "numeric", id: "n2" })).toBe(eight);
  });

  test("opening a question closes the choice of kind", () => {
    const s = run(start(), { type: "choosing", on: true });
    expect(reduce(s, { type: "open", id: first(s).id }).adding).toBe(false);
  });
});

describe("what is sent to the draft", () => {
  test("only the parts that changed", () => {
    const s = start();
    const sent = s.content;
    expect(isEmptyPatch(patchOf(sent, s.content))).toBe(true);
    expect(patchOf(sent, reduce(s, { type: "title", text: "Нов" }).content)).toEqual({ title: "Нов" });
    expect(patchOf(sent, reduce(s, { type: "summary", text: "Ново" }).content)).toEqual({ review_summary: "Ново" });
    const moved = reduce(s, { type: "move", id: first(s).id, direction: "down" }).content;
    expect(Object.keys(patchOf(sent, moved))).toEqual(["questions"]);
  });

  test("a change undone to the text the draft has is no change", () => {
    const s = start();
    const there = reduce(s, { type: "question", question: { ...first(s), prompt: "Друго?" } });
    const back = reduce(there, { type: "question", question: first(s) });
    expect(back.content).not.toBe(s.content);
    expect(isEmptyPatch(patchOf(s.content, back.content))).toBe(true);
  });

  test("the whole list is sent when any question changed, in order, so the draft is the lesson as the teacher sees it", () => {
    const s = start();
    const next = reduce(s, { type: "question", question: { ...first(s), prompt: "Друго?" } as DraftQuestion });
    expect(patchOf(s.content, next.content).questions).toHaveLength(6);
    expect(contentOf(draft()).questions).toEqual(s.content.questions);
  });
});
