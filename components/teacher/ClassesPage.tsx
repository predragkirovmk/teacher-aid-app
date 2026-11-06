"use client";

import { ArrowRightIcon, UsersThreeIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo } from "react";
import { useCourses } from "@/lib/teacher/api/hooks";
import { orderCourses } from "@/lib/teacher/classes";
import { useToday } from "@/lib/teacher/day";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { classUrl } from "@/lib/teacher/routes";
import { relativeDay, sayWhen } from "@/lib/teacher/when";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";

/** "IV-1 · Математика": what a course is, in a line. */
export const classLine = (className: string, subjectName: string): string => `${className} · ${subjectName}`;

/**
 * The teacher's classes (`GET /teacher/courses`): the one taught most recently first, then those not taught yet by name. Each says how many students it
 * has, how many lessons were held and when the last one was, and opens its results. A teacher the school has not given a class to is told who gives them.
 */
export function ClassesPage() {
  const { t, locale } = useT();
  const today = useToday();
  const courses = useCourses();
  const list = useMemo(() => orderCourses(courses.data ?? []), [courses.data]);

  return (
    <>
      <PageHeader title={t("classes.title")} subtitle={list.length > 0 ? t("classes.lead") : undefined} />
      <div className="content">
        {courses.status === "loading" && (
          <Loading>
            {[0, 1, 2].map((i) => (
              <div key={i} className="lesson lesson--skeleton" aria-hidden="true">
                <div className="lesson__text">
                  <Bar width="12rem" height="1.75rem" />
                  <Bar width="18rem" />
                </div>
                <Bar width="12rem" height="3.5rem" className="skeleton--button" />
              </div>
            ))}
          </Loading>
        )}
        {courses.status === "error" && <LoadProblem title={t("classes.error.title")} error={courses.error} onRetry={courses.refetch} />}
        {courses.status === "ready" && list.length === 0 && (
          <div className="card card--stack" data-testid="classes-empty">
            <span className="card__icon">
              <UsersThreeIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("classes.empty.title")}</h2>
            <p>{t("classes.empty.body")}</p>
          </div>
        )}
        {list.length > 0 && (
          <ul className="lessons" data-testid="classes-list">
            {list.map((c) => {
              const heading = `title-${c.id}`;
              const last = c.last_session_at === null || today === null ? null : sayWhen(t, relativeDay(Date.parse(c.last_session_at), today));
              return (
                <li key={c.id} className="lesson" data-testid="class-card">
                  <div className="lesson__text">
                    <h2 className="lesson__title" id={heading}>
                      {classLine(c.class.name, c.subject.name)}
                    </h2>
                    <p>{t(isOne(c.student_count, locale) ? "classes.students.one" : "classes.students", { n: c.student_count })}</p>
                    <p>
                      {t(c.lessons_run === 0 ? "classes.lessons.none" : isOne(c.lessons_run, locale) ? "classes.lessons.one" : "classes.lessons", { n: c.lessons_run })}
                      {last ? ` · ${t("classes.last", { when: last })}` : ""}
                    </p>
                  </div>
                  <div className="lesson__actions">
                    <Link href={classUrl(c.id)} prefetch={false} className="btn btn--secondary" aria-describedby={heading}>
                      {t("classes.open")}
                      <ArrowRightIcon size={24} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
