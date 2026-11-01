"use client";

import { useState, type ReactNode } from "react";
import { deleteDraft } from "@/lib/teacher/api/hooks";
import type { DraftSummary } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Throwing a lesson that is not finished away, asked about once for the whole page: Today and the Lessons page both list drafts,
 * and the list changes under its buttons, so the question belongs to the page and not to the card. `ask` opens the question for a
 * draft; `dialog` is the question, to be put anywhere on the page. A failure is said in the question, which stays open.
 */
export function useDiscardDraft(): { ask: (draft: DraftSummary) => void; dialog: ReactNode } {
  const { t, te } = useT();
  const [discarding, setDiscarding] = useState<DraftSummary | null>(null);
  const [problem, setProblem] = useState<unknown>(null);

  const stay = () => {
    setDiscarding(null);
    setProblem(null);
  };

  const discard = async () => {
    if (!discarding) return;
    try {
      await deleteDraft(discarding.id);
      stay();
    } catch (e) {
      setProblem(e);
    }
  };

  const dialog = (
    <ConfirmDialog
      open={discarding !== null}
      title={t("draft.discard.title")}
      body={discarding ? t(discarding.status === "pending" ? "draft.discard.body.pending" : discarding.lesson_id ? "draft.discard.body.edit" : "draft.discard.body.new") : undefined}
      problem={problem === null ? undefined : te(problem)}
      stay={t("draft.discard.stay")}
      confirm={t("draft.discard.confirm")}
      onStay={stay}
      onConfirm={discard}
    />
  );

  return { ask: setDiscarding, dialog };
}
