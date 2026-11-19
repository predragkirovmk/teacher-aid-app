"use client";

import { BooksIcon, CaretRightIcon, CheckCircleIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLessons, useLibrary } from "@/lib/teacher/api/hooks";
import type { LibraryItem } from "@/lib/teacher/api/types";
import { useToday } from "@/lib/teacher/day";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { lessonSections } from "@/lib/teacher/lessons-list";
import { newestSavedFirst } from "@/lib/teacher/library";
import { FROM_LIBRARY, libraryLessonUrl, TEMPLATES_ANCHOR } from "@/lib/teacher/routes";
import { LessonCard } from "./LessonCard";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";
import { TabPanel, Tabs } from "./Tabs";

type Shelf = "mine" | "templates";

/**
 * The Library, two shelves under one pill: the teacher's own lessons that have been held (to read again or hold once more) on the left,
 * and templates (lessons to read and copy) on the right. It opens on the teacher's own; the templates have their address (`#sabloni`), so
 * Back from a template comes back to them. Each shelf is rows on one surface.
 */
export function LibraryPage() {
  const { t } = useT();
  const today = useToday();
  const lessons = useLessons();
  const library = useLibrary();
  const [shelf, setShelf] = useState<Shelf>("mine");
  // The window that starts a lesson belongs to the page, not to the row, as on the Lessons page.

  // A link to the templates opens on them; the address follows the shelf, so a reload or Back keeps it.
  useEffect(() => {
    if (window.location.hash === `#${TEMPLATES_ANCHOR}`) startTransition(() => setShelf("templates"));
  }, []);
  const choose = (next: Shelf) => {
    setShelf(next);
    const hash = next === "templates" ? `#${TEMPLATES_ANCHOR}` : "";
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
  };

  const held = useMemo(() => lessonSections(lessons.data ?? []).held, [lessons.data]);
  const templates = useMemo(() => newestSavedFirst(library.data ?? []), [library.data]);

  return (
    <>
      <PageHeader title={t("library.title")} />
      <div className="content">
        <Tabs
          name="library"
          label={t("library.title")}
          tabs={[
            { id: "mine", label: t("library.tab.mine") },
            { id: "templates", label: t("library.tab.templates") },
          ]}
          value={shelf}
          onChange={choose}
        />

        <TabPanel name="library" id="mine" active={shelf === "mine"}>
          {lessons.status === "loading" ? (
            <Rows />
          ) : lessons.status === "error" ? (
            <LoadProblem title={t("lessons.error")} error={lessons.error} onRetry={lessons.refetch} />
          ) : held.length === 0 ? (
            <Empty icon={<ClockCounterClockwiseIcon size={32} aria-hidden="true" />} title={t("library.mine.empty.title")} body={t("library.mine.empty.body")} />
          ) : (
            <ul className="lessons">
              {held.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} today={today} from={FROM_LIBRARY} />
              ))}
            </ul>
          )}
        </TabPanel>

        <TabPanel name="library" id="templates" active={shelf === "templates"}>
          {library.status === "loading" ? (
            <Rows />
          ) : library.status === "error" ? (
            <LoadProblem title={t("library.error")} error={library.error} onRetry={library.refetch} />
          ) : templates.length === 0 ? (
            <Empty icon={<BooksIcon size={32} aria-hidden="true" />} title={t("library.empty.title")} body={t("library.empty.body")} />
          ) : (
            <ul className="lessons">
              {templates.map((item) => (
                <TemplateCard key={item.lesson_id} item={item} />
              ))}
            </ul>
          )}
        </TabPanel>
      </div>
    </>
  );
}

function Rows() {
  return (
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
  );
}

function Empty({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="card card--stack">
      <span className="card__icon">{icon}</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

/** One template, as a row: what it is and how many questions it has. The row opens it to be read; copying is there. */
function TemplateCard({ item }: { item: LibraryItem }) {
  const { t, locale } = useT();
  const questions = t(isOne(item.question_count, locale) ? "lesson.questions.one" : "lesson.questions.many", { n: item.question_count });
  return (
    <li className="lesson">
      <div className="lesson__text">
        <h3 className="lesson__title">
          <Link href={libraryLessonUrl(item.lesson_id)} prefetch={false} className="lesson__open">
            {item.title}
          </Link>
        </h3>
        <p>{questions}</p>
        {item.already_copied && (
          <p className="lesson__edit lesson__copied">
            <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
            {t("library.copied")}
          </p>
        )}
      </div>
      <CaretRightIcon className="lesson__chev" size={20} weight="bold" aria-hidden="true" />
    </li>
  );
}
