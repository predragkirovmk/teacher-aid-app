import type { DraftQuestion, LessonContent, Question, QuestionKind, ReadyDraft, Refinement } from "./api/types";
import { isValidContent, OPTIONS_MAX, OPTIONS_MIN, TIMER_MAX_SECONDS, TIMER_MIN_SECONDS } from "./lessons";
import { defaultTimerSeconds, parseNumeric, QUESTIONS_MAX, QUESTIONS_MIN } from "./scoring";

/**
 * The rules of editing a lesson's questions (F-03 step 5, FR-LES-07): what each change does to the list, and what is wrong with a
 * lesson before it can be saved (BR-Q-04, BR-TIME-05, BR-ANS-04, BR-Q-01). Nothing here touches the browser, so all of it is unit
 * tested. Every change returns a new list; the one that is shown is never changed in place.
 *
 * A draft holds a lesson that is not finished (`DraftQuestion`): an empty prompt, an option left blank, a right answer not yet
 * chosen. Those are not refused as they are typed. They are listed, in plain words and in page order, when the teacher saves.
 */

/** What the teacher edits: the title, the review summary and the questions (FR-LES-07). */
export type DraftContent = { title: string; review_summary: string; questions: DraftQuestion[] };

export const contentOf = (draft: ReadyDraft): DraftContent => ({
  title: draft.title,
  review_summary: draft.review_summary,
  questions: [...draft.questions].sort((a, b) => a.order - b.order),
});

export const KINDS: readonly QuestionKind[] = ["multiple_choice", "true_false", "numeric"];

let made = 0;
/** An id for a question the teacher adds: it must not repeat in the draft, nor with the ones the AI wrote or an earlier visit added. */
export const newQuestionId = (draftId: string): string => `${draftId}-n${Date.now().toString(36)}${++made}`;

// ---- How many questions ---------------------------------------------------------------------------------------

export const canAdd = (count: number): boolean => count < QUESTIONS_MAX;
export const canDelete = (count: number): boolean => count > QUESTIONS_MIN;

const renumber = (questions: readonly DraftQuestion[]): DraftQuestion[] => questions.map((q, order) => (q.order === order ? q : { ...q, order }));

// ---- A question of each kind ----------------------------------------------------------------------------------

/** A question with nothing in it yet, of the kind the teacher chose, with the timer that kind usually takes (BR-TIME-01). */
export function blankQuestion(kind: QuestionKind, id: string, order: number, topic: string): DraftQuestion {
  const base = { id, order, prompt: "", media: null, explanation: null, timer_seconds: defaultTimerSeconds(kind), topic };
  switch (kind) {
    case "multiple_choice":
      return { ...base, kind, options: ["", ""], correct: "" };
    case "true_false":
      return { ...base, kind, correct: "" };
    case "numeric":
      return { ...base, kind, correct: "", tolerance: 0, unit: null, allow_negative: false };
  }
}

/**
 * The same question as another kind. The prompt stays, and so do the explanation, the topic, the picture and the position; what
 * belongs to the old kind (the options, the right answer, the tolerance) goes, since it means nothing to the new one. A timer the
 * teacher never set follows the new kind.
 */
export function changeKind(q: DraftQuestion, kind: QuestionKind): DraftQuestion {
  if (q.kind === kind) return q;
  const timer = q.timer_seconds === defaultTimerSeconds(q.kind) ? defaultTimerSeconds(kind) : q.timer_seconds;
  const base = { id: q.id, order: q.order, prompt: q.prompt, media: q.media, explanation: q.explanation, timer_seconds: timer, topic: q.topic };
  return { ...blankQuestion(kind, q.id, q.order, q.topic), ...base };
}

// ---- The list -------------------------------------------------------------------------------------------------

/** A question added at the end. Past the most (BR-Q-02) nothing is added. */
export function addQuestion(questions: readonly DraftQuestion[], kind: QuestionKind, id: string): DraftQuestion[] {
  if (!canAdd(questions.length)) return [...questions];
  // A new question is about what the one before it is about, until the teacher says otherwise.
  const topic = questions[questions.length - 1]?.topic ?? "";
  return [...questions, blankQuestion(kind, id, questions.length, topic)];
}

export type Removed = { question: DraftQuestion; index: number };

/** The list without the question, and what was taken out so that it can be put back. Down to the fewest (BR-Q-02), nothing is removed. */
export function removeQuestion(questions: readonly DraftQuestion[], id: string): { questions: DraftQuestion[]; removed: Removed } | null {
  const index = questions.findIndex((q) => q.id === id);
  if (index < 0 || !canDelete(questions.length)) return null;
  return { questions: renumber(questions.filter((_, i) => i !== index)), removed: { question: questions[index], index } };
}

/** The question put back where it was, or at the end if the list has got shorter. Past the most, nothing is put back. */
export function restoreQuestion(questions: readonly DraftQuestion[], removed: Removed): DraftQuestion[] {
  if (!canAdd(questions.length) || questions.some((q) => q.id === removed.question.id)) return [...questions];
  const at = Math.min(removed.index, questions.length);
  return renumber([...questions.slice(0, at), removed.question, ...questions.slice(at)]);
}

/** A question one place up or down. At either end it stays where it is. */
export function moveQuestion(questions: readonly DraftQuestion[], id: string, direction: "up" | "down"): DraftQuestion[] {
  const from = questions.findIndex((q) => q.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= questions.length) return [...questions];
  const next = [...questions];
  [next[from], next[to]] = [next[to], next[from]];
  return renumber(next);
}

export const replaceQuestion = (questions: readonly DraftQuestion[], next: DraftQuestion): DraftQuestion[] =>
  questions.map((q) => (q.id === next.id ? next : q));

// ---- The answers of a multiple-choice question -----------------------------------------------------------------

type Choice = Extract<DraftQuestion, { kind: "multiple_choice" }>;

export const canAddOption = (q: Choice): boolean => q.options.length < OPTIONS_MAX;
export const canRemoveOption = (q: Choice): boolean => q.options.length > OPTIONS_MIN;

export const setOption = (q: Choice, index: number, text: string): Choice => ({ ...q, options: q.options.map((o, i) => (i === index ? text : o)) });

export const addOption = (q: Choice): Choice => (canAddOption(q) ? { ...q, options: [...q.options, ""] } : q);

/** An answer taken away. If it was the right one, none is right any more; if one before the right one went, the right one moves up with it. */
export function removeOption(q: Choice, index: number): Choice {
  if (!canRemoveOption(q) || index < 0 || index >= q.options.length) return q;
  const right = q.correct === "" ? -1 : Number(q.correct);
  const correct = right === index ? "" : right > index ? String(right - 1) : q.correct;
  return { ...q, options: q.options.filter((_, i) => i !== index), correct };
}

// ---- Numbers the teacher types ---------------------------------------------------------------------------------

/** A whole number of up to four digits, or null: the timer. Whether it is in range is a problem of the question, not of the typing. */
export function parseWhole(text: string): number | null {
  const s = text.trim();
  return /^\d{1,4}$/.test(s) ? Number(s) : null;
}

/** The tolerance: a number of zero or more (BR-ANS-03), a comma or a point, or null. */
export function parseTolerance(text: string): number | null {
  const n = parseNumeric(text);
  return n !== null && n >= 0 ? n : null;
}

/** A number as the API holds it (3.2): a point for the comma, and a zero before a bare point ("-,5" is "-0.5"). */
export function normalizeNumber(text: string): string {
  return text.trim().replace(",", ".").replace(/^(-?)\./, "$10.");
}

/** The timer moved by `by` seconds, kept inside the range (BR-TIME-05). */
export const nudgeTimer = (seconds: number, by: number): number => Math.min(TIMER_MAX_SECONDS, Math.max(TIMER_MIN_SECONDS, Math.round(seconds) + by));

/** What the teacher typed that is not a number yet, per question; kept apart from the draft, which holds only numbers. */
export type RawText = Record<string, { timer?: string; tolerance?: string }>;

// ---- What is wrong before it can be saved ----------------------------------------------------------------------

/** The place a problem is at, which is where the focus goes when the teacher follows it. */
export type Field = "title" | "add" | "prompt" | "right" | "answer" | "tolerance" | "timer" | `option-${number}`;

export type ProblemCode =
  | "title_empty"
  | "count_low"
  | "count_high"
  | "prompt_empty"
  | "option_empty"
  | "correct_none"
  | "answer_empty"
  | "answer_number"
  | "answer_negative"
  | "tolerance_number"
  | "timer_number"
  | "timer_range";

export type Problem = {
  code: ProblemCode;
  /** The question it is about, or null for the title and the number of questions. */
  question: string | null;
  /** The question's place in the list, from 1, for the words. */
  n: number | null;
  /** Which answer (from 1) when it is about one. */
  option: number | null;
  /** How many questions there are, for the count. */
  count: number | null;
  field: Field;
};

const problem = (code: ProblemCode, field: Field, q?: DraftQuestion, n?: number, extra: Partial<Pick<Problem, "option" | "count">> = {}): Problem => ({
  code,
  question: q?.id ?? null,
  n: n ?? null,
  option: extra.option ?? null,
  count: extra.count ?? null,
  field,
});

/** What is wrong with one question, in the order its fields are on the screen. `n` is its place in the list, from 1. */
export function questionProblems(q: DraftQuestion, n: number, raw: RawText[string] = {}): Problem[] {
  const out: Problem[] = [];
  if (!q.prompt.trim()) out.push(problem("prompt_empty", "prompt", q, n));
  switch (q.kind) {
    case "multiple_choice":
      q.options.forEach((o, i) => {
        if (!o.trim()) out.push(problem("option_empty", `option-${i}`, q, n, { option: i + 1 }));
      });
      // Exactly one is right (BR-Q-01): the choice allows only one, so what can be wrong is that none is.
      if (!/^\d$/.test(q.correct) || Number(q.correct) >= q.options.length) out.push(problem("correct_none", "right", q, n));
      break;
    case "true_false":
      if (q.correct !== "true" && q.correct !== "false") out.push(problem("correct_none", "right", q, n));
      break;
    case "numeric": {
      const answer = parseNumeric(q.correct);
      if (!q.correct.trim()) out.push(problem("answer_empty", "answer", q, n));
      else if (answer === null) out.push(problem("answer_number", "answer", q, n));
      // BR-ANS-04: a right answer below zero on a question that takes no minus could never be given.
      else if (answer < 0 && !q.allow_negative) out.push(problem("answer_negative", "answer", q, n));
      if (raw.tolerance !== undefined || !(q.tolerance >= 0)) out.push(problem("tolerance_number", "tolerance", q, n));
      break;
    }
  }
  if (raw.timer !== undefined || !Number.isInteger(q.timer_seconds)) out.push(problem("timer_number", "timer", q, n));
  else if (q.timer_seconds < TIMER_MIN_SECONDS || q.timer_seconds > TIMER_MAX_SECONDS) out.push(problem("timer_range", "timer", q, n));
  return out;
}

/** Everything wrong with a lesson, top to bottom as the page is: the title, the number of questions, then each question. */
export function contentProblems(content: DraftContent, raw: RawText = {}): Problem[] {
  const out: Problem[] = [];
  if (!content.title.trim()) out.push(problem("title_empty", "title"));
  const count = content.questions.length;
  if (count < QUESTIONS_MIN) out.push(problem("count_low", "add", undefined, undefined, { count }));
  if (count > QUESTIONS_MAX) out.push(problem("count_high", "add", undefined, undefined, { count }));
  content.questions.forEach((q, i) => out.push(...questionProblems(q, i + 1, raw[q.id])));
  return out;
}

/**
 * The lesson as `POST /lessons` and `PUT /lessons/{id}` take it: trimmed, numbers written the API's way, the order from 1 in
 * the list. Null while anything is wrong; the check is the one the server makes (`isValidContent`), so a lesson that passes
 * here is not refused there.
 */
export function lessonOf(content: DraftContent, raw: RawText = {}): LessonContent | null {
  if (contentProblems(content, raw).length > 0) return null;
  const questions = content.questions.map((q, order): Question => {
    const base = { id: q.id, order, prompt: q.prompt.trim(), media: q.media, explanation: q.explanation?.trim() || null, timer_seconds: q.timer_seconds, topic: q.topic.trim() };
    switch (q.kind) {
      case "multiple_choice":
        return { ...base, kind: q.kind, options: q.options.map((o) => o.trim()), correct: q.correct };
      case "true_false":
        return { ...base, kind: q.kind, correct: q.correct as "true" | "false" };
      case "numeric":
        return { ...base, kind: q.kind, correct: normalizeNumber(q.correct), tolerance: q.tolerance, unit: q.unit?.trim() || null, allow_negative: q.allow_negative };
    }
  });
  const lesson = { title: content.title.trim(), review_summary: content.review_summary.trim(), questions };
  return isValidContent(lesson) ? lesson : null;
}

// ---- Refinements -----------------------------------------------------------------------------------------------

export const REFINEMENTS: readonly Refinement[] = ["easier", "harder", "more_questions", "shorter_timers"];

/** "Повеќе прашања" has nothing to add to a lesson that already has the most (BR-Q-02). */
export const canRefine = (refinement: Refinement, count: number): boolean => refinement !== "more_questions" || canAdd(count);

/** Whether the lesson was edited after the refinement made it: going back to the draft before would lose those edits. */
export const editedSince = (draft: { created_at: string; updated_at: string }): boolean => draft.updated_at !== draft.created_at;
