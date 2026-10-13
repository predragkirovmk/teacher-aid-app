"use client";

import { QrCodeIcon, XIcon } from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { Play } from "@/components/app/quiz/Play";
import { subjectByCode } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";
import { leave } from "@/lib/app/nav";
import { useQT } from "@/lib/app/quiz-copy";

/** The live quiz a class QR opens: /app/play/<class code>. */
export default function PlayPage() {
  const { code } = useParams<{ code: string }>();
  const subject = subjectByCode(decodeURIComponent(code));
  if (!subject) return <NotRecognized />;
  return <Play key={subject.id} subject={subject} />;
}

function NotRecognized() {
  const router = useRouter();
  const { t } = useT();
  const { t: qt } = useQT();
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
            {qt("q.unknown.title")}
          </h1>
          <p className="t-body muted" style={{ margin: 0 }}>
            {qt("q.unknown.body")}
          </p>
        </div>
        <div className="q-foot">
          <button className="btn btn--primary btn--block" onClick={() => router.replace("/app/scan")}>
            {qt("q.unknown.cta")}
          </button>
        </div>
      </div>
    </main>
  );
}
