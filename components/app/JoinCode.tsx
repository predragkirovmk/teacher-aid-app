"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { HourglassIcon } from "@phosphor-icons/react";
import { FAILURE_ICON, RETRYABLE, useProblemBuzz } from "@/components/app/quiz/JoinFailure";
import type { ApiErrorCode } from "@/lib/app/api/errors";
import { HAPTICS, buzz } from "@/lib/app/haptics";
import { useT } from "@/lib/app/i18n";
import { useSlowHint } from "@/lib/app/join";
import { useJoinFailureCopy, useQT } from "@/lib/app/quiz-copy";
import { interpretCode } from "@/lib/app/scan";

/**
 * The field a class code is typed into, for a student with no camera or one who prefers to type. It checks the shape of
 * what was typed and calls `onCode` with the code as it is sent: in capitals, with no spaces. Nothing that is not shaped
 * like a class code reaches the API; the message says so in place, tied to the field.
 */
export function CodeForm({ onCode, className }: { onCode: (code: string) => void; className?: string }) {
  const { t } = useT();
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<"codeEmpty" | "codeBad" | null>(null);
  const id = useId();
  const errorId = `${id}-err`;
  const hintId = `${id}-hint`;
  const field = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // The field shows capitals whatever is typed, so what is sent is what is shown; stray spaces (a keyboard adds one after a word) go.
    const text = typed.replace(/\s+/g, "").toUpperCase();
    const found = !text ? "codeEmpty" : interpretCode(text).kind === "other" ? "codeBad" : null;
    setProblem(found);
    if (found) {
      // Focus stays in the field, so the student can fix it and press Enter again, also after tapping the button.
      field.current?.focus();
      return buzz(HAPTICS.problem);
    }
    onCode(text);
  };

  return (
    <form className={`scan-code${className ? ` ${className}` : ""}`} onSubmit={submit} noValidate>
      <label htmlFor={id} className="scan-code__label">
        {t("scan.codeLabel")}
      </label>
      <p id={hintId} className="scan-code__hint">
        {t("scan.codeHint")}
      </p>
      <div className="scan-code__row">
        <input
          id={id}
          ref={field}
          className="scan-code__input"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={24}
          autoFocus
          value={typed}
          aria-invalid={problem !== null}
          aria-describedby={problem ? `${hintId} ${errorId}` : hintId}
          onChange={(e) => {
            setTyped(e.target.value);
            setProblem(null);
          }}
        />
        <button className="btn btn--primary" type="submit">
          {t("scan.codeGo")}
        </button>
      </div>
      {problem && (
        <p id={errorId} className="scan-code__err" role="alert">
          {t(`scan.${problem}`)}
        </p>
      )}
    </form>
  );
}

/** A code that did not open a quiz, said over the screen it was tried on: the reason, and a way to try again. A failure that was only the connection retries the same code with `onRetry`; the rest go on with `onAgain`. */
export function Miss({ code, onAgain, onRetry, again, clearOfTabs }: { code?: ApiErrorCode; onAgain: () => void; onRetry?: () => void; again?: string; clearOfTabs?: boolean }) {
  const failure = useJoinFailureCopy()(code);
  const { t } = useQT();
  const Icon = FAILURE_ICON[failure.kind];
  useProblemBuzz(failure.kind);
  const retry = onRetry && RETRYABLE.has(failure.kind);
  return (
    <section className={`scan-miss glass${clearOfTabs ? " scan-miss--tabs" : ""}`} role="alert" data-failure={failure.kind}>
      <span className="scan-miss__badge" aria-hidden="true">
        <Icon size={32} color="var(--yellow)" />
      </span>
      <h2 className="scan-miss__title">{failure.title}</h2>
      <p className="scan-miss__body">{failure.body}</p>
      <button className="btn btn--primary btn--block" autoFocus onClick={retry ? onRetry : onAgain}>
        {retry ? t("q.fail.retry") : (again ?? t("q.fail.scan"))}
      </button>
    </section>
  );
}

/** The wait while a typed or scanned code is being joined; after a few seconds it adds that the connection is slow. */
export function Joining({ clearOfTabs }: { clearOfTabs?: boolean }) {
  const { t } = useT();
  const slow = useSlowHint();
  return (
    <section className={`scan-miss glass${clearOfTabs ? " scan-miss--tabs" : ""}`} role="status" data-joining>
      <span className="scan-miss__badge" aria-hidden="true">
        <HourglassIcon size={32} color="var(--yellow)" />
      </span>
      <h2 className="scan-miss__title">{t("join.waiting")}</h2>
      {slow && <p className="scan-miss__body">{t("join.waitingSlow")}</p>}
    </section>
  );
}
