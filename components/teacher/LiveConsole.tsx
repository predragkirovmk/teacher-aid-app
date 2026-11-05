"use client";

import { MagnifyingGlassIcon, PlayIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { advanceSession, useConsole, useFreshCode } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { ConsoleSnapshot } from "@/lib/teacher/api/types";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { formatShortCode, missingCount, STUDENTS_CAN_TYPE_CODE } from "@/lib/teacher/live";
import { courseLabel } from "@/lib/teacher/start";
import { TODAY } from "@/lib/teacher/signin";
import { ConfirmDialog } from "./ConfirmDialog";
import { LiveRoster } from "./LiveRoster";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Problem } from "./Problem";
import { MirrorWarning, ProjectorControl } from "./ProjectorControl";
import { Bar, Loading } from "./Skeleton";
import { StateLine } from "./StateLine";
import { AnonInbox } from "./AnonInbox";
import { QuestionList } from "./QuestionList";
import { QuestionPanel } from "./QuestionPanel";

/**
 * The teacher's own screen of a lesson that is running (F-06, FR-CON-*), with the sidebar. It says which lesson, class and subject
 * this is; where the lesson stands; and, in the lobby, the one yellow button that starts it, the code to read out, the button that opens
 * the projected window, and who has joined. Everything comes from `GET /sessions/{id}/console`, kept up to date by the stream, so a
 * reload or a window closed and opened again brings it all back (FR-SES-08), and a lost connection is said calmly and mended by itself.
 * While teaching it is the panel "Прашањето сега" with the one yellow button, the list of questions, the inbox of anonymous questions and the class.
 */
export function LiveConsole() {
  const { t } = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { query, connection } = useConsole(sessionId);
  const snapshot = query.data;
  useFreshCode(snapshot?.server_now, snapshot?.join?.valid_to, query.refetch);
  // A lesson that is not the open one (it ended, or the link is old) is not found: said plainly, with the way back to Today.
  const teaching = snapshot?.session.state === "teaching";
  const gone = query.status === "error" && isApiError(query.error) && query.error.code === "not_found";

  return (
    <>
      <PageHeader
        title={t("live.title")}
        subtitle={snapshot ? `${courseLabel(snapshot.session.subject_name, snapshot.session.class_name)}: ${snapshot.session.lesson.title}` : undefined}
        back={TODAY}
        backLabel={t("back.today")}
        compact={snapshot?.session.state === "teaching"}
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
            <StateLine state={snapshot.session.state} compact={teaching} />
            {teaching ? (
              <>
                {/* The panel first: what is happening to the question now and the one thing to press. Then the questions and what the class writes, beside who is here. */}
                <QuestionPanel snapshot={snapshot} />
                <div className="live__teach">
                  <div className="live__main">
                    <QuestionList snapshot={snapshot} />
                    <AnonInbox sessionId={snapshot.session.id} items={snapshot.anon_questions} />
                  </div>
                  <div className="live__side">
                    <LiveRoster sessionId={snapshot.session.id} students={snapshot.students} />
                    <ProjectorControl sessionId={snapshot.session.id} />
                    <JoinCard snapshot={snapshot} />
                    <MirrorWarning />
                  </div>
                </div>
              </>
            ) : (
              <div className="live__grid">
                {/* In the order a teacher does them: open the projector, then wait for the class, then start. */}
                <div className="live__side">
                  <ProjectorControl sessionId={snapshot.session.id} />
                  <JoinCard snapshot={snapshot} />
                  <MirrorWarning />
                </div>
                <LiveRoster sessionId={snapshot.session.id} students={snapshot.students} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * In the lobby, the page's one yellow button. The question before it is the app's own kind: the lesson cannot be taken back to the lobby
 * (4.1), and everyone who joins afterwards is late, so it asks first, with the safe answer as the default. The code to read out is shown only
 * while a student can type it (`STUDENTS_CAN_TYPE_CODE`, OPEN-03); until then the QR on the projector is the one way in, and a code here
 * would only invite the teacher to read out what nobody can use.
 */
function JoinCard({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { t, te, locale } = useT();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const lobby = snapshot.session.state === "lobby";
  // Those the teacher is still waiting for: a student marked present without a phone is not one of them.
  const waiting = missingCount(snapshot.students);
  if (!lobby && !STUDENTS_CAN_TYPE_CODE) return null;

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
      <h2 id="live-code">{t(STUDENTS_CAN_TYPE_CODE ? "live.code.label" : "live.start.title")}</h2>
      {STUDENTS_CAN_TYPE_CODE &&
        (snapshot.join ? (
          <>
            <p className="live__digits" data-testid="short-code">
              {formatShortCode(snapshot.join.short_code)}
            </p>
            <p className="live__rotates">{t("live.code.hint")}</p>
          </>
        ) : (
          <p>{t("live.code.none")}</p>
        ))}
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
            body={waiting > 0 ? t(isOne(waiting, locale) ? "live.start.confirm.waiting.one" : "live.start.confirm.waiting", { n: waiting }) : t("live.start.confirm.all")}
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
