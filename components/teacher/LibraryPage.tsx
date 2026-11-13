"use client";

import { BooksIcon, CheckCircleIcon, EyeIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useCourses, useLibrary } from "@/lib/teacher/api/hooks";
import type { LibraryItem } from "@/lib/teacher/api/types";
import { useToday } from "@/lib/teacher/day";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { libraryChoice, libraryChoices, LIBRARY_LONG, shownLibrary, showsRow } from "@/lib/teacher/library";
import { shownWords } from "@/lib/teacher/lessons-list";
import { libraryLessonUrl } from "@/lib/teacher/routes";
import { MINE, type SubjectChoice } from "@/lib/teacher/subjects";
import { relativeDay, sayWhen } from "@/lib/teacher/when";
import { kindLine } from "./LessonCard";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";
import { SubjectRow } from "./SubjectRow";

/**
 * The school library (F-05): the lessons colleagues of the same school saved, newest first, each with who made it, how many questions it
 * has and whether the teacher has copied it already. Each opens a preview, where it is read and copied. There is no main button here:
 * the main action, copying, is on the preview. A short library is shown whole; a long one opens on the teacher's own subjects.
 */
export function LibraryPage() {
  const { t, locale } = useT();
  const today = useToday();
  const library = useLibrary();
  const courses = useCourses();
  const [chosen, setChosen] = useState<SubjectChoice | null>(null);
  // What the list became when a subject was chosen, said to a screen reader (the list changes where it cannot see).
  const [result, setResult] = useState("");

  const items = useMemo(() => library.data ?? [], [library.data]);
  // The subjects the teacher teaches. Without the courses (they have not come, or could not) the library is shown whole.
  const mine = useMemo(() => new Set((courses.data ?? []).map((c) => c.subject.id)), [courses.data]);
  const choice = libraryChoice(chosen, items, mine);
  const shown = useMemo(() => shownLibrary(items, choice, mine), [items, choice, mine]);
  // A long library opens on the teacher's subjects, which needs the courses: wait for them, or the list would change under the teacher's eyes.
  const loading = library.status === "loading" || (courses.status === "loading" && items.length > LIBRARY_LONG);

  const label = (value: SubjectChoice, name: string | null) => (value === MINE ? t("library.mine") : name ?? t("lessons.subject.all"));
  const choose = (value: SubjectChoice) => {
    setChosen(value);
    const next = libraryChoice(value, items, mine);
    const named = libraryChoices(items, mine).find((c) => c.value === next);
    setResult(shownWords(t, locale, shownLibrary(items, next, mine).length, label(next, named?.subject?.name ?? null)));
  };

  return (
    <>
      <PageHeader title={t("library.title")} subtitle={t("library.sub")} />
      <div className="content">
        {loading ? (
          <Loading>
            <Bar width="12rem" height="2rem" className="skeleton--heading" />
            {[0, 1, 2].map((i) => (
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
        ) : library.status === "error" ? (
          <LoadProblem title={t("library.error")} error={library.error} onRetry={library.refetch} />
        ) : items.length === 0 ? (
          <div className="card card--stack">
            <span className="card__icon">
              <BooksIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("library.empty.title")}</h2>
            <p>{t("library.empty.body")}</p>
          </div>
        ) : (
          <>
            {showsRow(items, mine) && (
              <SubjectRow
                choices={libraryChoices(items, mine).map((c) => ({ value: c.value, label: label(c.value, c.subject?.name ?? null) }))}
                value={choice}
                result={result}
                onChange={choose}
              />
            )}
            <ul className="lessons">
              {shown.map((item) => (
                <LibraryCard key={item.lesson_id} item={item} today={today} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

/** One colleague's lesson: what it is, who made it, when, and the one thing to do with it, read it. */
function LibraryCard({ item, today }: { item: LibraryItem; today: number | null }) {
  const { t, locale } = useT();
  const title = useId();
  const questions = t(isOne(item.question_count, locale) ? "lesson.questions.one" : "lesson.questions.many", { n: item.question_count });
  const saved = today === null ? null : t("library.saved", { when: sayWhen(t, relativeDay(Date.parse(item.saved_at), today)) });
  return (
    <li className="lesson">
      <div className="lesson__text">
        <h3 className="lesson__title" id={title}>
          {item.title}
        </h3>
        <p>{kindLine(t, item)}</p>
        <p>{`${questions} · ${t("library.owner", { name: item.owner.name })}`}</p>
        {saved && <p>{saved}</p>}
        {item.already_copied && (
          <p className="lesson__edit lesson__copied">
            <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
            {t("library.copied")}
          </p>
        )}
      </div>
      <div className="lesson__actions">
        <Link href={libraryLessonUrl(item.lesson_id)} prefetch={false} className="btn btn--secondary" aria-describedby={title}>
          <EyeIcon size={24} aria-hidden="true" />
          {t("library.open")}
        </Link>
      </div>
    </li>
  );
}
