"use client";

import { CheckCircleIcon, ClipboardTextIcon, MagnifyingGlassIcon, PrinterIcon, ArrowRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReview } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { ResultRow } from "@/lib/teacher/api/types";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { registerName, resultsText, sortRegister } from "@/lib/teacher/results";
import { HOME } from "@/lib/teacher/signin";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Bar, Loading } from "./Skeleton";
import { StateLine } from "./StateLine";

/**
 * The page a lesson ends on, and the page a held lesson opens to (`/teacher/live/{id}`, the address of the console while it ran): the students who
 * joined, in register order, each with their score, to copy or print (FR-END-03); and the one main way on, back to the lessons. It reads
 * `GET /sessions/{id}/review`, so it is the same after a reload or on another day.
 */
export function EndPage({ sessionId }: { sessionId: string }) {
  const { t } = useT();
  const review = useReview(sessionId);
  const data = review.data;
  const gone = review.status === "error" && isApiError(review.error) && (review.error.code === "not_found" || review.error.code === "invalid_state");

  return (
    <>
      <PageHeader
        title={t("endpage.title")}
        subtitle={data?.session.lesson.title}
        back={HOME}
        backLabel={t("back.lessons")}
        action={
          data ? (
            <Link href={HOME} className="btn btn--primary">
              {t("endpage.lessons")}
              <ArrowRightIcon size={24} weight="bold" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      <div className="content live endpage">
        {review.status === "loading" && (
          <Loading>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="40%" height="2rem" />
              <Bar height="3.5rem" className="skeleton--row" />
              <Bar height="3.5rem" className="skeleton--row" />
            </div>
          </Loading>
        )}
        {gone && (
          <div className="card card--stack">
            <span className="card__icon">
              <MagnifyingGlassIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("live.notopen.title")}</h2>
            <p>{t("live.notopen.body")}</p>
            <Link href={HOME} className="btn btn--primary">
              {t("notfound.cta")}
            </Link>
          </div>
        )}
        {review.status === "error" && !gone && <LoadProblem title={t("live.error.title")} error={review.error} onRetry={review.refetch} />}
        {data && (
          <>
            <StateLine state="ended" compact />
            <p className="endpage__held">{t("endpage.held")}</p>
            <Results rows={data.students} lesson={data.session.lesson.title} day={data.session.ended_at ?? data.session.started_at} />
          </>
        )}
      </div>
    </>
  );
}

/** The score with its numbers in bold, whatever the words between them are in the language of the screen. */
function boldNumbers(text: string) {
  return text.split(/(\d+)/).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

/** The list in the register's order, and the two things a teacher does with it: copy it, or print it. */
function Results({ rows, lesson, day }: { rows: ResultRow[]; lesson: string; day: string }) {
  const { t, locale } = useT();
  const [note, setNote] = useState<"copied" | "failed" | null>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const words = { score: (correct: number, asked: number) => t("end.score", { correct, asked }) };

  // The line that says the list was copied takes the focus: a message that appears with its live region is often not read out, and one that holds the focus is.
  useEffect(() => {
    if (note) line.current?.focus();
  }, [note]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resultsText(rows, locale, words));
      setNote("copied");
    } catch {
      setNote("failed");
    }
  };

  if (rows.length === 0) {
    return (
      <section className="card att">
        <p data-testid="end-none">{t("end.none")}</p>
      </section>
    );
  }

  return (
    <section className="card att att-print" aria-labelledby="att-title">
      <div className="att__head">
        <div className="att__name">
          <h2 id="att-title">{t("end.list")}</h2>
          <p className="att__count" data-testid="end-count">
            {t(isOne(rows.length, locale) ? "end.count.one" : "end.count", { n: rows.length })}
          </p>
          {/* On paper only: the lesson and the day the list belongs to, above it. */}
          <p className="att-print__title">
            <span>{lesson}</span>
            <span>{new Date(day).toLocaleDateString(locale === "mk" ? "mk-MK" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
          </p>
        </div>
        <div className="att__actions">
          <button type="button" className="btn btn--secondary" onClick={() => void copy()}>
            <ClipboardTextIcon size={24} aria-hidden="true" />
            {t("att.copy")}
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => window.print()}>
            <PrinterIcon size={24} aria-hidden="true" />
            {t("att.print")}
          </button>
        </div>
      </div>
      {note && (
        <p ref={line} className="att__note" role="status" tabIndex={-1} data-note={note}>
          <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
          {t(note === "copied" ? "att.copied" : "att.copy.failed")}
        </p>
      )}
      <table className="att__table">
        <caption className="sr">{t("end.list")}</caption>
        <tbody>
          {sortRegister(rows).map((row) => (
            <tr key={row.student_id} data-testid="att-row">
              <th scope="row">{registerName(row.full_name, locale)}</th>
              <td>{boldNumbers(t("end.score", { correct: row.correct, asked: row.asked }))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
