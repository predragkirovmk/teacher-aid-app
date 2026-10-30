"use client";

import { CheckCircleIcon, TimerIcon } from "@phosphor-icons/react";
import { useParams, useSearchParams } from "next/navigation";
import { useLesson } from "@/lib/teacher/api/hooks";
import type { Question } from "@/lib/teacher/api/types";
import { decimal, isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { backFromLesson } from "@/lib/teacher/routes";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";
import { StartLessonButton } from "./StartLessonButton";
import { kindLine } from "./LessonCard";

/**
 * A lesson, to read: its title, subject and year, what the teacher asked to stress, and the questions in order, each with
 * its kind in words, its answers, which one is right (an icon and the words "Точен одговор", never colour alone), its timer
 * and why. Nothing can be changed here yet (step 6 adds editing); the one thing to do is start a class with it. Back goes to
 * the screen the teacher came from, and names it.
 */
export function LessonView() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const from = useSearchParams().get("from");
  const back = backFromLesson(from);
  const q = useLesson(id);
  const lesson = q.data;

  return (
    <>
      <PageHeader title={lesson?.title ?? t("lesson.title")} subtitle={lesson ? kindLine(t, lesson) : undefined} back={back.href} backLabel={t(back.label)} />
      <div className="content">
        {q.status === "loading" && (
          <Loading>
            <Bar width="14rem" height="3.5rem" className="skeleton--button" />
            {[0, 1].map((i) => (
              <div key={i} className="question" aria-hidden="true">
                <Bar width="30%" height="1.75rem" />
                <Bar width="80%" height="2rem" />
                <Bar height="3.5rem" className="skeleton--row" />
                <Bar height="3.5rem" className="skeleton--row" />
              </div>
            ))}
          </Loading>
        )}
        {q.status === "error" && <LoadProblem title={t("lesson.error.title")} error={q.error} onRetry={q.refetch} />}
        {lesson && (
          <>
            <div>
              <StartLessonButton lesson={lesson} primary />
            </div>
            {lesson.emphasis && (
              <div className="card card--stack">
                <h2>{t("lesson.emphasis")}</h2>
                <p>{`„${lesson.emphasis}“`}</p>
              </div>
            )}
            <QuestionList questions={lesson.questions} />
          </>
        )}
      </div>
    </>
  );
}

/** The questions of a lesson or a draft, in order, each to read. Step 6 makes the cards editable here. */
export function QuestionList({ questions }: { questions: readonly Question[] }) {
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

function QuestionCard({ question, n, total }: { question: Question; n: number; total: number }) {
  const { t, locale } = useT();
  return (
    <li className="question">
      <div className="question__top">
        <h3 className="question__n">{t("question.n", { n, total })}</h3>
        <p className="question__meta">
          <span>{t(`question.kind.${question.kind}`)}</span>
          <span>
            <TimerIcon size={24} aria-hidden="true" />
            {t(isOne(question.timer_seconds, locale) ? "question.timer.one" : "question.timer", { n: question.timer_seconds })}
          </span>
        </p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- the picture comes from the API, already made phone-sized (FR-LES-11) */}
      {question.media && <img className="question__image" src={question.media.url} alt={question.media.alt ?? t("question.image")} />}
      <p className="question__prompt">{question.prompt}</p>
      <Answers question={question} />
      {question.explanation && (
        <div className="question__why">
          <p className="question__label">{t("question.explanation")}</p>
          <p>{question.explanation}</p>
        </div>
      )}
    </li>
  );
}

/** The answers of a question, the right one marked with a tick and the words. */
function Answers({ question }: { question: Question }) {
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
              <span className="option__text">{text}</span>
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
  const value = `${decimal(question.correct, locale)}${question.unit ? ` ${question.unit}` : ""}`;
  return (
    <>
      <ul className="options options--plain">
        <li className="option" data-correct="true">
          <span className="option__text">{value}</span>
          {right}
        </li>
      </ul>
      {question.tolerance > 0 && <p className="question__note">{t("question.tolerance", { tolerance: decimal(String(question.tolerance), locale) })}</p>}
    </>
  );
}
