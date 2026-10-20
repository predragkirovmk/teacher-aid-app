/** The pure rules of the sign-in screen: what it accepts before it asks the API anything. */

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/** Whether what was typed can be an email at all. The roster decides whether it is a student's (EC-AUTH-02). */
export function emailError(raw: string): "empty" | "invalid" | null {
  const email = normalizeEmail(raw);
  if (!email) return "empty";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? null : "invalid";
}

/** Digits only, as many as the code has: what a paste or an autofill leaves in the field. */
export const cleanCode = (raw: string, length: number) => raw.replace(/\D/g, "").slice(0, length);

/**
 * Where to go after signing in: the screen that was asked for (a class QR's check-in link, say), if it
 * is a screen of this app. Anything else, including the welcome screen itself, is null.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !/^\/app(\/[\w.~%-]+)*$/.test(raw) || raw === "/app/welcome") return null;
  try {
    // A dot segment, even a percent-encoded one, would climb out of the app once the router resolves it.
    if (raw.split("/").some((segment) => ["", ".", ".."].includes(decodeURIComponent(segment)) && segment !== "")) return null;
  } catch {
    return null;
  }
  return raw;
}

/** The welcome screen, carrying the screen that was asked for so signing in can continue to it. */
export const welcomeUrl = (next?: string) => (next ? `/app/welcome?next=${encodeURIComponent(next)}` : "/app/welcome");
