"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Mark } from "@/components/app/Mark";
import { useT } from "@/lib/app/i18n";
import { actions, useApp } from "@/lib/app/store";

const noop = () => () => {};

/** Where to go after signing in: the screen that was asked for, if it is a screen of this app. */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && /^\/app(\/[\w-]+)*$/.test(next) && next !== "/app/welcome" ? next : "/app";
}

export default function Welcome() {
  const { t, locale } = useT();
  const router = useRouter();
  const { signedIn } = useApp();
  // False while hydrating, when signedIn is still the server default rather than the saved value.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  // Signing in, or arriving here already signed in, replaces this screen, so Back never shows it again.
  useEffect(() => {
    if (hydrated && signedIn) router.replace(nextPath());
  }, [hydrated, signedIn, router]);

  return (
    <main className="screen screen--bare">
      <div className="welcome">
        <Mark size={96} />
        <span className="brand__name" style={{ fontSize: "var(--fs-title3)" }}>
          TeacherAid
        </span>
        <h1 className="t-display" style={{ fontSize: "var(--fs-title1)", marginTop: 24 }}>
          {t("welcome.title")}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {t("welcome.sub")}
        </p>
        <button className="btn btn--primary btn--block" style={{ marginTop: 28 }} onClick={() => actions.setSignedIn(true)}>
          {t("welcome.cta")}
        </button>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="pill" lang="mk" aria-label="Македонски" aria-pressed={locale === "mk"} onClick={() => actions.setLocale("mk")}>
            МК
          </button>
          <button className="pill" lang="en" aria-label="English" aria-pressed={locale === "en"} onClick={() => actions.setLocale("en")}>
            EN
          </button>
        </div>
      </div>
    </main>
  );
}
