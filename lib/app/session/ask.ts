import type { StudentStage } from "../api/types";

/**
 * A question to the teacher (spec F-09, 7.8). The sender is stored and the teacher sees it; classmates never do
 * (BR-ANON-01). These are the numbers and the rules the phone and the mock share; the server has the last word.
 */

/** How many questions one student may send in a lesson (BR-ANON-02, DECIDED as a default). The server says what it is in the snapshot; this is the mock's. */
export const ANON_LIMIT = 3;

/** The longest question, in characters (PROPOSED, a named constant on the server too; the app takes it from here until the API says otherwise). */
export const ANON_MAX_LENGTH = 280;

/**
 * A question as the server keeps it: single spaces, trimmed, and no more than `max` characters (counted as the
 * student sees them, so an accented letter or an emoji is one). Empty means nothing to send.
 */
export function cleanAsk(text: string, max: number = ANON_MAX_LENGTH): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
}

/**
 * The stages in which the way to ask is on the screen. It is left out wherever a question is open for the class:
 * the student's one job then is to answer, and a second thing to tap would only compete with it. (The sheet can
 * be opened at any other time before the lesson ends, and a sheet already open stays open.)
 */
export function canAsk(stage: StudentStage): boolean {
  return stage === "waiting_start" || stage === "waiting_next";
}

/**
 * How many more questions the student may send: the limit, less what the server has and what is waiting on the
 * phone to be sent (those will count). Null when the server did not say what the limit is.
 */
export function askRemaining(anon: { used: number; limit: number } | null, waiting: number): number | null {
  return anon ? Math.max(0, anon.limit - anon.used - waiting) : null;
}
