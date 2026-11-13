"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { deleteDraft } from "@/lib/teacher/api/hooks";
import type { DraftSummary } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Throwing away a lesson that is ready and not saved, at the very end of its own page, away from the buttons that are pressed every day
 * (a saved lesson is deleted from the same place on its page). It asks first, and keeping the lesson is the answer in hand. What is
 * waiting to be saved is sent first (`before`), so that nothing is written to a draft that is gone; then the draft is deleted and the
 * page is left (`onGone`). A failure is said in the question, which stays open. A lesson that is still being written is stopped
 * from its own page too, by the wait's "Откажи".
 */
export function DiscardDraft({
  draft,
  before,
  onGone,
}: {
  draft: Pick<DraftSummary, "id" | "lesson_id">;
  before?: () => Promise<unknown>;
  onGone: () => void;
}) {
  const { t, te } = useT();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  const stay = () => {
    setAsking(false);
    setProblem(null);
  };

  const discard = async () => {
    try {
      await before?.();
      await deleteDraft(draft.id);
      onGone();
    } catch (e) {
      setProblem(e);
    }
  };

  return (
    <div className="lesson__delete">
      <button type="button" className="btn btn--secondary" aria-haspopup="dialog" onClick={() => setAsking(true)}>
        <TrashIcon size={24} aria-hidden="true" />
        {t(draft.lesson_id ? "draft.discard.edit" : "draft.discard")}
      </button>
      <ConfirmDialog
        open={asking}
        title={t("draft.discard.title")}
        body={t(draft.lesson_id ? "draft.discard.body.edit" : "draft.discard.body.new")}
        problem={problem === null ? undefined : te(problem)}
        stay={t("draft.discard.stay")}
        confirm={t("draft.discard.confirm")}
        onStay={stay}
        onConfirm={discard}
      />
    </div>
  );
}
