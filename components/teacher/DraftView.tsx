"use client";

import { MagnifyingGlassIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useDraft } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import { useT } from "@/lib/teacher/i18n";
import { backFromLesson, NEW_LESSON } from "@/lib/teacher/routes";
import { kindLine } from "./LessonCard";
import { QuestionList } from "./LessonView";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";

/**
 * The questions the AI suggested, to read: the title, the subject and year, one short note that this is a suggestion, what the
 * teacher asked to stress and then the questions in order, as a lesson is read; the review summary closes the page, since the
 * questions are what is read and checked. It is a draft, not a lesson: editing, the four refinements and saving are step 6's,
 * and the note says so in a line or two, so that it never stands between the teacher and the questions. It is found by its
 * address, so a reload (or the link) brings it back (EC-LES-09); an address the API does not know says so and leads to
 * preparing a new one. Back goes to where the teacher started, as it does from a lesson.
 */
export function DraftView() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const back = backFromLesson(useSearchParams().get("from"));
  const q = useDraft(id);
  const draft = q.data;
  const gone = q.status === "error" && isApiError(q.error) && q.error.code === "not_found";

  return (
    <>
      <PageHeader
        title={draft?.title ?? t("draft.title")}
        subtitle={draft ? kindLine(t, draft) : undefined}
        back={back.href}
        backLabel={t(back.label)}
      />
      <div className="content">
        {q.status === "loading" && (
          <Loading>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="4rem" height="4rem" className="skeleton--round" />
              <Bar width="40%" height="2rem" />
              <Bar width="80%" height="1.5rem" />
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="question" aria-hidden="true">
                <Bar width="30%" height="1.75rem" />
                <Bar width="80%" height="2rem" />
                <Bar height="3.5rem" className="skeleton--row" />
                <Bar height="3.5rem" className="skeleton--row" />
              </div>
            ))}
          </Loading>
        )}
        {q.status === "error" && !gone && <LoadProblem title={t("draft.error.title")} error={q.error} onRetry={q.refetch} />}
        {gone && (
          <div className="card card--stack">
            <span className="card__icon">
              <MagnifyingGlassIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("draft.notfound.title")}</h2>
            <p>{t("draft.notfound.body")}</p>
            <Link href={NEW_LESSON} className="btn btn--primary">
              {t("lessonsNew.title")}
            </Link>
          </div>
        )}
        {draft && (
          <>
            <div className="card card--compact draft__note">
              <span className="card__icon card__icon--small">
                <PencilSimpleIcon size={24} aria-hidden="true" />
              </span>
              <p>
                <strong>{t("draft.note.lead")}</strong> {t("draft.note.body")}
              </p>
            </div>
            {draft.emphasis && (
              <div className="card card--compact draft__emphasis">
                <h2>{t("lesson.emphasis")}</h2>
                <p>{`„${draft.emphasis}“`}</p>
              </div>
            )}
            <QuestionList questions={draft.questions} />
            {draft.review_summary.trim() && (
              <div className="card card--stack">
                <h2>{t("draft.summary")}</h2>
                <p>{draft.review_summary}</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
