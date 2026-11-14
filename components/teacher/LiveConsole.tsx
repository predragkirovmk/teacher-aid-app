"use client";

import { PlayIcon, QuestionIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  advanceSession,
  useConsole,
  useFreshCode,
} from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { ConsoleSnapshot } from "@/lib/teacher/api/types";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import {
  formatShortCode,
  missingCount,
  STUDENTS_CAN_TYPE_CODE,
} from "@/lib/teacher/live";
import { forgetReviewScreen } from "@/lib/teacher/review-screen";
import { courseLabel } from "@/lib/teacher/start";
import { TODAY } from "@/lib/teacher/signin";
import { ConfirmDialog } from "./ConfirmDialog";
import { EndLesson } from "./EndLesson";
import { EndPage } from "./EndPage";
import { LiveRoster } from "./LiveRoster";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Problem } from "./Problem";
import { MirrorWarning, ProjectorControl } from "./ProjectorControl";
import { Bar, Loading } from "./Skeleton";
import { StateLine } from "./StateLine";
import { TabPanel, Tabs } from "./Tabs";
import { AnonInbox } from "./AnonInbox";
import { QuestionList } from "./QuestionList";
import { QuestionPanel } from "./QuestionPanel";
import { ReviewPanel } from "./ReviewPanel";

type PanelTab = "class" | "questions" | "anon";

/**
 * The teacher's own screen of a lesson that is running (F-06, FR-CON-*). It is the one page without the sidebar: in front of a class the
 * window belongs to the lesson, and Back leads to Today. The top bar says which lesson, class and subject this is and holds the button
 * that opens the projected window, with where that window stands, and the red End. Under it, where the lesson stands; then, at the left,
 * the stage: the one thing to do now (start it in the lobby, the question while teaching). At the right, who has joined; while teaching it
 * shares its place with the list of questions and the anonymous questions, as tabs, so the whole lesson is one screen. Everything comes from `GET /sessions/{id}/console`, kept up to date by the stream, so a
 * reload or a window closed and opened again brings it all back (FR-SES-08), and a lost connection is said calmly and mended by itself.
 * While teaching it is the panel "Прашањето сега" with the one main button, the list of questions, the inbox of anonymous questions and the class.
 */
export function LiveConsole() {
  const { t } = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { query, connection } = useConsole(sessionId);
  const snapshot = query.data;
  useFreshCode(snapshot?.server_now, snapshot?.join?.valid_to, query.refetch);
  const [tab, setTab] = useState<PanelTab>("class");
  const teaching = snapshot?.session.state === "teaching";
  const reviewing = snapshot?.session.state === "review";
  // A lesson that has ended (this window pressed End, another did, or the page was opened afterwards) is no longer a console: the answer is `ended` or
  // `not_found`, and the page becomes the end page, which reads the lesson from its review. A link to no lesson at all says so there.
  const state = snapshot?.session.state;
  useEffect(() => {
    if (state && state !== "review") forgetReviewScreen(sessionId);
  }, [state, sessionId]);
  const over =
    snapshot?.session.state === "ended" ||
    (isApiError(query.error) && query.error.code === "not_found");
  // The frame hides its sidebar while this screen is the console (app/(teacher)/teacher.css, `data-focus`). The end page is a page like any other.
  useLayoutEffect(() => {
    if (over) return;
    const root = document.documentElement;
    root.dataset.focus = "live";
    return () => {
      delete root.dataset.focus;
    };
  }, [over]);
  if (over) return <EndPage sessionId={sessionId} />;

  return (
    <>
      <PageHeader
        title={t("live.title")}
        subtitle={
          snapshot
            ? `${courseLabel(snapshot.session.subject_name, snapshot.session.class_name)}: ${snapshot.session.lesson.title}`
            : undefined
        }
        back={TODAY}
        backLabel={t("back.today")}
        compact
        action={
          snapshot ? (
            <div className="live__tools">
              {/* First, as it is the first thing to do: the projected window. Last, apart and red: the one way to end. */}
              <ProjectorControl sessionId={snapshot.session.id} />
              <section
                id="live-end-section"
                className="live__end"
                aria-labelledby="live-end"
              >
                <h2 id="live-end" className="sr" tabIndex={-1}>
                  {t("end.button")}
                </h2>
                <EndLesson sessionId={snapshot.session.id} />
                <p className="sr">{t("end.hint")}</p>
              </section>
            </div>
          ) : undefined
        }
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
        {query.status === "error" && (
          <LoadProblem
            title={t("live.error.title")}
            error={query.error}
            onRetry={query.refetch}
          />
        )}
        {snapshot && (
          <>
            {connection === "reconnecting" && (
              <div className="card card--compact reconnecting" role="status">
                <p>
                  <strong>{t("live.connecting.title")}</strong>{" "}
                  {t("live.connecting.body")}
                </p>
              </div>
            )}
            <StateLine state={snapshot.session.state} compact />
            {reviewing ? (
              <ReviewPanel snapshot={snapshot} />
            ) : (
              <div className="live__frame">
                {/* The stage: the one thing to do now. It keeps its place when the lesson moves on. */}
                <div className="live__stage">
                  {teaching && <QuestionPanel snapshot={snapshot} />}
                  <JoinCard snapshot={snapshot} />
                  <div className="live__notes">
                    <MirrorWarning />
                    <p className="projector__hint">
                      {t("live.projector.hint")}
                    </p>
                    <Link
                      href="/teacher/help"
                      className="btn btn--quiet"
                      target="_blank"
                      rel="noopener"
                    >
                      <QuestionIcon size={24} aria-hidden="true" />
                      {t("nav.help")}
                      <span className="sr">{`, ${t("link.newtab")}`}</span>
                    </Link>
                  </div>
                </div>
                {/* Who is here keeps its place from the lobby on; while teaching the questions and what the class writes share it, one at a time. */}
                <div className="live__panel">
                  {teaching && (
                    <Tabs
                      name="live"
                      label={t("live.tabs.label")}
                      value={tab}
                      onChange={setTab}
                      tabs={[
                        { id: "class", label: t("live.tab.class") },
                        { id: "questions", label: t("live.tab.questions") },
                        {
                          id: "anon",
                          label: t("live.tab.anon", {
                            n: snapshot.anon_questions.length,
                          }),
                        },
                      ]}
                    />
                  )}
                  <TabPanel
                    name="live"
                    id="class"
                    active={!teaching || tab === "class"}
                    tabbed={teaching}
                  >
                    <LiveRoster
                      sessionId={snapshot.session.id}
                      students={snapshot.students}
                    />
                  </TabPanel>
                  {teaching && (
                    <TabPanel
                      name="live"
                      id="questions"
                      active={tab === "questions"}
                    >
                      <QuestionList snapshot={snapshot} />
                    </TabPanel>
                  )}
                  {teaching && (
                    <TabPanel name="live" id="anon" active={tab === "anon"}>
                      <AnonInbox
                        sessionId={snapshot.session.id}
                        items={snapshot.anon_questions}
                      />
                    </TabPanel>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * In the lobby, the page's one main button. The question before it is the app's own kind: the lesson cannot be taken back to the lobby
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
      <h2 id="live-code">
        {t(STUDENTS_CAN_TYPE_CODE ? "live.code.label" : "live.start.title")}
      </h2>
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
          <button
            type="button"
            className="btn btn--primary btn--big"
            aria-haspopup="dialog"
            onClick={() => setAsking(true)}
          >
            <PlayIcon size={28} weight="fill" aria-hidden="true" />
            {t("live.start")}
          </button>
          <p className="live__starthint">{t("live.start.hint")}</p>
          {problem && (
            <Problem title={t("live.start.failed")}>{problem}</Problem>
          )}
          <ConfirmDialog
            open={asking}
            title={t("live.start.confirm.title")}
            body={
              waiting > 0
                ? t(
                    isOne(waiting, locale)
                      ? "live.start.confirm.waiting.one"
                      : "live.start.confirm.waiting",
                    { n: waiting },
                  )
                : t("live.start.confirm.all")
            }
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
