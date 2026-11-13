"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import type { LessonSummary } from "@/lib/teacher/api/types";
import { isOne, romanYear } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { lessonUrl, type FROM_TODAY } from "@/lib/teacher/routes";
import { heldLine, heldText } from "@/lib/teacher/lessons-list";
import { relativeDay, sayWhen } from "@/lib/teacher/when";
import { StartButton } from "./StartLessonButton";

/** The subject and year of a lesson in a line: "Математика · II година". */
export const kindLine = (t: ReturnType<typeof useT>["t"], lesson: Pick<LessonSummary, "subject" | "year">): string =>
  `${lesson.subject.name} · ${t("lesson.year", { n: lesson.year, roman: romanYear(lesson.year) })}`;

/**
 * One lesson on Today or on the Lessons page, as a row: its title, one line that says what it is, and one button. The whole row
 * opens the lesson (its title is the link, and the arrow at the end says the row goes somewhere); the button starts a class with it,
 * in one press and in words. A lesson that has been held says when it was last held and how many times before what it is, instead
 * of when it was last changed: that is the date the list is in the order of. Deleting is not here: it is on the lesson's own page,
 * away from the button that is pressed every day.
 */
export function LessonCard({
  lesson,
  today,
  from,
  onStart,
}: {
  lesson: LessonSummary;
  today: number | null;
  /** Where the list is, so that the Back of the lesson goes there: Today says so, the Lessons page leaves it out (Back goes to Lessons). */
  from?: typeof FROM_TODAY;
  onStart: (lesson: LessonSummary) => void;
}) {
  const { t, locale } = useT();
  const title = useId();
  const questions = t(isOne(lesson.question_count, locale) ? "lesson.questions.one" : "lesson.questions.many", { n: lesson.question_count });
  const wasHeld = lesson.times_run > 0;
  const changed = today === null || wasHeld ? null : t("lesson.changed", { when: sayWhen(t, relativeDay(Date.parse(lesson.updated_at), today)) });
  const held = today === null ? null : heldLine(lesson, today, locale);
  const what = `${kindLine(t, lesson)} · ${questions}`;
  return (
    <li className={wasHeld ? "lesson lesson--held" : "lesson"}>
      <div className="lesson__text">
        <h3 className="lesson__title" id={title}>
          {/* The lesson fills itself from the API once it is open, so there is nothing to fetch ahead of time. */}
          <Link href={lessonUrl(lesson.id, from)} prefetch={false} className="lesson__open">
            {lesson.title}
          </Link>
        </h3>
        {wasHeld ? (
          <p>
            {held && <span className="lesson__held">{heldText(t, held)}</span>}
            {held && " · "}
            {what}
          </p>
        ) : (
          <p>{changed ? `${what} · ${changed}` : what}</p>
        )}
      </div>
      <div className="lesson__actions">
        <StartButton describedBy={title} onPress={() => onStart(lesson)} />
      </div>
      <CaretRightIcon className="lesson__chev" size={20} weight="bold" aria-hidden="true" />
    </li>
  );
}
