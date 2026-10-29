"use client";

import { ArrowRightIcon, ChalkboardTeacherIcon, PlusIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { LessonCard } from "@/components/teacher/LessonCard";
import { LoadProblem } from "@/components/teacher/LoadProblem";
import { PageHeader } from "@/components/teacher/PageHeader";
import { RunningBand } from "@/components/teacher/RunningBand";
import { Bar, Loading } from "@/components/teacher/Skeleton";
import { useOpenSession, usePreparedLessons, useTeacherName } from "@/lib/teacher/api/hooks";
import { useDayPart, useToday } from "@/lib/teacher/day";
import { useT } from "@/lib/teacher/i18n";
import { LESSONS, NEW_LESSON } from "@/lib/teacher/routes";
import { shownOnToday } from "@/lib/teacher/today";
import { dateParts } from "@/lib/teacher/when";

const GREETING = { morning: "today.greet.morning", day: "today.greet.day", evening: "today.greet.evening" } as const;

/** Today, top to bottom: the date, a lesson that is running, the one button to prepare a lesson, the lessons prepared and not run. */
export default function TodayPage() {
  const { t } = useT();
  const part = useDayPart();
  const teacher = useTeacherName();
  const today = useToday();
  const open = useOpenSession();
  const lessons = usePreparedLessons();

  const date = today === null ? undefined : dateParts(today);
  const running = open.data?.session ?? null;
  const loading = lessons.status === "loading" || open.status === "loading";
  // Yellow belongs to one button: the way back to a running lesson, else the way to prepare a new one.
  const prepareClass = running ? "btn btn--secondary" : "btn btn--primary";
  const { shown, more } = shownOnToday(lessons.data ?? []);

  const prepare = (
    <Link href={NEW_LESSON} className={prepareClass}>
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
            <Bar width="16rem" height="2.25rem" />
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
        ) : shown.length === 0 ? (
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
            <section aria-labelledby="prepared">
              <h2 className="section__title" id="prepared">
                {t("today.prepared.title")}
              </h2>
              <ul className="lessons">
                {shown.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} today={today} />
                ))}
              </ul>
              {more && (
                <Link href={LESSONS} className="btn btn--secondary lessons__all">
                  {t("today.prepared.all")}
                  <ArrowRightIcon size={24} weight="bold" aria-hidden="true" />
                </Link>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
