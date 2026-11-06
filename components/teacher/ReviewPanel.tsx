"use client";

import { ArrowLeftIcon, CheckCircleIcon, ProjectorScreenIcon, WarningIcon } from "@phosphor-icons/react";
import { useReview } from "@/lib/teacher/api/hooks";
import type { ConsoleSnapshot } from "@/lib/teacher/api/types";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { useReviewScreenController } from "@/lib/teacher/review-screen";
import { clampScreen, correctWords, REVIEW_MISSED_MAX, reviewScreens } from "@/lib/teacher/review";
import { useClassViewStatus } from "@/lib/teacher/windows";
import { AnonInbox } from "./AnonInbox";
import { LoadProblem } from "./LoadProblem";
import { Bar, Loading } from "./Skeleton";

/**
 * The review on the console (FR-REV-01, FR-REV-02): the questions the class missed most, worst first, each with the right answer and how many missed it, and the
 * questions the class wrote, with the sender's name (this screen only), to answer aloud. No explanation by a machine. Beside it the projector's own review, which the
 * teacher steps through here, one screen at a time (see `reviewScreens`): the page's one yellow button is "show the next on the projector" until the last has been
 * shown, and then the way on is End, the red button at the foot of the page. A lesson with nothing missed says so, and goes on to End.
 */
export function ReviewPanel({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { t, locale } = useT();
  const sessionId = snapshot.session.id;
  const review = useReview(sessionId);
  const [at, setAt] = useReviewScreenController(sessionId);
  const status = useClassViewStatus(sessionId);

  if (review.status === "loading") {
    return (
      <Loading>
        <div className="card card--stack" aria-hidden="true">
          <Bar width="50%" height="2rem" />
          <Bar height="5rem" />
        </div>
      </Loading>
    );
  }
  if (!review.data) return <LoadProblem title={t("live.error.title")} error={review.error} onRetry={review.refetch} />;

  const { most_missed: missed, anon_questions: anon } = review.data;
  const screens = reviewScreens(missed, anon);
  const here = clampScreen(at, screens);
  const last = here >= screens.length - 1;
  const shown = missed.slice(0, REVIEW_MISSED_MAX);
  const labels = { true: t("q.adhoc.true"), false: t("q.adhoc.false") };

  return (
    <>
      <section className="card rpanel" aria-labelledby="rev-title">
        <h2 id="rev-title" className="rpanel__title">
          {t("rev.title")}
        </h2>
        <p className="rpanel__hint">{t("rev.intro")}</p>

        <h3 className="rpanel__sub">{t("rev.missed.title")}</h3>
        {shown.length === 0 ? (
          <p className="rpanel__none" data-testid="none-missed">
            <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
            {t("rev.missed.none")}
          </p>
        ) : (
          <ol className="rlist" data-testid="missed-list">
            {shown.map((m, i) => (
              <li key={m.session_question_id} className="rlist__item">
                <p className="rlist__n">{i + 1}</p>
                <p className="rlist__prompt">{m.prompt}</p>
                <p className="rlist__answer">
                  <strong>{t("rev.right")}:</strong> {correctWords(m, labels)}
                </p>
                <p className="rlist__count">{t(isOne(m.missed, locale) ? "rev.missed.count.one" : "rev.missed.count", { missed: m.missed, joined: m.joined })}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {screens.length > 1 && (
        <section className="card rproj" aria-labelledby="rev-proj">
          <h2 id="rev-proj">{t("rev.projector.title")}</h2>
          <p className="rproj__now" role="status" data-testid="screen-now">
            <ProjectorScreenIcon size={28} aria-hidden="true" />
            {t("rev.projector.now", { n: here + 1, total: screens.length })}
          </p>
          <div className="rproj__actions">
            {!last && (
              <button type="button" className="btn btn--primary btn--big" onClick={() => setAt(here + 1)}>
                {t("rev.projector.next")}
              </button>
            )}
            {here > 0 && (
              <button type="button" className="btn btn--secondary" onClick={() => setAt(here - 1)}>
                <ArrowLeftIcon size={24} aria-hidden="true" />
                {t("rev.projector.prev")}
              </button>
            )}
          </div>
          {last && <p className="rpanel__hint">{t("rev.projector.last")}</p>}
          {status === "closed" && (
            <p className="rproj__closed" role="status">
              <WarningIcon size={24} weight="fill" aria-hidden="true" />
              {t("rev.projector.closed")}
            </p>
          )}
        </section>
      )}

      <div className="rpanel__anon">
        <AnonInbox sessionId={sessionId} items={snapshot.anon_questions} />
      </div>
    </>
  );
}
