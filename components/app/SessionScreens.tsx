"use client";

import { DevicesIcon, WarningCircleIcon, WifiSlashIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { Mark } from "@/components/app/Mark";
import { errorCopy, useT } from "@/lib/app/i18n";
import type { ApiError } from "@/lib/app/api/errors";

/**
 * What the shell shows in place of a screen while it does not yet know who is signed in. It matches
 * the iPhone launch image (the mark on the blue ground), so opening the app is one picture until the
 * answer arrives, and a signed-out student never sees a signed-in screen first.
 */
export function Splash() {
  const { t } = useT();
  return (
    <div className="splash" role="status">
      <Mark size={96} />
      <span className="sr">{t("state.loading")}</span>
    </div>
  );
}

/**
 * The full screen for a student whose session ended because the same account signed in on another
 * device (BR-AUTH-03, FR-AUTH-06): what happened, and one way forward. `onSignIn` takes them to sign-in.
 */
export function SignedElsewhere({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useT();
  const cta = useRef<HTMLButtonElement>(null);
  // The one thing to do is the first thing a keyboard reaches.
  useEffect(() => {
    cta.current?.focus();
  }, []);
  return (
    <main className="screen screen--bare">
      <div className="signin signin--center" role="alert">
        <span className="signin__badge" aria-hidden="true">
          <DevicesIcon size={52} color="var(--yellow)" />
        </span>
        <h1 className="t-display signin__title">{t("elsewhere.title")}</h1>
        <p className="t-body muted signin__sub">{t("elsewhere.body")}</p>
        <button ref={cta} className="btn btn--primary btn--block signin__cta" onClick={onSignIn}>
          {t("elsewhere.cta")}
        </button>
      </div>
    </main>
  );
}

/** The app could not find out who is signed in (offline, or the server failed): say so and let the student retry. */
export function Unreachable({ error, onRetry }: { error: ApiError | null; onRetry: () => void }) {
  const { t } = useT();
  const Icon = error?.code === "network" ? WifiSlashIcon : WarningCircleIcon;
  return (
    <main className="screen screen--bare">
      <div className="signin signin--center" role="alert">
        <span className="signin__badge" aria-hidden="true">
          <Icon size={52} color="var(--yellow)" />
        </span>
        <p className="t-title signin__sub">{errorCopy(t, error)}</p>
        <button className="btn btn--primary btn--block signin__cta" onClick={onRetry}>
          {t("state.retry")}
        </button>
      </div>
    </main>
  );
}
