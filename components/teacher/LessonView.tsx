"use client";

import { CheckCircleIcon, PencilSimpleIcon, TimerIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useState, type ReactNode } from "react";
import { startEditing, useLesson } from "@/lib/teacher/api/hooks";
import type { DraftQuestion } from "@/lib/teacher/api/types";
import { decimal, isOne } from "@/lib/teacher/format";
import { useT, type Key } from "@/lib/teacher/i18n";
import { backFromLesson, draftUrl, fromOf, isSaved, liveUrl, type Saved } from "@/lib/teacher/routes";
import { DeleteLesson } from "./DeleteLesson";
import { OnceLine } from "./OnceLine";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";
import { StartLessonButton } from "./StartLessonButton";
import { kindLine } from "./LessonCard";

/** What the lesson page says once on arriving: from a save of a new lesson, from a save of changes, or from a copy of a colleague's lesson. */
const SAVED_WORDS = { new: "lesson.saved.new", changes: "lesson.saved.changes", copied: "lesson.saved.copied" } as const satisfies Record<Saved, Key>;

/**
 * A lesson, to read: its title, subject and year, what the teacher asked to stress, and the questions in order, each with
 * its kind in words, its answers, which one is right (an icon and the words "Точен одговор", never colour alone), its timer
 * and why. Two things to do with it: start a class (the main one), and edit it, which opens a draft of it to change (a lesson
 * is read here, and changed on a draft's page, where every change saves itself). Coming from saving, a line says so once.
 * Back goes to the screen the teacher came from, and names it.
 */
export function LessonView() {
  const { t } = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const from = useSearchParams().get("from");
  const back = backFromLesson(from);
  const q = useLesson(id);
  const lesson = q.data;
  // What the address said when the page opened: that a save has just been made. Told once, then taken off the address.
  const [saved, setSaved] = useState<Saved | null>(null);
  const [opening, setOpening] = useState(false);
  const [openProblem, setOpenProblem] = useState<unknown>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("saved");
    if (value === null) return;
    if (isSaved(value)) startTransition(() => setSaved(value));
    params.delete("saved");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, []);

  const edit = async () => {
    if (opening) return;
    setOpening(true);
    setOpenProblem(null);
    try {
      const draft = await startEditing(id);
      router.push(draftUrl(draft.id, fromOf(from)));
    } catch (e) {
      setOpenProblem(e);
      setOpening(false);
    }
  };

  return (
    <>
      <PageHeader title={lesson?.title ?? t("lesson.title")} subtitle={lesson ? kindLine(t, lesson) : undefined} back={back.href} backLabel={t(back.label)} />
      <div className="content">
        {q.status === "loading" && (
          <Loading>
            <Bar width="14rem" height="3.5rem" className="skeleton--button" />
            <div className="questions" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="question">
                  <Bar width="60%" height="1.75rem" />
                  <Bar width="80%" height="1.5rem" />
                  <Bar width="40%" height="1.5rem" />
                </div>
              ))}
            </div>
          </Loading>
        )}
        {q.status === "error" && <LoadProblem title={t("lesson.error.title")} error={q.error} onRetry={q.refetch} />}
        {lesson && (
          <>
            {saved && <OnceLine>{t(SAVED_WORDS[saved])}</OnceLine>}
            <div className="lesson__buttons">
              <StartLessonButton lesson={lesson} primary />
              <button type="button" className="btn btn--secondary" aria-busy={opening} onClick={() => void edit()}>
                <PencilSimpleIcon size={24} aria-hidden="true" />
                {t("lesson.edit")}
              </button>
            </div>
            {lesson.last_session_id && (
              <p>
                <Link href={liveUrl(lesson.last_session_id)} prefetch={false} className="btn btn--quiet" data-testid="last-run">
                  {t("lesson.lastrun")}
                </Link>
              </p>
            )}
            {openProblem !== null && <LoadProblem title={t("lesson.edit.failed")} error={openProblem} onRetry={() => void edit()} />}
            {lesson.emphasis && (
              <div className="card card--stack">
                <h2>{t("lesson.emphasis")}</h2>
                <p>{`„${lesson.emphasis}“`}</p>
              </div>
            )}
            <QuestionList questions={lesson.questions} />
            <DeleteLesson lesson={lesson} />
          </>
        )}
      </div>
    </>
  );
}

/** The questions of a lesson, in order, each to read. A draft's page lists its own, each with the means to edit it. */
export function QuestionList({ questions }: { questions: readonly DraftQuestion[] }) {
  const { t } = useT();
  return (
    <section aria-labelledby="questions">
      <h2 className="section__title" id="questions">
        {t("lesson.questions.title")}
      </h2>
      <ol className="questions">
        {[...questions]
          .sort((a, b) => a.order - b.order)
          .map((question, i, all) => (
            <QuestionCard key={question.id} question={question} n={i + 1} total={all.length} />
          ))}
      </ol>
    </section>
  );
}

/**
 * One question to read, a row of the list: its number at the left, its prompt, its kind and timer at the right, its answers with the
 * right one marked, and why. The number is drawn alone; a screen reader hears the whole "Прашање 2 од 6" from the heading. A question
 * that is not finished (a draft's) says what is missing in grey words instead of showing nothing. `actions` is the button at the
 * row's right end (the editor's "Уреди").
 */
export function QuestionCard({ question, n, total, actions, headingId }: { question: DraftQuestion; n: number; total: number; actions?: ReactNode; headingId?: string }) {
  const { t, locale } = useT();
  return (
    <li className="question question--read" id={`q-${question.id}`}>
      <span className="question__num" aria-hidden="true">
        {n}
      </span>
      <div className="question__top">
        <h3 className="question__n sr" id={headingId}>
          {t("question.n", { n, total })}
        </h3>
        <p className="question__meta">
          <span>{t(`question.kind.${question.kind}`)}</span>
          <span>
            <TimerIcon size={24} aria-hidden="true" />
            {t(isOne(question.timer_seconds, locale) ? "question.timer.one" : "question.timer", { n: question.timer_seconds })}
          </span>
        </p>
      </div>
      {question.media && (
        <figure className="question__figure">
          {/* eslint-disable-next-line @next/next/no-img-element -- the picture comes from the API, already made phone-sized (FR-LES-11) */}
          <img className="question__image" src={question.media.url} alt={question.media.alt || t("question.image")} />
          {/* The words are the picture's name for a screen reader; seen here for the teacher, who reads them with the picture and does not hear them twice. */}
          {question.media.alt && <figcaption aria-hidden="true">{t("image.caption", { alt: question.media.alt })}</figcaption>}
        </figure>
      )}
      {question.prompt.trim() ? <p className="question__prompt">{question.prompt}</p> : <p className="question__prompt question__blank">{t("question.blank")}</p>}
      <Answers question={question} />
      {question.explanation && (
        <div className="question__why">
          <p className="question__label">{t("question.explanation")}</p>
          <p>{question.explanation}</p>
        </div>
      )}
      {actions && <div className="question__actions">{actions}</div>}
    </li>
  );
}

/** The answers of a question, the right one marked with a tick and the words. */
function Answers({ question }: { question: DraftQuestion }) {
  const { t, locale } = useT();
  const right = (
    <span className="option__correct">
      <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
      {t("question.correct")}
    </span>
  );
  if (question.kind === "multiple_choice") {
    return (
      <ol className="options">
        {question.options.map((text, i) => {
          const correct = String(i) === question.correct;
          return (
            <li key={i} className="option" data-correct={correct}>
              <span className={text.trim() ? "option__text" : "option__text question__blank"}>{text.trim() ? text : t("question.option.blank")}</span>
              {correct && right}
            </li>
          );
        })}
      </ol>
    );
  }
  if (question.kind === "true_false") {
    return (
      <ul className="options options--plain">
        {(["true", "false"] as const).map((v) => (
          <li key={v} className="option" data-correct={v === question.correct}>
            <span className="option__text">{t(v === "true" ? "question.true" : "question.false")}</span>
            {v === question.correct && right}
          </li>
        ))}
      </ul>
    );
  }
  const answer = question.correct.trim();
  const value = `${decimal(answer, locale)}${question.unit ? ` ${question.unit}` : ""}`;
  return (
    <>
      <ul className="options options--plain">
        <li className="option" data-correct={answer !== ""}>
          <span className={answer ? "option__text" : "option__text question__blank"}>{answer ? value : t("question.answer.blank")}</span>
          {answer && right}
        </li>
      </ul>
      {question.tolerance > 0 && <p className="question__note">{t("question.tolerance", { tolerance: decimal(String(question.tolerance), locale) })}</p>}
    </>
  );
}
