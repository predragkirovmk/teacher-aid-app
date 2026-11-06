"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState, useSyncExternalStore } from "react";
import { Mark } from "@/components/app/Mark";
import { SignIn } from "@/components/app/SignIn";
import { useAuth, useSettings } from "@/lib/app/api/hooks";
import type { ApiErrorCode } from "@/lib/app/api/errors";
import type { AuthProvider } from "@/lib/app/api/types";
import { useT } from "@/lib/app/i18n";
import { isAppPath, isProvider, safeNext, welcomeUrl } from "@/lib/app/signin";

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * The demo's stand-in for the provider's own sign-in page, loaded behind the build-time test itself so a live build carries
 * neither it nor the mock's roster (see lib/app/api/index.ts).
 */
const Demo =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? null
    : (() => {
        const sheet = require("@/components/app/DemoProviderSheet") as typeof import("@/components/app/DemoProviderSheet");
        return { Sheet: sheet.DemoProviderSheet };
      })();
/* eslint-enable @typescript-eslint/no-require-imports */

const noop = () => () => {};

/** Where to go after signing in: the screen that was asked for, if it is a screen of this app. */
const nextPath = () => safeNext(new URLSearchParams(window.location.search).get("next"));

/** What the API's callback sends back when it refused (spec 11.3): nothing else on the address is taken as a reason. */
const REFUSALS: readonly ApiErrorCode[] = ["unknown_email", "sign_in_failed"];

/** The first screen a student sees: sign in with the school's Google or Microsoft account, then carry on to whatever was asked for. */
export default function Welcome() {
  const { locale, t } = useT();
  const { setLocale } = useSettings();
  const router = useRouter();
  const signedIn = useAuth().status === "signedIn";
  // False while hydrating, when signedIn is still the server default rather than the saved value.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const arriving = hydrated && signedIn;
  // The refusal the callback came back with, read once and then taken off the address so a reload does not repeat it.
  const [refusal, setRefusal] = useState<ApiErrorCode | null>(null);
  // The demo's provider page, while the browser is "at" one.
  const [provider, setProvider] = useState<{ id: AuthProvider; returnTo: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const found = REFUSALS.find((r) => r === error) ?? null;
    if (found) startTransition(() => setRefusal(found));
    if (Demo) {
      const id = params.get("demo_provider");
      const back = params.get("return_to");
      if (isProvider(id)) {
        startTransition(() => setProvider({ id, returnTo: isAppPath(back) ? back : welcomeUrl() }));
        return;
      }
    }
    if (error) window.history.replaceState(window.history.state, "", welcomeUrl(nextPath() ?? undefined));
  }, []);

  // Signing in, or arriving here already signed in, replaces this screen, so Back never shows it again.
  useEffect(() => {
    if (arriving) router.replace(nextPath() ?? "/app");
  }, [arriving, router]);

  return (
    <main className="screen screen--bare">
      {!arriving && (
        <div className="signin">
          <header className="signin__top">
            <span className="signin__brand">
              <Mark size={44} />
              <span className="brand__name">TeacherAid</span>
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button className="pill" lang="mk" aria-label="МК, Македонски" aria-pressed={locale === "mk"} onClick={() => setLocale("mk")}>
                МК
              </button>
              <button className="pill" lang="en" aria-label="EN, English" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
                EN
              </button>
            </div>
          </header>
          <SignIn next={nextPath} error={refusal} onTry={() => setRefusal(null)} />
          {/* The notice is readable before anything is sent: a student can see how their data is used before signing in. */}
          <footer className="signin__legal">
            <p className="t-cap">{t("privacy.welcome")}</p>
            <div className="signin__legal-links">
              <Link href="/app/privacy" className="btn btn--plain">
                {t("privacy.row")}
              </Link>
              <Link href="/app/terms" className="btn btn--plain">
                {t("terms.row")}
              </Link>
            </div>
          </footer>
        </div>
      )}
      {Demo && provider && (
        <Demo.Sheet
          provider={provider.id}
          returnTo={provider.returnTo}
          onClose={() => {
            // Back from the provider's page without choosing: the address goes back to the screen, nothing else changes.
            setProvider(null);
            router.replace(provider.returnTo);
          }}
        />
      )}
    </main>
  );
}
