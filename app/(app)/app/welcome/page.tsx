"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Mark } from "@/components/app/Mark";
import { SignIn } from "@/components/app/SignIn";
import { useAuth, useSettings } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";
import { safeNext } from "@/lib/app/signin";

const noop = () => () => {};

/** Where to go after signing in: the screen that was asked for, if it is a screen of this app. */
const nextPath = () => safeNext(new URLSearchParams(window.location.search).get("next"));

/** The first screen a student sees: sign in with the school email, then carry on to whatever was asked for. */
export default function Welcome() {
  const { locale } = useT();
  const { setLocale } = useSettings();
  const router = useRouter();
  const signedIn = useAuth().status === "signedIn";
  // False while hydrating, when signedIn is still the server default rather than the saved value.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const arriving = hydrated && signedIn;

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
              <button className="pill" lang="mk" aria-label="Македонски" aria-pressed={locale === "mk"} onClick={() => setLocale("mk")}>
                МК
              </button>
              <button className="pill" lang="en" aria-label="English" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
                EN
              </button>
            </div>
          </header>
          <SignIn next={nextPath} />
        </div>
      )}
    </main>
  );
}
