"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { SubjectMark } from "@/components/app/SubjectCard";
import type { SessionResult } from "@/lib/app/api/types";
import { formatDate } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";
import { subjectLabel } from "@/lib/app/subjects";

/** One finished lesson: its title, the subject and the day, and how many questions were right. It opens that lesson's summary. */
export function ResultRow({ result, withSubject = true }: { result: SessionResult; withSubject?: boolean }) {
  const { t, locale } = useT();
  const subject = subjectLabel(t, result.subjectId, result.subjectName);
  const date = formatDate(result.endedAt, locale);
  return (
    <Link href={`/app/summary/${encodeURIComponent(result.sessionId)}`} className="item">
      <span className="mark" aria-hidden="true">
        <SubjectMark subject={result} />
      </span>
      <span className="grow item__main">
        <span className="item__text">
          <span className="item__title" style={{ display: "block" }}>
            {result.lessonTitle}
          </span>
          <span className="t-cap">{withSubject ? `${subject} · ${date}` : date}</span>
        </span>
        <span className="status">{t("res.score", { right: result.right, total: result.total })}</span>
      </span>
      <CaretRightIcon size={22} aria-hidden="true" />
    </Link>
  );
}

export function ResultList({ results, withSubject = true }: { results: SessionResult[]; withSubject?: boolean }) {
  return (
    <ul className="list">
      {results.map((r) => (
        <li key={r.sessionId}>
          <ResultRow result={r} withSubject={withSubject} />
        </li>
      ))}
    </ul>
  );
}
