import { isProvider, isTeacherPath, SIGN_IN, withError } from "../signin";
import type { SchoolType } from "../store";
import { SCHOOLS } from "./mock-data";
import { PERSONAS, type Persona } from "./mock-state";
import type { AuthProvider } from "./types";

/**
 * The mock's sign-in: the shape of the live one, played in the browser (F-01, FR-AUTH-10).
 *
 * `POST /auth/start` answers with a redirect, here to the sign-in screen with the demo's provider page open on it (a sheet
 * that stands in for Google's or Microsoft's own page). That page returns through `finishSignIn`, which does what
 * `GET /auth/callback/{provider}` does: it matches the account's email to the teachers the admin invited, signs the teacher
 * in and sends the browser back to `return_to`, or back with `?error=` and nothing created (EC-AUTH-02, EC-AUTH-09,
 * EC-AUTH-10). So the screen cannot tell the mock from the live API: it leaves for a provider and the page is loaded afresh
 * when it comes back.
 *
 * The session itself is a key in localStorage, apart from the demo's data, standing in for the API's cookie: resetting the
 * demo data does not sign anybody out, and signing out does not delete the lessons.
 */

export const MOCK_SESSION_KEY = "teacheraid-teacher-session-v1";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

/** The signed-in teacher, or null. Never throws: storage that refuses to be read is no session. */
export function readSession(storage: ReadableStorage | null): Persona | null {
  try {
    const raw = storage?.getItem(MOCK_SESSION_KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    const persona = saved && typeof saved === "object" ? (saved as { persona?: unknown }).persona : null;
    return PERSONAS.find((p) => p === persona) ?? null;
  } catch {
    return null;
  }
}

/** Sign in as `persona`, or out with null. A browser that refuses (private mode) cannot keep a demo session between pages. */
export function writeSession(storage: WritableStorage | null, persona: Persona | null): void {
  try {
    if (persona) storage?.setItem(MOCK_SESSION_KEY, JSON.stringify({ persona }));
    else storage?.removeItem(MOCK_SESSION_KEY);
  } catch {
    // ignore
  }
}

// ---- The accounts the demo's provider page offers -------------------------------------------------

/**
 * What the reviewer can choose on the demo's provider page. The first two are teachers the school's admin invited; the next
 * two are accounts that are on no list (a school account nobody invited, and a personal one), which the API cannot tell
 * apart (EC-AUTH-09): both are `unknown_email`. `cancelled` is the provider's window closed, and `offline` is no connection,
 * which the sign-in screen plays itself since nothing reaches the API.
 */
export const DEMO_ACCOUNTS = ["veteran", "novice", "not_invited", "personal", "cancelled", "offline"] as const;
export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];
export const isDemoAccount = (v: unknown): v is DemoAccount => DEMO_ACCOUNTS.includes(v as DemoAccount);

/** The email each demo account signs in with. A cancelled window has none. */
export const DEMO_EMAILS: Record<"not_invited" | "personal", string> = {
  not_invited: "nikola.trajkov@gimnazija-svetlina.example",
  personal: "marija.petrovska@gmail.com",
};

/** The teachers the school admin invited, by email: what the callback matches the account's email against (FR-AUTH-03). */
export function invitedPersona(email: string): Persona | null {
  const lower = email.trim().toLowerCase();
  for (const school of Object.values(SCHOOLS)) {
    if (school.teacher.email === lower) return "veteran";
    if (school.novice.email === lower) return "novice";
  }
  return null;
}

/** The email a demo account signs in with at the demo school the app is on. */
export function demoEmail(account: "veteran" | "novice" | "not_invited" | "personal", type: SchoolType): string {
  if (account === "veteran") return SCHOOLS[type].teacher.email;
  if (account === "novice") return SCHOOLS[type].novice.email;
  return DEMO_EMAILS[account];
}

/** The app path the sign-in comes back to: a path of this app, else the sign-in screen (the API accepts nothing else). */
const appPath = (raw: string | null | undefined) => (isTeacherPath(raw) ? raw : SIGN_IN);

/** Signing in needs the server, so a computer that is offline cannot, in the mock as for real. */
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** The demo's provider page: the sign-in screen with its sheet open. `returnTo` rides along as the live `state` would. */
export const demoProviderUrl = (provider: AuthProvider, returnTo: string | undefined) =>
  `${SIGN_IN}?demo_provider=${provider}&return_to=${encodeURIComponent(appPath(returnTo))}`;

/** Whether `url` is a demo provider page and, if so, which provider and where it returns to. */
export function readDemoProvider(search: string): { provider: AuthProvider; returnTo: string } | null {
  const params = new URLSearchParams(search);
  const provider = params.get("demo_provider");
  if (!isProvider(provider)) return null;
  return { provider, returnTo: appPath(params.get("return_to")) };
}

/**
 * GET /auth/callback/{provider}, for the account the demo's page chose. Who is signed in (null when nobody is) and the path
 * the browser goes to next: `return_to`, or `return_to` with `?error=` and nothing created.
 */
export function finishSignIn(
  account: Exclude<DemoAccount, "offline">,
  returnTo: string,
  type: SchoolType,
): { persona: Persona | null; location: string } {
  const back = appPath(returnTo);
  if (account === "cancelled") return { persona: null, location: withError(back, "sign_in_failed") };
  const persona = invitedPersona(demoEmail(account, type));
  if (!persona) return { persona: null, location: withError(back, "unknown_email") };
  return { persona, location: back };
}
