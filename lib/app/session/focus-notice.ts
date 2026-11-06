/**
 * Whether this phone's student has been told that leaving the quiz during a question is visible to the teacher.
 * The lobby says it, once; the focus flag records nothing until it has (see focus.ts). It is kept on the phone
 * and nowhere else: it is a fact about what this screen has shown. Where storage is blocked it is remembered for
 * as long as the page lives.
 */
export const FOCUS_NOTICE_KEY = "teacheraid-focus-notice";

let shown = false;

export function focusNoticeSeen(): boolean {
  if (shown) return true;
  try {
    return window.localStorage.getItem(FOCUS_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markFocusNoticeSeen() {
  shown = true;
  try {
    window.localStorage.setItem(FOCUS_NOTICE_KEY, "1");
  } catch {
    // blocked storage: told for this visit, and told again next time
  }
}

/** The demo's reset: the line is new again. */
export function resetFocusNotice() {
  shown = false;
  try {
    window.localStorage.removeItem(FOCUS_NOTICE_KEY);
  } catch {
    // nothing was kept
  }
}
