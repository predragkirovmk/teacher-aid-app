"use client";

import { CheckCircleIcon, CircleDashedIcon, ClockCountdownIcon, EyeIcon, MinusCircleIcon, PaperPlaneTiltIcon, SkipForwardIcon, TimerIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { fireQuestion, revealQuestion, skipQuestion } from "@/lib/teacher/api/hooks";
import type { ConsoleQuestion, ConsoleSnapshot } from "@/lib/teacher/api/types";
import { useServerNow } from "@/lib/teacher/clock";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { nudgeMinutes, optionLetter, panelStep, secondsLeft } from "@/lib/teacher/questions";
import { ConfirmDialog } from "./ConfirmDialog";
import { useCalm } from "./LiveRoster";
import { Problem } from "./Problem";

/** "Question 3 of 8, choose an answer": the label over a question, for the sent and the next alike. */
export function questionLine(q: ConsoleQuestion, snapshot: ConsoleSnapshot, t: ReturnType<typeof useT>["t"]): string {
  const lessonTotal = snapshot.questions.filter((x) => !x.adhoc).length;
  const n = snapshot.questions.indexOf(q) + 1;
  const which = q.adhoc ? t("q.adhoc.tag") : t("q.panel.label", { n, total: lessonTotal });
  return `${which}, ${t(`question.kind.${q.question.kind}`).toLowerCase()}`;
}

/** The right answer in words, for the console: "B. Реку", "Точно", "12 cm". */
export function answerWords(q: ConsoleQuestion, t: ReturnType<typeof useT>["t"]): string {
  const question = q.question;
  if (question.kind === "true_false") return t(question.correct === "true" ? "q.adhoc.true" : "q.adhoc.false");
  if (question.kind === "multiple_choice") {
    const at = Number(question.correct);
    return `${optionLetter(at)}. ${question.options[at]}`;
  }
  return `${question.correct.replace(".", ",")}${question.unit ? ` ${question.unit}` : ""}`;
}

/**
 * "Прашањето сега" (4.2): the one place a teacher looks while teaching. It follows the question's life, and the page's one yellow button is always the
 * next sensible step:
 * - nothing open: the next question not yet sent, with what it is, and yellow "Send the question";
 * - open: a calm countdown on the server's clock and how many have answered; no yellow while it runs, and the time is the question's (BR-TIME-04 may close it
 *   sooner, by itself);
 * - closed: yellow "Show the right answer";
 * - answer shown: the counts and the right answer, then yellow "Send the next question".
 * Skipping asks first (BR-SKIP-01). The panel is read from the questions alone, so a reload or a second window shows the same.
 */
export function QuestionPanel({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { t, te, locale } = useT();
  const sessionId = snapshot.session.id;
  const step = panelStep(snapshot.questions);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState<"send" | "reveal" | "skip" | null>(null);
  const [problem, setProblem] = useState<{ title: string; error: unknown } | null>(null);
  const [skipping, setSkipping] = useState<ConsoleQuestion | null>(null);

  // What the panel is on: a change of it is the teacher's own press or the clock's. If the focus was on the button that went away, it moves on to the new one.
  const on = step.step === "send" ? `send:${step.next?.id ?? "none"}` : `${step.step}:${step.question.id}`;
  const was = useRef(on);
  useEffect(() => {
    if (was.current === on) return;
    was.current = on;
    const active = document.activeElement;
    if (active && active !== document.body && !panel.current?.contains(active)) return;
    (panel.current?.querySelector<HTMLElement>("[data-main]") ?? heading.current)?.focus();
  }, [on]);

  const run = async (kind: "send" | "reveal" | "skip", title: string, call: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(kind);
    setProblem(null);
    try {
      await call();
    } catch (e) {
      setProblem({ title, error: e });
    } finally {
      setBusy(null);
    }
  };

  const open = step.step === "open" ? step.question : null;
  const now = useServerNow(snapshot.server_now, open !== null);
  const left = open?.closes_at ? secondsLeft(open.closes_at, 0, now) : 0;
  const progress = (q: ConsoleQuestion) => t(isOne(q.answered, locale) ? "q.progress.one" : "q.progress", { n: q.answered, total: q.joined });
  const calmProgress = useCalm(step.step === "open" || step.step === "closed" ? progress(step.question) : "");

  const skipTarget = step.step === "send" ? step.next : step.step === "open" || step.step === "closed" ? step.question : null;

  const skipButton = skipTarget && (
    <button type="button" className="btn btn--secondary" aria-haspopup="dialog" disabled={busy !== null} onClick={() => setSkipping(skipTarget)}>
      <SkipForwardIcon size={24} aria-hidden="true" />
      {t("q.skip")}
    </button>
  );

  return (
    <section ref={panel} className="card qpanel" aria-labelledby={titleId} data-step={step.step}>
      <h2 id={titleId} ref={heading} tabIndex={-1} className="qpanel__title">
        {t("q.panel.title")}
      </h2>

      {step.step === "send" && (
        <>
          {step.skipped && (
            <p className="qpanel__said">
              <MinusCircleIcon size={24} aria-hidden="true" />
              {t("q.skipped.said", { prompt: step.skipped.question.prompt })}
            </p>
          )}
          {step.next ? (
            <>
              <p className="qpanel__label">
                {t("q.next.label")}: {questionLine(step.next, snapshot, t)}
              </p>
              <p className="qpanel__prompt" data-testid="panel-prompt">
                {step.next.question.prompt}
              </p>
              <div className="qpanel__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--big"
                  data-main
                  aria-busy={busy === "send"}
                  disabled={busy !== null}
                  onClick={() => step.next && void run("send", t("q.send.failed"), () => fireQuestion(sessionId, (step.next as ConsoleQuestion).id))}
                >
                  <PaperPlaneTiltIcon size={28} weight="fill" aria-hidden="true" />
                  {t("q.send")}
                </button>
                {skipButton}
              </div>
              <p className="qpanel__hint">{t("q.send.what")}</p>
            </>
          ) : (
            <>
              <p className="qpanel__state">
                <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
                {t("q.none.title")}
              </p>
              <p className="qpanel__hint">{t("q.none.body")}</p>
            </>
          )}
        </>
      )}

      {step.step === "open" && (
        <>
          <p className="qpanel__label">{questionLine(step.question, snapshot, t)}</p>
          <p className="qpanel__prompt">{step.question.question.prompt}</p>
          <div className="qpanel__timer">
            <TimerIcon size={40} aria-hidden="true" />
            <p className="qpanel__count" role="timer" aria-live="off" data-testid="countdown">
              {t(isOne(left, locale) ? "q.left.one" : "q.left", { n: left })}
            </p>
          </div>
          <p className="qpanel__progress" data-testid="progress" aria-hidden="true">
            {progress(step.question)}
          </p>
          <p className="sr" role="status">
            {calmProgress}
          </p>
          <div className="qpanel__actions">{skipButton}</div>
          <p className="qpanel__hint">{t("q.open.wait")}</p>
        </>
      )}

      {step.step === "closed" && (
        <>
          <p className="qpanel__state">
            <TimerIcon size={32} aria-hidden="true" />
            {t("q.closed.title")}
          </p>
          <p className="qpanel__prompt">{step.question.question.prompt}</p>
          <p className="qpanel__progress" data-testid="progress">
            {progress(step.question)}
          </p>
          <div className="qpanel__actions">
            <button
              type="button"
              className="btn btn--primary btn--big"
              data-main
              aria-busy={busy === "reveal"}
              disabled={busy !== null}
              onClick={() => void run("reveal", t("q.reveal.failed"), () => revealQuestion(sessionId, step.question.id))}
            >
              <EyeIcon size={28} weight="fill" aria-hidden="true" />
              {t("q.reveal")}
            </button>
            {skipButton}
          </div>
          <p className="qpanel__hint">{t("q.reveal.what")}</p>
        </>
      )}

      {step.step === "revealed" && (
        <>
          <p className="qpanel__state">
            <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
            {t("q.revealed.title")}
          </p>
          <p className="qpanel__prompt">{step.question.question.prompt}</p>
          <p className="qpanel__answer" data-testid="right-answer">
            <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
            {t("q.revealed.answer", { answer: answerWords(step.question, t) })}
          </p>
          {step.question.counts && (
            <ul className="qpanel__counts" aria-label={t("q.revealed.title")}>
              <li>
                <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
                <span>{t("q.revealed.right")}</span> <strong>{step.question.counts.right}</strong>
              </li>
              <li>
                <MinusCircleIcon size={24} aria-hidden="true" />
                <span>{t("q.revealed.wrong")}</span> <strong>{step.question.counts.wrong}</strong>
              </li>
              <li>
                <CircleDashedIcon size={24} aria-hidden="true" />
                <span>{t("q.revealed.none")}</span> <strong>{step.question.counts.unanswered}</strong>
              </li>
            </ul>
          )}
          {step.next ? (
            <>
              <div className="qpanel__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--big"
                  data-main
                  aria-busy={busy === "send"}
                  disabled={busy !== null}
                  onClick={() => step.next && void run("send", t("q.send.failed"), () => fireQuestion(sessionId, (step.next as ConsoleQuestion).id))}
                >
                  <PaperPlaneTiltIcon size={28} weight="fill" aria-hidden="true" />
                  {t("q.next")}
                </button>
              </div>
              <p className="qpanel__hint">{t("q.next.what", { prompt: step.next.question.prompt })}</p>
            </>
          ) : (
            <p className="qpanel__hint" data-testid="none-left">
              {t("q.none.title")}. {t("q.none.body")}
            </p>
          )}
        </>
      )}

      {snapshot.nudge && (step.step === "send" || step.step === "revealed") && step.next && (
        <p className="qpanel__nudge" role="status" data-testid="nudge">
          <ClockCountdownIcon size={24} aria-hidden="true" />
          {t(nudgeMinutes(snapshot.nudge.idle_seconds) === 1 ? "q.nudge.one" : "q.nudge", { n: nudgeMinutes(snapshot.nudge.idle_seconds) })}
        </p>
      )}

      {problem && <Problem title={problem.title}>{te(problem.error)}</Problem>}

      <SkipQuestion
        question={skipping}
        onStay={() => setSkipping(null)}
        onConfirm={async () => {
          const target = skipping;
          setSkipping(null);
          if (target) await run("skip", t("q.skip.failed"), () => skipQuestion(sessionId, target.id));
        }}
      />
    </section>
  );
}

/** The question before a question is taken out of the lesson: it will not count, in plain words, and the safe answer is the default (BR-SKIP-01). */
export function SkipQuestion({ question, onStay, onConfirm }: { question: ConsoleQuestion | null; onStay: () => void; onConfirm: () => void | Promise<void> }) {
  const { t } = useT();
  return (
    <ConfirmDialog
      open={question !== null}
      title={t("q.skip.title")}
      body={t(question?.status === "ready" ? "q.skip.body.ready" : "q.skip.body")}
      stay={t("q.skip.stay")}
      confirm={t("q.skip.yes")}
      onStay={onStay}
      onConfirm={onConfirm}
    />
  );
}
