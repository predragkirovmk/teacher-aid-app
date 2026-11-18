// Haptics for rewards and deliberate actions only; navigation, tabs, presses and sheets stay silent.
// Patterns are in milliseconds (vibrate, pause, vibrate, ...).
export const HAPTICS = {
  right: [18, 60, 28], // a right answer
  wrong: 20, // a single light tick: a wrong answer is a small reaction, never a punishment
  badge: [16, 50, 16], // a new badge
  done: [20, 40, 30], // the end of a lesson or a practice set, 90 ms in all
  send: 14, // an answer or a question was sent
  problem: 40, // a validation problem
} as const satisfies Record<string, number | readonly number[]>;

/**
 * Vibrates where the phone supports it. Chrome blocks `vibrate` before the first tap and logs an
 * intervention message (the e2e fixture fails on console errors), and a hidden page should not buzz,
 * so it does nothing until the page has had a gesture and while it is not visible.
 */
export function buzz(pattern: number | readonly number[]) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (document.visibilityState !== "visible") return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern as number | number[]);
  } catch {
    // Some browsers throw when vibration is blocked, and it is only a nicety.
  }
}
