import type { JoinedSession, SessionSnapshot } from "../api/types";

/**
 * Which session this phone joined with which code, kept for the tab's life. The code in a class QR
 * rotates every 30 seconds (BR-JOIN-02), so a student who reloads the quiz page minutes later holds
 * a code the API calls expired; knowing they joined that session, the app reads it back instead.
 * sessionStorage, so it is gone when the tab is, and cleared when a session ends (hooks.ts).
 */
const KEY = "teacheraid-session";

const norm = (code: string) => code.trim().toLowerCase();

export function rememberSession(code: string, session: SessionSnapshot) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ code: norm(code), sessionId: session.id, session }));
  } catch {
    // blocked storage: a reload then needs a fresh code, which is what it would have needed anyway
  }
}

/** The session id this code joined earlier in this tab, or null. */
export function recallSession(code: string): string | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as { code?: unknown; sessionId?: unknown } | null;
    return saved && saved.code === norm(code) && typeof saved.sessionId === "string" ? saved.sessionId : null;
  } catch {
    return null;
  }
}

/**
 * The join this tab made with this code, for a reload with no connection: the lesson's screen can open
 * and say it is waiting for the signal, instead of failing a join the student already made. Its clock is
 * the phone's, which is all there is until the first snapshot.
 */
export function recallJoin(code: string): JoinedSession | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as { code?: unknown; session?: SessionSnapshot } | null;
    return saved && saved.code === norm(code) && saved.session ? { session: saved.session, attendance: null, serverNow: Date.now() } : null;
  } catch {
    return null;
  }
}

export function forgetSession() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing was kept
  }
}
