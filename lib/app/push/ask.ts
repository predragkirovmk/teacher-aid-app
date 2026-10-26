import type { Permission, PushStatus } from "./support";

/**
 * When the app may ask a student to turn notifications on (never cold). It asks only after something the student
 * would want to hear about has just happened, never more than ASK_MAX times, never twice in ASK_GAP_MS, and never a
 * student who cannot say yes or has already answered: the browser's own "block" is final, and so is a switch they
 * turned off themselves.
 */

/** The moments worth an ask: a lesson the student finished, or a practice set. */
export type Moment = "lesson_end" | "practice_done";

export const ASK_MAX = 2;
export const ASK_GAP_MS = 7 * 24 * 60 * 60 * 1000;

/** How many times the student has been asked and when last; kept on the phone. */
export type AskHistory = { count: number; last: number };

export const NEVER_ASKED: AskHistory = { count: 0, last: 0 };

export function shouldAsk(input: { status: PushStatus; permission: Permission; history: AskHistory; now: number }): boolean {
  const { status, permission, history, now } = input;
  // `off` with a permission that was never given is a student nobody has asked; `off` with one given is a student who said no in the app.
  const askable = (status === "off" && permission === "default") || status === "needs-install";
  return askable && history.count < ASK_MAX && now - history.last >= ASK_GAP_MS;
}

/** The ask has been shown: counted whether it is answered or not, so a student who ignores it is not asked again at once. */
export const asked = (history: AskHistory, now: number): AskHistory => ({ count: history.count + 1, last: now });

/** Parse what the phone kept; anything that is not an AskHistory is a student who has never been asked. */
export function readHistory(raw: string | null): AskHistory {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<AskHistory>) : null;
    return v && Number.isFinite(v.count) && Number.isFinite(v.last) && (v.count as number) >= 0 ? { count: v.count as number, last: v.last as number } : NEVER_ASKED;
  } catch {
    return NEVER_ASKED;
  }
}

/** Screens where an ask can appear without getting in the way: the tab roots, a summary, the list of practice sets. */
export const calmScreen = (pathname: string) =>
  ["/app", "/app/notifications", "/app/profile", "/app/practice"].includes(pathname) || pathname.startsWith("/app/summary");
