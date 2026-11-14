"use client";

import { CheckCircleIcon, CopyIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { copyFromLibrary, useLesson, useLibrary } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import { useT } from "@/lib/teacher/i18n";
import { backFromLibraryLesson, LIBRARY, savedLessonUrl } from "@/lib/teacher/routes";
import { kindLine } from "./LessonCard";
import { QuestionList } from "./LessonView";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Problem } from "./Problem";
import { Bar, Loading } from "./Skeleton";

/**
 * A colleague's lesson, to read and copy (FR-LIB-01 to -04): the same questions as a lesson of the teacher's own, with nothing to change,
 * and one main button, "Копирај во моите лекции". It is read with `GET /lessons/{id}`, which answers a library lesson as a preview; who made
 * it, and whether the teacher has copied it before, come from the library's list. Copying again stays possible, and the page says that
 * the teacher has done it. After a copy the teacher lands on the new lesson, which is theirs, with a line to say so.
 */
export function LibraryPreview() {
  const { t, te } = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const lessonQuery = useLesson(id);
  const library = useLibrary();
  const [copying, setCopying] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const back = backFromLibraryLesson();

  const lesson = lessonQuery.data;
  const item = library.data?.find((i) => i.lesson_id === id);
  // Not a lesson of the library: it is not there (a colleague deleted it), it is the teacher's own, or the address is old.
  const missing = (lessonQuery.status === "error" && isApiError(lessonQuery.error) && lessonQuery.error.code === "not_found") || (library.status === "ready" && !item);
  const failed = !missing && (lessonQuery.status === "error" || library.status === "error") && !(lesson && item);
  const ready = lesson && item && !missing;

  const copy = async () => {
    if (copying) return;
    setCopying(true);
    setProblem(null);
    try {
      const copied = await copyFromLibrary(id);
      router.push(savedLessonUrl(copied.id, "copied"));
    } catch (e) {
      setProblem(e);
      setCopying(false);
    }
  };

  return (
    <>
      <PageHeader title={ready ? lesson.title : t("lesson.title")} subtitle={ready ? kindLine(t, lesson) : undefined} back={back.href} backLabel={t(back.label)} />
      <div className="content">
        {!ready && !missing && !failed && (
          <Loading>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="80%" height="1.5rem" />
              <Bar width="14rem" height="3.5rem" className="skeleton--button" />
            </div>
            <div className="questions" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="question">
                  <Bar width="60%" height="1.75rem" />
                  <Bar width="80%" height="1.5rem" />
                  <Bar width="40%" height="1.5rem" />
                </div>
              ))}
            </div>
          </Loading>
        )}
        {missing && (
          <div className="card card--stack">
            <span className="card__icon">
              <MagnifyingGlassIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("library.notfound.title")}</h2>
            <p>{t("library.notfound.body")}</p>
            <Link href={LIBRARY} className="btn btn--secondary">
              {t("back.library")}
            </Link>
          </div>
        )}
        {failed && (
          <LoadProblem
            title={t("library.preview.error")}
            error={lessonQuery.error ?? library.error}
            onRetry={() => {
              lessonQuery.refetch();
              library.refetch();
            }}
          />
        )}
        {ready && (
          <>
            <div className="card card--stack">
              <p>{t("library.note", { name: item.owner.name })}</p>
              {item.already_copied && (
                <p className="lesson__copied" role="status">
                  <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
                  {t("library.copy.again")}
                </p>
              )}
              <button type="button" className="btn btn--primary" aria-busy={copying} onClick={() => void copy()}>
                <CopyIcon size={24} weight="bold" aria-hidden="true" />
                {t(copying ? "library.copying" : "library.copy")}
              </button>
              {/* A button that changes its words is not read out again; a line that was there before its words are is. */}
              <p role="status" className="sr">
                {copying ? t("library.copying") : ""}
              </p>
              {problem !== null && <Problem title={t("library.copy.failed")}>{te(problem)}</Problem>}
            </div>
            <QuestionList questions={lesson.questions} />
          </>
        )}
      </div>
    </>
  );
}
