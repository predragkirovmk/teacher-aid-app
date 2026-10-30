"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useT, type Key } from "@/lib/teacher/i18n";
import { STILL_WORKING_MS, type Failure } from "@/lib/teacher/prepare";
import { Problem } from "./Problem";

export type Phase = "reading" | "writing";

/**
 * The wait for the questions, on the page of the form so that nothing typed is lost. It names the part of the work that is
 * going on, as the calls come back (reading the document, then writing the questions; typed sentences have only the second),
 * says it can take up to 3 minutes, and has no percentage: nobody knows one. The dots are the only thing that moves, softly,
 * as long as the work goes on (they are a loop only because they mean "working"), and they stand still when the computer asks
 * for less motion.
 */
export function Waiting({ phase, withDocument, onCancel }: { phase: Phase; withDocument: boolean; onCancel: () => void }) {
  const { t } = useT();
  return (
    <section className="card card--stack waiting" aria-labelledby="waiting-title">
      {withDocument && <p className="waiting__step">{t("guide.step", { n: phase === "reading" ? 1 : 2, total: 2 })}</p>}
      <div aria-live="polite">
        <h2 id="waiting-title" tabIndex={-1} data-focus="wait">
          {t(phase === "reading" ? "prepare.wait.reading" : "prepare.wait.writing")}
        </h2>
      </div>
      <div className="waiting__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{t("prepare.wait.time")}</p>
      <button type="button" className="btn btn--secondary btn--big" onClick={onCancel}>
        {t("prepare.wait.cancel")}
      </button>
      {/* Under the button, so that when the line comes the button stays where a hand may be going to it, and nothing is held
          back in the meantime. The region is there before the line is, so the line is read out when it comes. */}
      <div role="status" className="waiting__still">
        <StillWorking key={phase} />
      </div>
    </section>
  );
}

/** One calm line, once, when a part of the wait has gone on for a while. It starts over with each part. */
function StillWorking() {
  const { t } = useT();
  const [still, setStill] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStill(true), STILL_WORKING_MS);
    return () => clearTimeout(timer);
  }, []);
  return still ? <p>{t("prepare.wait.still")}</p> : null;
}

const WORDS: Record<Exclude<Failure, "other">, { title: Key; body: Key }> = {
  generation: { title: "prepare.fail.generation.title", body: "prepare.fail.generation.body" },
  offline: { title: "prepare.fail.offline.title", body: "prepare.fail.offline.body" },
  timeout: { title: "prepare.fail.timeout.title", body: "prepare.fail.timeout.body" },
};

/**
 * The wait ended in a failure: what happened in plain words, that nothing is lost, and the way forward. The yellow button asks
 * again for the questions with the same material (a document already sent is not sent again); the other button returns to the
 * form with everything as it was.
 */
export function WaitFailure({ failure, error, onRetry, onBack }: { failure: Failure; error: unknown; onRetry: () => void; onBack: () => void }) {
  const { t, te } = useT();
  const title = failure === "other" ? t("prepare.fail.other.title") : t(WORDS[failure].title);
  const body = failure === "other" ? te(error) : t(WORDS[failure].body);
  return (
    <section className="card card--stack">
      <Problem id="prepare-failure" title={title}>
        {body}
      </Problem>
      <div className="prepare__actions">
        {/* The focus goes to the way forward, which is read together with what went wrong. */}
        <button type="button" className="btn btn--primary btn--big" data-focus="failed" aria-describedby="prepare-failure" onClick={onRetry}>
          <ArrowClockwiseIcon size={24} weight="bold" aria-hidden="true" />
          {t("error.retry")}
        </button>
        {/* Not "Назад": the page has a Back of its own, which leaves it. */}
        <button type="button" className="btn btn--secondary btn--big" onClick={onBack}>
          {t("prepare.fail.change")}
        </button>
      </div>
    </section>
  );
}
