import { isApiError } from "./api/errors";
import type { CourseSummary, Id, Subject } from "./api/types";
import { EMPHASIS_MAX_CHARS, LESSON_UPLOAD_EXTENSIONS, LESSON_UPLOAD_MAX_BYTES, TYPED_TEXT_MIN_CHARS } from "./lessons";
import type { Locale } from "./store";

/**
 * The rules of "Подготви лекција" (F-03): which subjects and years a teacher is offered, what is wrong with what they gave
 * before anything is sent, what a refusal from the API means on the form, and what a failure during the wait means on the
 * wait view. Nothing here touches the browser, so all of it is unit tested.
 */

/** BR-LES-09: the wait for the questions is given up at this long (the API client's limit is the same). */
export const WAIT_LIMIT_MS = 180_000;
/** After this long a wait says, once and calmly, that it is still going on. */
export const STILL_WORKING_MS = 20_000;
/** The count of the sentence of emphasis shows from here on, so it never nags and is there when the end is near. */
export const EMPHASIS_COUNT_FROM = 160;

// ---- Part 1: the subject and the year -------------------------------------------------------------------------

/** The subjects of the teacher's courses, each once, in the order the API gave them. */
export function subjectsOf(courses: readonly CourseSummary[]): Subject[] {
  const seen = new Set<Id>();
  const out: Subject[] = [];
  for (const course of courses) {
    if (seen.has(course.subject.id)) continue;
    seen.add(course.subject.id);
    out.push(course.subject);
  }
  return out;
}

/** The years of the teacher's own classes in this subject, each once, the first year first. None until a subject is chosen. */
export function yearsOf(courses: readonly CourseSummary[], subjectId: Id | null): number[] {
  if (subjectId === null) return [];
  return [...new Set(courses.filter((c) => c.subject.id === subjectId).map((c) => c.class.year))].sort((a, b) => a - b);
}

/** The classes of the teacher in this subject and year, so a year can be told by its class ("II-4"). */
export function classesOf(courses: readonly CourseSummary[], subjectId: Id | null, year: number): string[] {
  return courses.filter((c) => c.subject.id === subjectId && c.class.year === year).map((c) => c.class.name);
}

/** The subject that is chosen: the teacher's pick if it is offered, else the only one there is, else none. */
export function chosenSubject(subjects: readonly Subject[], picked: Id | null): Id | null {
  if (picked !== null && subjects.some((s) => s.id === picked)) return picked;
  return subjects.length === 1 ? subjects[0].id : null;
}

/** The year that is chosen: the teacher's pick if it is offered, else the only one there is, else none. */
export function chosenYear(years: readonly number[], picked: number | null): number | null {
  if (picked !== null && years.includes(picked)) return picked;
  return years.length === 1 ? years[0] : null;
}

// ---- Part 2: the material -------------------------------------------------------------------------------------

export type MaterialKind = "file" | "typed";

/** What is wrong with a document, judged by its name and size alone (BR-LES-05). The words are the API's `reason`. */
export type FileProblem = "file_type" | "file_too_large" | "empty";

export function checkFile(file: { name: string; size: number }): FileProblem | null {
  const name = file.name.toLowerCase();
  if (!LESSON_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext))) return "file_type";
  if (file.size === 0) return "empty";
  if (file.size > LESSON_UPLOAD_MAX_BYTES) return "file_too_large";
  return null;
}

/** What is wrong with typed sentences (BR-LES-06): nothing at all, or fewer characters than are worth sending. */
export type TextProblem = "text_none" | "text_too_short";

export function checkText(text: string): TextProblem | null {
  const length = text.trim().length;
  if (length === 0) return "text_none";
  return length < TYPED_TEXT_MIN_CHARS ? "text_too_short" : null;
}

/**
 * Everything that can be said at part 2. `pick` and `no_file` are the teacher's not having chosen yet; the next three are the
 * client's reading of the file and the next two the API's (it alone can look inside): `no_text` is a scan. The last two are
 * about typed sentences. `other` is a refusal with no reason the form can put in words; the screen then shows the API's own.
 */
export type MaterialProblem = "pick" | "no_file" | FileProblem | "no_text" | TextProblem | "other";

export type Part = "subject" | "year" | "material";
/** The order the parts are on the page, and so the order the first problem is found in. */
export const PARTS: readonly Part[] = ["subject", "year", "material"];

export type Problems = { subject?: true; year?: true; material?: MaterialProblem };

export type FormInput = {
  subject: Id | null;
  /** Null while the subject, which decides the years, is not chosen either. */
  year: number | null;
  /** Whether there is a year to choose at all: a subject is chosen. */
  needsYear: boolean;
  kind: MaterialKind | null;
  file: { name: string; size: number } | null;
  text: string;
};

/** What is missing or wrong before anything is sent. Empty means the questions can be asked for. */
export function checkForm(input: FormInput): Problems {
  const problems: Problems = {};
  if (input.subject === null) problems.subject = true;
  else if (input.needsYear && input.year === null) problems.year = true;
  if (input.kind === null) problems.material = "pick";
  else if (input.kind === "file") problems.material = input.file ? (checkFile(input.file) ?? undefined) : "no_file";
  else problems.material = checkText(input.text) ?? undefined;
  if (problems.material === undefined) delete problems.material;
  return problems;
}

/**
 * Whether the form holds something the teacher put there by hand and would have to do again: sentences, a document, or the
 * sentence of emphasis. Choosing a year or a way to add the material is not work. Leaving a form that has some asks first.
 */
export const hasWork = (form: { file: unknown; text: string; emphasis: string }): boolean =>
  form.file !== null || form.text.trim() !== "" || form.emphasis.trim() !== "";

/** The first part with a problem, top to bottom: where the focus goes. */
export const firstProblem = (problems: Problems): Part | null => PARTS.find((part) => problems[part] !== undefined) ?? null;

/** The things on the page the focus is sent to, by the `data-focus` they carry. */
export type FocusKey = "subject" | "year" | "kind" | "file" | "text" | "submit" | "wait" | "failed";

/** Where the focus goes for a problem at this part: the control that fixes it. */
export function focusKeyOf(part: Part, problems: Problems, kind: MaterialKind | null): FocusKey {
  if (part !== "material") return part;
  if (problems.material === "pick" || kind === null) return "kind";
  return kind === "file" ? "file" : "text";
}

export const hasProblems = (problems: Problems): boolean => firstProblem(problems) !== null;

/**
 * Why `POST /lessons/sources` refused the material, as the form says it at part 2: each `reason` of EC-LES-06 and EC-LES-07
 * is its own sentence. A refusal with no reason is `other`. Anything that is not a refusal is null: the form cannot fix it.
 */
export function materialProblemOf(error: unknown): MaterialProblem | null {
  if (!isApiError(error) || error.code !== "validation_failed") return null;
  switch (error.reason) {
    case "file_type":
    case "file_too_large":
    case "empty":
    case "no_text":
    case "text_too_short":
      return error.reason;
    default:
      return "other";
  }
}

/** The sentence of emphasis as it is sent: trimmed, cut at the limit the server keeps (BR-LES-07), or none. */
export function emphasisOf(text: string): string | null {
  return text.trim().slice(0, EMPHASIS_MAX_CHARS) || null;
}

export const showsEmphasisCount = (length: number): boolean => length >= EMPHASIS_COUNT_FROM;

/** A file's size in the words of a person: "240 KB", "1,4 MB" (Macedonian writes a comma). */
export function fileSize(bytes: number, locale: Locale): string {
  const MB = 1024 * 1024;
  if (bytes >= MB) {
    const text = String(Math.round((bytes / MB) * 10) / 10);
    return `${locale === "mk" ? text.replace(".", ",") : text} MB`;
  }
  return `${bytes === 0 ? 0 : Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---- The wait ------------------------------------------------------------------------------------------------

/** Why the screen stopped waiting by itself, or that the teacher did: what it says when the call comes back as a failure. */
export type StopReason = "cancel" | "timeout" | "offline" | "leave";

/**
 * What a failure during the wait is, in the teacher's terms: the AI could not write the questions, the connection is gone, it
 * took too long, or something else that has its own words (the API's).
 */
export type Failure = "generation" | "offline" | "timeout" | "other";

export function failureOf(error: unknown, stopped: StopReason | null): Failure {
  if (stopped === "timeout") return "timeout";
  if (stopped === "offline") return "offline";
  if (isApiError(error)) {
    if (error.code === "generation_failed") return "generation";
    if (error.code === "network") return "offline";
  }
  return "other";
}

/**
 * The source a retry may use again, so a document is not uploaded twice: the one already made, unless the API no longer knows
 * it (`not_found`), when the whole thing starts over. Null means: make the source again.
 */
export function sourceToKeep(sourceId: Id | null, error: unknown): Id | null {
  return isApiError(error) && error.code === "not_found" ? null : sourceId;
}
