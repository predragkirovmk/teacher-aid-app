"use client";

import { ArrowRightIcon, ChalkboardTeacherIcon, PlusIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/teacher/ConfirmDialog";
import { DraftCard } from "@/components/teacher/DraftCard";
import { LessonCard } from "@/components/teacher/LessonCard";
import { LoadProblem } from "@/components/teacher/LoadProblem";
import { PageHeader } from "@/components/teacher/PageHeader";
import { RunningBand } from "@/components/teacher/RunningBand";
import { Bar, Loading } from "@/components/teacher/Skeleton";
import { StartDialog, type StartLesson } from "@/components/teacher/StartDialog";
import { deleteDraft, useDrafts, useOpenSession, usePreparedLessons, useTeacherName } from "@/lib/teacher/api/hooks";
import type { DraftSummary } from "@/lib/teacher/api/types";
import { useDayPart, useToday } from "@/lib/teacher/day";
import { useT } from "@/lib/teacher/i18n";
import { FROM_TODAY, LESSONS, newLessonUrl } from "@/lib/teacher/routes";
import { shownOnToday } from "@/lib/teacher/today";
import { dateParts } from "@/lib/teacher/when";

const GREETING = { morning: "today.greet.morning", day: "today.greet.day", evening: "today.greet.evening" } as const;

/**
 * Today, top to bottom: the date, a lesson that is running, the one button to prepare a lesson, the lessons that are not finished
 * (being written, failed, or being changed), the lessons prepared and not run.
 */
export default function TodayPage() {
  const { t, te } = useT();
  const part = useDayPart();
  const teacher = useTeacherName();
  const today = useToday();
  const open = useOpenSession();
  const lessons = usePreparedLessons();
  const drafts = useDrafts();
  // The window that starts a lesson belongs to the page, not to the lesson's card: a lesson that has just been started leaves
  // the list, and the window must stay until it has said what happened.
  const [starting, setStarting] = useState<StartLesson | null>(null);
  // Throwing a draft away is asked about by the page too, for the same reason: the list changes under its buttons.
  const [discarding, setDiscarding] = useState<DraftSummary | null>(null);
  const [discardProblem, setDiscardProblem] = useState<unknown>(null);

  const date = today === null ? undefined : dateParts(today);
  const running = open.data?.session ?? null;
  const loading = lessons.status === "loading" || open.status === "loading";
  // Yellow belongs to one button: the way back to a running lesson, else the way to prepare a new one.
  const prepareClass = running ? "btn btn--secondary" : "btn btn--primary";
  const { shown, more } = shownOnToday(lessons.data ?? []);
  const unfinished = drafts.data ?? [];

  const discard = async () => {
    if (!discarding) return;
    try {
      await deleteDraft(discarding.id);
      setDiscarding(null);
      setDiscardProblem(null);
    } catch (e) {
      setDiscardProblem(e);
    }
  };

  const prepare = (
    <Link href={newLessonUrl(FROM_TODAY)} className={prepareClass}>
      <PlusIcon size={24} weight="bold" aria-hidden="true" />
      {t("today.prepare")}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t("today.title")}
        date={date ? t("today.date", { weekday: t(date.weekday), day: date.day, month: t(date.month) }) : undefined}
        subtitle={teacher ? t(part ? GREETING[part] : "today.greet.neutral", { name: teacher.first }) : undefined}
      />
      <div className="content">
        {open.status === "error" && <LoadProblem title={t("running.error.title")} error={open.error} onRetry={open.refetch} />}
        {running && open.data && <RunningBand session={running} serverNow={open.data.server_now} />}

        {loading ? (
          <Loading>
            <Bar width="14rem" height="3.5rem" className="skeleton--button" />
            <Bar width="16rem" height="2rem" className="skeleton--heading" />
            {[0, 1].map((i) => (
              <div key={i} className="lesson lesson--skeleton" aria-hidden="true">
                <div className="lesson__text">
                  <Bar width="55%" height="1.75rem" />
                  <Bar width="35%" height="1.25rem" />
                  <Bar width="45%" height="1.25rem" />
                </div>
                <Bar width="11rem" height="3.5rem" className="skeleton--button" />
              </div>
            ))}
          </Loading>
        ) : lessons.status === "error" ? (
          <LoadProblem title={t("today.prepared.error")} error={lessons.error} onRetry={lessons.refetch} />
        ) : shown.length === 0 && unfinished.length === 0 ? (
          <div className="card card--stack">
            <span className="card__icon">
              <ChalkboardTeacherIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("today.empty.title")}</h2>
            <p>{t("today.empty.body")}</p>
            {prepare}
          </div>
        ) : (
          <>
            <div>{prepare}</div>
            {unfinished.length > 0 && (
              <section aria-labelledby="unfinished">
                <h2 className="section__title" id="unfinished">
                  {t("today.drafts.title")}
                </h2>
                <ul className="lessons">
                  {unfinished.map((draft) => (
                    <DraftCard key={draft.id} draft={draft} today={today} onDiscard={setDiscarding} />
                  ))}
                </ul>
              </section>
            )}
            {drafts.status === "error" && <LoadProblem title={t("today.drafts.error")} error={drafts.error} onRetry={drafts.refetch} />}
            {shown.length > 0 && (
              <section aria-labelledby="prepared">
                <h2 className="section__title" id="prepared">
                  {t("today.prepared.title")}
                </h2>
                <ul className="lessons">
                  {shown.map((lesson) => (
                    <LessonCard key={lesson.id} lesson={lesson} today={today} onStart={setStarting} />
                  ))}
                </ul>
                {more && (
                  <Link href={LESSONS} className="btn btn--secondary lessons__all">
                    {t("today.prepared.all")}
                    <ArrowRightIcon size={24} weight="bold" aria-hidden="true" />
                  </Link>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {starting && <StartDialog lesson={starting} onClose={() => setStarting(null)} />}
      <ConfirmDialog
        open={discarding !== null}
        title={t("draft.discard.title")}
        body={discarding ? t(discarding.status === "pending" ? "draft.discard.body.pending" : discarding.lesson_id ? "draft.discard.body.edit" : "draft.discard.body.new") : undefined}
        problem={discardProblem === null ? undefined : te(discardProblem)}
        stay={t("draft.discard.stay")}
        confirm={t("draft.discard.confirm")}
        onStay={() => {
          setDiscarding(null);
          setDiscardProblem(null);
        }}
        onConfirm={discard}
      />
    </>
  );
}
