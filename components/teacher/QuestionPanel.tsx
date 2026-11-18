"use client";

import { CheckCircleIcon, CircleDashedIcon, ClockCountdownIcon, MinusCircleIcon, PaperPlaneTiltIcon, SkipForwardIcon, TimerIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { isApiError } from "@/lib/teacher/api/errors";
import { fireQuestion, skipQuestion } from "@/lib/teacher/api/hooks";
import type { ConsoleQuestion, ConsoleSnapshot } from "@/lib/teacher/api/types";
import { useServerNow } from "@/lib/teacher/clock";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { nudgeMinutes, optionLetter, panelStep, secondsLeft } from "@/lib/teacher/questions";
import { ConfirmDialog } from "./ConfirmDialog";
import { EndLesson } from "./EndLesson";
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
 * "Прашањето сега" (4.2): the one place a teacher looks while teaching. It follows the question's life, and the page's one main button is always the
 * next sensible step:
 * - nothing open: the next question not yet sent, with what it is, and the main button "Send the question";
 * - open: a calm countdown on the server's clock and how many have answered; no main button while it runs, and the time is the question's (BR-TIME-04 may end it
 *   sooner, by itself);
 * - ended: the right answer shows by itself, with the counts, then the main button "Send the next question";
 * - nothing left to send (the last answer has shown, or the rest were skipped): the panel says that was the last question and offers End, the same red
 *   button as the top bar. Nothing opens by itself: the teacher stays as long as they like, for the anonymous questions.
 * Skipping asks first (BR-SKIP-01). The panel is read from the questions alone, so a reload or a second window shows the same.
 */
export function QuestionPanel({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { t, te, locale } = useT();
  const sessionId = snapshot.session.id;
  const step = panelStep(snapshot.questions);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState<"send" | "skip" | null>(null);
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

  const run = async (kind: "send" | "skip", title: string, call: () => Promise<unknown>) => {
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
  const calmProgress = useCalm(step.step === "open" ? progress(step.question) : "");

  const skipTarget = step.step === "send" || step.step === "revealed" ? step.next : step.question;

  const skipButton = skipTarget && (
    <button type="button" className="btn btn--secondary" aria-haspopup="dialog" aria-disabled={busy !== null} onClick={() => setSkipping(skipTarget)}>
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
                  aria-disabled={busy !== null}
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
              <LastState />
              <LastEnd sessionId={sessionId} />
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

      {step.step === "revealed" && (
        <>
          {/* When this was the last question, its state line says so; the answer and the counts stay below it. */}
          {step.next ? (
            <p className="qpanel__state">
              <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
              {t("q.revealed.title")}
            </p>
          ) : (
            <LastState />
          )}
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
                  aria-disabled={busy !== null}
                  onClick={() => step.next && void run("send", t("q.send.failed"), () => fireQuestion(sessionId, (step.next as ConsoleQuestion).id))}
                >
                  <PaperPlaneTiltIcon size={28} weight="fill" aria-hidden="true" />
                  {t("q.next")}
                </button>
                {skipButton}
              </div>
              <p className="qpanel__hint">{t("q.next.what", { prompt: step.next.question.prompt })}</p>
            </>
          ) : (
            <LastEnd sessionId={sessionId} />
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

      {/* The question the dialog asks about may end (its answer shows by itself) or be skipped elsewhere while the dialog is open: then there is nothing left to ask. */}
      <SkipQuestion
        question={skipping && ["ready", "open"].includes(snapshot.questions.find((q) => q.id === skipping.id)?.status ?? "") ? skipping : null}
        onStay={() => setSkipping(null)}
        onConfirm={async () => {
          const target = skipping;
          setSkipping(null);
          // A question that ended in the same instant is part of the lesson now, and the panel already shows its answer: that refusal is not a failure.
          if (target)
            await run("skip", t("q.skip.failed"), () =>
              skipQuestion(sessionId, target.id).catch((e: unknown) => {
                if (!(isApiError(e) && e.code === "invalid_state")) throw e;
              }),
            );
        }}
      />
    </section>
  );
}

/** After the last question, the state line: this was the last one. */
function LastState() {
  const { t } = useT();
  return (
    <p className="qpanel__state" data-testid="none-left">
      <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
      {t("q.last.title")}
    </p>
  );
}

/** After the last question: that the anonymous questions stay in their tab, and the red End with its own confirm. No window opens by itself. */
function LastEnd({ sessionId }: { sessionId: string }) {
  const { t } = useT();
  return (
    <>
      <p className="qpanel__hint">{t("q.last.hint")}</p>
      <div className="qpanel__actions">
        <EndLesson sessionId={sessionId} />
      </div>
    </>
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
