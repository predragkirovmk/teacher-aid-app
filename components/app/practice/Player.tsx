"use client";

import { CheckCircleIcon, CheckIcon, CloudArrowUpIcon, HourglassIcon, XCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectionPill } from "@/components/app/ConnectionPill";
import { Gate } from "@/components/app/QueryState";
import { Top } from "@/components/app/Top";
import { Choices, choiceOf, responseOf, type ChoiceQuestion } from "@/components/app/quiz/choices";
import { NumberField } from "@/components/app/quiz/Numeric";
import { CheckDraw, QuizTop, buzz, useCountUp } from "@/components/app/quiz/parts";
import { markNotificationsRead, useCourses, useNotifications } from "@/lib/app/api/hooks";
import type { PracticeQuestion, PracticeSet } from "@/lib/app/api/types";
import { useT } from "@/lib/app/i18n";
import { leave } from "@/lib/app/nav";
import { formatNumeric, withUnit } from "@/lib/app/numeric";
import { PRACTICE_POINTS, type PracticeView, type QuestionState } from "@/lib/app/practice";
import { usePracticeRun } from "@/lib/app/practice-run";
import { noteMoment } from "@/lib/app/push";
import { useQT } from "@/lib/app/quiz-copy";
import { useNet } from "@/lib/app/session/net";
import { subjectLabel } from "@/lib/app/subjects";

/**
 * A practice set, answered at the student's own pace (F-12): the quiz's questions with no clock and no class. Each answer is saved on the
 * phone and checked; the screen says right or wrong and why, then the student moves on when they like. Leaving costs nothing and the set is
 * picked up where it was left, from the server's record or the phone's.
 */
export function PracticePlayer({ id }: { id: string }) {
  const { t } = useT();
  const { set, view, answer } = usePracticeRun(id);
  const { data: notifications } = useNotifications();

  // Opening a set is reading the alert that announced it, so Home stops calling it new.
  const announced = notifications?.find((n) => n.kind === "practice_set_sent" && n.payload.practiceSetId === id && n.readAt === null);
  useEffect(() => {
    if (announced) markNotificationsRead([announced.id]).catch(() => {});
  }, [announced]);

  return (
    <Gate query={set} header={<Top title={t("pr.title")} />}>
      {(s) => (s && view ? <Run key={s.id} set={s} view={view} answer={answer} /> : <Missing />)}
    </Gate>
  );
}

function Missing() {
  const { t } = useT();
  return (
    <main className="screen">
      <Top title={t("pr.title")} />
      <p className="muted" style={{ textAlign: "center", marginTop: 60 }}>
        {t("pr.missing")}
      </p>
      <Link href="/app/practice" replace className="btn btn--ghost btn--block" style={{ marginTop: 24 }}>
        {t("pr.missing.cta")}
      </Link>
    </main>
  );
}

function Run({ set, view, answer }: { set: PracticeSet; view: PracticeView; answer: (questionId: string, response: string) => Promise<void> }) {
  const router = useRouter();
  const total = set.questions.length;
  // Where the student carries on from, fixed when the screen opens: answering a question must not move the screen on by itself,
  // the student moves on when they have read the verdict.
  const [at, setAt] = useState(() => view.next ?? total);
  const onLeave = () => leave(router);

  if (at >= total) return <End set={set} view={view} onLeave={onLeave} />;
  const q = set.questions[at];
  return (
    <Step
      key={q.id}
      set={set}
      q={q}
      state={view.items[at]}
      view={view}
      index={at}
      onAnswer={(response) => answer(q.id, response)}
      onNext={() => setAt(at + 1)}
      onLeave={onLeave}
    />
  );
}

/** Words for a response: the option's, true or false, or the number as the student's language writes it, with its unit. */
function useAnswerText() {
  const { t, locale } = useQT();
  return (q: PracticeQuestion, response: string) => {
    if (q.kind === "true_false") return t(response === "true" ? "q.true" : "q.false");
    if (q.kind === "numeric") return withUnit(formatNumeric(response, locale), q.numeric?.unit ?? null);
    return q.options?.[Number(response)] ?? response;
  };
}

function Step({
  set,
  q,
  state,
  view,
  index,
  onAnswer,
  onNext,
  onLeave,
}: {
  set: PracticeSet;
  q: PracticeQuestion;
  state: QuestionState;
  view: PracticeView;
  index: number;
  onAnswer: (response: string) => Promise<void>;
  onNext: () => void;
  onLeave: () => void;
}) {
  const { t } = useT();
  const { t: qt, locale } = useQT();
  const total = set.questions.length;
  const net = useNet();
  const away = net.banner === "offline" || net.banner === "reconnecting";
  const last = index === total - 1;
  const text = useAnswerText();
  const [picked, setPicked] = useState<number | null>(null);
  const choice: ChoiceQuestion | null = q.kind === "numeric" ? null : q;
  const open = state.status === "open";

  const send = (response: string) => {
    buzz(14);
    void onAnswer(response);
  };

  // Points a right answer was worth, as the server credited them.
  const perRight = view.right > 0 ? Math.round(view.points / view.right) : PRACTICE_POINTS;
  const verdict = state.status === "checked" ? state.verdict : null;
  const given = state.status === "open" ? null : state.response;

  return (
    <main className="screen screen--bare q pr" data-stage={state.status}>
      <div className="q__col">
        <ConnectionPill variant="inline" answerShown />
        <QuizTop
          onLeave={onLeave}
          leaveLabel={t("pr.leave")}
          label={t("pr.progress", { n: index + 1, total })}
          done={index + (open ? 0 : 1)}
          total={total}
        />
        <div className={`q-body q-ask${q.kind === "numeric" ? " q-ask--num" : ""}`} key={`ask-${q.id}`}>
          {q.kind === "true_false" && <span className="t-label muted">{qt("q.tfPrompt")}</span>}
          <h1 className={`q-question${q.kind === "numeric" ? " q-question--num" : ""}`}>{q.prompt}</h1>
          {q.kind === "numeric" && (
            <NumberField
              unit={q.numeric?.unit ?? null}
              allowNegative={q.numeric?.allowNegative ?? false}
              submitLabel={t("pr.check")}
              locked={given === null ? null : formatNumeric(given, locale)}
              autoFocus={open}
              onSubmit={send}
            />
          )}
        </div>

        <div className="q-foot pr-foot">
          {choice && (
            <Choices
              q={choice}
              picked={given === null ? picked : choiceOf(choice, given)}
              locked={!open && !verdict}
              shown={verdict ? { right: choiceOf(choice, verdict.correctAnswer) } : null}
              onPick={setPicked}
            />
          )}

          {open && choice && (
            <>
              <button
                className="btn btn--primary btn--block"
                aria-disabled={picked === null}
                aria-describedby={picked === null ? "pr-pick" : undefined}
                onClick={() => {
                  if (picked !== null) send(responseOf(choice, picked));
                }}
              >
                {t("pr.check")}
              </button>
              <p id="pr-pick" className="t-cap q-cap q-center">
                {picked === null ? t("pr.pick") : t("pr.saveNote")}
              </p>
            </>
          )}
          {open && !choice && <p className="t-cap q-cap q-center">{t("pr.saveNote")}</p>}

          {state.status === "saved" && (
            <>
              <p className="pr-note" role="status">
                {away ? (
                  <>
                    <CloudArrowUpIcon size={20} aria-hidden="true" />
                    {t("pr.saved")}
                  </>
                ) : (
                  <>
                    <HourglassIcon size={20} aria-hidden="true" />
                    {t("pr.checking")}
                  </>
                )}
              </p>
              {/* The way on is offered when the verdict is not coming soon; while it is, the screen waits for it. */}
              {away && (
                <button className="btn btn--primary btn--block" onClick={onNext}>
                  {last ? t("pr.result") : t("pr.next")}
                </button>
              )}
            </>
          )}

          {verdict && (
            <>
              <section className="pr-verdict" role="status" data-right={verdict.correct}>
                <h2 className="pr-verdict__head">
                  {verdict.correct ? <CheckCircleIcon size={26} weight="bold" aria-hidden="true" /> : <XCircleIcon size={26} weight="bold" aria-hidden="true" />}
                  <span className="grow">{verdict.correct ? t("pr.right") : t("pr.wrong")}</span>
                  {verdict.correct && perRight > 0 && <span className="pr-verdict__gain">{t("pr.gain", { n: perRight })}</span>}
                </h2>
                {!verdict.correct && <p className="pr-verdict__line">{t("pr.correctIs", { a: text(q, verdict.correctAnswer) })}</p>}
                {verdict.explanation && (
                  <p className="pr-verdict__why">
                    <b>{t("pr.why")}</b> {verdict.explanation}
                  </p>
                )}
              </section>
              <button className="btn btn--primary btn--block" onClick={onNext} autoFocus>
                {last ? t("pr.result") : t("pr.next")}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/** After the last question: the result when every verdict is in, else a word that they are still on their way. */
function End({ set, view, onLeave }: { set: PracticeSet; view: PracticeView; onLeave: () => void }) {
  const { t } = useT();
  const courses = useCourses();
  const course = courses.data?.find((c) => c.id === set.courseId);
  const label = course ? subjectLabel(t, course.subjectId, course.subjectName) : (set.lessonTitle ?? "");
  const total = set.questions.length;
  const score = useCountUp(view.right, 0, 700);
  const points = useCountUp(view.points, 0, 900);
  const text = useAnswerText();
  // A finished set is a moment worth asking about notifications; the ask waits for a calm screen (lib/app/push).
  const finished = view.finished;
  useEffect(() => {
    if (finished) noteMoment("practice_done");
  }, [finished]);

  if (!view.finished) {
    return (
      <main className="screen screen--bare q pr" data-stage="waiting">
        <div className="q__col">
          <ConnectionPill variant="inline" answerShown />
          <QuizTop onLeave={onLeave} leaveLabel={t("pr.leave")} label={label} />
          <div className="q-body q-body--center" role="status">
            <span className="q-badge q-badge--no">
              <CloudArrowUpIcon size={56} aria-hidden="true" />
            </span>
            <h1 className="q-hero q-hero--fail">{t("pr.wait.title")}</h1>
            <p className="t-body muted q-fail__body">{t("pr.wait.body")}</p>
          </div>
          <div className="q-foot">
            <button className="btn btn--primary btn--block" onClick={onLeave}>
              {t("close")}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="screen screen--bare q pr" data-stage="done">
      <div className="q__col">
        <ConnectionPill variant="inline" answerShown />
        <QuizTop onLeave={onLeave} leaveLabel={t("pr.leave")} label={label} />
        <div className="q-body q-body--center q-body--tight" role="status">
          <span className="q-badge q-badge--no">
            <CheckDraw size={64} />
          </span>
          <h1 className="q-hero">{t("pr.done.score", { score, total })}</h1>
          <p className="q-strong">{t("pr.done.sub")}</p>
          {view.points > 0 && <span className="q-chip">{t("pr.gain", { n: points })}</span>}
          {view.right === total && <p className="t-cap q-cap">{t("pr.done.all")}</p>}
        </div>
        <div className="pr-foot">
          <button className="btn btn--primary btn--block" onClick={onLeave}>
            {t("close")}
          </button>
        </div>
        <section className="pr-review" aria-label={t("pr.review")}>
          <h2 className="section-h">{t("pr.review")}</h2>
          <ol className="list">
            {set.questions.map((q, i) => {
              const item = view.items[i];
              const checked = item.status === "checked" ? item : null;
              return (
                <li key={q.id} className="item" style={{ alignItems: "flex-start" }}>
                  <span className="rank">{i + 1}</span>
                  <span className="grow">
                    <span className="item__title" style={{ display: "block" }}>
                      {q.prompt}
                    </span>
                    {checked && (
                      <span className="status" style={{ marginTop: 8 }}>
                        {checked.verdict.correct ? <CheckIcon size={20} weight="bold" aria-hidden="true" /> : <XCircleIcon size={20} aria-hidden="true" />}
                        {checked.verdict.correct ? t("pr.right") : t("pr.wrong")}
                      </span>
                    )}
                    {checked && !checked.verdict.correct && (
                      <span className="t-cap" style={{ display: "block", marginTop: 4 }}>
                        {t("pr.correctIs", { a: text(q, checked.verdict.correctAnswer) })}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}
