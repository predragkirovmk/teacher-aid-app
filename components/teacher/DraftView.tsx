"use client";

import { MagnifyingGlassIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDraft } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import { useT } from "@/lib/teacher/i18n";
import { NEW_LESSON } from "@/lib/teacher/routes";
import { TODAY } from "@/lib/teacher/signin";
import { kindLine } from "./LessonCard";
import { QuestionList } from "./LessonView";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";
import { SoonCard } from "./SoonCard";

/**
 * The questions the AI suggested, to read: the title, the subject and year, what the teacher asked to stress, the review
 * summary and the questions in order, as a lesson is read. It is a draft, not a lesson: editing, the four refinements and
 * saving are step 6's, and the page says so. It is found by its address, so a reload (or the link) brings it back (EC-LES-09);
 * an address the API does not know says so and leads to preparing a new one. Back goes to Today.
 */
export function DraftView() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useDraft(id);
  const draft = q.data;
  const gone = q.status === "error" && isApiError(q.error) && q.error.code === "not_found";

  return (
    <>
      <PageHeader
        title={draft?.title ?? t("draft.title")}
        subtitle={draft ? kindLine(t, draft) : undefined}
        back={TODAY}
        backLabel={t("back.today")}
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
            <SoonCard icon={PencilSimpleIcon} what={t("draft.soon")} />
            {draft.emphasis && (
              <div className="card card--stack">
                <h2>{t("lesson.emphasis")}</h2>
                <p>{`„${draft.emphasis}“`}</p>
              </div>
            )}
            {draft.review_summary.trim() && (
              <div className="card card--stack">
                <h2>{t("draft.summary")}</h2>
                <p>{draft.review_summary}</p>
              </div>
            )}
            <QuestionList questions={draft.questions} />
          </>
        )}
      </div>
    </>
  );
}
