"use client";

import { ArrowRightIcon, FolderOpenIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import type { DraftSummary } from "@/lib/teacher/api/types";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { draftUrl, FROM_TODAY } from "@/lib/teacher/routes";
import { relativeDay, sayWhen } from "@/lib/teacher/when";
import { kindLine } from "./LessonCard";

/**
 * One lesson that is not finished, on Today: its title (while it is being written, or when that failed, those words in its place),
 * its subject and year, what it is, and the two things to do with it, each named: "Продолжи" opens a lesson that is ready where it
 * was left (one that is being written, or that failed, has nothing to carry on and is "Отвори"), "Фрли" throws it away, after a
 * question that the page asks. A draft of a lesson that was already saved says so, since it carries the
 * saved lesson's own title and would otherwise look like a second copy of it.
 */
export function DraftCard({ draft, today, onDiscard }: { draft: DraftSummary; today: number | null; onDiscard: (draft: DraftSummary) => void }) {
  const { t, locale } = useT();
  const title = useId();
  // A title the teacher has emptied is still a lesson to find; it is called what the page of a draft calls it until it has a name.
  const heading = draft.status === "ready" ? ((draft.title ?? "").trim() || t("draft.title")) : t(draft.status === "pending" ? "draft.card.pending" : "draft.card.failed");
  const questions = draft.question_count ?? 0;
  const changed = today === null ? null : t("lesson.changed", { when: sayWhen(t, relativeDay(Date.parse(draft.updated_at), today)) });
  const count = t(isOne(questions, locale) ? "lesson.questions.one" : "lesson.questions.many", { n: questions });
  const line = draft.status === "pending" ? t("draft.card.pending.line") : draft.status === "failed" ? t("draft.card.failed.line") : changed ? `${count} · ${changed}` : count;
  return (
    <li className="lesson lesson--draft" data-status={draft.status}>
      <div className="lesson__text">
        <h3 className="lesson__title" id={title}>
          {draft.status === "failed" && (
            <span className="problem__badge lesson__badge" aria-hidden="true">
              <WarningIcon size={20} weight="bold" />
            </span>
          )}
          {heading}
        </h3>
        <p>{kindLine(t, draft)}</p>
        <p>{line}</p>
        {draft.lesson_id && <p className="lesson__edit">{t("draft.card.edit")}</p>}
      </div>
      <div className="lesson__actions">
        <Link href={draftUrl(draft.id, FROM_TODAY)} prefetch={false} className="btn btn--secondary" aria-describedby={title}>
          {/* Only a lesson that is ready can be carried on: one that is being written, or that failed, is opened to be looked at. */}
          {draft.status === "ready" ? <ArrowRightIcon size={24} weight="bold" aria-hidden="true" /> : <FolderOpenIcon size={24} aria-hidden="true" />}
          {t(draft.status === "ready" ? "draft.card.continue" : "lesson.open")}
        </Link>
        <button type="button" className="btn btn--quiet" aria-haspopup="dialog" aria-describedby={title} onClick={() => onDiscard(draft)}>
          <TrashIcon size={24} aria-hidden="true" />
          {t("draft.card.discard")}
        </button>
      </div>
    </li>
  );
}
