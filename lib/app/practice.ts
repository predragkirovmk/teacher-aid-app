import type { Id, PracticeAttempt, PracticeSet, PracticeVerdict } from "./api/types";

/**
 * Practice sets (spec F-12, 7.12): optional questions the teacher sends after a lesson, answered at the
 * student's own pace. This file is the pure part: what a set looks like to the student (new, started, done),
 * and where an answer has got to. The server owns the right answers; practice gives no points (BR-PTS-03); the phone owns the
 * answers it has saved but not yet delivered. Both are folded into one view here, so the screen can resume
 * where the student left off, whichever side holds the progress.
 */

/** A set with no answer yet, one the student has started, one they have finished. */
export type PracticeStatus = "new" | "started" | "done";

export function practiceStatus(set: Pick<PracticeSet, "questions" | "completedAt">): PracticeStatus {
  if (set.completedAt !== null) return "done";
  return set.questions.some((q) => q.answer !== null) ? "started" : "new";
}

/** How many of the set's questions the server has an answer to. */
export const answeredIn = (set: Pick<PracticeSet, "questions">) => set.questions.filter((q) => q.answer !== null).length;

/** The sets still worth offering: not done. Newest first, as the server lists them. */
export const openSets = <T extends Pick<PracticeSet, "questions" | "completedAt">>(sets: T[]) => sets.filter((s) => practiceStatus(s) !== "done");

/** A verdict the server gave in this session of the app that the set the app holds does not carry yet. */
export type LocalVerdict = { response: string; verdict: PracticeVerdict };

export type QuestionState =
  /** Not answered. */
  | { status: "open" }
  /** Answered and saved on the phone; the server has not said whether it is right (no connection, or still on its way). */
  | { status: "saved"; response: string }
  /** Answered, and the server has said. */
  | { status: "checked"; response: string; verdict: PracticeVerdict };

export type PracticeView = {
  items: QuestionState[];
  /** The first question with no answer, where the student carries on; null when every question has one. */
  next: number | null;
  /** Questions answered, saved or checked. */
  answered: number;
  checked: number;
  /** Right among the checked ones. */
  right: number;
  /** Every question is answered and the server has said so for each: the set is done. */
  finished: boolean;
  /** Every question is answered, but some verdicts are still to come. */
  waiting: boolean;
};

/**
 * Fold what the server holds, what it said a moment ago, and what the phone has saved into one view. For a question the
 * server's own record wins, then a verdict it gave in this session, then an answer saved on the phone. `pending` and
 * `local` are keyed by question id.
 */
export function practiceView(set: PracticeSet, pending: Record<Id, string>, local: Record<Id, LocalVerdict>): PracticeView {
  const items = set.questions.map((q): QuestionState => {
    if (q.answer) return { status: "checked", response: q.answer.response, verdict: q.answer };
    const told = local[q.id];
    if (told) return { status: "checked", response: told.response, verdict: told.verdict };
    const saved = pending[q.id];
    if (saved !== undefined) return { status: "saved", response: saved };
    return { status: "open" };
  });
  const next = items.findIndex((i) => i.status === "open");
  const checked = items.filter((i) => i.status === "checked");
  const right = checked.filter((i) => i.status === "checked" && i.verdict.correct).length;
  const answered = items.length - items.filter((i) => i.status === "open").length;
  return {
    items,
    next: next < 0 ? null : next,
    answered,
    checked: checked.length,
    right,
    finished: items.length > 0 && checked.length === items.length,
    waiting: items.length > 0 && answered === items.length && checked.length < items.length,
  };
}

/** The verdicts of an attempt as the app keeps them until the set is read again. */
export function localVerdicts(attempt: PracticeAttempt, responses: Record<Id, string>): Record<Id, LocalVerdict> {
  const out: Record<Id, LocalVerdict> = {};
  for (const r of attempt.results) {
    const response = responses[r.questionId];
    if (response === undefined) continue;
    out[r.questionId] = { response, verdict: { correct: r.correct, correctAnswer: r.correctAnswer, explanation: r.explanation } };
  }
  return out;
}
