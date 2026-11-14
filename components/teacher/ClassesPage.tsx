"use client";

import { CaretRightIcon, UsersThreeIcon } from "@phosphor-icons/react";
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
 * has, how many lessons were held and when the last one was, and the whole row opens its results. A teacher the school has not given a class to is told who gives them.
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
            <div className="lessons" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="lesson lesson--skeleton">
                  <div className="lesson__text">
                    <Bar width="45%" height="1.5rem" />
                    <Bar width="65%" height="1.25rem" />
                  </div>
                </div>
              ))}
            </div>
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
                      <Link href={classUrl(c.id)} prefetch={false} className="lesson__open">
                        {classLine(c.class.name, c.subject.name)}
                      </Link>
                    </h2>
                    <p>
                      {t(isOne(c.student_count, locale) ? "classes.students.one" : "classes.students", { n: c.student_count })}
                      {" · "}
                      {t(c.lessons_run === 0 ? "classes.lessons.none" : isOne(c.lessons_run, locale) ? "classes.lessons.one" : "classes.lessons", { n: c.lessons_run })}
                      {last ? ` · ${t("classes.last", { when: last })}` : ""}
                    </p>
                  </div>
                  <CaretRightIcon className="lesson__chev" size={20} weight="bold" aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
