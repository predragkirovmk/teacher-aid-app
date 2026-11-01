"use client";

import { InfoIcon, TrashIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteLesson, useDrafts, useOpenSession } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { Lesson } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { LESSONS_DELETED } from "@/lib/teacher/routes";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * "Избриши лекција", at the very end of the lesson's page, away from the buttons pressed every day. It asks first, in plain words, and
 * "Откажи" is the answer in hand. A lesson that a class is being held with cannot be deleted: instead of the button the page says
 * to end the lesson first. The open lesson is asked of the API (`GET /sessions/open`), and a refusal from the API (`invalid_state`, for
 * a lesson started in another window) says the same.
 */
export function DeleteLesson({ lesson }: { lesson: Lesson }) {
  const { t, te } = useT();
  const router = useRouter();
  const open = useOpenSession();
  const drafts = useDrafts();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const [refused, setRefused] = useState(false);

  // Until it is known whether a lesson is running, neither the button nor the refusal is shown, so that neither flashes and goes.
  if (open.status === "loading") return null;
  const running = open.data?.session?.lesson.id === lesson.id || refused;
  // Changes that were started and not saved are deleted with the lesson (PROPOSED), and the question says so.
  const hasEdits = (drafts.data ?? []).some((d) => d.lesson_id === lesson.id);

  const stay = () => {
    setAsking(false);
    setProblem(null);
  };

  const remove = async () => {
    try {
      await deleteLesson(lesson.id);
      router.replace(LESSONS_DELETED);
    } catch (e) {
      if (isApiError(e) && e.code === "invalid_state") {
        // A class has been started with it since this page was opened: the lesson stays, and the page says why.
        stay();
        setRefused(true);
        open.refetch();
      } else {
        setProblem(e);
      }
    }
  };

  return (
    <div className="lesson__delete">
      {running ? (
        <div className="card card--compact draft__note">
          <span className="card__icon card__icon--small">
            <InfoIcon size={24} aria-hidden="true" />
          </span>
          <p>
            <strong className="lesson__refused">{t("lesson.delete.running")}</strong>
            {t("lesson.delete.running.body")}
          </p>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn--secondary" aria-haspopup="dialog" onClick={() => setAsking(true)}>
            <TrashIcon size={24} aria-hidden="true" />
            {t("lesson.delete")}
          </button>
          <ConfirmDialog
            open={asking}
            title={t("lesson.delete.title", { title: lesson.title })}
            body={hasEdits ? `${t("lesson.delete.body")} ${t("lesson.delete.draft")}` : t("lesson.delete.body")}
            problem={problem === null ? undefined : te(problem)}
            stay={t("lesson.delete.stay")}
            confirm={t("lesson.delete.confirm")}
            onStay={stay}
            onConfirm={remove}
          />
        </>
      )}
    </div>
  );
}
