"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toApiError, type ApiErrorCode } from "@/lib/app/api/errors";
import { startSignIn } from "@/lib/app/api/hooks";
import type { AuthProvider } from "@/lib/app/api/types";
import { errorKey, hasKey, useT, type TFn } from "@/lib/app/i18n";
import { PROVIDERS, welcomeUrl } from "@/lib/app/signin";
import { ProviderMark } from "./ProviderMark";

/** What the screen says about a sign-in that did not work: a title and a line where the app has both, else the one line for the code. */
function problemCopy(t: TFn, code: ApiErrorCode): { title: string | null; body: string } {
  const title = `signin.err.${code}.title`;
  const body = `signin.err.${code}.body`;
  if (hasKey(title) && hasKey(body)) return { title: t(title), body: t(body) };
  return { title: null, body: t(errorKey(code)) };
}

/**
 * Student sign-in (F-02, US-S01): the school's Google or Microsoft account, nothing else (2026-10-27). A button asks the API where to
 * send the browser; the provider sends it back to the API's callback, which brings it here again, signed in (the welcome screen
 * then leaves for `next`) or with `error` set when it could not. `returnTo` is this screen, carrying `next`, so a refusal is told
 * where the student can read it.
 *
 * The provider buttons follow each provider's own button guidelines (a white button, its mark, its words), not the app's yellow:
 * the screen has no other action to compete with.
 */
export function SignIn({ next, error, onTry }: { next: () => string | null; error: ApiErrorCode | null; onTry: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [failed, setFailed] = useState<ApiErrorCode | null>(null);
  const problem = failed ?? error;

  // Back from the provider's page with the browser's own button shows this screen as it was left: not waiting any more.
  useEffect(() => {
    const show = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", show);
    return () => window.removeEventListener("pageshow", show);
  }, []);

  // Coming back online clears "no connection"; nothing else was wrong.
  const offline = problem === "network";
  useEffect(() => {
    if (!offline) return;
    const online = () => setFailed(null);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [offline]);

  const go = async (provider: AuthProvider) => {
    if (busy) return;
    setFailed(null);
    // The refusal the student arrived with is told once; trying again takes it away.
    onTry();
    setBusy(provider);
    try {
      const redirect = await startSignIn({ provider, returnTo: welcomeUrl(next() ?? undefined) });
      // The provider's own page takes over; it brings the student back here.
      window.location.assign(redirect.url);
    } catch (err) {
      setFailed(toApiError(err).code);
      setBusy(null);
    }
  };

  const copy = problem ? problemCopy(t, problem) : null;

  return (
    <div className="signin__form">
      <div className="signin__intro">
        <h1 className="t-display signin__title">{t("welcome.title")}</h1>
        <p className="t-body muted signin__sub">{t("welcome.sub")}</p>
      </div>

      {copy && (
        <div className="signin__problem" role="alert">
          <WarningCircleIcon size={24} color="var(--yellow)" aria-hidden="true" />
          <div>
            {copy.title && <p className="t-label signin__problem-title">{copy.title}</p>}
            <p className="t-body signin__problem-body">{copy.body}</p>
          </div>
        </div>
      )}

      <div className="signin__providers">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`provider provider--${p.id}`}
            disabled={busy !== null && busy !== p.id}
            aria-busy={busy === p.id}
            onClick={() => void go(p.id)}
          >
            <ProviderMark provider={p.id} />
            {busy === p.id ? t("signin.opening", { provider: p.name }) : t(`signin.${p.id}`)}
          </button>
        ))}
      </div>
      <p className="t-cap signin__safe">{t("signin.safe")}</p>
    </div>
  );
}
