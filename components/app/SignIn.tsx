"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { toApiError, type ApiError, type ApiErrorCode } from "@/lib/app/api/errors";
import { completeSignIn, startSignIn } from "@/lib/app/api/hooks";
import { errorCopy, useT, type TFn } from "@/lib/app/i18n";
import { cleanCode, emailError, normalizeEmail } from "@/lib/app/signin";

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * The demo's stand-in for a school mailbox: a roster email to try and the code it "receives". Loaded
 * behind the build-time test itself, so a live build carries neither (see lib/app/api/index.ts).
 */
const demo =
  process.env.NEXT_PUBLIC_API_MODE === "live" ? null : (require("@/lib/app/demo") as typeof import("@/lib/app/demo")).DEMO_SIGN_IN;
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * What the sign-in remembers for this tab: the code stage, because switching to a mail app to read
 * the code can discard this page, and the email typed, so coming back from the code stage does not
 * make the student type it again. The tab's sessionStorage is the source of truth (a closed tab
 * forgets); blocked storage falls back to memory.
 */
const STAGE_KEY = "teacheraid-signin-stage";
const EMAIL_KEY = "teacheraid-signin-email";
/** How long a locked sign-in waits when the server does not say. */
const DEFAULT_LOCK_SECONDS = 60;

type CodeStage = { kind: "code"; email: string; codeLength: number; expiresAt: number; resendAt: number };

const memory = new Map<string, string | null>();
const watchers = new Set<() => void>();

const readKey = (key: string): string | null => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
};

const writeKey = (key: string, value: string | null) => {
  memory.set(key, value);
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // blocked storage: the copy in memory serves
  }
  watchers.forEach((w) => w());
};

const watch = (cb: () => void) => {
  watchers.add(cb);
  return () => {
    watchers.delete(cb);
  };
};

/** A remembered string, "" on the server render and while hydrating. */
const useRemembered = (key: string) => useSyncExternalStore(watch, () => readKey(key) ?? "", () => "");

const parseStage = (raw: string): CodeStage | null => {
  try {
    const s = JSON.parse(raw || "null") as Partial<CodeStage> | null;
    const valid =
      s?.kind === "code" &&
      typeof s.email === "string" &&
      Number.isInteger(s.codeLength) &&
      Number.isFinite(s.expiresAt) &&
      Number.isFinite(s.resendAt);
    return valid && Date.now() < s.expiresAt! ? (s as CodeStage) : null;
  } catch {
    return null;
  }
};

const saveStage = (stage: CodeStage | null) => writeKey(STAGE_KEY, stage ? JSON.stringify(stage) : null);

/** Whole seconds left until a time, never below zero, counted down while there is some left. */
function useSecondsUntil(at: number | null) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (at === null) return () => {};
      const id = setInterval(cb, 1000);
      return () => clearInterval(id);
    },
    [at],
  );
  return useSyncExternalStore(
    subscribe,
    () => (at === null ? 0 : Math.max(0, Math.ceil((at - Date.now()) / 1000))),
    () => 0,
  );
}

/** Move a field sideways a few times, once, when what was typed is refused. Reduced motion keeps only the message. */
function shake(el: HTMLElement | null) {
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-8px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 300, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  );
}

/**
 * Student sign-in (F-02, US-S01): the school email first, then whatever the API asks for next. For
 * now that is a one-time code typed here, or a redirect to the school's identity provider (OPEN-01);
 * the screen follows what `startSignIn` answers. Success is seen by the welcome screen (the session is
 * now known), which leaves for `next`, the screen that was asked for.
 */
export function SignIn({ next }: { next: () => string | null }) {
  const { t } = useT();
  const saved = useRemembered(STAGE_KEY);
  const stage = useMemo(() => parseStage(saved), [saved]);
  // A stage slides in when the student moved to it, not when the page opened on it (a reload on the code stage).
  const [moved, setMoved] = useState(false);

  return (
    // Each stage arrives in its own element, so the change plays once and a stage never re-animates on a keystroke.
    <div key={stage ? "code" : "email"} className={moved ? "signin__stage signin__stage--moved" : "signin__stage"}>
      {stage ? (
        <CodeStage
          stage={stage}
          onChangeEmail={() => {
            setMoved(true);
            saveStage(null);
          }}
          t={t}
        />
      ) : (
        <EmailStage
          next={next}
          onCode={(s) => {
            setMoved(true);
            saveStage(s);
          }}
          t={t}
        />
      )}
    </div>
  );
}

/** The line under a field when something is wrong: an icon and words, never colour alone. */
function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span className="pe-err signin__err" id={id} role="alert">
      <WarningCircleIcon size={20} color="var(--yellow)" aria-hidden="true" />
      {children}
    </span>
  );
}

function EmailStage({ next, onCode, t }: { next: () => string | null; onCode: (s: CodeStage) => void; t: TFn }) {
  const id = useId();
  const remembered = useRemembered(EMAIL_KEY);
  const [typed, setTyped] = useState<string | null>(null);
  const email = typed ?? remembered;
  const setEmail = setTyped;
  const [problem, setProblem] = useState<{ text: string; code?: ApiErrorCode } | null>(null);
  const [busy, setBusy] = useState<"sending" | "redirecting" | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Coming back online clears "no connection"; nothing else was wrong.
  const offline = problem?.code === "network";
  useEffect(() => {
    if (!offline) return;
    const online = () => setProblem(null);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [offline]);

  const fail = (text: string, code?: ApiErrorCode) => {
    setProblem({ text, code });
    shake(field.current);
    input.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const invalid = emailError(email);
    if (invalid) return fail(t(`signin.err.${invalid}`));
    setProblem(null);
    setBusy("sending");
    const schoolEmail = normalizeEmail(email);
    writeKey(EMAIL_KEY, schoolEmail);
    try {
      const challenge = await startSignIn({ schoolEmail, returnTo: next() ?? undefined });
      if (challenge.method === "redirect") {
        // The school's own sign-in takes over; it brings the student back to `next`.
        setBusy("redirecting");
        window.location.assign(challenge.url);
        return;
      }
      onCode({ kind: "code", email: schoolEmail, ...challenge });
    } catch (err) {
      const error = toApiError(err);
      fail(errorCopy(t, error), error.code);
      setBusy(null);
    }
  };

  return (
    <form className="signin__form" onSubmit={submit} noValidate>
      <div className="signin__intro">
        <h1 className="t-display signin__title">{t("welcome.title")}</h1>
        <p className="t-body muted signin__sub">{t("welcome.sub")}</p>
      </div>

      <div className="pe-field" ref={field}>
        <label htmlFor={`${id}-email`} className="t-label">
          {t("signin.email")}
        </label>
        <input
          ref={input}
          id={`${id}-email`}
          name="email"
          className="pe-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={email}
          aria-invalid={!!problem}
          aria-describedby={problem ? `${id}-err` : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setProblem(null);
          }}
        />
        <div className="pe-help signin__help">{problem && <FieldError id={`${id}-err`}>{problem.text}</FieldError>}</div>
      </div>

      <button type="submit" className="btn btn--primary btn--block" aria-busy={busy !== null}>
        {busy === "redirecting" ? t("signin.redirecting") : busy === "sending" ? t("signin.sending") : t("signin.next")}
      </button>

      {demo && (
        <div className="signin__demo signin__demo--email">
          <span className="t-cap">{t("signin.demoEmail")}</span>
          <span className="t-label signin__demo-email">{demo.email}</span>
          <button
            type="button"
            className="pill"
            onClick={() => {
              setEmail(demo.email);
              setProblem(null);
              input.current?.focus();
            }}
          >
            {t("signin.demoUse")}
          </button>
        </div>
      )}
    </form>
  );
}

function CodeStage({ stage, onChangeEmail, t }: { stage: CodeStage; onChangeEmail: () => void; t: TFn }) {
  const id = useId();
  const { email, codeLength } = stage;
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(stage.resendAt);
  const [sent, setSent] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const resendIn = useSecondsUntil(resendAt);
  const lockedFor = useSecondsUntil(lockedUntil);
  const locked = lockedUntil !== null && lockedFor > 0;

  // The student arrives to type: the keyboard is already up on the code field (a phone that will not
  // raise it from here still has the field focused for the next tap).
  useEffect(() => {
    input.current?.focus();
  }, []);

  // A lock that has run out takes its message with it.
  const shown = problem?.code === "rate_limited" && !locked ? null : problem;
  const offline = shown?.code === "network";
  useEffect(() => {
    if (!offline) return;
    const online = () => setProblem(null);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [offline]);

  const refuse = (error: ApiError) => {
    setProblem(error);
    shake(field.current);
    if (error.code === "rate_limited") setLockedUntil(Date.now() + (error.retryAfter ?? DEFAULT_LOCK_SECONDS) * 1000);
    // A wrong or expired code is cleared so the next one starts from nothing; one that never reached the server is kept.
    if (error.code === "invalid_code" || error.code === "code_expired" || error.code === "rate_limited") setCode("");
    input.current?.focus();
  };

  const verify = async (value: string) => {
    if (busy || locked) return;
    if (value.length < codeLength) return;
    setBusy(true);
    setProblem(null);
    try {
      // The shell sees the new session and leaves this screen; nothing else to do here on success.
      await completeSignIn({ schoolEmail: email, code: value });
      saveStage(null);
    } catch (err) {
      refuse(toApiError(err));
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || resendIn > 0) return;
    setBusy(true);
    setProblem(null);
    try {
      const challenge = await startSignIn({ schoolEmail: email });
      if (challenge.method === "code") {
        saveStage({ kind: "code", email, ...challenge });
        setResendAt(challenge.resendAt);
        setCode("");
        setSent(true);
        input.current?.focus();
      }
    } catch (err) {
      refuse(toApiError(err));
    }
    setBusy(false);
  };

  const message = shown === null ? null : shown.code === "rate_limited" ? t("signin.locked", { s: lockedFor }) : errorCopy(t, shown);

  return (
    <form
      className="signin__form"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
      noValidate
    >
      <div className="signin__intro">
        <h1 className="t-display signin__title">{t("signin.codeTitle")}</h1>
        <p className="t-body muted signin__sub">
          {t("signin.codeSub", { n: codeLength })}
          {/* The address is on its own line and carries no full stop, so it can be copied as it reads. */}
          <span className="signin__email">
            {/* A long address breaks after the @ or a dot, never in the middle of a word. */}
            {email.split(/(?<=[@.])/).map((part, i) => (
              <span key={i}>
                {i > 0 && <wbr />}
                {part}
              </span>
            ))}
          </span>
        </p>
      </div>

      <div className="pe-field" ref={field}>
        <label htmlFor={`${id}-code`} className="t-label">
          {t("signin.code")}
        </label>
        <input
          ref={input}
          id={`${id}-code`}
          name="code"
          className="pe-input signin__code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={codeLength}
          placeholder={"•".repeat(codeLength)}
          value={code}
          disabled={locked}
          aria-invalid={!!shown && !offline}
          aria-describedby={message ? `${id}-err` : undefined}
          onChange={(e) => {
            const next = cleanCode(e.target.value, codeLength);
            setCode(next);
            setProblem(null);
            setSent(false);
            // The last digit is the submit: nobody should have to find a button after a code that is complete.
            if (next.length === codeLength) void verify(next);
          }}
        />
        <div className="pe-help signin__help">
          {message &&
            (locked ? (
              <>
                {/* The countdown changes every second; only the fixed sentence is read out. */}
                <span className="sr" role="alert">
                  {errorCopy(t, shown!)}
                </span>
                <span className="pe-err signin__err" id={`${id}-err`} aria-hidden="true">
                  <WarningCircleIcon size={20} color="var(--yellow)" />
                  {message}
                </span>
              </>
            ) : (
              <FieldError id={`${id}-err`}>{message}</FieldError>
            ))}
          {!message && sent && (
            <span className="t-cap signin__sent" role="status">
              {t("signin.resent")}
            </span>
          )}
        </div>
      </div>

      <button type="submit" className="btn btn--primary btn--block" aria-busy={busy} disabled={locked}>
        {busy ? t("signin.verifying") : t("signin.verify")}
      </button>

      <div className="signin__more">
        <button type="button" className="btn btn--plain" onClick={resend} aria-disabled={resendIn > 0 || busy}>
          {resendIn > 0 ? t("signin.resendIn", { s: resendIn }) : t("signin.resend")}
        </button>
        <button type="button" className="btn btn--plain" onClick={onChangeEmail}>
          {t("signin.change")}
        </button>
      </div>

      {demo && (
        <div className="signin__demo">
          <span className="t-cap">{t("signin.demoCode", { code: demo.code })}</span>
          <button
            type="button"
            className="pill"
            onClick={() => {
              setCode(demo.code);
              setProblem(null);
              void verify(demo.code);
            }}
          >
            {t("signin.demoUse")}
          </button>
        </div>
      )}
    </form>
  );
}
