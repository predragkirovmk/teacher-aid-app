import type { FocusEventInput, Id } from "../api/types";

/**
 * The web focus flag (spec 7.10, BR-FOC-01, the pilot decision of 2026-10-15). While a question is open, the app
 * notices that the student has left it, and tells the teacher's console when and for how long. Nobody is blocked,
 * nothing on the student's screen changes, and nothing is taken away.
 *
 * What is recorded is two kinds of fact and no more: `lost` (the quiz was hidden or the window lost focus) and
 * `back` (it came back), each with a time on the server's clock and the id of the open question. Not which app the
 * student went to, not an address, not what was on the screen: a web page cannot see those, and does not try.
 * Nothing is recorded outside an open question, or before the student has been told (`enabled`).
 */

/**
 * A departure counts only if it lasts this long. A glance at the notification shade, the control centre or a
 * dropped-and-caught phone is shorter; looking something up in another app is not. A `lost` is then stamped with
 * the moment the student left, not the moment it was confirmed.
 */
export const FOCUS_LOST_AFTER_MS = 3000;

/**
 * What the page tells the tracker, from `visibilitychange` and `pagehide`/`pageshow` (hidden, visible) and from the
 * window's `blur` and `focus`. The student is away while any of the first pair says hidden or the second says blurred.
 */
export type FocusSignal = "hidden" | "visible" | "blur" | "focus";

export type FocusTrackerDeps = {
  /** The id of the question open at local time `at` for this student, or null when none is (between questions, before the first, after the lesson). */
  openQuestion(at: number): Id | null;
  /** The server's clock for a local time. */
  toServer(at: number): number;
  emit(event: FocusEventInput): void;
  /** Whether the student has been told (the lobby's line); nothing is recorded until they have. */
  enabled(): boolean;
  now?: () => number;
  lostAfterMs?: number;
};

export type FocusTracker = {
  signal(signal: FocusSignal): void;
  dispose(): void;
};

type Away = {
  /** The local time the student left. */
  since: number;
  /** The question open when they left; null when none was, so this absence is not recorded however long it lasts. */
  question: Id | null;
  lostSent: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
};

export function createFocusTracker(deps: FocusTrackerDeps): FocusTracker {
  const now = deps.now ?? Date.now;
  const after = deps.lostAfterMs ?? FOCUS_LOST_AFTER_MS;
  let hidden = false;
  let blurred = false;
  let away: Away | null = null;

  const lost = (a: Away) => {
    a.lostSent = true;
    deps.emit({ type: "lost", at: deps.toServer(a.since), sessionQuestionId: a.question! });
  };

  function leave() {
    const at = now();
    // Whether this absence is recorded is settled by what was open when it began: a question that opens while
    // the student is already away does not turn an earlier absence into one (EC-FOC-02).
    const question = deps.enabled() ? deps.openQuestion(at) : null;
    const a: Away = { since: at, question, lostSent: false, timer: undefined };
    // On a page the browser keeps running this confirms the departure while it is still going, so the console
    // shows it at once. On one it has frozen (a phone with the screen off) the timer never fires, and the return
    // below says it instead.
    if (question !== null) a.timer = setTimeout(() => lost(a), after);
    away = a;
  }

  function back() {
    const a = away!;
    away = null;
    clearTimeout(a.timer);
    if (a.question === null) return;
    const at = now();
    if (!a.lostSent) {
      // A flicker: gone and back before the threshold. Nothing happened.
      if (at - a.since < after) return;
      lost(a);
    }
    deps.emit({ type: "back", at: deps.toServer(at), sessionQuestionId: a.question });
  }

  return {
    signal(signal) {
      if (signal === "hidden") hidden = true;
      else if (signal === "visible") hidden = false;
      else if (signal === "blur") blurred = true;
      else blurred = false;
      const gone = hidden || blurred;
      if (gone && !away) leave();
      else if (!gone && away) back();
    },
    dispose() {
      if (away) clearTimeout(away.timer);
      away = null;
    },
  };
}
