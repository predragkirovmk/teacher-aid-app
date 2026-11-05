"use client";

import { MagnifyingGlassIcon, PlayIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { advanceSession, useConsole, useFreshCode } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { ConsoleSnapshot } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { formatShortCode, joinedCount } from "@/lib/teacher/live";
import { courseLabel } from "@/lib/teacher/start";
import { TODAY } from "@/lib/teacher/signin";
import { ConfirmDialog } from "./ConfirmDialog";
import { LiveRoster } from "./LiveRoster";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Problem } from "./Problem";
import { ProjectorControl } from "./ProjectorControl";
import { Bar, Loading } from "./Skeleton";
import { StateLine } from "./StateLine";
import { QuestionCard } from "./LessonView";

/**
 * The teacher's own screen of a lesson that is running (F-06, FR-CON-*), with the sidebar. It says which lesson, class and subject
 * this is; where the lesson stands; and, in the lobby, the one yellow button that starts it, the code to read out, the button that opens
 * the projected window, and who has joined. Everything comes from `GET /sessions/{id}/console`, kept up to date by the stream, so a
 * reload or a window closed and opened again brings it all back (FR-SES-08), and a lost connection is said calmly and mended by itself.
 * Firing the questions is the next step: while teaching, the questions are listed to read, and there is no yellow button.
 */
export function LiveConsole() {
  const { t } = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { query, connection } = useConsole(sessionId);
  const snapshot = query.data;
  useFreshCode(snapshot?.server_now, snapshot?.join?.valid_to, query.refetch);
  // A lesson that is not the open one (it ended, or the link is old) is not found: said plainly, with the way back to Today.
  const gone = query.status === "error" && isApiError(query.error) && query.error.code === "not_found";

  return (
    <>
      <PageHeader
        title={t("live.title")}
        subtitle={snapshot ? `${courseLabel(snapshot.session.subject_name, snapshot.session.class_name)}: ${snapshot.session.lesson.title}` : undefined}
        back={TODAY}
        backLabel={t("back.today")}
      />
      <div className="content live">
        {query.status === "loading" && (
          <Loading>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="60%" height="2rem" />
              <Bar width="90%" height="1.5rem" />
            </div>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="40%" height="4rem" />
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
        {query.status === "error" && !gone && <LoadProblem title={t("live.error.title")} error={query.error} onRetry={query.refetch} />}
        {snapshot && (
          <>
            {connection === "reconnecting" && (
              <div className="card card--compact reconnecting" role="status">
                <p>
                  <strong>{t("live.connecting.title")}</strong> {t("live.connecting.body")}
                </p>
              </div>
            )}
            <StateLine state={snapshot.session.state} />
            <div className="live__grid">
              <div className="live__side">
                <JoinCard snapshot={snapshot} />
                <ProjectorControl sessionId={snapshot.session.id} />
              </div>
              <LiveRoster sessionId={snapshot.session.id} students={snapshot.students} />
            </div>
            {snapshot.session.state === "teaching" && <Questions snapshot={snapshot} />}
          </>
        )}
      </div>
    </>
  );
}

/**
 * The code, large enough to read out, and in the lobby the page's one yellow button. The question before it is the app's own kind: the
 * lesson cannot be taken back to the lobby (4.1), and everyone who joins afterwards is late, so it asks first, with the safe answer as the default.
 */
function JoinCard({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { t, te } = useT();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const lobby = snapshot.session.state === "lobby";
  const { total, joined } = joinedCount(snapshot.students);
  const waiting = total - joined;

  const start = async () => {
    try {
      await advanceSession(snapshot.session.id, "teaching");
      setAsking(false);
    } catch (e) {
      setAsking(false);
      setProblem(te(e));
    }
  };

  return (
    <section className="card live__code" aria-labelledby="live-code">
      <h2 id="live-code">{t("live.code.label")}</h2>
      {snapshot.join ? (
        <>
          <p className="live__digits" data-testid="short-code">
            {formatShortCode(snapshot.join.short_code)}
          </p>
          <p className="live__rotates">{t("live.code.hint")}</p>
        </>
      ) : (
        <p>{t("live.code.none")}</p>
      )}
      {lobby && (
        <>
          <button type="button" className="btn btn--primary btn--big" aria-haspopup="dialog" onClick={() => setAsking(true)}>
            <PlayIcon size={28} weight="fill" aria-hidden="true" />
            {t("live.start")}
          </button>
          <p className="live__starthint">{t("live.start.hint")}</p>
          {problem && <Problem title={t("live.start.failed")}>{problem}</Problem>}
          <ConfirmDialog
            open={asking}
            title={t("live.start.confirm.title")}
            body={waiting > 0 ? t("live.start.confirm.waiting", { n: waiting }) : t("live.start.confirm.all")}
            stay={t("live.start.confirm.stay")}
            confirm={t("live.start.confirm.yes")}
            onStay={() => setAsking(false)}
            onConfirm={start}
          />
        </>
      )}
    </section>
  );
}

/** While teaching: the lesson's questions, to read, and an honest line that sending them comes next. */
function Questions({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { t } = useT();
  const questions = snapshot.questions;
  return (
    <section className="live__questions" aria-labelledby="live-questions">
      <h2 className="section__title" id="live-questions">
        {t("live.teaching.title")}
      </h2>
      <div className="card card--compact">
        <p>{t("live.teaching.soon")}</p>
      </div>
      <ol className="questions">
        {questions.map((q, i) => (
          <QuestionCard key={q.id} question={q.question} n={i + 1} total={questions.length} />
        ))}
      </ol>
    </section>
  );
}
