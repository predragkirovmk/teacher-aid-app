"use client";

import { QrCodeIcon, XIcon } from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { Play } from "@/components/app/quiz/Play";
import { demoOnly } from "@/lib/app/api";
import { ApiError, toApiError } from "@/lib/app/api/errors";
import { useAuth, useCourse, useJoinSession } from "@/lib/app/api/hooks";
import type { JoinResult } from "@/lib/app/api/types";
import { useT } from "@/lib/app/i18n";
import { leave } from "@/lib/app/nav";
import { useJoinFailureCopy } from "@/lib/app/quiz-copy";

/** A code that came out of a link may be percent-encoded, and a hand-edited one may not decode at all. */
const decode = (code: string) => {
  try {
    return decodeURIComponent(code);
  } catch {
    return code;
  }
};

/** The live quiz a class QR opens: /app/play/<class code>. Joining the session is the check-in. */
export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const code = decode(params.code);
  const signedIn = useAuth().status === "signedIn";
  const join = useJoinSession(code, signedIn);
  if (join.status === "failed") return <NotRecognized error={join.error} />;
  if (join.status === "joining") return <main className="screen screen--bare q" />;
  return <Joined key={join.join.session.id} join={join.join} />;
}

function Joined({ join }: { join: JoinResult }) {
  const course = useCourse(join.session.courseId);
  // The quiz itself needs the live session engine, which is not built yet; joining already counts as the check-in.
  if (!demoOnly) return <NotRecognized error={new ApiError("not_implemented")} />;
  if (course.status === "error") return <NotRecognized error={toApiError(course.error)} />;
  if (!course.data) return <main className="screen screen--bare q" />;
  return <Play course={course.data} join={join} />;
}

function NotRecognized({ error }: { error: ApiError }) {
  const router = useRouter();
  const { t } = useT();
  const failure = useJoinFailureCopy()(error.code);
  return (
    <main className="screen screen--bare q">
      <div className="q__col">
        <header className="q-top">
          <button className="round" aria-label={t("close")} onClick={() => leave(router)}>
            <XIcon size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="q-body q-body--center" role="alert">
          <span className="q-badge q-badge--no">
            <QrCodeIcon size={52} color="var(--yellow)" aria-hidden="true" />
          </span>
          <h1 className="q-hero" style={{ fontSize: "var(--fs-title1)" }}>
            {failure.title}
          </h1>
          <p className="t-body muted" style={{ margin: 0 }}>
            {failure.body}
          </p>
        </div>
        <div className="q-foot">
          <button className="btn btn--primary btn--block" onClick={() => router.replace("/app/scan")}>
            {failure.cta}
          </button>
        </div>
      </div>
    </main>
  );
}
