"use client";

import { ArrowUpIcon, CheckIcon, ChatsIcon, HourglassIcon, LockIcon, QuotesIcon, ThumbsDownIcon, ThumbsUpIcon, UserIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { startTransition, useId, useRef, useState, ViewTransition, type CSSProperties } from "react";
import { AnswerDelivery } from "@/components/app/ConnectionPill";
import type { SessionQuestion } from "@/lib/app/api/types";
import { LETTERS } from "@/lib/app/quiz";
import { useQT } from "@/lib/app/quiz-copy";
import type { SessionRunView } from "@/lib/app/session/controller";
import { CheckDraw, CrossDraw, QuizTop, TimerRing, buzz, useCountUp } from "./parts";

/** How many of the class's anonymous reasons one phone shows; the server may send more (spec 11.2). */
const REASONS_SHOWN = 3;

type Props = { run: SessionRunView; onLeave: () => void };

/** The index of the side a vote names: an option number, or 0 for agree and 1 for disagree. */
const sideOf = (response: string) => (response === "agree" ? 0 : response === "disagree" ? 1 : Number(response));

function useOpenerLabels(q: SessionQuestion) {
  const { t, locale } = useQT();
  const debate = q.kind === "opener_debate";
  return {
    t,
    debate,
    tag: t(debate ? "o.tag.debate" : "o.tag.prediction"),
    /** What a side is called when the student is choosing (I agree), and when the class is counted (Agree). */
    choice: (i: number) => (debate ? t(i === 0 ? "o.agree" : "o.disagree") : (q.options?.[i] ?? "")),
    side: (i: number) => (debate ? t(i === 0 ? "o.side.agreeN" : "o.side.disagreeN") : (q.options?.[i] ?? "")),
    letter: (i: number) => LETTERS[locale][i],
  };
}

/** The vote, locked in, as a quiet card: yellow is for the one thing to do on the screen. */
function VoteCard({ q, picked, variant }: { q: SessionQuestion; picked: string | null; variant: "full" | "slim" }) {
  const { t, debate, choice, letter } = useOpenerLabels(q);
  const i = picked === null ? null : sideOf(picked);
  if (i === null) {
    return (
      <div className="o-vote o-vote--none" role="status">
        <span className="t-label o-vote__head">
          <HourglassIcon size={18} weight="bold" aria-hidden="true" />
          {t("o.missed")}
        </span>
        {variant === "full" && <span className="t-body muted">{t("o.missedNote")}</span>}
      </div>
    );
  }
  return (
    <ViewTransition name={`q-pick-${i}`} share="q-morph" default="none">
      <div className="o-vote">
        <span className="t-label o-vote__head">
          <LockIcon size={18} weight="bold" aria-hidden="true" />
          {t("o.voteLocked")}
        </span>
        <span className="q-answer">
          <span className="q-letter">
            {debate ? i === 0 ? <ThumbsUpIcon size={22} weight="bold" aria-hidden="true" /> : <ThumbsDownIcon size={22} weight="bold" aria-hidden="true" /> : letter(i)}
          </span>
          {choice(i)}
        </span>
      </div>
    </ViewTransition>
  );
}

/** Step one: the vote. A prediction is a list to choose from, a debate is two sides. */
export function Voting({ run, onLeave, onPick }: Props & { onPick: (response: string) => void }) {
  const q = run.question!;
  const { t, debate, tag, choice, letter } = useOpenerLabels(q);
  const pick = (response: string) => {
    buzz(14);
    startTransition(() => onPick(response));
  };
  return (
    <>
      <QuizTop onLeave={onLeave} label={tag} right={<TimerRing key={`${q.id}:vote`} duration={run.duration} elapsedAtMount={run.elapsed} seconds={run.secondsLeft} />} />
      <div className="q-body q-ask" key={`ask-${q.id}`}>
        <h1 className="q-question">{q.prompt}</h1>
      </div>
      <div className="q-foot">
        <p className="t-cap q-cap q-center">{t(debate ? "o.hint.debate" : "o.hint.prediction")}</p>
        {debate ? (
          <div className="q-tf">
            {(["agree", "disagree"] as const).map((side, i) => (
              <ViewTransition key={side} name={`q-pick-${i}`} share="q-morph" default="none">
                <button className="q-tf__btn" style={{ "--i": i } as CSSProperties} onClick={() => pick(side)}>
                  <span className="q-tf__icon">
                    {i === 0 ? <ThumbsUpIcon size={38} weight="bold" aria-hidden="true" /> : <ThumbsDownIcon size={38} weight="bold" aria-hidden="true" />}
                  </span>
                  <span className="q-tf__label o-side-label">{choice(i)}</span>
                </button>
              </ViewTransition>
            ))}
          </div>
        ) : (
          <div className="q-options">
            {(q.options ?? []).map((_, i) => (
              <ViewTransition key={i} name={`q-pick-${i}`} share="q-morph" default="none">
                <button className="q-opt" style={{ "--i": i } as CSSProperties} onClick={() => pick(String(i))}>
                  <span className="q-letter">{letter(i)}</span>
                  <span>{choice(i)}</span>
                </button>
              </ViewTransition>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Step two: one line of reason, from the moment the vote is in. It is worth points however the vote turns
 * out, so skipping is a plain way out and not the loud one: the yellow button sends. Enter sends, as the
 * keypad's own key says ("Send"); the whole form sits in the top half, clear of the keyboard.
 */
export function Reasoning({ run, onLeave, onSend, onSkip }: Props & { onSend: (text: string) => void; onSkip: () => void }) {
  const q = run.question!;
  const o = run.opener!;
  const { t, debate, tag } = useOpenerLabels(q);
  const [text, setText] = useState("");
  const [empty, setEmpty] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const used = Array.from(text).length;

  const send = () => {
    if (text.trim() === "") {
      setEmpty(true);
      buzz(40);
      field.current?.focus();
      return;
    }
    buzz(14);
    startTransition(() => onSend(text));
  };

  return (
    <>
      <QuizTop onLeave={onLeave} label={tag} right={<TimerRing key={`${q.id}:reason`} duration={run.duration} elapsedAtMount={run.elapsed} seconds={run.secondsLeft} />} />
      <div className="q-body q-stack" key={`reason-${q.id}`}>
        <p className="q-question q-question--small">{q.prompt}</p>
        <VoteCard q={q} picked={run.picked} variant="slim" />
        {run.answer !== "none" && run.answer !== "late" && <AnswerDelivery status={run.answer} />}
        <form
          className="o-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor={id} className="o-why">
            <span className="o-why__q">{t("o.why")}</span>
            <span className="t-label muted">{t("o.reasonLabel")}</span>
          </label>
          <textarea
            ref={field}
            id={id}
            className="o-input"
            rows={3}
            maxLength={o.reasonMax}
            enterKeyHint="send"
            autoComplete="off"
            autoFocus
            placeholder={t("o.reasonPlaceholder")}
            value={text}
            aria-invalid={empty}
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              // One line: a pasted line break becomes a space, and Enter sends.
              setText(e.target.value.replace(/\s*\n\s*/g, " "));
              setEmpty(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="o-meta">
            <p id={`${id}-hint`} className="t-cap">
              {t(debate ? "o.reasonHint.debate" : "o.reasonHint.prediction")}
            </p>
            <span className="o-count" role="img" aria-label={t("o.countAria", { n: used, max: o.reasonMax })} data-full={used >= o.reasonMax}>
              {used}/{o.reasonMax}
            </span>
          </div>
          {empty && (
            <p className="n-err" role="alert">
              <WarningCircleIcon size={20} weight="bold" aria-hidden="true" />
              {t("o.err.empty")}
            </p>
          )}
          <button type="submit" className="btn btn--primary btn--block">
            {t("o.send")}
          </button>
          <button type="button" className="btn btn--plain btn--block" onClick={onSkip}>
            {t("o.skip")}
          </button>
        </form>
      </div>
    </>
  );
}

/** Rows of bars: how the class voted. The bars grow once, from the left, the first time they are shown. */
function VoteCounts({ q, votes, mine, right }: { q: SessionQuestion; votes: number[]; mine: number | null; right: number | null }) {
  const { t, side, debate, letter } = useOpenerLabels(q);
  const most = Math.max(1, ...votes);
  return (
    <section className="card o-counts" aria-label={t("o.counts")}>
      <h2 className="t-label muted o-counts__title">{t("o.counts")}</h2>
      <ul className="o-bars">
        {votes.map((n, i) => (
          <li key={i} className="o-bar" style={{ "--i": i, "--w": n / most } as CSSProperties} data-right={right === i} aria-label={t("o.barAria", { label: side(i), n })}>
            <div className="o-bar__top">
              <span className="o-bar__label">
                {!debate && <span className="o-bar__letter">{letter(i)}</span>}
                {side(i)}
              </span>
              <span className="o-bar__n">{n}</span>
            </div>
            <div className="o-bar__track" aria-hidden="true">
              <i />
            </div>
            {(mine === i || right === i) && (
              <div className="o-bar__tags">
                {mine === i && (
                  <span className="o-tag">
                    <UserIcon size={16} weight="bold" aria-hidden="true" />
                    {t("o.yourVote")}
                  </span>
                )}
                {right === i && (
                  <span className="o-tag o-tag--right">
                    <CheckIcon size={16} weight="bold" aria-hidden="true" />
                    {t("q.correctAnswer")}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The student's own reason, as they sent it, with where it has got to. */
function OwnReason({ run }: { run: SessionRunView }) {
  const { t } = useQT();
  const o = run.opener!;
  if (o.reasonAnswer === "late") {
    return (
      <p className="q-delivery" role="status">
        <HourglassIcon size={20} aria-hidden="true" />
        {t("o.reasonLate")}
      </p>
    );
  }
  if (o.reason === null) {
    return o.reasonSkipped ? <p className="t-cap q-cap o-skipped">{t("o.reasonSkipped")}</p> : null;
  }
  return (
    <div className="o-own">
      <span className="t-label muted">{t("o.yourReason")}</span>
      <p className="o-own__text">{o.reason}</p>
      {o.reasonAnswer !== "none" && <AnswerDelivery status={o.reasonAnswer} />}
    </div>
  );
}

/** The vote and the reason are in: wait for the class. Once voting closes the class's counts appear. */
export function OpenerWait({ run, onLeave }: Props) {
  const q = run.question!;
  const o = run.opener!;
  const { t, tag } = useOpenerLabels(q);
  const progress = o.votes === null ? run.progress : null;
  const closing = run.secondsLeft === 0;
  const mine = run.picked === null ? null : sideOf(run.picked);
  return (
    <>
      <QuizTop
        onLeave={onLeave}
        label={tag}
        right={closing ? undefined : <TimerRing key={`${q.id}:end`} duration={run.duration} elapsedAtMount={run.elapsed} seconds={run.secondsLeft} />}
      />
      <div className="q-body q-stack" key={`wait-${q.id}`}>
        <p className="q-question q-question--small">{q.prompt}</p>
        <VoteCard q={q} picked={run.picked} variant="full" />
        {run.picked !== null && run.answer !== "none" && run.answer !== "late" && <AnswerDelivery status={run.answer} />}
        {run.answer === "late" && (
          <p className="q-delivery" role="status">
            <HourglassIcon size={20} aria-hidden="true" />
            {t("ans.tooLate")}
          </p>
        )}
        <OwnReason run={run} />
        {o.votes ? (
          <VoteCounts q={q} votes={o.votes} mine={mine} right={null} />
        ) : (
          progress && (
            <section className="card q-answered" aria-label={`${progress.answered} ${t("o.voted", { total: progress.joined })}`}>
              <div className="q-answered__count">
                <span className="q-big">{progress.answered}</span>
                <span className="t-label muted">{t("o.voted", { total: progress.joined })}</span>
              </div>
            </section>
          )
        )}
      </div>
      <div className="q-foot q-status" role="status">
        <span className="q-status__line">
          <HourglassIcon size={22} color="var(--yellow)" aria-hidden="true" />
          {closing ? t("q.checking") : t("o.waitClass")}
        </span>
        <span className="t-cap q-cap">{t("o.waitNote")}</span>
      </div>
    </>
  );
}

/**
 * The opener's result: whether the vote was right (a prediction) or which side the student took (a debate,
 * where nothing is right or wrong), what the vote and the reason earned, how the class voted, and what some
 * of them wrote. The right answer and the reasons arrive with the teacher's reveal, a moment after the points.
 */
export function OpenerResult({ run, onLeave }: Props) {
  const q = run.question!;
  const o = run.opener!;
  const { t, debate, tag } = useOpenerLabels(q);
  const total = useCountUp(run.points, run.points - run.gain, 1000);
  const mine = run.picked === null ? null : sideOf(run.picked);
  const right = !debate && run.correctAnswer !== null ? sideOf(run.correctAnswer) : null;
  const voted = mine !== null;
  const wasRight = run.correct === true;
  const shown = o.reasons.slice(0, REASONS_SHOWN);

  const headline = !voted ? t("o.noVote") : debate ? t(mine === 0 ? "o.side.agree" : "o.side.disagree") : wasRight ? t("q.right") : t("q.wrong");
  const sub = !voted
    ? t("o.noVoteSub")
    : debate
      ? t("o.noRight")
      : wasRight
        ? t("o.voteRight")
        : o.reasonPoints > 0
          ? t("o.voteWrongReason")
          : t("o.voteWrong");

  return (
    <>
      <QuizTop onLeave={onLeave} label={tag} />
      <div className="q-body q-body--center q-body--tight o-head" role="status" key={`result-${q.id}`}>
        {debate || !voted ? (
          <span className="q-badge q-badge--no q-badge--sm q-pop">
            {voted ? <ChatsIcon size={40} aria-hidden="true" /> : <HourglassIcon size={40} color="var(--yellow)" aria-hidden="true" />}
          </span>
        ) : wasRight ? (
          <span className="q-badge q-badge--yes q-badge--sm q-pop">
            <CheckDraw size={52} />
          </span>
        ) : (
          <span className="q-badge q-badge--no q-badge--sm q-pop">
            <CrossDraw size={42} />
          </span>
        )}
        <h1 className="q-hero o-head__title">{headline}</h1>
        <p className="t-body muted o-head__sub">{sub}</p>
        {(o.votePoints > 0 || o.reasonPoints > 0) && (
          <div className="o-chips">
            {o.votePoints > 0 && (
              <span className="q-chip">
                <ArrowUpIcon size={18} weight="bold" aria-hidden="true" />
                {t("o.pts.vote", { n: o.votePoints })}
              </span>
            )}
            {o.reasonPoints > 0 && (
              <span className="q-chip">
                <ArrowUpIcon size={18} weight="bold" aria-hidden="true" />
                {t("o.pts.reason", { n: o.reasonPoints })}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="q-stack o-rest">
        {o.votes && <VoteCounts q={q} votes={o.votes} mine={mine} right={right} />}
        {voted && o.reason !== null && <OwnReason run={run} />}
        {shown.length > 0 && (
          <section className="o-reasons" aria-label={t("o.classSays")}>
            <h2 className="t-label muted o-reasons__title">
              {t("o.classSays")} <span className="o-anon">· {t("o.anon")}</span>
            </h2>
            <ul className="o-reasons__list">
              {shown.map((r, i) => (
                <li key={i} className="o-reason" style={{ "--i": i } as CSSProperties}>
                  <QuotesIcon size={20} weight="fill" aria-hidden="true" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="card q-total">
          <div className="q-total__text">
            <span className="t-label muted">{t("q.total")}</span>
            <span className="q-big">{total}</span>
          </div>
          <span className="q-chip">
            {run.gain > 0 && <ArrowUpIcon size={18} weight="bold" aria-hidden="true" />}
            {run.gain > 0 ? run.gain : "+0"}
          </span>
        </section>
      </div>
      <div className="q-foot q-status" role="status">
        <span className="q-status__line">
          <HourglassIcon size={22} color="var(--yellow)" aria-hidden="true" />
          {t("q.next")}
        </span>
        <span className="t-cap q-cap">{t("q.nextNote")}</span>
      </div>
    </>
  );
}
