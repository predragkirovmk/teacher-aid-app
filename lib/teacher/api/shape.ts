import { ApiError } from "./errors";
import type { Lesson, LessonDraft } from "./types";

/**
 * The live adapter's check of the two answers that carry questions, a draft and a lesson, before any screen reads them. They are
 * the AI's output, stored by the server, and the AI's own schema writes an answer as a number where the wire has text (`correct`
 * is `"0"` or `"3.5"`, spec 11.5); a draft passed through as it came would stop the draft page with `correct.trim is not a
 * function`. An answer that is not in the shape of 11.5 is `invalid_response` instead, which the page words plainly and offers to
 * ask again, and the message names the first field that is wrong, for whoever reads the console.
 *
 * It checks what the screens rely on, not everything the wire may carry: extra fields pass.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrOrNull = (v: unknown) => v === null || isStr(v);

const KINDS = ["multiple_choice", "true_false", "numeric"];
const STATUSES = ["pending", "ready", "failed"];
const SOURCE_KINDS = ["upload", "typed"];

/** The first thing wrong with this question, or null. A draft's true or false question may have no answer chosen yet (`""`). */
function questionProblem(q: unknown, draft: boolean): string | null {
  if (!isObj(q)) return "is not an object";
  if (!isStr(q.id)) return "id is not text";
  if (!isNum(q.order)) return "order is not a number";
  if (!isStr(q.prompt)) return "prompt is not text";
  if (!isStr(q.topic)) return "topic is not text";
  if (!isNum(q.timer_seconds)) return "timer_seconds is not a number";
  if (!isStrOrNull(q.explanation)) return "explanation is not text or null";
  if (q.media !== null && !(isObj(q.media) && isStr(q.media.id) && isStr(q.media.url) && isStrOrNull(q.media.alt))) return "media is not { id, url, alt } or null";
  if (!KINDS.includes(q.kind as string)) return `kind ${JSON.stringify(q.kind)} is not one of ${KINDS.join(", ")}`;
  if (q.kind === "multiple_choice") {
    if (!Array.isArray(q.options) || !q.options.every(isStr)) return "options is not a list of text";
    if (!isStr(q.correct)) return "correct is not text (the option's index as a string)";
  }
  if (q.kind === "true_false") {
    const allowed = draft ? ["true", "false", ""] : ["true", "false"];
    if (!allowed.includes(q.correct as string)) return `correct is not ${allowed.map((a) => JSON.stringify(a)).join(" or ")}`;
  }
  if (q.kind === "numeric") {
    if (!isStr(q.correct)) return "correct is not text (the number as a string)";
    if (!isNum(q.tolerance)) return "tolerance is not a number";
    if (!isStrOrNull(q.unit)) return "unit is not text or null";
    if (typeof q.allow_negative !== "boolean") return "allow_negative is not true or false";
  }
  return null;
}

function questionsProblem(questions: unknown, draft: boolean): string | null {
  if (!Array.isArray(questions)) return "questions is not a list";
  for (let i = 0; i < questions.length; i++) {
    const problem = questionProblem(questions[i], draft);
    if (problem) return `questions[${i}]${problem.startsWith("is ") ? " " : "."}${problem}`;
  }
  return null;
}

const subjectProblem = (s: unknown) => (isObj(s) && isStr(s.id) && isStr(s.name) ? null : "subject is not { id, name }");

function draftProblem(d: unknown): string | null {
  if (!isObj(d)) return "is not an object";
  if (!isStr(d.id)) return "id is not text";
  if (!STATUSES.includes(d.status as string)) return `status ${JSON.stringify(d.status)} is not one of ${STATUSES.join(", ")}`;
  const subject = subjectProblem(d.subject);
  if (subject) return subject;
  if (!isNum(d.year)) return "year is not a number";
  if (d.source !== null && !(isObj(d.source) && SOURCE_KINDS.includes(d.source.kind as string) && isStrOrNull(d.source.file_name)))
    return "source is not { kind, file_name } or null";
  if (!isStrOrNull(d.emphasis)) return "emphasis is not text or null";
  if (!Array.isArray(d.refinements)) return "refinements is not a list";
  for (const key of ["source_id", "previous_draft_id", "consumed_at", "lesson_id"]) if (!isStrOrNull(d[key])) return `${key} is not text or null`;
  if (!isStr(d.created_at) || !isStr(d.updated_at)) return "created_at or updated_at is not text";
  if (d.status !== "ready") return null;
  if (!isStr(d.title)) return "title is not text";
  if (!isStr(d.review_summary)) return "review_summary is not text";
  return questionsProblem(d.questions, true);
}

function lessonProblem(l: unknown): string | null {
  if (!isObj(l)) return "is not an object";
  if (!isStr(l.id)) return "id is not text";
  if (!isStr(l.title)) return "title is not text";
  if (!isStr(l.review_summary)) return "review_summary is not text";
  const subject = subjectProblem(l.subject);
  if (subject) return subject;
  return questionsProblem(l.questions, false);
}

function checked<T>(what: string, value: unknown, problem: string | null): T {
  if (problem) throw new ApiError("invalid_response", { message: `${what}: ${problem}` });
  return value as T;
}

/** The draft as the screens read it, or `invalid_response` naming what is wrong. */
export const checkDraft = (value: unknown): LessonDraft => checked("draft", value, draftProblem(value));

/** The lesson as the screens read it, or `invalid_response` naming what is wrong. */
export const checkLesson = (value: unknown): Lesson => checked("lesson", value, lessonProblem(value));
