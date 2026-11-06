"use client";

import { ArrowDownIcon, ArrowLeftIcon, CheckCircleIcon, ProjectorScreenIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useReview } from "@/lib/teacher/api/hooks";
import type { ConsoleSnapshot, MissedQuestion } from "@/lib/teacher/api/types";
import { isOne, personName } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import type { Locale } from "@/lib/teacher/store";
import { useReviewScreenController } from "@/lib/teacher/review-screen";
import { clampScreen, correctWords, REVIEW_MISSED_MAX, reviewScreens, type ReviewScreen } from "@/lib/teacher/review";
import { useClassViewStatus } from "@/lib/teacher/windows";
import { AnonInbox } from "./AnonInbox";
import { LoadProblem } from "./LoadProblem";
import { MirrorWarning, ProjectorControl } from "./ProjectorControl";
import { Bar, Loading } from "./Skeleton";

/**
 * The review on the console (FR-REV-01, FR-REV-02), laid out like the teaching panel: one panel at the top that says what the projector shows now (the most-missed
 * question with its right answer and how many missed it, or the questions the class wrote with the sender's name, which only this screen shows), the place in
 * the review, and the page's one yellow button, "Следно на проекторот"; going back one is a quiet control beside it. When the last screen is up the panel says the
 * review is done and points to End. Below it the whole review as a list, the item on the projector marked, and the projector's own controls beside it.
 * The place is kept (`useReviewScreenController`), so a reload of either window brings the other back to agree with it. No explanation by a machine.
 */
export function ReviewPanel({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { t, locale } = useT();
  const sessionId = snapshot.session.id;
  const review = useReview(sessionId);
  const [at, setAt] = useReviewScreenController(sessionId);
  const status = useClassViewStatus(sessionId);
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const screens = review.data ? reviewScreens(review.data.most_missed, review.data.anon_questions) : [];
  const here = clampScreen(at, screens);
  const last = here >= screens.length - 1;

  // The button that was pressed goes away on the last screen (and "back" on the first): if the focus was in the panel, it moves on to the one that is left.
  const was = useRef(here);
  useEffect(() => {
    if (was.current === here) return;
    was.current = here;
    const active = document.activeElement;
    if (active && active !== document.body && !panel.current?.contains(active)) return;
    (panel.current?.querySelector<HTMLElement>("[data-main]") ?? heading.current)?.focus();
  }, [here]);

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
  const shown = missed.slice(0, REVIEW_MISSED_MAX);
  const screen = screens[here];
  const labels = { true: t("q.adhoc.true"), false: t("q.adhoc.false") };
  const senders = new Map(snapshot.anon_questions.map((a) => [a.id, a.sender.name]));
  const onProjector = screen.kind === "missed" ? screen.item.session_question_id : null;
  const anonOnProjector = new Set(screen.kind === "anon" ? screen.items.map((a) => a.id) : []);
  const countLine = (m: MissedQuestion) => t(isOne(m.missed, locale) ? "rev.missed.count.one" : "rev.missed.count", { missed: m.missed, joined: m.joined });

  const goToEnd = () => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("live-end-section")?.scrollIntoView({ block: "end", behavior: calm ? "auto" : "smooth" });
    // The focus goes to the heading above the red control, never to the control: the one thing that closes the lesson is not what a press of Enter lands on.
    document.getElementById("live-end")?.focus({ preventScroll: true });
  };

  return (
    <>
      <section ref={panel} className="card qpanel rpanel" aria-labelledby="rev-proj" data-step={last ? "done" : "next"}>
        <h2 id="rev-proj" ref={heading} tabIndex={-1} className="qpanel__title">
          {t("rev.projector.title")}
        </h2>
        <p className="qpanel__label rpanel__now" role="status" data-testid="screen-now">
          <ProjectorScreenIcon size={28} aria-hidden="true" />
          {t("rev.projector.now", { n: here + 1, total: screens.length })}
        </p>

        <Now screen={screen} senders={senders} locale={locale} labels={labels} countLine={countLine} />

        {last ? (
          <div className="rpanel__done" data-testid="review-done">
            <p className="qpanel__state">
              <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
              {t("rev.done.title")}
            </p>
            <p className="qpanel__hint">{t("rev.done.body")}</p>
            <div className="qpanel__actions">
              <button type="button" className="btn btn--secondary" onClick={goToEnd}>
                <ArrowDownIcon size={24} aria-hidden="true" />
                {t("rev.done.go")}
              </button>
              {here > 0 && <Back onClick={() => setAt(here - 1)} />}
            </div>
          </div>
        ) : (
          <div className="qpanel__actions">
            <button type="button" className="btn btn--primary btn--big" data-main onClick={() => setAt(here + 1)}>
              {t("rev.projector.next")}
            </button>
            {here > 0 && <Back onClick={() => setAt(here - 1)} />}
          </div>
        )}

        {status === "closed" && (
          <p className="rproj__closed" role="status">
            <WarningIcon size={24} weight="fill" aria-hidden="true" />
            {t("rev.projector.closed")}
          </p>
        )}
      </section>

      <div className="live__teach">
        <div className="live__main">
          <section className="card rpanel__list" aria-labelledby="rev-title">
            <h2 id="rev-title" className="rpanel__title">
              {t("rev.missed.title")}
            </h2>
            {shown.length === 0 ? (
              <p className="rpanel__none" data-testid="none-missed">
                <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
                {t("rev.missed.none")}
              </p>
            ) : (
              <ol className="rlist" data-testid="missed-list">
                {shown.map((m, i) => {
                  const now = m.session_question_id === onProjector;
                  return (
                    <li key={m.session_question_id} className="rlist__item" aria-current={now ? "true" : undefined} data-now={now}>
                      <p className="rlist__n">{i + 1}</p>
                      <p className="rlist__prompt">{m.prompt}</p>
                      <p className="rlist__answer">
                        <strong>{t("rev.right")}:</strong> {correctWords(m, labels)}
                      </p>
                      <p className="rlist__count">{countLine(m)}</p>
                      {now && <OnProjector />}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <AnonInbox sessionId={sessionId} items={snapshot.anon_questions} onProjector={anonOnProjector} />
        </div>
        <div className="live__side">
          <ProjectorControl sessionId={sessionId} />
          <MirrorWarning />
        </div>
      </div>
    </>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className="btn btn--quiet" onClick={onClick}>
      <ArrowLeftIcon size={24} aria-hidden="true" />
      {t("rev.projector.prev")}
    </button>
  );
}

function OnProjector() {
  const { t } = useT();
  return (
    <p className="rlist__on" data-testid="on-projector">
      <ProjectorScreenIcon size={24} aria-hidden="true" />
      {t("rev.on")}
    </p>
  );
}

/** What the projector shows now, in the console's words: the question, its right answer and how many missed it; or the questions the class wrote, with the names. */
function Now({
  screen,
  senders,
  locale,
  labels,
  countLine,
}: {
  screen: ReviewScreen;
  senders: ReadonlyMap<string, string>;
  locale: Locale;
  labels: { true: string; false: string };
  countLine: (m: MissedQuestion) => string;
}) {
  const { t } = useT();
  if (screen.kind === "none_missed") {
    return (
      <p className="qpanel__state" data-testid="now-none">
        <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
        {t("rev.missed.none")}
      </p>
    );
  }
  if (screen.kind === "missed") {
    const m = screen.item;
    return (
      <>
        <p className="qpanel__label">
          {t("cv.review.missed")}
        </p>
        <p className="qpanel__prompt" data-testid="now-prompt">
          {m.prompt}
        </p>
        <p className="qpanel__answer" data-testid="now-answer">
          <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
          {t("rev.right")}: {correctWords(m, labels)}
        </p>
        <p className="qpanel__progress" data-testid="now-count">
          {countLine(m)}
        </p>
      </>
    );
  }
  return (
    <>
      <p className="qpanel__label">
        {t("rev.anon.title")}, {t("cv.review.n", { n: screen.to, total: screen.of })}
      </p>
      <ul className="rpanel__anonnow" data-testid="now-anon">
        {screen.items.map((a) => {
          const name = senders.get(a.id);
          return (
            <li key={a.id}>
              {name && <strong>{personName(name, locale)}</strong>}
              <span>{a.text}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
