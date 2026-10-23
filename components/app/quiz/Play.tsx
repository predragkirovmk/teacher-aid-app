"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckIcon, FlagCheckeredIcon, HashIcon, HourglassIcon, LockIcon, MinusIcon, PencilSimpleIcon, UsersIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState, ViewTransition, type ReactNode } from "react";
import { Avatar } from "@/components/app/Avatar";
import { AnswerDelivery, ConnectionPill } from "@/components/app/ConnectionPill";
import { ProfileEditor } from "@/components/app/ProfileEditor";
import { Sheet } from "@/components/app/Shell";
import { useUI } from "@/components/app/ui";
import type { Course, JoinedSession } from "@/lib/app/api/types";
import { formatTime } from "@/lib/app/format";
import { errorCopy, useT } from "@/lib/app/i18n";
import { leave } from "@/lib/app/nav";
import { useSelf } from "@/lib/app/profile";
import { initials, personName } from "@/lib/app/quiz";
import { canAsk } from "@/lib/app/session/ask";
import { useQT } from "@/lib/app/quiz-copy";
import type { SessionRunView } from "@/lib/app/session/controller";
import { useSession } from "@/lib/app/session/react";
import { subjectLabel } from "@/lib/app/subjects";
import { AskBody, AskEntry, FocusNotice } from "./Ask";
import { JoinFailureScreen } from "./JoinFailure";
import { formatNumeric } from "@/lib/app/numeric";
import { NumericQuestion, numberText } from "./Numeric";
import { Choices, choiceOf, responseOf, useChoiceLabels, type ChoiceQuestion } from "./choices";
import { OpenerResult, OpenerWait, Reasoning, Voting } from "./Opener";
import { Burst, CheckDraw, CrossDraw, QuizCard, QuizTop, TimerRing, buzz, useCountUp } from "./parts";

/** How long the "you're in" confirmation holds before the lesson itself is the screen. */
const JOINED_MS = 1700;

/**
 * The live quiz. What it draws comes from the session engine (lib/app/session): the server's
 * snapshots and events, never a script of its own. It moves through section 4.4's states: joined,
 * lobby, answering, waiting for others, right or wrong, waiting for the next question, and ended.
 */
export function Play({ course, join }: { course: Course; join: JoinedSession }) {
  const router = useRouter();
  const { confirm, toast } = useUI();
  const { t } = useQT();
  const { t: tt } = useT();
  const { run, answer, reason, skipReason, ask, retry } = useSession(join.session.id, join.attendance?.status === "late");
  // Joining the session was the check-in (spec 5.4): the screen starts from its answer, for a moment.
  const [confirming, setConfirming] = useState(join.attendance !== null);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => startTransition(() => setConfirming(false)), JOINED_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  // A short buzz for each verdict, where the phone supports it.
  useEffect(() => {
    if (run.stage === "right") buzz([18, 60, 28]);
    else if (run.stage === "wrong") buzz(70);
  }, [run.stage]);

  // The sheet for a question to the teacher. What is typed lives here, so a sheet closed by a question starting keeps it.
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  // A question opening for the class is the student's job now: the sheet steps aside, and says why.
  const mustAnswer = run.stage === "answering" || run.stage === "voting" || run.stage === "reasoning";
  useEffect(() => {
    if (!asking || !mustAnswer) return;
    startTransition(() => setAsking(false));
    toast(t("ask.paused"));
  }, [asking, mustAnswer, toast, t]);
  const askEntry = canAsk(run.stage) ? <AskEntry onOpen={() => setAsking(true)} /> : null;

  const onLeave = () =>
    confirm({ title: t("q.leaveTitle"), confirmLabel: t("q.leaveConfirm"), onConfirm: () => leave(router) });

  if (run.failed) {
    // The session would not load: not a join's failure, so its own words and the one thing to do, ask again.
    return (
      <JoinFailureScreen
        code={run.failed.code}
        copy={{
          kind: "generic",
          title: t("q.load.title"),
          body: errorCopy(tt, run.failed),
          cta: t("q.fail.retry"),
          action: "retry",
          secondary: { label: t("q.home"), action: "home" },
        }}
        onRetry={retry}
      />
    );
  }

  // The answer's own state is drawn under the locked card; the strip need not say it a second time.
  const lockedScreen =
    ((run.stage === "waiting_others" || run.stage === "waiting_result") && run.picked !== null) || run.stage === "reasoning" || run.stage === "opener_wait";
  // Said while the student is on the first question they came to, and gone once the lesson has ranked anyone.
  const lateNote = run.late && run.board === null && run.points === 0 && (run.stage === "answering" || run.stage === "waiting_others" || run.stage === "waiting_result");
  return (
    <main className="screen screen--bare q" data-stage={confirming ? "joined" : run.stage}>
      <div className="q__col">
        {confirming ? (
          <Joined course={course} join={join} />
        ) : (
          <>
            <ConnectionPill variant="inline" answerShown={lockedScreen || asking} />
            {lateNote && (
              <p className="q-note q-note--late" role="status">
                {t("q.late.note")}
              </p>
            )}
            {run.stage === "syncing" && <Connecting course={course} join={join} onLeave={onLeave} />}
            {run.stage === "waiting_start" && <Lobby course={course} join={join} run={run} onLeave={onLeave} askEntry={askEntry} />}
            {run.stage === "answering" &&
              (run.question!.kind === "numeric" ? (
                <NumericQuestion run={run} onLeave={onLeave} onPick={answer} />
              ) : (
                <Question run={run} onLeave={onLeave} onPick={answer} />
              ))}
            {(run.stage === "waiting_others" || run.stage === "waiting_result") && <Locked run={run} onLeave={onLeave} />}
            {run.stage === "voting" && <Voting run={run} onLeave={onLeave} onPick={answer} />}
            {run.stage === "reasoning" && <Reasoning run={run} onLeave={onLeave} onSend={reason} onSkip={skipReason} />}
            {run.stage === "opener_wait" && <OpenerWait run={run} onLeave={onLeave} />}
            {run.stage === "opener_result" && <OpenerResult run={run} onLeave={onLeave} askEntry={askEntry} />}
            {(run.stage === "right" || run.stage === "wrong") && <Verdict key={run.question?.id} run={run} />}
            {run.stage === "waiting_next" && <Between key={run.question?.id ?? "none"} course={course} join={join} run={run} onLeave={onLeave} onHome={() => router.replace("/app")} askEntry={askEntry} />}
            {run.stage === "ended" && <Ended run={run} onHome={() => router.replace("/app")} />}
            {asking && (
              <Sheet label={t("ask.title")} onClose={() => setAsking(false)}>
                {(close) => <AskBody run={run} draft={draft} setDraft={setDraft} onSend={ask} close={close} />}
              </Sheet>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Joined({ course, join }: { course: Course; join: JoinedSession }) {
  const { t } = useQT();
  const { t: tt, locale } = useT();
  const joinedAt = join.attendance?.joinedAt ?? null;
  const late = join.attendance?.status === "late";
  return (
    <>
      <div className="q-body q-body--center" role="status">
        <span className="q-badge q-badge--yes q-pop">
          <CheckDraw size={70} />
        </span>
        <h1 className="q-hero">{t("q.joined.title")}</h1>
        <p className="q-strong">
          {t("q.joined.sub", { subject: subjectLabel(tt, course.subjectId, course.subjectName), teacher: personName(course.teacherName, locale) })}
        </p>
        {joinedAt !== null && <p className="t-cap q-cap">{t("q.joined.time", { time: formatTime(joinedAt) })}</p>}
        {late && <p className="t-body muted q-late-text">{t("q.late.note")}</p>}
      </div>
      <div className="q-foot">
        <ViewTransition name="q-card" share="q-morph" default="none">
          <QuizCard course={course} title={join.session.lessonTitle} count={join.session.questionCount} live={false} />
        </ViewTransition>
        <p className="t-label muted q-opening">{t("q.opening")}</p>
      </div>
    </>
  );
}

/** Between the confirmation and the first snapshot: the quiz card and a word that we are on our way. */
function Connecting({ course, join, onLeave }: { course: Course; join: JoinedSession; onLeave: () => void }) {
  const { t } = useQT();
  const { t: tt } = useT();
  return (
    <>
      <QuizTop onLeave={onLeave} label={subjectLabel(tt, course.subjectId, course.subjectName)} />
      <div className="q-body q-stack">
        <QuizCard course={course} title={join.session.lessonTitle} count={join.session.questionCount} />
      </div>
      <div className="q-foot q-status" role="status">
        <span className="q-status__line">
          <HourglassIcon size={22} color="var(--yellow)" aria-hidden="true" />
          {t("q.connecting")}
        </span>
      </div>
    </>
  );
}

function Lobby({ course, join, run, onLeave, askEntry }: { course: Course; join: JoinedSession; run: SessionRunView; onLeave: () => void; askEntry: ReactNode }) {
  const { t } = useQT();
  const { t: tt } = useT();
  const me = useSelf();
  const [editing, setEditing] = useState(false);
  const others = Math.max(0, run.joined - run.recent.length);
  return (
    <>
      <QuizTop onLeave={onLeave} label={subjectLabel(tt, course.subjectId, course.subjectName)} />
      <div className="q-body q-stack">
        <ViewTransition name="q-card" share="q-morph" default="none">
          <QuizCard course={course} title={run.title ?? join.session.lessonTitle} count={run.questionCount ?? join.session.questionCount} />
        </ViewTransition>
        <button className="card q-me" onClick={() => setEditing(true)}>
          <Avatar photo={me.photo} initials={me.initials} size={56} />
          <span className="q-me__text">
            <span className="q-me__name">{me.name}</span>
            <span className="t-cap">{t("q.you")}</span>
          </span>
          <PencilSimpleIcon size={22} aria-hidden="true" />
        </button>
        <section className="card q-joined" aria-label={`${run.joined} ${t("q.joinedCount")}`}>
          <div className="row row--between" style={{ alignItems: "flex-end" }}>
            <div className="q-joined__count">
              <span key={run.joined} className="q-big q-tick">
                {run.joined}
              </span>
              <span className="t-label muted">{t("q.joinedCount")}</span>
            </div>
            <UsersIcon size={30} aria-hidden="true" />
          </div>
          {run.recent.length > 0 && (
            <div className="q-faces" aria-hidden="true">
              {run.recent.map((name, i) => (
                <span key={name} className={`q-face ${i % 2 ? "q-face--deep" : "q-face--ice"}`}>
                  {initials(name)}
                </span>
              ))}
              {others > 0 && <span className="q-faces__more">+{others}</span>}
            </div>
          )}
        </section>
      </div>
      <div className="q-foot q-status" role="status">
        <span className="q-status__line">
          <HourglassIcon size={22} color="var(--yellow)" aria-hidden="true" />
          {t("q.waitTeacher")}
        </span>
        <span className="t-cap q-cap">{t("q.keepOpen")}</span>
        <FocusNotice />
        {askEntry}
      </div>
      {editing && (
        <Sheet label={t("p.editTitle")} onClose={() => setEditing(false)}>
          {(close) => <ProfileEditor onDone={close} />}
        </Sheet>
      )}
    </>
  );
}

function Question({ run, onLeave, onPick }: { run: SessionRunView; onLeave: () => void; onPick: (response: string) => void }) {
  const { t } = useQT();
  const q = run.question!;
  const choice = q as ChoiceQuestion;
  const pick = (i: number) => {
    buzz(14);
    startTransition(() => onPick(responseOf(choice, i)));
  };

  return (
    <>
      <QuizTop
        onLeave={onLeave}
        label={t("q.progress", { n: q.index + 1, total: q.total })}
        done={q.index + 1}
        total={q.total}
        right={<TimerRing key={q.id} duration={run.duration} elapsedAtMount={run.elapsed} seconds={run.secondsLeft} />}
      />
      <div className="q-body q-ask" key={`ask-${q.id}`}>
        {q.kind === "true_false" && <span className="t-label muted">{t("q.tfPrompt")}</span>}
        <h1 className="q-question">{q.prompt}</h1>
      </div>
      <div className="q-foot">
        <p className="t-cap q-cap q-center">{t("q.tapHint")}</p>
        <Choices q={choice} onPick={pick} morph />
      </div>
    </>
  );
}

/**
 * The answer is in (waiting for others), or time is up and the result is on its way. The answer is
 * final once tapped (BR-ANS-02); what the screen waits for is the class, or the server's verdict.
 */
function Locked({ run, onLeave }: { run: SessionRunView; onLeave: () => void }) {
  const { t, locale } = useQT();
  const q = run.question!;
  const { label, mark } = useChoiceLabels(q);
  const closing = run.stage === "waiting_result";
  const numeric = q.kind === "numeric";
  const picked = run.picked === null ? null : numeric ? 0 : choiceOf(q, run.picked);
  const progress = !closing ? run.progress : null;
  const dots = progress ? Math.min(progress.joined, 40) : 0;

  return (
    <>
      <QuizTop
        onLeave={onLeave}
        label={t("q.progress", { n: q.index + 1, total: q.total })}
        done={q.index + 1}
        total={q.total}
        right={closing ? undefined : <TimerRing key={q.id} duration={run.duration} elapsedAtMount={run.elapsed} seconds={run.secondsLeft} />}
      />
      <div className="q-body q-stack">
        <p className="q-question q-question--small">{q.prompt}</p>
        {picked !== null ? (
          <ViewTransition name={numeric ? "q-pick-n" : `q-pick-${picked}`} share="q-morph" default="none">
            <div className="q-locked">
              <span className="t-label q-locked__head">
                <LockIcon size={18} weight="bold" aria-hidden="true" />
                {t("q.locked")}
              </span>
              <span className="q-answer">
                <span className="q-letter q-letter--ink">{numeric ? <HashIcon size={22} weight="bold" aria-hidden="true" /> : mark(picked)}</span>
                {numeric ? numberText(run.picked!, q, locale) : label(picked)}
              </span>
            </div>
          </ViewTransition>
        ) : (
          <div className="q-locked q-locked--none">
            <span className="t-label q-locked__head">
              <HourglassIcon size={18} weight="bold" aria-hidden="true" />
              {t("q.timeout")}
            </span>
          </div>
        )}
        {picked !== null && run.answer !== "none" && run.answer !== "late" && <AnswerDelivery status={run.answer} />}
        {progress && (
          <section className="card q-answered" aria-label={`${progress.answered} ${t("q.answered", { total: progress.joined })}`}>
            <div className="q-answered__count">
              <span className="q-big">{progress.answered}</span>
              <span className="t-label muted">{t("q.answered", { total: progress.joined })}</span>
            </div>
            <div className="q-dots" aria-hidden="true">
              {Array.from({ length: dots }, (_, i) => (
                <i key={i} data-on={i < progress.answered} />
              ))}
            </div>
          </section>
        )}
      </div>
      <p className="q-foot t-cap q-cap q-center" role="status">
        {closing ? (run.answer === "saved" || run.answer === "sending" ? t("q.savedWait") : t("q.checking")) : t("q.waitNote")}
      </p>
    </>
  );
}

function Verdict({ run }: { run: SessionRunView }) {
  const { t, locale } = useQT();
  const q = run.question!;
  const { letters, label, mark } = useChoiceLabels(q);
  const gain = useCountUp(run.gain, 0, 700);
  const total = useCountUp(run.points, run.points - run.gain, 1000);
  const numeric = q.kind === "numeric";
  const picked = run.picked === null ? null : numeric ? 0 : choiceOf(q, run.picked);
  const right = run.correctAnswer === null ? null : numeric ? 0 : choiceOf(q, run.correctAnswer);
  // A number: the student's own value and the right one, each with its unit, in the student's script.
  const yours = numeric && run.picked !== null ? numberText(run.picked, q, locale) : null;
  const exact = numeric && run.correctAnswer !== null ? numberText(run.correctAnswer, q, locale) : null;
  const tolerance = q.numeric && q.numeric.tolerance > 0 ? formatNumeric(String(q.numeric.tolerance), locale) : null;

  return (
    <>
      {run.correct ? (
        <div className="q-body q-body--center" role="status">
          <span className="q-badge-wrap">
            <Burst />
            <span className="q-badge q-badge--yes q-pop">
              <CheckDraw size={74} />
            </span>
          </span>
          <h1 className="q-hero">{t("q.right")}</h1>
          <span className="q-gain">+{gain}</span>
          <span className="t-cap q-cap">
            {run.bonus > 0 ? t("q.breakdown", { base: run.gain - run.bonus, bonus: run.bonus }) : t("q.breakdownBase", { base: run.gain })}
          </span>
          {/* Right within the tolerance, but not on the dot: say what the exact value is. */}
          {yours !== null && exact !== null && yours !== exact && <span className="t-cap q-cap">{t("n.exactValue", { text: exact })}</span>}
        </div>
      ) : (
        <>
          <div className="q-body q-body--center q-body--tight" role="status">
            <span className="q-badge q-badge--no q-pop">
              <CrossDraw size={60} />
            </span>
            <h1 className="q-hero">{picked === null ? t("q.timeout") : t("q.wrong")}</h1>
            <p className="t-body muted" style={{ margin: 0 }}>
              {run.answer === "late" ? t("q.tooLate") : picked === null ? t("q.timeoutSub") : t("q.wrongSub")}
            </p>
          </div>
          <div className="q-mid">
            {right !== null ? (
              <div className="q-correct">
                <span className="t-label q-locked__head">
                  <CheckIcon size={18} weight="bold" aria-hidden="true" />
                  {numeric ? t("n.correctValue") : t("q.correctAnswer")}
                </span>
                <span className="q-answer">
                  <span className="q-letter q-letter--blue">{numeric ? <HashIcon size={22} weight="bold" aria-hidden="true" /> : mark(right)}</span>
                  {numeric ? exact : label(right)}
                </span>
                {numeric && tolerance && <span className="t-cap q-correct__note">{t("n.tolerance", { tol: tolerance })}</span>}
              </div>
            ) : (
              <p className="t-cap q-cap q-wait" role="status">
                <HourglassIcon size={18} color="var(--yellow)" aria-hidden="true" />
                {t("q.waitReveal")}
              </p>
            )}
            {picked !== null && (
              <p className="t-cap q-cap" style={{ margin: "0 8px" }}>
                {numeric
                  ? t("n.yours", { text: yours! })
                  : q.kind === "true_false"
                    ? t("q.yourAnswerTf", { text: label(picked) })
                    : t("q.yourAnswer", { letter: letters[picked], text: label(picked) })}
              </p>
            )}
          </div>
        </>
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
    </>
  );
}

/** How far the student moved since they last saw the ranking, in words. */
function Movement({ run }: { run: SessionRunView }) {
  const { t } = useQT();
  if (run.rank === null || run.rankBefore === null) return null;
  const moved = run.rankBefore - run.rank;
  return (
    <span className="q-chip">
      {moved > 0 ? (
        <ArrowUpIcon size={18} weight="bold" color="var(--yellow)" aria-hidden="true" />
      ) : moved < 0 ? (
        <ArrowDownIcon size={18} weight="bold" aria-hidden="true" />
      ) : (
        <MinusIcon size={18} weight="bold" aria-hidden="true" />
      )}
      {moved === 1 ? t("q.up1") : moved > 1 ? t("q.upN", { n: moved }) : moved === -1 ? t("q.down1") : moved < -1 ? t("q.downN", { n: -moved }) : t("q.same")}
    </span>
  );
}

/** Three rows of the session's ranking around the student's own. */
function Board({ run }: { run: SessionRunView }) {
  const { t, locale } = useQT();
  const me = useSelf();
  const rows = run.board!;
  const at = Math.max(0, rows.findIndex((r) => r.studentId === run.meId));
  const start = Math.max(0, Math.min(at - 1, rows.length - 3));
  const slice = rows.slice(start, start + 3);
  const moved = run.rankBefore !== null && run.rank !== null ? run.rankBefore - run.rank : 0;
  return (
    <ol className="list q-board" aria-label={t("q.board")}>
      {slice.map((r, i) => {
        const mine = r.studentId === run.meId;
        const below = moved > 0 && i > 0 && slice[i - 1].studentId === run.meId;
        return (
          <li key={r.studentId} className={`q-row${mine ? " q-row--me" : ""}${mine && moved > 0 ? " q-row--climb" : ""}${below ? " q-row--drop" : ""}`}>
            <span className="q-row__rank">{r.rank}</span>
            {mine ? (
              <Avatar photo={me.photo} initials={me.initials} size={44} />
            ) : (
              <span className={`q-face ${(start + i) % 2 ? "q-face--deep" : "q-face--ice"}`} aria-hidden="true">
                {initials(r.name)}
              </span>
            )}
            <span className="q-row__name">{mine ? t("q.me", { name: me.first }) : personName(r.name, locale)}</span>
            <span className="q-row__pts" aria-label={t("q.pts", { n: r.points })}>
              {r.points}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Between questions: where the student stands, and that the next one comes when the teacher sends it. */
function Between({
  course,
  join,
  run,
  onLeave,
  onHome,
  askEntry,
}: {
  course: Course;
  join: JoinedSession;
  run: SessionRunView;
  onLeave: () => void;
  onHome: () => void;
  askEntry: ReactNode;
}) {
  const { t } = useQT();
  const { t: tt } = useT();
  const q = run.question;
  const wrapping = run.sessionState === "review" || (run.last && q !== null);

  // No question yet (the lesson is still on the opener, or has just begun): nothing to rank.
  if (!q || q.opener || run.rank === null) {
    return (
      <>
        <QuizTop onLeave={onLeave} label={subjectLabel(tt, course.subjectId, course.subjectName)} />
        <div className="q-body q-stack">
          <QuizCard course={course} title={run.title ?? join.session.lessonTitle} count={run.questionCount ?? join.session.questionCount} />
        </div>
        <div className="q-foot q-status" role="status">
          <span className="q-status__line">
            <HourglassIcon size={22} color="var(--yellow)" aria-hidden="true" />
            {t("q.next")}
          </span>
          <span className="t-cap q-cap">{t("q.nextNote")}</span>
          <FocusNotice />
          {askEntry}
        </div>
      </>
    );
  }

  return (
    <>
      <QuizTop onLeave={onLeave} label={t("q.doneOf", { n: q.index + 1, total: q.total })} done={q.index + 1} total={q.total} />
      <div className="q-body q-body--center q-body--tight">
        <span className="q-rank">{run.rank}.</span>
        <span className="q-rank__label">{t("q.place")}</span>
        <Movement run={run} />
      </div>
      {run.board && run.board.length > 0 && <Board run={run} />}
      <div className="q-foot q-status" role="status">
        {run.skipped && <span className="t-cap q-cap">{t("q.skipped")}</span>}
        {wrapping ? (
          <>
            <span className="q-status__line">{t("q.last")}</span>
            <span className="t-cap q-cap">{t("q.lastNote")}</span>
            <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={onHome}>
              {t("q.home")}
            </button>
          </>
        ) : (
          <>
            <span className="q-status__line">
              <HourglassIcon size={22} color="var(--yellow)" aria-hidden="true" />
              {t("q.next")}
            </span>
            <span className="t-cap q-cap">{t("q.nextNote")}</span>
            <FocusNotice />
          </>
        )}
        {askEntry}
      </div>
    </>
  );
}

/** The teacher ended the session (F-10): the student's results, points and place, and the way to the summary. */
function Ended({ run, onHome }: { run: SessionRunView; onHome: () => void }) {
  const { t } = useQT();
  const total = useCountUp(run.points, 0, 900);
  return (
    <>
      {/* An answer saved offline that reached the server only after the End did not count. */}
      {run.answer === "late" && (
        <p className="q-note" role="status">
          {t("ans.ended")}
        </p>
      )}
      <div className="q-body q-body--center q-body--tight" role="status">
        <span className="q-badge q-badge--no q-pop">
          <FlagCheckeredIcon size={56} color="var(--yellow)" aria-hidden="true" />
        </span>
        <h1 className="q-hero q-hero--fail">{t("q.ended.title")}</h1>
        {run.summary && <p className="q-strong">{t("q.ended.right", { right: run.summary.right, total: run.summary.total })}</p>}
      </div>
      <div className="q-ended">
        {run.rank !== null && (
          <div className="q-ended__rank">
            <span className="q-rank q-rank--small">{run.rank}.</span>
            <span className="q-rank__label">{t("q.place")}</span>
          </div>
        )}
        <section className="card q-total">
          <div className="q-total__text">
            <span className="t-label muted">{t("q.total")}</span>
            <span className="q-big">{total}</span>
          </div>
        </section>
      </div>
      <div className="q-foot">
        <Link className="btn btn--primary btn--block" href={`/app/summary/${encodeURIComponent(run.sessionId)}`} replace>
          {t("q.ended.summary")}
        </Link>
        <button className="btn btn--plain btn--block" onClick={onHome}>
          {t("q.home")}
        </button>
      </div>
    </>
  );
}
