/**
 * Which session this phone joined with which code, kept for the tab's life. The code in a class QR
 * rotates every 30 seconds (BR-JOIN-02), so a student who reloads the quiz page minutes later holds
 * a code the API calls expired; knowing they joined that session, the app reads it back instead.
 * sessionStorage, so it is gone when the tab is, and cleared when a session ends (hooks.ts).
 */
const KEY = "teacheraid-session";

const norm = (code: string) => code.trim().toLowerCase();

export function rememberSession(code: string, sessionId: string) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ code: norm(code), sessionId }));
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

export function forgetSession() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing was kept
  }
}
