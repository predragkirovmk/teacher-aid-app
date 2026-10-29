"use client";

import { FolderOpenIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import type { LessonSummary } from "@/lib/teacher/api/types";
import { romanYear } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { FROM_TODAY, lessonUrl } from "@/lib/teacher/routes";
import { relativeDay, sayWhen } from "@/lib/teacher/when";
import { StartLessonButton } from "./StartLessonButton";

/** The subject and year of a lesson in a line: "Математика · II година". */
export const kindLine = (t: ReturnType<typeof useT>["t"], lesson: Pick<LessonSummary, "subject" | "year">): string =>
  `${lesson.subject.name} · ${t("lesson.year", { n: lesson.year, roman: romanYear(lesson.year) })}`;

/**
 * One prepared lesson on Today: what it is, how many questions, when it was last changed, and the two things to do with it,
 * each named. The title is what both buttons are about, for a screen reader that reads them one after another.
 */
export function LessonCard({ lesson, today }: { lesson: LessonSummary; today: number | null }) {
  const { t } = useT();
  const title = useId();
  const questions = lesson.question_count === 1 ? t("lesson.questions.one") : t("lesson.questions.many", { n: lesson.question_count });
  const changed = today === null ? null : t("lesson.changed", { when: sayWhen(t, relativeDay(Date.parse(lesson.updated_at), today)) });
  return (
    <li className="lesson">
      <div className="lesson__text">
        <h3 className="lesson__title" id={title}>
          {lesson.title}
        </h3>
        <p>{kindLine(t, lesson)}</p>
        <p>{changed ? `${questions} · ${changed}` : questions}</p>
      </div>
      <div className="lesson__actions">
        <StartLessonButton lesson={lesson} describedBy={title} />
        {/* The lesson fills itself from the API once it is open, so there is nothing to fetch ahead of time. */}
        <Link href={lessonUrl(lesson.id, FROM_TODAY)} prefetch={false} className="btn btn--quiet" aria-describedby={title}>
          <FolderOpenIcon size={24} aria-hidden="true" />
          {t("lesson.open")}
        </Link>
      </div>
    </li>
  );
}
