"use client";

import { FolderOpenIcon } from "@phosphor-icons/react";
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
 * One lesson on Today or on the Lessons page: what it is, how many questions, and the two things to do with it, each named. One of them
 * is the quiet filled button, the way on from this card; the other is the quiet underlined link beside it, the lesser thing (the same two
 * looks as on a card of a draft, whose "Фрли" is the quiet one). A lesson that is prepared is for starting a class, so "Започни час" is
 * the button and "Отвори", to look at it first, the link. A lesson that has been held is mostly looked up (to read it, to change it, to
 * hold it again from its own page), so "Отвори" is the button there and "Започни час" the link, still one press and still in words. A held
 * lesson says when it was last held and how many times, in words, instead of when it was last changed: that is the date the list is in
 * the order of. The title is what both are about, for a screen reader that reads them one after another. Deleting is not here: it is on
 * the lesson's own page, away from the buttons that are pressed every day.
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
  // The lesson fills itself from the API once it is open, so there is nothing to fetch ahead of time.
  const open = (
    <Link href={lessonUrl(lesson.id, from)} prefetch={false} className={wasHeld ? "btn btn--secondary" : "btn btn--quiet"} aria-describedby={title}>
      <FolderOpenIcon size={24} aria-hidden="true" />
      {t("lesson.open")}
    </Link>
  );
  const start = <StartButton quiet={wasHeld} describedBy={title} onPress={() => onStart(lesson)} />;
  return (
    <li className={wasHeld ? "lesson lesson--held" : "lesson"}>
      <div className="lesson__text">
        <h3 className="lesson__title" id={title}>
          {lesson.title}
        </h3>
        {wasHeld ? (
          <>
            <p>{`${kindLine(t, lesson)} · ${questions}`}</p>
            {held && <p className="lesson__held">{heldText(t, held)}</p>}
          </>
        ) : (
          <>
            <p>{kindLine(t, lesson)}</p>
            <p>{changed ? `${questions} · ${changed}` : questions}</p>
          </>
        )}
      </div>
      <div className="lesson__actions">
        {wasHeld ? open : start}
        {wasHeld ? start : open}
      </div>
    </li>
  );
}
