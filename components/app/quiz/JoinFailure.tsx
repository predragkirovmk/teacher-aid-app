"use client";

import { ClockCountdownIcon, FlagCheckeredIcon, QrCodeIcon, UsersThreeIcon, WarningCircleIcon, WifiSlashIcon, XIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import type { ApiErrorCode } from "@/lib/app/api/errors";
import { useT } from "@/lib/app/i18n";
import { leave } from "@/lib/app/nav";
import { useJoinFailureCopy, type JoinFailure } from "@/lib/app/quiz-copy";

/** One picture for each reason a join can fail, so the screen says it before the words do. */
export const FAILURE_ICON: Record<JoinFailure["kind"], ComponentType<{ size?: number; color?: string; "aria-hidden"?: boolean | "true" }>> = {
  expired: ClockCountdownIcon,
  class: UsersThreeIcon,
  ended: FlagCheckeredIcon,
  offline: WifiSlashIcon,
  unknown: QrCodeIcon,
  generic: WarningCircleIcon,
};

/**
 * The screen for a join that did not work. Each reason has its own words and the one thing worth doing
 * next: scan again for a code that expired or was not recognized, go home from a class that is not the
 * student's or a lesson that is over, and try again when only the connection was missing. `error` is
 * what the API said; `onRetry` asks the API again (the join is idempotent, so asking twice is safe).
 */
export function JoinFailureScreen({
  code,
  copy,
  onRetry,
}: {
  code?: ApiErrorCode;
  /** Words and action to use in place of the code's own, for a failure that is not a join's (the session would not load). */
  copy?: JoinFailure;
  onRetry: () => void;
}) {
  const router = useRouter();
  const { t } = useT();
  const describe = useJoinFailureCopy();
  const failure = copy ?? describe(code);
  const Icon = FAILURE_ICON[failure.kind];
  const run = (action: "scan" | "home" | "retry") => {
    if (action === "retry") onRetry();
    else if (action === "scan") router.replace("/app/scan");
    else router.replace("/app");
  };
  return (
    <main className="screen screen--bare q" data-failure={failure.kind}>
      <div className="q__col">
        <header className="q-top">
          <button className="round" aria-label={t("close")} onClick={() => leave(router)}>
            <XIcon size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="q-body q-body--center" role="alert">
          <span className="q-badge q-badge--no">
            <Icon size={52} color="var(--yellow)" aria-hidden="true" />
          </span>
          <h1 className="q-hero q-hero--fail">{failure.title}</h1>
          <p className="t-body muted q-fail__body">{failure.body}</p>
        </div>
        <div className="q-foot">
          <button className="btn btn--primary btn--block" onClick={() => run(failure.action)}>
            {failure.cta}
          </button>
          {failure.secondary && (
            <button className="btn btn--plain btn--block" onClick={() => run(failure.secondary!.action)}>
              {failure.secondary.label}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
