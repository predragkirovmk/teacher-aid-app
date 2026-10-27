import { ApiError } from "../errors";
import type { AuthProvider, SignInRedirect } from "../types";
import { isAppPath, isProvider, withError } from "../../signin";
import { MOCK_PERSONAL_ACCOUNT, MOCK_ROSTER } from "./roster";
import { actions } from "./store";

/**
 * The mock's sign-in: the shape of the live one, played in the browser (F-02, FR-AUTH-10).
 *
 * `POST /auth/student/start` answers with a redirect, here to a page of the app that stands in for Google's or Microsoft's own
 * (the demo sheet on the welcome screen). That page returns through `finishMockSignIn`, which does what `GET /auth/callback/{provider}`
 * does: it checks the account against the roster, signs the student in and sends the browser back to `return_to`, or back with
 * `?error=` and nothing created (EC-AUTH-09, EC-AUTH-10). So the screen cannot tell the mock from the live API: it leaves for a
 * provider and the page is loaded afresh when it comes back.
 */

/** The accounts the demo's provider page offers. */
export type DemoAccount = "marko" | "personal" | "cancel";

/** The app path the sign-in comes back to: a path of this app, else the welcome screen (the API accepts nothing else). */
const appPath = (raw: string | null | undefined) => (isAppPath(raw) ? raw : "/app/welcome");

/** Signing in needs the server, so a phone that is offline cannot, in the mock as for real. */
const needNetwork = () => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError("network");
};

/** The demo's provider page: the welcome screen with its sheet open. `returnTo` rides along as the live `state` would. */
export const demoProviderUrl = (provider: AuthProvider, returnTo: string) =>
  `/app/welcome?demo_provider=${provider}&return_to=${encodeURIComponent(appPath(returnTo))}`;

/** POST /auth/student/start. */
export function startMockSignIn(provider: AuthProvider, returnTo: string | undefined): SignInRedirect {
  needNetwork();
  if (!isProvider(provider)) throw new ApiError("validation_failed");
  return { method: "redirect", url: demoProviderUrl(provider, returnTo ?? "") };
}

/**
 * GET /auth/callback/{provider}, for the account the demo's page chose. Returns the path the browser goes to next:
 * `return_to` with the student signed in, or with `?error=` and nobody signed in.
 */
export function finishMockSignIn(account: DemoAccount, returnTo: string): string {
  const back = appPath(returnTo);
  if (account === "cancel") return withError(back, "sign_in_failed");
  const email = account === "marko" ? MOCK_ROSTER[0] : MOCK_PERSONAL_ACCOUNT;
  if (!MOCK_ROSTER.includes(email)) return withError(back, "unknown_email");
  actions.signIn();
  return back;
}
