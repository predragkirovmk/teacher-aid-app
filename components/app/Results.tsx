"use client";

import { CaretRightIcon, ListChecksIcon } from "@phosphor-icons/react";
import Link from "next/link";
import type { SessionResult } from "@/lib/app/api/types";
import { formatDate } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";

/** One finished quiz: its title, "New" when its result has not been opened, the day, and how many questions were right. It opens that quiz's summary. */
export function ResultRow({ result, isNew = false }: { result: SessionResult; isNew?: boolean }) {
  const { t, locale } = useT();
  const date = formatDate(result.endedAt, locale);
  return (
    <Link href={`/app/summary/${encodeURIComponent(result.sessionId)}`} className="item item--result" transitionTypes={["nav-forward"]}>
      <span className="mark" aria-hidden="true">
        <ListChecksIcon size="1em" weight="bold" />
      </span>
      <span className="grow item__main">
        <span className="item__text">
          <span className="item__title" style={{ display: "block" }}>
            {result.lessonTitle}
          </span>
          {/* One line: the "New" mark and the date keep their width. */}
          <span className="t-cap res-cap">
            {isNew && (
              <>
                <b className="tile__new">{t("home.new")}</b>
                {" · "}
              </>
            )}
            {date}
          </span>
        </span>
        <span className="status">{t("res.score", { right: result.right, total: result.total })}</span>
      </span>
      <CaretRightIcon size={22} aria-hidden="true" />
    </Link>
  );
}

export function ResultList({ results }: { results: SessionResult[] }) {
  return (
    <ul className="list">
      {results.map((r) => (
        <li key={r.sessionId}>
          <ResultRow result={r} />
        </li>
      ))}
    </ul>
  );
}
