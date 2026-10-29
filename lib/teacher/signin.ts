import type { ApiErrorCode } from "./api/errors";
import type { AuthProvider } from "./api/types";

/**
 * The pure rules of signing in: which providers there are, where a sign-in may come back to and where it goes next,
 * and what the address of the sign-in screen can say. Nothing here touches the browser, so all of it is unit tested.
 */

export const TODAY = "/teacher";
export const SIGN_IN = "/teacher/sign-in";
export const GUIDE = "/teacher/welcome";

/** The identity providers, in the order the buttons come (spec 3.2 `auth_provider`). */
export const PROVIDERS: readonly { id: AuthProvider; name: string }[] = [
  { id: "google", name: "Google" },
  { id: "microsoft", name: "Microsoft" },
];

export const isProvider = (v: unknown): v is AuthProvider => PROVIDERS.some((p) => p.id === v);

export const providerName = (id: AuthProvider) => PROVIDERS.find((p) => p.id === id)!.name;

// ---- Where a sign-in goes next -----------------------------------------------------------------

/** Screens a sign-in never continues to: the sign-in itself, the welcome guide (the first run decides about it) and the old signed-out address. */
const NOT_NEXT = [SIGN_IN, GUIDE, "/teacher/signed-out"];

const SEGMENT = /^[A-Za-z0-9._~%-]+$/;

/**
 * A path of the teacher app a sign-in may continue to, or null. Only `/teacher` and the paths below it, made of plain
 * segments, no query and no fragment: a link that was meant for another site, a protocol-relative address (`//host`), a
 * backslash, a dot segment (even percent-encoded, which the router would resolve and climb out of the app) or an encoded
 * slash is refused. A refused `next` is not an error, the teacher simply lands on Today.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 200 || !raw.startsWith(TODAY)) return null;
  if (NOT_NEXT.includes(raw)) return null;
  const rest = raw.slice(TODAY.length);
  if (rest === "") return raw;
  if (!rest.startsWith("/")) return null; // `/teachers`, `/teacher.evil.example`
  const segments = rest.slice(1).split("/");
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) return null; // an empty segment (`//`), a `?`, a `#`, a `\`, a space, a colon
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (decoded === "." || decoded === ".." || /[/\\]/.test(decoded)) return null;
  }
  return raw;
}

/**
 * Whether `raw` is somewhere a provider's callback may send the browser back to: a path of the teacher app, with a query if
 * it has one (spec 11.3: the API accepts nothing else). Not `safeNext`: the sign-in screen itself, query and all, is the usual one.
 */
export const isTeacherPath = (raw: string | null | undefined): raw is string =>
  !!raw && raw.length <= 400 && /^\/teacher(?:[/?]|$)/.test(raw) && !/[\\\s]/.test(raw) && !raw.includes("//") && !raw.includes("#");

/** `path` with `error=` added to its query, as the API's callback does when it refuses (`&` when there is a query already). */
export const withError = (path: string, error: string) => `${path}${path.includes("?") ? "&" : "?"}error=${error}`;

/** Why the teacher is at the sign-in screen, when it is not just the first visit: told once, then taken off the address. */
export const NOTICES = ["signed_out", "expired"] as const;
export type Notice = (typeof NOTICES)[number];
export const isNotice = (v: unknown): v is Notice => NOTICES.includes(v as Notice);

/** What the callback may send back (spec 11.3). Any other value in `error` is ignored. */
export const REFUSALS = ["unknown_email", "sign_in_failed"] as const satisfies readonly ApiErrorCode[];
export type Refusal = (typeof REFUSALS)[number];
export const isRefusal = (v: unknown): v is Refusal => REFUSALS.includes(v as Refusal);

/** The sign-in screen, carrying the screen that was asked for (so signing in continues to it) and why the teacher is here. */
export function signInUrl({ next, notice }: { next?: string | null; notice?: Notice | null } = {}): string {
  const query = new URLSearchParams();
  const safe = safeNext(next);
  if (notice) query.set("reason", notice);
  if (safe && safe !== TODAY) query.set("next", safe);
  const text = query.toString();
  return text ? `${SIGN_IN}?${text}` : SIGN_IN;
}

/** The welcome guide, carrying the screen a first sign-in was heading for. */
export function guideUrl(next?: string | null): string {
  const safe = safeNext(next);
  return safe && safe !== TODAY ? `${GUIDE}?next=${encodeURIComponent(safe)}` : GUIDE;
}

/** Where the browser goes to reach a provider: a path of this app (the demo's stand-in), or the provider's own https address. */
export function isSafeRedirect(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0 || url.length > 4000) return false;
  if (url.startsWith("/")) return !url.startsWith("//") && !url.includes("\\");
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
