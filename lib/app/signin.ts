import type { AuthProvider } from "./api/types";

/** The pure rules of the sign-in screen: where a sign-in continues to, and which providers there are. */

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

/** The identity providers a student can sign in with, in the order the buttons come, and how each is written (spec 3.2 `auth_provider`). */
export const PROVIDERS: readonly { id: AuthProvider; name: string }[] = [
  { id: "google", name: "Google" },
  { id: "microsoft", name: "Microsoft" },
];

export const isProvider = (v: unknown): v is AuthProvider => PROVIDERS.some((p) => p.id === v);

export const providerName = (id: AuthProvider) => PROVIDERS.find((p) => p.id === id)!.name;

/** Whether `raw` is a path of this app, query allowed: the only kind of place a sign-in may come back to (the API accepts nothing else). */
export const isAppPath = (raw: string | null | undefined): raw is string => !!raw && /^\/app(?![\w-])/.test(raw);

/** `path` with `error=` added to its query: how the API's callback tells the screen a sign-in was refused. */
export const withError = (path: string, error: string) => `${path}${path.includes("?") ? "&" : "?"}error=${error}`;

/** The welcome screen, carrying the screen that was asked for so signing in can continue to it. */
export const welcomeUrl = (next?: string) => (next ? `/app/welcome?next=${encodeURIComponent(next)}` : "/app/welcome");
