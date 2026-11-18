"use client";

import { ChalkboardTeacherIcon, PlusIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useDrafts, useLessons } from "@/lib/teacher/api/hooks";
import { useToday } from "@/lib/teacher/day";
import { useT } from "@/lib/teacher/i18n";
import { lessonSections, unfinishedDrafts, UNFINISHED_ANCHOR, withCount } from "@/lib/teacher/lessons-list";
import { newLessonUrl } from "@/lib/teacher/routes";
import { DraftCard } from "./DraftCard";
import { LessonCard } from "./LessonCard";
import { LoadProblem } from "./LoadProblem";
import { OnceLine } from "./OnceLine";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";
import { StartDialog, type StartLesson } from "./StartDialog";

/**
 * The app's home: the one main button, at the right of the title, prepares a lesson, and under it the lessons that are prepared, then the
 * ones that are not finished. Lessons already held are in the Library. Each section is rows on one surface, and its name says how many it
 * holds. A section with nothing in it is not shown. The lessons are only read here: deleting one is on its own page.
 */
export function LessonsPage() {
  const { t } = useT();
  const today = useToday();
  const lessons = useLessons();
  const drafts = useDrafts();
  // The window that starts a lesson belongs to the page, not to the row: a lesson that has just been started leaves the list.
  const [starting, setStarting] = useState<StartLesson | null>(null);
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
  const prepared = useMemo(() => lessonSections(lessons.data ?? []).prepared, [lessons.data]);
  const shownDrafts = useMemo(() => unfinishedDrafts(drafts.data ?? []), [drafts.data]);
  const nothing = prepared.length === 0 && shownDrafts.length === 0;

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
            {prepared.length > 0 && (
              <section aria-labelledby="prepared">
                <h2 className="section__title" id="prepared">
                  {withCount(t, t("lessons.prepared"), prepared.length)}
                </h2>
                <ul className="lessons">
                  {prepared.map((lesson) => (
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
            {drafts.status === "error" && <LoadProblem title={t("lessons.drafts.error")} error={drafts.error} onRetry={drafts.refetch} />}
          </>
        )}
      </div>
      {starting && <StartDialog lesson={starting} onClose={() => setStarting(null)} />}
    </>
  );
}
