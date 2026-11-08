import type { DraftQuestion, LessonContent, Question } from "./api/types";
import { parseNumeric, QUESTIONS_MAX, QUESTIONS_MIN } from "./scoring";

/** The range a timer may be set to (BR-TIME-02 lets the teacher change it; the limits themselves are PROPOSED). */
export const TIMER_MIN_SECONDS = 5;
export const TIMER_MAX_SECONDS = 300;

/** BR-Q-01: a multiple-choice question has two to four options. */
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 4;

export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isText = (v: unknown): v is string => typeof v === "string";
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Whether a value is a question the API could hold: the shape of its kind (BR-Q-01) and values that mean something.
 * Used to check what the teacher edits before it is saved, and what the demo reads back from the browser.
 */
export function isValidQuestion(q: unknown): q is Question {
  if (!isObject(q)) return false;
  if (!isText(q.id) || !Number.isInteger(q.order) || !isText(q.prompt) || !q.prompt.trim() || !isText(q.topic)) return false;
  if (!Number.isInteger(q.timer_seconds) || (q.timer_seconds as number) < TIMER_MIN_SECONDS || (q.timer_seconds as number) > TIMER_MAX_SECONDS) return false;
  if (q.explanation !== null && !isText(q.explanation)) return false;
  if (q.media !== null) {
    const m = q.media;
    if (!isObject(m) || !isText(m.id) || !isText(m.url) || (m.alt !== null && !isText(m.alt))) return false;
  }
  switch (q.kind) {
    case "multiple_choice": {
      const options = q.options;
      if (!Array.isArray(options) || options.length < OPTIONS_MIN || options.length > OPTIONS_MAX) return false;
      if (!options.every((o) => isText(o) && o.trim())) return false;
      return isText(q.correct) && /^\d$/.test(q.correct) && Number(q.correct) < options.length;
    }
    case "true_false":
      return q.correct === "true" || q.correct === "false";
    case "numeric": {
      if (!isText(q.correct) || !isFiniteNumber(q.tolerance) || q.tolerance < 0 || (q.unit !== null && !isText(q.unit))) return false;
      if (typeof q.allow_negative !== "boolean") return false;
      const correct = parseNumeric(q.correct);
      // A right answer below zero on a question that does not take a minus could never be given (BR-ANS-03).
      return correct !== null && (correct >= 0 || q.allow_negative);
    }
    default:
      return false;
  }
}

/**
 * Whether a value is a question a draft may hold: the shape of its kind and no more. A draft is a lesson in the making, so an empty
 * prompt, a blank option, a right answer not yet chosen and a timer out of range are all fine here; they are refused when the
 * draft is saved as a lesson (`isValidQuestion`). What the demo reads back from the browser and what the edit call takes.
 */
export function isDraftQuestion(q: unknown): q is DraftQuestion {
  if (!isObject(q)) return false;
  if (!isText(q.id) || !Number.isInteger(q.order) || !isText(q.prompt) || !isText(q.topic) || !isFiniteNumber(q.timer_seconds)) return false;
  if (q.explanation !== null && !isText(q.explanation)) return false;
  if (q.media !== null) {
    const m = q.media;
    if (!isObject(m) || !isText(m.id) || !isText(m.url) || (m.alt !== null && !isText(m.alt))) return false;
  }
  switch (q.kind) {
    case "multiple_choice":
      return Array.isArray(q.options) && q.options.length >= 1 && q.options.length <= OPTIONS_MAX && q.options.every(isText) && isText(q.correct);
    case "true_false":
      return q.correct === "true" || q.correct === "false" || q.correct === "";
    case "numeric":
      return isText(q.correct) && isFiniteNumber(q.tolerance) && (q.unit === null || isText(q.unit)) && typeof q.allow_negative === "boolean";
    default:
      return false;
  }
}

/** A lesson's content: a title, a review summary and five to eight valid questions (BR-Q-02). */
export function isValidContent(c: unknown): c is LessonContent {
  if (!isObject(c)) return false;
  if (!isText(c.title) || !c.title.trim() || !isText(c.review_summary)) return false;
  const questions = c.questions;
  return Array.isArray(questions) && questions.length >= QUESTIONS_MIN && questions.length <= QUESTIONS_MAX && questions.every(isValidQuestion);
}

/** BR-LES-05: PDF or Word (.docx), one file per lesson, at most 20 MB (PROPOSED size). */
export const LESSON_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const LESSON_UPLOAD_EXTENSIONS = [".pdf", ".docx"] as const;
/** A few typed sentences (FR-LES-06): the shortest text worth sending to the AI. PROPOSED. */
export const TYPED_TEXT_MIN_CHARS = 40;
/** And the most: a longer paste is a payload and a cost (BR-LES-14). PROPOSED; the box takes no more than this. */
export const TYPED_TEXT_MAX_CHARS = 20_000;
/** The sentence of emphasis is one sentence; this is the most the server keeps. PROPOSED. */
export const EMPHASIS_MAX_CHARS = 200;
/** BR-LES-09: a draft may stay `pending` this long, from when its generation or retry started, and then it has `failed`. PROPOSED. */
export const DRAFT_PENDING_MAX_SECONDS = 180;
/**
 * The page's own limit on the wait, behind the server's: a draft still `pending` a minute past `DRAFT_PENDING_MAX_SECONDS`, counted
 * from when the page began to wait for it, belongs to a job that stopped before the server could fail it, and the page says so
 * instead of waiting for good. The page goes on asking, so a draft that comes after all still takes it on.
 */
export const DRAFT_STUCK_MS = (DRAFT_PENDING_MAX_SECONDS + 60) * 1000;
/** BR-LES-12: an unsaved draft is kept this long, and the teacher is told so. PROPOSED. */
export const DRAFT_RETENTION_DAYS = 30;
/** 11.4: while it shows the wait for a draft the app reads it every 2 to 3 seconds. */
export const DRAFT_POLL_MS = 2500;
