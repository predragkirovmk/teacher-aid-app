import { GUIDE, guideUrl, HELP, safeNext, SIGN_IN, signInUrl, TODAY, type Notice } from "./signin";

/**
 * Who may see which page, decided in one place (the gate in components/teacher/Gate.tsx asks). Every page under `/teacher`
 * needs a signed-in teacher except the sign-in screen and Help, so a page added by a later step is protected without
 * anyone remembering to protect it. The session lives in a cookie of the API's origin, which this app cannot read, so
 * the decision is made in the browser from `GET /me`, and nothing protected is drawn until that has answered.
 */

export type Access = "sign-in" | "either" | "private";

/** Sign-in is open to everyone, Help to everyone (signed out it has no sidebar), and every other page needs a teacher. */
export function accessOf(pathname: string): Access {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === SIGN_IN) return "sign-in";
  if (path === HELP) return "either";
  return "private";
}

/** What the app knows of the teacher. `error` is a failure to find out (offline, a server error), not a refusal. */
export type AuthStatus = "loading" | "signedIn" | "signedOut" | "error";

/** Why a signed-out teacher is signed out: their own choice, or the session ended while they were working. */
export type EndReason = "signed_out" | "expired";

/**
 * Signed in or out, from what is known: why a session ended (if it did), and how `GET /me` stands. A teacher whose session
 * ended is signed out whatever `me` still holds on screen; one whose `me` was refused as `unauthenticated` is signed out; one
 * whose `me` failed for any other reason (offline, a server error) is neither: the answer is `error`, and they are not sent
 * to sign in, because they may well still be signed in.
 */
export function authStatusOf(input: { ended: EndReason | null; me: "loading" | "ready" | "error"; failure: string | null }): AuthStatus {
  if (input.ended) return "signedOut";
  if (input.me === "ready") return "signedIn";
  if (input.me === "loading") return "loading";
  return input.failure === "unauthenticated" ? "signedOut" : "error";
}

export type View = "page" | "wait" | "retry";

type Input = {
  pathname: string;
  status: AuthStatus;
  reason?: EndReason | null;
  /** Known once the teacher is signed in. */
  firstRunDone?: boolean;
};

/**
 * What to draw: the page, a neutral waiting screen (nothing protected shows while the answer is unknown, while the
 * teacher is being sent somewhere else, or after the session ended), or the "could not find out" screen with a retry.
 */
export function viewOf({ pathname, status, firstRunDone }: Input): View {
  const access = accessOf(pathname);
  if (access === "sign-in") return status === "signedIn" ? "wait" : "page";
  if (access === "either") return status === "loading" ? "wait" : "page";
  if (status === "error") return "retry";
  if (status !== "signedIn") return "wait";
  return firstRunDone === false && pathname !== GUIDE ? "wait" : "page";
}

/**
 * Where to send the teacher, or null to stay. `next` is the screen a sign-in was heading for (from the address of the
 * sign-in or guide screen; it is checked again here), and `here` is the screen a signed-out teacher was on.
 *
 * - Signed out on a protected page: to sign-in, remembering the page. After the teacher's own sign-out nothing is
 *   remembered, and after a session that ended mid-use the screen says so.
 * - Signed in on the sign-in screen: on to `next` or Today, by way of the guide when the first run is not done.
 * - Signed in, first run not done, anywhere else protected: to the guide, remembering the page.
 */
export function destinationOf(input: Input, here: string | null, next: string | null): string | null {
  const { pathname, status, reason, firstRunDone } = input;
  const access = accessOf(pathname);
  if (access === "sign-in") {
    if (status !== "signedIn") return null;
    return firstRunDone === false ? guideUrl(next) : (safeNext(next) ?? TODAY);
  }
  if (access === "either") return null;
  if (status === "signedOut") {
    if (reason === "signed_out") return signInUrl({ notice: "signed_out" });
    const notice: Notice | null = reason === "expired" ? "expired" : null;
    return signInUrl({ next: here, notice });
  }
  if (status === "signedIn" && firstRunDone === false && pathname !== GUIDE) return guideUrl(here);
  return null;
}
