"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import type { ClassViewSnapshot } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { optionFit, optionLetter, promptSize } from "@/lib/teacher/questions";
import { RightMark } from "./ClassQuestion";
import { useReviewScreenFollower } from "@/lib/teacher/review-screen";
import { clampScreen, correctWords, missedShare, reviewScreens } from "@/lib/teacher/review";

/**
 * The review on the projector (FR-REV-01, FR-REV-02): one screen at a time, which the teacher steps through from the console (`reviewScreens`,
 * `useReviewScreenFollower`) so the projector never scrolls. The most-missed questions come worst first, each with the right answer, how many missed it
 * and why; then the questions the class wrote, as text with no name. The sizing is the question's: type in units of the window's height, full white, filling
 * the window. The text comes from the class view's snapshot or `review.ready`, which only this window and the console read (BR-ANON-06).
 */
export function ClassReview({ snapshot }: { snapshot: ClassViewSnapshot }) {
  const { t } = useT();
  const place = useReviewScreenFollower(snapshot.session.id);
  const review = snapshot.review;
  if (!review) return <p className="cv__quiet">{t("cv.review.wait")}</p>;
  const screens = reviewScreens(review.most_missed, review.anon_questions);
  const screen = screens[clampScreen(place, screens)];

  if (screen.kind === "none_missed") {
    return (
      <section className="cvr cvr--none" aria-live="polite">
        <h1 className="cvr__none" data-testid="cv-none">
          <CheckCircleIcon size="1.2em" weight="fill" aria-hidden="true" />
          <span>{t("cv.review.none")}</span>
        </h1>
      </section>
    );
  }

  if (screen.kind === "missed") {
    const m = screen.item;
    const labels = m.kind === "true_false" ? [t("cv.true"), t("cv.false")] : (m.options ?? []);
    const right = m.kind === "true_false" ? (m.correct_answer === "true" ? 0 : 1) : Number(m.correct_answer);
    return (
      <section className="cvq cvr" aria-live="polite" data-testid="cv-missed">
        <p className="cvq__n">
          {t("cv.review.missed")} · {t("cv.review.n", { n: screen.n, total: screen.of })}
        </p>
        <h1 className="cvq__prompt" data-size={promptSize(m.prompt.length) === "xl" ? "l" : promptSize(m.prompt.length)} data-testid="cv-prompt">
          {m.prompt}
        </h1>
        {m.kind === "numeric" ? (
          <div className="cvr__number">
            <p className="cvq__bignumber" data-testid="cv-answer">
              <CheckCircleIcon size="1em" weight="fill" aria-hidden="true" />
              <span>{t("cv.numeric.is", { answer: correctWords(m, { true: t("cv.true"), false: t("cv.false") }) })}</span>
            </p>
          </div>
        ) : (
          <ol className="cvq__options" data-kind={m.kind} data-count={labels.length} data-fit={optionFit(labels)}>
            {labels.map((label, i) => (
              <li key={i} className="cvq__option" data-right={i === right} data-testid={i === right ? "cv-answer" : "cv-option"}>
                {m.kind === "multiple_choice" && <span className="cvq__letter">{optionLetter(i)}</span>}
                <span className="cvq__label">{label}</span>
                {i === right && <RightMark />}
              </li>
            ))}
          </ol>
        )}
        <div className="cvr__facts">
          <p className="cvr__count" data-testid="cv-count">
            {t("cv.review.count", { missed: m.missed, joined: m.joined })}
          </p>
          <span className="cvq__track" aria-hidden="true">
            <span className="cvq__barfill" style={{ width: `${Math.round(missedShare(m) * 100)}%` }} />
          </span>
          {m.explanation && (
            <p className="cvq__why" data-testid="cv-why">
              <strong>{t("cv.why")}: </strong>
              {m.explanation}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="cvq cvr" aria-live="polite" data-testid="cv-anon">
      <h1 className="cvq__prompt" data-size="l">
        {t("cv.review.anon")}
      </h1>
      <ul className="cvr__anon" data-count={screen.items.length}>
        {screen.items.map((a) => (
          <li key={a.id} data-testid="cv-anon-text">
            {a.text}
          </li>
        ))}
      </ul>
      {screen.of > screen.items.length && (
        <p className="cvq__n">{t("cv.review.n", { n: screen.to, total: screen.of })}</p>
      )}
    </section>
  );
}
