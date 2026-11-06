import type { ConsoleQuestion, MissedQuestion, QuestionKind } from "./api/types";
import { optionLetter } from "./questions";

/**
 * The review of a lesson (FR-REV-01, FR-REV-02): which questions the class missed most, in what order, and how the review is cut into the
 * screens the projector shows one after another. Pure, so it is unit tested.
 */

/** The most-missed questions the review shows: the five worst. Fewer is a shorter lesson, not a smaller review. */
export const REVIEW_MISSED_MAX = 5;
/** The anonymous questions on one screen of the projector: they are read aloud, so only a few at a time. */
export const ANON_PER_SCREEN = 3;

/** The share of the class that missed a question, 0 to 1. */
export const missedShare = (m: Pick<MissedQuestion, "missed" | "joined">): number => (m.joined > 0 ? m.missed / m.joined : 0);

/** Worst first: the larger share, then the larger number, then the earlier question. Only a question somebody missed is in it (FR-REV-01). */
export function rankMissed(list: readonly MissedQuestion[]): MissedQuestion[] {
  return list
    .filter((m) => m.missed > 0 && m.joined > 0)
    .sort((a, b) => missedShare(b) - missedShare(a) || b.missed - a.missed || a.order - b.order);
}

/**
 * The most-missed questions of a lesson that is running, from the console's questions. A question that was skipped, was never sent or is still
 * open has no result and is left out; one whose time is up counts whether or not its answer has been shown. An empty topic is the lesson's title (BR-TOP-03).
 */
export function missedOfQuestions(questions: readonly ConsoleQuestion[], lessonTitle: string): MissedQuestion[] {
  const out: MissedQuestion[] = [];
  for (const q of questions) {
    if ((q.status !== "closed" && q.status !== "revealed") || !q.counts) continue;
    const question = q.question;
    out.push({
      session_question_id: q.id,
      order: question.order,
      prompt: question.prompt,
      kind: question.kind,
      topic: question.topic.trim() || lessonTitle,
      missed: q.counts.wrong + q.counts.unanswered,
      joined: q.joined,
      correct_answer: question.correct,
      explanation: question.explanation,
      options: question.kind === "multiple_choice" ? question.options : null,
      unit: question.kind === "numeric" ? question.unit : null,
    });
  }
  return rankMissed(out);
}

/** The right answer in words: "B. Реку", "Точно", "12,5 cm". `labels` are the words for true and false in the language of the screen. */
export function correctWords(
  m: { kind: QuestionKind; correct_answer: string; options: string[] | null; unit: string | null },
  labels: { true: string; false: string },
): string {
  if (m.kind === "true_false") return m.correct_answer === "true" ? labels.true : labels.false;
  if (m.kind === "multiple_choice") {
    const at = Number(m.correct_answer);
    return `${optionLetter(at)}. ${m.options?.[at] ?? ""}`;
  }
  return `${m.correct_answer.replace(".", ",")}${m.unit ? ` ${m.unit}` : ""}`;
}

/** One screen of the projector's review. */
export type ReviewScreen =
  | { kind: "none_missed" }
  | { kind: "missed"; item: MissedQuestion; n: number; of: number }
  | { kind: "anon"; items: { id: string; text: string }[]; from: number; to: number; of: number };

/**
 * The review cut into screens the teacher steps through from the console: one most-missed question each, worst first, then the anonymous questions
 * a few at a time. With nothing missed the first screen says so, and the anonymous questions follow; with neither there is that one screen.
 */
export function reviewScreens(missed: readonly MissedQuestion[], anon: readonly { id: string; text: string }[]): ReviewScreen[] {
  const shown = missed.slice(0, REVIEW_MISSED_MAX);
  const screens: ReviewScreen[] = shown.length === 0 ? [{ kind: "none_missed" }] : shown.map((item, i) => ({ kind: "missed", item, n: i + 1, of: shown.length }));
  for (let from = 0; from < anon.length; from += ANON_PER_SCREEN) {
    const items = anon.slice(from, from + ANON_PER_SCREEN).map(({ id, text }) => ({ id, text }));
    screens.push({ kind: "anon", items, from: from + 1, to: from + items.length, of: anon.length });
  }
  return screens;
}

/** A screen number that exists: the position is clamped, so a review that got shorter never points past its end. */
export const clampScreen = (at: number, screens: readonly unknown[]): number => Math.min(Math.max(0, Math.floor(at) || 0), Math.max(0, screens.length - 1));
