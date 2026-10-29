"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { isApiError } from "@/lib/teacher/api/errors";
import { useT } from "@/lib/teacher/i18n";
import { Problem } from "./Problem";

/**
 * A screen could not get what it shows: what went wrong in the words of the step 2 error copy, and the button to try again.
 * Something that is not there (`not_found`) does not come back by asking again, so it has no button.
 */
export function LoadProblem({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  const { t, te } = useT();
  const gone = isApiError(error) && error.code === "not_found";
  return (
    <div className="load-problem">
      <Problem title={title}>{te(error)}</Problem>
      {!gone && (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          <ArrowClockwiseIcon size={24} weight="bold" aria-hidden="true" />
          {t("error.retry")}
        </button>
      )}
    </div>
  );
}
