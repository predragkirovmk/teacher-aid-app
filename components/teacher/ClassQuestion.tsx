"use client";

import { CheckCircleIcon, CircleDashedIcon, MinusCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { ClassViewSnapshot, LeaderboardRow, PublicQuestion } from "@/lib/teacher/api/types";
import { useServerNow } from "@/lib/teacher/clock";
import { isOne, personName } from "@/lib/teacher/format";
import { useT, type Key } from "@/lib/teacher/i18n";
import { barRows, numericSummary, optionLetter, promptSize, secondsLeft, shareLeft, topOfBoard } from "@/lib/teacher/questions";

/**
 * What the projector shows of a question, for a whole room that reads it from the back on a weak projector: the prompt as large as it can be (smaller
 * for a long one, never below a size that can be read), its picture, the options with big letters, and the time in big seconds with a shrinking bar and
 * how many have answered. Never the right answer before it is revealed; the snapshot has none to show.
 */

function Heading({ q }: { q: PublicQuestion }) {
  const { t } = useT();
  return (
    <p className="cvq__n">
      {q.adhoc ? t("cv.q.adhoc") : t("cv.q.n", { n: q.index + 1, total: q.total })}
    </p>
  );
}

function Prompt({ q, small }: { q: PublicQuestion; small?: boolean }) {
  return (
    <h1 className="cvq__prompt" data-size={small ? "s" : promptSize(q.prompt.length)} data-testid="cv-prompt">
      {q.prompt}
    </h1>
  );
}

/** The picture of a question, with its words as the name a screen reader gives it. */
function Picture({ q }: { q: PublicQuestion }) {
  const { t } = useT();
  if (!q.media) return null;
  return (
    <figure className="cvq__figure">
      {/* eslint-disable-next-line @next/next/no-img-element -- the picture comes from the API, already made phone-sized (FR-LES-11) */}
      <img src={q.media.url} alt={q.media.alt || t("cv.picture")} data-testid="cv-picture" />
    </figure>
  );
}

/** The answers to choose from, before the reveal: big letters for the options, the two words for true or false, or the call for a number. */
function Choices({ q }: { q: PublicQuestion }) {
  const { t } = useT();
  if (q.kind === "numeric") {
    return (
      <div className="cvq__number">
        <p className="cvq__numeric">{t("cv.numeric")}</p>
        {q.numeric?.unit && <p className="cvq__unit">{t("cv.unit", { unit: q.numeric.unit })}</p>}
      </div>
    );
  }
  const labels = q.kind === "true_false" ? [t("cv.true"), t("cv.false")] : (q.options ?? []);
  return (
    <ol className="cvq__options" data-kind={q.kind}>
      {labels.map((label, i) => (
        <li key={i} className="cvq__option" data-testid="cv-option">
          {q.kind === "multiple_choice" && <span className="cvq__letter">{optionLetter(i)}</span>}
          <span className="cvq__label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The question while it is open: the prompt, the picture, the answers, the time left and how many have answered. */
export function OpenQuestion({ snapshot, q }: { snapshot: ClassViewSnapshot; q: PublicQuestion }) {
  const { t, locale } = useT();
  const now = useServerNow(snapshot.server_now, true);
  const closes = q.closes_at ?? snapshot.server_now;
  const left = secondsLeft(closes, 0, now);
  const share = q.fired_at ? shareLeft(q.fired_at, closes, 0, now) : 0;
  const { answered, joined } = snapshot.progress ?? { answered: 0, joined: snapshot.session.joined_count };
  return (
    <section className="cvq cvq--open" aria-label={q.prompt}>
      <Heading q={q} />
      <div className="cvq__body" data-picture={q.media !== null}>
        <div className="cvq__text">
          <Prompt q={q} />
          <Choices q={q} />
        </div>
        <Picture q={q} />
      </div>
      <div className="cvq__foot">
        <p className="cvq__seconds" role="timer" aria-live="off" data-testid="cv-seconds">
          <span className="cvq__num">{left}</span>
          <span className="cvq__unitword">{t(isOne(left, locale) ? "cv.seconds.one" : "cv.seconds")}</span>
        </p>
        <div className="cvq__bar" aria-hidden="true">
          <div className="cvq__fill" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <p className="cvq__progress" data-testid="cv-progress">
          {t(isOne(answered, locale) ? "cv.progress.one" : "cv.progress", { n: answered, total: joined })}
        </p>
      </div>
    </section>
  );
}

/** The time is up: said in two words and the count, with the question still in view. The right answer comes only at the reveal. */
export function ClosedQuestion({ snapshot, q }: { snapshot: ClassViewSnapshot; q: PublicQuestion }) {
  const { t, locale } = useT();
  const { answered, joined } = snapshot.progress ?? { answered: 0, joined: snapshot.session.joined_count };
  return (
    <section className="cvq cvq--closed" aria-label={q.prompt}>
      <Heading q={q} />
      <Prompt q={q} small />
      <p className="cvq__done" role="status">
        <CircleDashedIcon size="1.2em" aria-hidden="true" />
        {t("cv.closed")}
      </p>
      <p className="cvq__progress cvq__progress--big" data-testid="cv-progress">
        {t(isOne(answered, locale) ? "cv.progress.one" : "cv.progress", { n: answered, total: joined })}
      </p>
    </section>
  );
}

/** A question taken out of the lesson: it does not count, in six words. */
export function SkippedQuestion({ q }: { q: PublicQuestion }) {
  const { t } = useT();
  return (
    <section className="cvq cvq--skipped" aria-label={q.prompt}>
      <p className="cvq__done" role="status" data-testid="cv-skipped">
        <MinusCircleIcon size="1.2em" aria-hidden="true" />
        {t("cv.skipped")}
      </p>
      <Prompt q={q} small />
    </section>
  );
}

/** The first places of the session ranking in big type: the place, the name and the points. A tie shares a place. */
export function Board({ rows, className }: { rows: readonly LeaderboardRow[]; className?: string }) {
  const { t, locale } = useT();
  const top = topOfBoard(rows);
  if (top.length === 0) return null;
  return (
    <section className={className ? `cvb ${className}` : "cvb"} aria-labelledby="cv-board-title" data-testid="cv-board">
      <h2 className="cvb__title" id="cv-board-title">
        {t("cv.board")}
      </h2>
      <ol className="cvb__list">
        {top.map((r) => (
          <li key={r.student_id} className="cvb__row" value={r.rank}>
            <span className="cvb__rank" aria-hidden="true">
              {r.rank}
            </span>
            <span className="cvb__name">{personName(r.name, locale)}</span>
            <span className="cvb__points">{t(isOne(r.points, locale) ? "cv.point.one" : "cv.point", { n: r.points })}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const BAR_TEXT: Record<"true" | "false", Key> = { true: "cv.true", false: "cv.false" };

/** The right answer marked by an icon and the words, never by colour alone, and nothing marked in red for the others. */
function RightMark() {
  const { t } = useT();
  return (
    <span className="cvq__rightmark" data-testid="cv-right">
      <CheckCircleIcon size="1.1em" weight="fill" aria-hidden="true" />
      {t("cv.right")}
    </span>
  );
}

/**
 * The answer shown: for options and true or false a bar for each with how many chose it and the share, the right one marked; for a number, the number
 * and how many were right, not right and gave none. Then why, if the teacher wrote it, and the first places of the ranking beside it.
 */
export function RevealedQuestion({ snapshot, q }: { snapshot: ClassViewSnapshot; q: PublicQuestion }) {
  const { t } = useT();
  const reveal = snapshot.reveal;
  if (!reveal) return null;
  const numeric = q.kind === "numeric";
  const rows = numeric ? [] : barRows(q.kind, q.options?.length ?? 0, reveal.counts, reveal.correct_answer);
  const labelOf = (key: string, i: number) => (q.kind === "true_false" ? t(BAR_TEXT[key as "true" | "false"]) : (q.options?.[i] ?? ""));
  const summary = numericSummary(reveal.counts);
  const tile = (key: Key, n: number, icon: ReactNode) => (
    <li className="cvq__tile" key={key}>
      {icon}
      <span className="cvq__tilenum">{n}</span>
      <span className="cvq__tileword">{t(key)}</span>
    </li>
  );
  const hasBoard = topOfBoard(snapshot.board).length > 0;
  return (
    <section className="cvq cvq--revealed" aria-label={q.prompt} data-board={hasBoard}>
      <Heading q={q} />
      <div className="cvq__reveal">
        <div className="cvq__text">
          <Prompt q={q} small />
          {numeric ? (
            <>
              <p className="cvq__bignumber" data-testid="cv-answer">
                <CheckCircleIcon size="1em" weight="fill" aria-hidden="true" />
                <span>
                  {t("cv.numeric.is", { answer: `${reveal.correct_answer.replace(".", ",")}${q.numeric?.unit ? ` ${q.numeric.unit}` : ""}` })}
                </span>
              </p>
              <ul className="cvq__tiles">
                {tile("cv.numeric.right", summary.right, <CheckCircleIcon size="1.2em" weight="fill" aria-hidden="true" />)}
                {tile("cv.numeric.wrong", summary.wrong, <XCircleIcon size="1.2em" aria-hidden="true" />)}
                {tile("cv.numeric.none", summary.unanswered, <CircleDashedIcon size="1.2em" aria-hidden="true" />)}
              </ul>
            </>
          ) : (
            <ol className="cvq__bars">
              {rows.map((r, i) => (
                <li key={r.key} className="cvq__barrow" data-right={r.right} data-testid="cv-bar">
                  <span className="cvq__barhead">
                    {q.kind === "multiple_choice" && <span className="cvq__letter">{optionLetter(i)}</span>}
                    <span className="cvq__label">{labelOf(r.key, i)}</span>
                    {r.right && <RightMark />}
                  </span>
                  <span className="cvq__track" aria-hidden="true">
                    <span className="cvq__barfill" style={{ width: `${r.percent}%` }} />
                  </span>
                  <span className="cvq__barcount" data-testid="cv-count">
                    {t("cv.count", { n: r.count, percent: r.percent })}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {reveal.explanation && (
            <p className="cvq__why" data-testid="cv-why">
              <strong>{t("cv.why")}: </strong>
              {reveal.explanation}
            </p>
          )}
        </div>
        <Board rows={snapshot.board} className="cvb--side" />
      </div>
    </section>
  );
}
