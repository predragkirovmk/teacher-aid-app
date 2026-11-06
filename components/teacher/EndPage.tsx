"use client";

import { CheckCircleIcon, ClipboardTextIcon, MagnifyingGlassIcon, PrinterIcon, ArrowRightIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { sendPracticeSet, useCourse, usePracticeResults, useReview } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { AttendanceRow, AttendanceStatus, MissedQuestion } from "@/lib/teacher/api/types";
import { attendanceText, ATTENDANCE_STATUSES, registerName, sortAttendance, tallyOf, statusWords, type AttendanceWords } from "@/lib/teacher/attendance";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { correctWords, REVIEW_MISSED_MAX } from "@/lib/teacher/review";
import { courseLabel } from "@/lib/teacher/start";
import { TODAY } from "@/lib/teacher/signin";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Problem } from "./Problem";
import { Bar, Loading } from "./Skeleton";
import { StateLine } from "./StateLine";

/** The words the list is written with, in the language of the screen. */
function useAttendanceWords(): AttendanceWords {
  const { t } = useT();
  return {
    status: {
      present: t("att.status.present"),
      late: t("att.status.late"),
      absent: t("att.status.absent"),
      present_no_device: t("att.status.present_no_device"),
    },
    reason: {
      no_phone: t("live.reason.no_phone"),
      battery: t("live.reason.battery"),
      no_data: t("live.reason.no_data"),
      no_focus_authorization: t("live.reason.no_focus_authorization"),
    },
  };
}

/**
 * The page a lesson ends on, and the page a held lesson opens to (`/teacher/live/{id}`, the address of the console while it ran): the full attendance list
 * for e-Дневник with its counts, to copy or print (FR-END-03); the questions the class missed most; the practice set to send (F-12); and the one yellow way on,
 * back to Today. It reads `GET /sessions/{id}/review`, so it is the same after a reload or on another day.
 */
export function EndPage({ sessionId }: { sessionId: string }) {
  const { t } = useT();
  const review = useReview(sessionId);
  const data = review.data;
  const course = useCourse(data?.session.course_id).data;
  const gone = review.status === "error" && isApiError(review.error) && (review.error.code === "not_found" || review.error.code === "invalid_state");

  return (
    <>
      <PageHeader
        title={t("endpage.title")}
        subtitle={data ? `${course ? `${courseLabel(course.subject.name, course.class.name)}: ` : ""}${data.session.lesson.title}` : undefined}
        back={TODAY}
        backLabel={t("back.today")}
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
            <Link href={TODAY} className="btn btn--primary">
              {t("notfound.cta")}
            </Link>
          </div>
        )}
        {review.status === "error" && !gone && <LoadProblem title={t("live.error.title")} error={review.error} onRetry={review.refetch} />}
        {data && data.attendance && (
          <>
            <StateLine state="ended" />
            <Attendance rows={data.attendance} title={`${course ? `${courseLabel(course.subject.name, course.class.name)}, ` : ""}${data.session.lesson.title}`} />
            <Missed missed={data.most_missed} />
            <Practice sessionId={sessionId} noneMissed={data.most_missed.length === 0} />
            <section className="card endpage__way" aria-label={t("endpage.today")}>
              <Link href={TODAY} className="btn btn--primary btn--big">
                {t("endpage.today")}
                <ArrowRightIcon size={28} weight="bold" aria-hidden="true" />
              </Link>
              <p>{t("endpage.held")}</p>
            </section>
          </>
        )}
      </div>
    </>
  );
}

const COUNT_KEY = {
  present: "att.count.present",
  late: "att.count.late",
  absent: "att.count.absent",
  present_no_device: "att.count.present_no_device",
} as const satisfies Record<AttendanceStatus, string>;

/** The counts, the list in the register's order, and the two things a teacher does with it: copy it, or print it. */
function Attendance({ rows, title }: { rows: AttendanceRow[]; title: string }) {
  const { t, locale } = useT();
  const words = useAttendanceWords();
  const [note, setNote] = useState<"copied" | "failed" | null>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const tally = tallyOf(rows);
  const sorted = sortAttendance(rows);

  // The line that says the list was copied takes the focus: a message that appears with its live region is often not read out, and one that holds the focus is.
  useEffect(() => {
    if (note) line.current?.focus();
  }, [note]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(attendanceText(rows, words, locale));
      setNote("copied");
    } catch {
      setNote("failed");
    }
  };

  return (
    <section className="card att att-print" aria-labelledby="att-title">
      <h2 id="att-title">{t("att.title")}</h2>
      <p className="att-print__title">{title}</p>
      <p className="att__hint">{t("att.hint")}</p>
      <ul className="att__counts" aria-label={t("att.title")}>
        {ATTENDANCE_STATUSES.map((status) => (
          <li key={status} data-status={status}>
            <strong data-testid={`count-${status}`}>{tally[status]}</strong>
            <span>{t(COUNT_KEY[status])}</span>
          </li>
        ))}
        <li data-status="total">
          <strong data-testid="count-total">{tally.total}</strong>
          <span>{t("att.count.total")}</span>
        </li>
      </ul>
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
      {note && (
        <p ref={line} className="att__note" role="status" tabIndex={-1} data-note={note}>
          <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
          {t(note === "copied" ? "att.copied" : "att.copy.failed")}
        </p>
      )}
      <table className="att__table">
        <thead>
          <tr>
            <th scope="col">{t("att.col.name")}</th>
            <th scope="col">{t("att.col.status")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.student_id} data-status={row.status} data-testid="att-row">
              <th scope="row">{registerName(row.full_name, locale)}</th>
              <td>{statusWords(row, words)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The questions the class missed most: the same ranking as the review, short. */
function Missed({ missed }: { missed: MissedQuestion[] }) {
  const { t, locale } = useT();
  const labels = { true: t("q.adhoc.true"), false: t("q.adhoc.false") };
  return (
    <section className="card endpage__missed" aria-labelledby="end-missed">
      <h2 id="end-missed">{t("endpage.missed.title")}</h2>
      {missed.length === 0 ? (
        <p className="rpanel__none" data-testid="none-missed">
          <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
          {t("endpage.missed.none")}
        </p>
      ) : (
        <ol className="rlist" data-testid="missed-list">
          {missed.slice(0, REVIEW_MISSED_MAX).map((m, i) => (
            <li key={m.session_question_id} className="rlist__item">
              <p className="rlist__n">{i + 1}</p>
              <p className="rlist__prompt">{m.prompt}</p>
              <p className="rlist__answer">
                <strong>{t("rev.right")}:</strong> {correctWords(m, labels)}
              </p>
              <p className="rlist__count">{t(isOne(m.missed, locale) ? "rev.missed.count.one" : "rev.missed.count", { missed: m.missed, joined: m.joined })}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * The practice set (F-12): one button makes it and sends it, once per lesson. "Sent" is shown only after the API said so; a set that was made (here, in
 * another window, or earlier) is read from `GET /sessions/{id}/practice-set`, so the button is gone and the page says so. When nothing was missed there is
 * nothing to send, and the page says that. Who has done it is a short list (FR-PRA-10).
 */
function Practice({ sessionId, noneMissed }: { sessionId: string; noneMissed: boolean }) {
  const { t, te, locale } = useT();
  const results = usePracticeResults(sessionId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [nothing, setNothing] = useState(false);
  const set = results.data;
  const notYet = results.status === "error" && isApiError(results.error) && results.error.code === "not_found";

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const made = await sendPracticeSet(sessionId);
      if (made.practice_set === null) setNothing(true);
    } catch (e) {
      setProblem(te(e));
    } finally {
      setBusy(false);
    }
  };

  const none = nothing || (noneMissed && !set);
  const done = set ? set.students.filter((s) => s.completed_at !== null) : [];
  const register = sortAttendance(done);

  return (
    <section className="card practice" aria-labelledby="practice-title">
      <h2 id="practice-title">{t("pr.title")}</h2>
      {results.status === "loading" && <Bar height="3.5rem" className="skeleton--row" />}
      {results.status === "error" && !notYet && <LoadProblem title={t("pr.title")} error={results.error} onRetry={results.refetch} />}
      {notYet && none && (
        <p className="rpanel__none" data-testid="practice-none">
          <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
          {t("pr.none")}
        </p>
      )}
      {notYet && !none && (
        <>
          <p>{t("pr.what")}</p>
          <div>
            <button type="button" className="btn btn--secondary btn--big" aria-busy={busy} aria-disabled={busy} onClick={() => void send()}>
              <PaperPlaneTiltIcon size={28} aria-hidden="true" />
              {busy ? t("pr.sending") : t("pr.send")}
            </button>
          </div>
          {problem && <Problem title={t("pr.failed")}>{problem}</Problem>}
        </>
      )}
      {set && (
        <>
          <p className="practice__sent" data-testid="practice-sent">
            <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
            <strong>{t("pr.sent.title")}</strong>
          </p>
          <p data-testid="practice-count">{t(isOne(set.practice_set.question_count, locale) ? "pr.sent.one" : "pr.sent", { n: set.practice_set.question_count })}</p>
          <h3 className="practice__sub">{t("pr.done.title")}</h3>
          <p data-testid="practice-done">{t("pr.done.count", { done: done.length, total: set.students.length })}</p>
          {done.length === 0 ? (
            <p>{t("pr.done.none")}</p>
          ) : (
            <>
              <ul className="practice__list">
                {register.map((s) => (
                  <li key={s.student_id} data-testid="practice-student">
                    <span>{registerName(s.full_name, locale)}</span>
                    <span>{t("pr.done.score", { score: s.score ?? 0, total: set.practice_set.question_count })}</span>
                  </li>
                ))}
              </ul>
              {done.length < set.students.length && <p>{t("pr.done.more")}</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}
