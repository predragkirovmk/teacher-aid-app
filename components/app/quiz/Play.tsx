"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckIcon, HourglassIcon, LockIcon, MinusIcon, PencilSimpleIcon, UsersIcon, XIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState, useSyncExternalStore, ViewTransition, type CSSProperties } from "react";
import { Avatar } from "@/components/app/Avatar";
import { ProfileEditor } from "@/components/app/ProfileEditor";
import { Sheet } from "@/components/app/Shell";
import { useUI } from "@/components/app/ui";
import type { Subject } from "@/lib/app/data";
import { formatTime } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { leave } from "@/lib/app/nav";
import { useMe } from "@/lib/app/profile";
import { CLASSMATES, CORRECT_POINTS, LETTERS, QUIZZES, initials, personName, useQuiz, type QuizRun } from "@/lib/app/quiz";
import { useQT } from "@/lib/app/quiz-copy";
import { actions, useApp } from "@/lib/app/store";
import { Burst, CheckDraw, CrossDraw, QuizCard, QuizTop, TimerRing, useCountUp } from "./parts";

const noop = () => () => {};

const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers throw when vibration is blocked; it is only a nicety.
  }
};

/** The live quiz: one screen that moves through joined, lobby, question, result and between. */
export function Play({ subject }: { subject: Subject }) {
  const router = useRouter();
  const { confirm } = useUI();
  const { t } = useQT();
  const { signedIn } = useApp();
  const quiz = QUIZZES[subject.id];
  const run = useQuiz(quiz, actions.addQuizPoints);
  // False while hydrating, when signedIn is still the server default rather than the saved value.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  // Joining is the check-in (spec 5.4); the store keeps one per subject per hour.
  useEffect(() => {
    if (hydrated && signedIn) actions.checkIn(subject.id);
  }, [hydrated, signedIn, subject.id]);

  // Achievements come from quiz play: a first answer, right or wrong, and a whole quiz answered right.
  useEffect(() => {
    if (run.stage !== "reveal") return;
    if (run.picked !== null) actions.markQuizAnswered();
    if (run.last && run.right === run.total) actions.markPerfectQuiz();
  }, [run.stage, run.picked, run.last, run.right, run.total]);

  // A short buzz for each verdict, where the phone supports it.
  useEffect(() => {
    if (run.stage === "reveal") buzz(run.correct ? [18, 60, 28] : 70);
  }, [run.stage, run.correct]);

  const onLeave = () =>
    confirm({ title: t("q.leaveTitle"), confirmLabel: t("q.leaveConfirm"), onConfirm: () => leave(router) });

  return (
    <main className="screen screen--bare q" data-stage={run.stage}>
      <div className="q__col">
        {run.stage === "joined" && <Joined subject={subject} />}
        {run.stage === "lobby" && <Lobby subject={subject} run={run} onLeave={onLeave} />}
        {run.stage === "question" && <Question run={run} onLeave={onLeave} />}
        {run.stage === "reveal" && <Reveal key={run.index} run={run} />}
        {run.stage === "between" && <Between key={run.index} run={run} onLeave={onLeave} onHome={() => router.replace("/app")} />}
      </div>
    </main>
  );
}

function Joined({ subject }: { subject: Subject }) {
  const { t } = useQT();
  const { t: tt } = useT();
  const { checkins } = useApp();
  const entry = checkins.find((c) => c.subject === subject.id);
  return (
    <>
      <div className="q-body q-body--center" role="status">
        <span className="q-badge q-badge--yes q-pop">
          <CheckDraw size={70} />
        </span>
        <h1 className="q-hero">{t("q.joined.title")}</h1>
        <p className="q-strong">{t("q.joined.sub", { subject: tt(`subj.${subject.id}`), teacher: tt(`teacher.${subject.id}`) })}</p>
        {entry && <p className="t-cap q-cap">{t("q.joined.time", { time: formatTime(entry.at) })}</p>}
      </div>
      <div className="q-foot">
        <ViewTransition name="q-card" share="q-morph" default="none">
          <QuizCard subject={subject} quiz={QUIZZES[subject.id]} live={false} />
        </ViewTransition>
        <p className="t-label muted q-opening">{t("q.opening")}</p>
      </div>
    </>
  );
}

function Lobby({ subject, run, onLeave }: { subject: Subject; run: QuizRun; onLeave: () => void }) {
  const { t } = useQT();
  const { t: tt } = useT();
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const others = run.joined - run.joinedRecent.length;
  return (
    <>
      <QuizTop onLeave={onLeave} label={tt(`subj.${subject.id}`)} />
      <div className="q-body q-stack">
        <ViewTransition name="q-card" share="q-morph" default="none">
          <QuizCard subject={subject} quiz={QUIZZES[subject.id]} />
        </ViewTransition>
        <button className="card q-me" onClick={() => setEditing(true)}>
          <Avatar avatar={me.avatar} initials={me.initials} size={56} />
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
          <div className="q-faces" aria-hidden="true">
            {run.joinedRecent.map((i) => (
              <span key={i} className={`q-face ${i % 2 ? "q-face--deep" : "q-face--ice"}`}>
                {initials(CLASSMATES[i])}
              </span>
            ))}
            {others > 0 && <span className="q-faces__more">+{others}</span>}
          </div>
        </section>
      </div>
      <div className="q-foot q-status" role="status">
        <span className="q-status__line">
          <HourglassIcon size={22} color="var(--yellow)" aria-hidden="true" />
          {t("q.waitTeacher")}
        </span>
        <span className="t-cap q-cap">{t("q.keepOpen")}</span>
      </div>
      {editing && (
        <Sheet label={t("p.editTitle")} onClose={() => setEditing(false)}>
          {(close) => <ProfileEditor onDone={close} />}
        </Sheet>
      )}
    </>
  );
}

function Question({ run, onLeave }: { run: QuizRun; onLeave: () => void }) {
  const { t, locale } = useQT();
  const q = run.question;
  const letters = LETTERS[locale];
  const label = (i: number) => (q.kind === "tf" ? t(i === 0 ? "q.true" : "q.false") : q.options[i][locale]);
  const pick = (i: number) => {
    buzz(14);
    startTransition(() => run.pick(i));
  };

  return (
    <>
      <QuizTop
        onLeave={onLeave}
        label={t("q.progress", { n: run.index + 1, total: run.total })}
        done={run.index + 1}
        total={run.total}
        right={<TimerRing key={run.index} duration={run.duration} elapsedAtMount={run.elapsed} seconds={run.secondsLeft} />}
      />
      {run.picked === null ? (
        <>
          <div className="q-body q-ask" key={`ask-${run.index}`}>
            {q.kind === "tf" && <span className="t-label muted">{t("q.tfPrompt")}</span>}
            <h1 className="q-question">{q.text[locale]}</h1>
          </div>
          <div className="q-foot">
            <p className="t-cap q-cap q-center">{t("q.tapHint")}</p>
            {q.kind === "mc" ? (
              <div className="q-options">
                {q.options.map((o, i) => (
                  <ViewTransition key={i} name={`q-pick-${i}`} share="q-morph" default="none">
                    <button className="q-opt" style={{ "--i": i } as CSSProperties} onClick={() => pick(i)}>
                      <span className="q-letter">{letters[i]}</span>
                      <span>{o[locale]}</span>
                    </button>
                  </ViewTransition>
                ))}
              </div>
            ) : (
              <div className="q-tf">
                {[0, 1].map((i) => (
                  <ViewTransition key={i} name={`q-pick-${i}`} share="q-morph" default="none">
                    <button className="q-tf__btn" style={{ "--i": i } as CSSProperties} onClick={() => pick(i)}>
                      <span className="q-tf__icon">{i === 0 ? <CheckIcon size={38} weight="bold" aria-hidden="true" /> : <XIcon size={38} weight="bold" aria-hidden="true" />}</span>
                      <span className="q-tf__label">{label(i)}</span>
                    </button>
                  </ViewTransition>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="q-body q-stack">
            <p className="q-question q-question--small">{q.text[locale]}</p>
            <ViewTransition name={`q-pick-${run.picked}`} share="q-morph" default="none">
              <div className="q-locked">
                <span className="t-label q-locked__head">
                  <LockIcon size={18} weight="bold" aria-hidden="true" />
                  {t("q.locked")}
                </span>
                <span className="q-answer">
                  <span className="q-letter q-letter--ink">
                    {q.kind === "tf" ? run.picked === 0 ? <CheckIcon size={22} weight="bold" aria-hidden="true" /> : <XIcon size={22} weight="bold" aria-hidden="true" /> : letters[run.picked]}
                  </span>
                  {label(run.picked)}
                </span>
              </div>
            </ViewTransition>
            <section className="card q-answered" aria-label={`${run.answered + 1} ${t("q.answered", { total: run.classSize + 1 })}`}>
              <div className="q-answered__count">
                <span className="q-big">{run.answered + 1}</span>
                <span className="t-label muted">{t("q.answered", { total: run.classSize + 1 })}</span>
              </div>
              <div className="q-dots" aria-hidden="true">
                {Array.from({ length: run.classSize + 1 }, (_, i) => (
                  <i key={i} data-on={i <= run.answered} />
                ))}
              </div>
            </section>
          </div>
          <p className="q-foot t-cap q-cap q-center" role="status">
            {t("q.waitNote")}
          </p>
        </>
      )}
    </>
  );
}

function Reveal({ run }: { run: QuizRun }) {
  const { t, locale } = useQT();
  const q = run.question;
  const letters = LETTERS[locale];
  const label = (i: number) => (q.kind === "tf" ? t(i === 0 ? "q.true" : "q.false") : q.options[i][locale]);
  const mark = (i: number) =>
    q.kind === "tf" ? i === 0 ? <CheckIcon size={22} weight="bold" aria-hidden="true" /> : <XIcon size={22} weight="bold" aria-hidden="true" /> : letters[i];
  const gain = useCountUp(run.gain, 0, 700);
  const total = useCountUp(run.points, run.points - run.gain, 1000);

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
            {run.bonus > 0 ? t("q.breakdown", { base: CORRECT_POINTS, bonus: run.bonus }) : t("q.breakdownBase", { base: CORRECT_POINTS })}
          </span>
        </div>
      ) : (
        <>
          <div className="q-body q-body--center q-body--tight" role="status">
            <span className="q-badge q-badge--no q-pop">
              <CrossDraw size={60} />
            </span>
            <h1 className="q-hero">{run.picked === null ? t("q.timeout") : t("q.wrong")}</h1>
            <p className="t-body muted" style={{ margin: 0 }}>
              {run.picked === null ? t("q.timeoutSub") : t("q.wrongSub")}
            </p>
          </div>
          <div className="q-mid">
            <div className="q-correct">
              <span className="t-label q-locked__head">
                <CheckIcon size={18} weight="bold" aria-hidden="true" />
                {t("q.correctAnswer")}
              </span>
              <span className="q-answer">
                <span className="q-letter q-letter--blue">{mark(q.answer)}</span>
                {label(q.answer)}
              </span>
            </div>
            {run.picked !== null && (
              <p className="t-cap q-cap" style={{ margin: "0 8px" }}>
                {q.kind === "tf"
                  ? t("q.yourAnswerTf", { text: label(run.picked) })
                  : t("q.yourAnswer", { letter: letters[run.picked], text: label(run.picked) })}
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

function Between({ run, onLeave, onHome }: { run: QuizRun; onLeave: () => void; onHome: () => void }) {
  const { t, locale } = useQT();
  const me = useMe();
  const rows = [
    { key: "me", me: true, index: -1, points: run.points },
    ...CLASSMATES.map((_, i) => ({ key: `c${i}`, me: false, index: i, points: run.theirs[i] })),
  ].sort((a, b) => b.points - a.points || (a.me ? -1 : b.me ? 1 : a.index - b.index));
  const at = rows.findIndex((r) => r.me);
  const start = Math.max(0, Math.min(at - 1, rows.length - 3));
  const slice = rows.slice(start, start + 3).map((r) => ({ ...r, rank: 1 + rows.filter((x) => x.points > r.points).length }));
  const moved = run.rankBefore - run.rank;
  const up = moved > 0;

  return (
    <>
      <QuizTop onLeave={onLeave} label={t("q.doneOf", { n: run.index + 1, total: run.total })} done={run.index + 1} total={run.total} />
      <div className="q-body q-body--center q-body--tight">
        <span className="q-rank">{run.rank}.</span>
        <span className="q-rank__label">{t("q.place")}</span>
        <span className="q-chip">
          {moved > 0 ? (
            <ArrowUpIcon size={18} weight="bold" color="var(--yellow)" aria-hidden="true" />
          ) : moved < 0 ? (
            <ArrowDownIcon size={18} weight="bold" aria-hidden="true" />
          ) : (
            <MinusIcon size={18} weight="bold" aria-hidden="true" />
          )}
          {moved === 1
            ? t("q.up1")
            : moved > 1
              ? t("q.upN", { n: moved })
              : moved === -1
                ? t("q.down1")
                : moved < -1
                  ? t("q.downN", { n: -moved })
                  : t("q.same")}
        </span>
      </div>
      <ol className="list q-board" aria-label={t("q.board")}>
        {slice.map((r, i) => {
          const below = up && i > 0 && slice[i - 1].me;
          return (
            <li key={r.key} className={`q-row${r.me ? " q-row--me" : ""}${r.me && up ? " q-row--climb" : ""}${below ? " q-row--drop" : ""}`}>
              <span className="q-row__rank">{r.rank}</span>
              {r.me ? (
                <Avatar avatar={me.avatar} initials={me.initials} size={44} />
              ) : (
                <span className={`q-face ${r.index % 2 ? "q-face--deep" : "q-face--ice"}`} aria-hidden="true">
                  {initials(CLASSMATES[r.index])}
                </span>
              )}
              <span className="q-row__name">{r.me ? t("q.me", { name: me.first }) : personName(CLASSMATES[r.index], locale)}</span>
              <span className="q-row__pts" aria-label={t("q.pts", { n: r.points })}>
                {r.points}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="q-foot q-status" role="status">
        {run.last ? (
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
          </>
        )}
      </div>
    </>
  );
}
