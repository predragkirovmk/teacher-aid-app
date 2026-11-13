"use client";

import { ChalkboardTeacherIcon, PlusIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useDrafts, useLessons } from "@/lib/teacher/api/hooks";
import { useToday } from "@/lib/teacher/day";
import { useT } from "@/lib/teacher/i18n";
import { lessonSections, shownWords, unfinishedDrafts, UNFINISHED_ANCHOR, withCount } from "@/lib/teacher/lessons-list";
import { newLessonUrl } from "@/lib/teacher/routes";
import { ALL, choiceOf, effectiveChoice, needsSubjectRow, subjectsOf, type SubjectChoice } from "@/lib/teacher/subjects";
import { DraftCard } from "./DraftCard";
import { LessonCard } from "./LessonCard";
import { LoadProblem } from "./LoadProblem";
import { OnceLine } from "./OnceLine";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";
import { StartDialog, type StartLesson } from "./StartDialog";
import { SubjectRow } from "./SubjectRow";

/**
 * All the teacher's lessons on one page, with nothing hidden behind a tab: the one main button, at the right of the title, prepares a
 * lesson, and under it, in this order (the order of Today), the lessons that are prepared, the ones that are not finished and the ones
 * that were held, which are the long list of a teacher with a year of lessons and so come last. Each is rows on one surface, and its
 * name says how many it holds. A section with nothing in it is not shown. A teacher with more than one subject chooses between them in a row at the top; with one there is no row. The
 * lessons are only read here: deleting one is on its own page.
 */
export function LessonsPage() {
  const { t, locale } = useT();
  const today = useToday();
  const lessons = useLessons();
  const drafts = useDrafts();
  // The window that starts a lesson belongs to the page, as it does on Today: the list can change under the button that opened it.
  const [starting, setStarting] = useState<StartLesson | null>(null);
  const [chosen, setChosen] = useState<SubjectChoice | null>(null);
  // What the list became when a subject was chosen, said to a screen reader (the list changes where it cannot see).
  const [result, setResult] = useState("");
  const [deleted, setDeleted] = useState(false);

  // What the address said when the page opened: that a lesson has just been deleted. Told once, then taken off the address.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("deleted") === null) return;
    startTransition(() => setDeleted(true));
    params.delete("deleted");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }, []);

  const loading = lessons.status === "loading" || drafts.status === "loading";
  const all = useMemo(() => lessons.data ?? [], [lessons.data]);
  const unfinished = useMemo(() => drafts.data ?? [], [drafts.data]);
  const subjects = useMemo(() => subjectsOf(all, unfinished), [all, unfinished]);
  const choice = effectiveChoice(chosen, subjects) ?? ALL;
  const sections = useMemo(() => lessonSections(all, choice), [all, choice]);
  const shownDrafts = useMemo(() => unfinishedDrafts(unfinished, choice), [unfinished, choice]);
  const nothing = all.length === 0 && unfinished.length === 0;

  const choose = (value: SubjectChoice) => {
    setChosen(value);
    const next = effectiveChoice(value, subjects) ?? ALL;
    const inIt = lessonSections(all, next);
    const n = inIt.prepared.length + inIt.held.length + unfinishedDrafts(unfinished, next).length;
    setResult(shownWords(t, locale, n, next === ALL ? t("lessons.subject.all") : (subjects.find((s) => choiceOf(s.id) === next)?.name ?? "")));
  };

  // A link to "the lessons not finished" (`#nedovrseni`) lands on that section: the page is built after the address is read, so the
  // browser's own jump has nothing to jump to. The focus goes to the heading, so that it is also where a screen reader starts.
  const section = useRef<HTMLHeadingElement>(null);
  const jumped = useRef(false);
  const hasSection = shownDrafts.length > 0;
  useEffect(() => {
    if (jumped.current || !hasSection || window.location.hash !== `#${UNFINISHED_ANCHOR}`) return;
    jumped.current = true;
    section.current?.focus();
    section.current?.scrollIntoView({ block: "start" });
  }, [hasSection]);

  const empty = !loading && lessons.status !== "error" && nothing && drafts.status !== "error";

  const prepare = (
    <Link href={newLessonUrl()} className="btn btn--primary">
      <PlusIcon size={24} weight="bold" aria-hidden="true" />
      {t("lessons.prepare")}
    </Link>
  );

  return (
    <>
      {/* With no lesson yet the button is in the middle of the page, with the words that say what it is for. */}
      <PageHeader title={t("lessons.title")} action={empty ? undefined : prepare} />
      <div className="content">
        {deleted && <OnceLine>{t("lessons.deleted")}</OnceLine>}

        {loading ? (
          <Loading>
            <Bar width="12rem" height="2rem" className="skeleton--heading" />
            <div className="lessons" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="lesson lesson--skeleton">
                  <div className="lesson__text">
                    <Bar width="45%" height="1.5rem" />
                    <Bar width="65%" height="1.25rem" />
                  </div>
                  <Bar width="9rem" height="2.75rem" className="skeleton--button" />
                </div>
              ))}
            </div>
          </Loading>
        ) : lessons.status === "error" ? (
          <LoadProblem title={t("lessons.error")} error={lessons.error} onRetry={lessons.refetch} />
        ) : empty ? (
          <div className="card card--stack">
            <span className="card__icon">
              <ChalkboardTeacherIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("lessons.empty.title")}</h2>
            <p>{t("lessons.empty.body")}</p>
            {prepare}
          </div>
        ) : (
          <>
            {needsSubjectRow(subjects) && (
              <SubjectRow
                choices={[{ value: ALL, label: t("lessons.subject.all") }, ...subjects.map((s) => ({ value: choiceOf(s.id), label: s.name }))]}
                value={choice}
                result={result}
                onChange={choose}
              />
            )}
            {sections.prepared.length > 0 && (
              <section aria-labelledby="prepared">
                <h2 className="section__title" id="prepared">
                  {withCount(t, t("lessons.prepared"), sections.prepared.length)}
                </h2>
                <ul className="lessons">
                  {sections.prepared.map((lesson) => (
                    <LessonCard key={lesson.id} lesson={lesson} today={today} onStart={setStarting} />
                  ))}
                </ul>
              </section>
            )}
            {shownDrafts.length > 0 && (
              <section aria-labelledby={UNFINISHED_ANCHOR}>
                <h2 className="section__title" id={UNFINISHED_ANCHOR} tabIndex={-1} ref={section}>
                  {withCount(t, t("lessons.unfinished"), shownDrafts.length)}
                </h2>
                <ul className="lessons">
                  {shownDrafts.map((draft) => (
                    <DraftCard key={draft.id} draft={draft} today={today} />
                  ))}
                </ul>
              </section>
            )}
            {drafts.status === "error" && <LoadProblem title={t("today.drafts.error")} error={drafts.error} onRetry={drafts.refetch} />}
            {sections.held.length > 0 && (
              <section aria-labelledby="held">
                <h2 className="section__title" id="held">
                  {withCount(t, t("lessons.held"), sections.held.length)}
                </h2>
                <ul className="lessons">
                  {sections.held.map((lesson) => (
                    <LessonCard key={lesson.id} lesson={lesson} today={today} onStart={setStarting} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      {starting && <StartDialog lesson={starting} onClose={() => setStarting(null)} />}
    </>
  );
}
