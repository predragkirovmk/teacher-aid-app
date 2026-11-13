"use client";

import { CaretRightIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import type { DraftSummary } from "@/lib/teacher/api/types";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { draftUrl, type From } from "@/lib/teacher/routes";
import { relativeDay, sayWhen } from "@/lib/teacher/when";
import { kindLine } from "./LessonCard";

/**
 * One lesson that is not finished, as a row: its title (while it is being written, or when that failed, those words in its place),
 * what it is, and the one thing to do with it, named: "Продолжи" opens a lesson that is ready where it was left (one that is being
 * written, or that failed, has nothing to carry on and is "Отвори"). The whole row is that link. Throwing it away is on the
 * lesson's own page, away from the rows that are pressed every day. A draft of a lesson that was already saved says so, since it
 * carries the saved lesson's own title and would otherwise look like a second copy of it.
 */
export function DraftCard({
  draft,
  today,
  from,
}: {
  draft: DraftSummary;
  today: number | null;
  /** Where the list is, so that the Back of the draft goes there: Today says so, the Lessons page leaves it out (Back goes to Lessons). */
  from?: From;
}) {
  const { t, locale } = useT();
  const title = useId();
  // A title the teacher has emptied is still a lesson to find; it is called what the page of a draft calls it until it has a name.
  const heading = draft.status === "ready" ? ((draft.title ?? "").trim() || t("draft.title")) : t(draft.status === "pending" ? "draft.card.pending" : "draft.card.failed");
  const questions = draft.question_count ?? 0;
  const changed = today === null ? null : t("lesson.changed", { when: sayWhen(t, relativeDay(Date.parse(draft.updated_at), today)) });
  const count = t(isOne(questions, locale) ? "lesson.questions.one" : "lesson.questions.many", { n: questions });
  const kind = kindLine(t, draft);
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
        {draft.status === "ready" ? (
          <p>{changed ? `${kind} · ${count} · ${changed}` : `${kind} · ${count}`}</p>
        ) : (
          <>
            <p>{kind}</p>
            <p>{t(draft.status === "pending" ? "draft.card.pending.line" : "draft.card.failed.line")}</p>
          </>
        )}
        {draft.lesson_id && <p className="lesson__edit">{t("draft.card.edit")}</p>}
      </div>
      <div className="lesson__actions">
        {/* Only a lesson that is ready can be carried on: one that is being written, or that failed, is opened to be looked at. */}
        <Link href={draftUrl(draft.id, from)} prefetch={false} className="lesson__open lesson__go" aria-describedby={title}>
          {t(draft.status === "ready" ? "draft.card.continue" : "lesson.open")}
        </Link>
      </div>
      <CaretRightIcon className="lesson__chev" size={20} weight="bold" aria-hidden="true" />
    </li>
  );
}
