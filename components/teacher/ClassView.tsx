"use client";

import { ArrowsOutIcon } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Mark } from "@/components/app/Mark";
import { useClassView, useFreshCode } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { ClassViewSnapshot } from "@/lib/teacher/api/types";
import { isOne, personName } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { formatShortCode, joinUrl, STUDENTS_CAN_TYPE_CODE } from "@/lib/teacher/live";
import { courseLabel } from "@/lib/teacher/start";
import { useClassViewBeat } from "@/lib/teacher/windows";
import { PageTitle } from "./PageTitle";

/** Whether the page is full screen: the button that asks for it is gone while it is, and back when the teacher leaves it. */
const subscribeFullscreen = (listener: () => void) => {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
};
const isFullscreen = () => document.fullscreenElement !== null;
const canFullscreen = () => document.fullscreenEnabled === true;

/**
 * The projected window (FR-SES-02, FR-JOIN-01): a full-screen page with no sidebar, for a whole classroom to read from the back on a weak
 * projector. Huge type, the code and the QR on dark panels, nothing small, and no student's name but the last few who joined (the class
 * view may show those, and nobody who has not). It is a page of the teacher's own sign-in, so a session that ends sends it to sign-in
 * like any other. A reload reads `GET /sessions/{id}/class-view`. Its own channel carries the live code, which a student does not read.
 * "Цел екран" is the only control, and it hides itself in full screen; nothing else ever hides.
 */
export function ClassView() {
  const { t } = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { query, connection } = useClassView(sessionId);
  const snapshot = query.data;
  useClassViewBeat(sessionId);
  useFreshCode(snapshot?.server_now, snapshot?.join?.valid_to, query.refetch);
  const gone = query.status === "error" && isApiError(query.error) && query.error.code === "not_found";
  const fullscreen = useSyncExternalStore(subscribeFullscreen, isFullscreen, () => true);
  const allowed = useSyncExternalStore(subscribeFullscreen, canFullscreen, () => false);

  return (
    <main className="cv" data-state={snapshot?.session.state ?? "loading"}>
      <PageTitle title={t("class.title")} />
      <header className="cv__top">
        <span className="cv__brand">
          <Mark size={48} />
          <span>TeacherAid</span>
        </span>
        {snapshot && <p className="cv__course">{courseLabel(snapshot.session.subject_name, snapshot.session.class_name)}</p>}
        {allowed && !fullscreen && (
          <button type="button" className="btn btn--secondary cv__fullscreen" onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}>
            <ArrowsOutIcon size={28} aria-hidden="true" />
            {t("class.fullscreen")}
          </button>
        )}
      </header>
      {query.status === "loading" && <p className="cv__quiet">{t("class.loading")}</p>}
      {(gone || (query.status === "error" && !snapshot)) && <h1 className="cv__big">{t("class.notopen")}</h1>}
      {snapshot && <Screen snapshot={snapshot} />}
      {connection === "reconnecting" && (
        <p className="cv__reconnecting" role="status">
          {t("class.reconnecting")}
        </p>
      )}
    </main>
  );
}

function Screen({ snapshot }: { snapshot: ClassViewSnapshot }) {
  const { t } = useT();
  const { state } = snapshot.session;
  if (state === "lobby") return <Lobby snapshot={snapshot} />;
  if (state === "teaching") return <Teaching snapshot={snapshot} />;
  return <h1 className="cv__big">{t(state === "review" ? "class.review" : "class.ended")}</h1>;
}

/** The QR of the join address with the token of the moment, on a white ground with its own margin, so that a phone reads it from across a room. */
function Qr({ token, label }: { token: string; label: string }) {
  // The address is this app's own origin: the student app is served from it (FR-JOIN-02). The server render has none, and draws nothing.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  return (
    <div className="cv__qr" role="img" aria-label={label}>
      {origin && <QRCodeSVG value={joinUrl(origin, token)} level="M" marginSize={2} fgColor="#0a2e37" bgColor="#ffffff" />}
    </div>
  );
}

function Lobby({ snapshot }: { snapshot: ClassViewSnapshot }) {
  const { t, locale } = useT();
  const { join, session } = snapshot;
  return (
    <div className="cv__lobby">
      <h1 className="sr">{session.lesson_title}</h1>
      {join && <Qr token={join.token} label={t("class.qr.label")} />}
      <div className="cv__info">
        <p className="cv__how">{t(STUDENTS_CAN_TYPE_CODE ? "class.how.type" : "class.how")}</p>
        {/* The code is shown only while a student can type it (OPEN-03): until then the QR is the one way in, and a code would be read out for nothing. */}
        {STUDENTS_CAN_TYPE_CODE && join && (
          <>
            <p className="cv__label">{t("class.code.label")}</p>
            <p className="cv__code" data-testid="class-code">
              {formatShortCode(join.short_code)}
            </p>
            <p className="cv__quiet">{t("class.rotates")}</p>
          </>
        )}
        <p className="cv__count">{t(isOne(session.joined_count, locale) ? "class.joined.one" : "class.joined", { n: session.joined_count })}</p>
        {session.recent.length > 0 && (
          <>
            <p className="sr">{t("class.recent")}</p>
            <ul className="cv__names">
              {session.recent.map((name) => (
                <li key={name}>{personName(name, locale)}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** The lesson has begun: the words, and a small corner for a student who is late (the code goes on changing, so the corner stays right). */
function Teaching({ snapshot }: { snapshot: ClassViewSnapshot }) {
  const { t } = useT();
  const { join, session } = snapshot;
  return (
    <>
      <h1 className="cv__big">{t("class.started")}</h1>
      <p className="cv__lesson">{session.lesson_title}</p>
      {join && (
        <aside className="cv__corner">
          <Qr token={join.token} label={t("class.qr.label")} />
          <div>
            <p className="cv__label">{t(STUDENTS_CAN_TYPE_CODE ? "class.late.type" : "class.late")}</p>
            {STUDENTS_CAN_TYPE_CODE && (
              <p className="cv__code cv__code--small" data-testid="class-code">
                {formatShortCode(join.short_code)}
              </p>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
