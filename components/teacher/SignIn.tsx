"use client";

import { CheckCircleIcon, LockKeyIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { Mark } from "@/components/app/Mark";
import { ApiError, toApiError } from "@/lib/teacher/api/errors";
import { startSignIn } from "@/lib/teacher/api/hooks";
import type { AuthProvider } from "@/lib/teacher/api/types";
import { useT, type Key } from "@/lib/teacher/i18n";
import { HELP, isNotice, isRefusal, isSafeRedirect, PROVIDERS, safeNext, signInUrl, type Notice } from "@/lib/teacher/signin";
import { actions, useTeacher } from "@/lib/teacher/store";
import { PageTitle } from "./PageTitle";
import { Problem } from "./Problem";
import { ProviderMark } from "./ProviderMark";

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * The demo's stand-in for the provider's own sign-in page, loaded behind the build-time test itself so a live build carries
 * neither it nor the mock's list of teachers (the same trick as the adapters in lib/teacher/api/client.ts).
 */
const Demo =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? null
    : (() => {
        const sheet = require("./DemoSignInSheet") as typeof import("./DemoSignInSheet");
        return { Sheet: sheet.DemoSignInSheet, read: sheet.readDemoProvider };
      })();
/* eslint-enable @typescript-eslint/no-require-imports */

/** The heading of the box that says what went wrong: two failures have their own, every other is "did not work". */
const PROBLEM_TITLE: Record<string, Key> = {
  unknown_email: "signin.problem.unknown_email",
  network: "signin.problem.network",
};

/** What to do, for a failure whose shared words would only say the heading again. */
const PROBLEM_BODY: Record<string, Key> = {
  network: "signin.problem.network.body",
};

/** The warning, so each button can say it too: what failed is the attempt, and either button is the next one. */
const PROBLEM = "signin-problem";

/**
 * Teacher sign-in (F-01, US-T01): the school's Google or Microsoft account, nothing else (2026-10-27). A button asks the API
 * where to send the browser; the provider sends it back to the API's callback, which brings it here again, signed in (the
 * gate then moves on to `next`, or to the guide on a first run) or with `error` set when it could not. The address this
 * screen came back to carries `next`, so a refusal is told where the teacher can read it and a second try still knows
 * where to go.
 *
 * The two buttons follow each provider's own sign-in button guidelines (a white button, its logo, its words), not the app's
 * yellow: the screen has no other action to compete with. There is nothing to type.
 */
export function SignIn() {
  const { t, te, locale } = useT();
  const { schoolSeen } = useTeacher();
  const router = useRouter();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  // What went wrong in this visit, as an error the words come from.
  const [failed, setFailed] = useState<ApiError | null>(null);
  // What the address said when the page opened: why the teacher is here, and what the callback refused. Read once.
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  // The demo's provider page, while the browser is "at" one.
  const [provider, setProvider] = useState<{ id: AuthProvider; returnTo: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const reason = params.get("reason");
    const demo = Demo ? Demo.read(window.location.search) : null;
    startTransition(() => {
      if (isRefusal(error)) setRefusal(new ApiError(error));
      if (isNotice(reason)) setNotice(reason);
      if (demo) setProvider({ id: demo.provider, returnTo: demo.returnTo });
    });
    // Told once: the address goes back to the plain sign-in screen (keeping `next`), so a reload does not tell it again.
    if (!demo && (error !== null || reason !== null)) {
      window.history.replaceState(window.history.state, "", signInUrl({ next: params.get("next") }));
    }
  }, []);

  // Back from the provider's page with the browser's own button shows this screen as it was left: not waiting any more.
  useEffect(() => {
    const show = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", show);
    return () => window.removeEventListener("pageshow", show);
  }, []);

  // Coming back online clears "no connection"; nothing else was wrong.
  const offline = failed?.code === "network";
  useEffect(() => {
    if (!offline) return;
    const online = () => setFailed(null);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [offline]);

  const go = async (id: AuthProvider) => {
    if (busy) return;
    // What the screen said before is old news once the teacher tries again.
    setFailed(null);
    setRefusal(null);
    setNotice(null);
    setBusy(id);
    try {
      const next = safeNext(new URLSearchParams(window.location.search).get("next"));
      const redirect = await startSignIn({ provider: id, return_to: signInUrl({ next }) });
      // Only the provider's own https address, or in the demo a page of this app: never a `javascript:` address.
      if (!isSafeRedirect(redirect?.url)) throw new ApiError("invalid_response");
      // The provider's own page takes over; it brings the teacher back here.
      window.location.assign(redirect.url);
    } catch (e) {
      setFailed(toApiError(e));
      setBusy(null);
    }
  };

  const problem = failed ?? refusal;
  const message = problem
    ? { title: t(PROBLEM_TITLE[problem.code] ?? "signin.problem.sign_in_failed"), body: PROBLEM_BODY[problem.code] ? t(PROBLEM_BODY[problem.code]) : te(problem) }
    : null;

  return (
    <main className="entry">
      <PageTitle title={t("signin.title")} />
      <header className="entry__top">
        <span className="brand__link">
          <Mark size={44} />
          <span className="brand__word">TeacherAid</span>
        </span>
        <div className="lang" role="group" aria-label={t("signin.lang")}>
          {(["mk", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              className="pill"
              lang={l}
              aria-label={t(l === "mk" ? "signin.lang.mk" : "signin.lang.en")}
              aria-pressed={locale === l}
              onClick={() => actions.setLocale(l)}
            >
              {l === "mk" ? "МК" : "EN"}
            </button>
          ))}
        </div>
      </header>

      <div className="entry__body">
        <div className="card card--stack entry__card">
          <h1>{t("signin.title")}</h1>
          <p className="entry__sub">{t(schoolSeen ? "signin.sub.known" : "signin.sub")}</p>

          {notice && (
            <p className="note-box" role="status">
              {notice === "signed_out" ? <CheckCircleIcon size={28} weight="fill" aria-hidden="true" /> : <LockKeyIcon size={28} aria-hidden="true" />}
              <span>{t(notice === "signed_out" ? "signin.note.signed_out" : "signin.note.expired")}</span>
            </p>
          )}
          {message && (
            <Problem id={PROBLEM} title={message.title}>
              {message.body}
            </Problem>
          )}

          <div className="providers">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`provider provider--${p.id}`}
                disabled={busy !== null && busy !== p.id}
                aria-busy={busy === p.id}
                aria-describedby={message ? PROBLEM : undefined}
                onClick={() => void go(p.id)}
              >
                <ProviderMark provider={p.id} size={28} />
                {busy === p.id ? t("signin.opening", { provider: p.name }) : t(p.id === "google" ? "signin.google" : "signin.microsoft")}
              </button>
            ))}
          </div>

          <p className="entry__help">
            <Link href={HELP}>{t("signin.help")}</Link>
            <span>{t("help.contact.email")}</span>
          </p>
        </div>
      </div>

      {Demo && provider && (
        <Demo.Sheet
          provider={provider.id}
          returnTo={provider.returnTo}
          onClose={() => {
            // Back from the provider's page without choosing: the address goes back to the screen, nothing else changes.
            setProvider(null);
            router.replace(provider.returnTo);
          }}
          onOffline={() => {
            // Nothing reaches the API: the same thing a button press would have said, with the connection down.
            setProvider(null);
            setFailed(new ApiError("network"));
            router.replace(provider.returnTo);
          }}
        />
      )}
    </main>
  );
}
