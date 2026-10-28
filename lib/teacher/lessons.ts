import type { LessonContent, Question } from "./api/types";
import { parseNumeric, QUESTIONS_MAX, QUESTIONS_MIN } from "./scoring";

/** The range a timer may be set to (BR-TIME-02 lets the teacher change it; the limits themselves are PROPOSED). */
export const TIMER_MIN_SECONDS = 5;
export const TIMER_MAX_SECONDS = 300;

/** BR-Q-01: a multiple-choice question has two to four options. */
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 4;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Whether a value is a question the API could hold: the shape of its kind (BR-Q-01) and values that mean something.
 * Used to check what the teacher edits before it is saved, and what the demo reads back from the browser.
 */
export function isValidQuestion(q: unknown): q is Question {
  if (!isObject(q)) return false;
  if (!isText(q.id) || !Number.isInteger(q.order) || !isText(q.prompt) || !q.prompt.trim() || !isText(q.topic)) return false;
  if (!isFiniteNumber(q.timer_seconds) || q.timer_seconds < TIMER_MIN_SECONDS || q.timer_seconds > TIMER_MAX_SECONDS) return false;
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
    case "numeric":
      return (
        isText(q.correct) &&
        parseNumeric(q.correct) !== null &&
        isFiniteNumber(q.tolerance) &&
        q.tolerance >= 0 &&
        (q.unit === null || isText(q.unit)) &&
        typeof q.allow_negative === "boolean"
      );
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
/** The sentence of emphasis is one sentence; this is the most the server keeps. PROPOSED. */
export const EMPHASIS_MAX_CHARS = 200;
