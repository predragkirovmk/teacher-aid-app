"use client";

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { Gate } from "@/components/app/QueryState";
import { Top } from "@/components/app/Top";
import { markNotificationsRead, useLatestResult, useNotifications } from "@/lib/app/api/hooks";
import type { SessionResult } from "@/lib/app/api/types";
import { useT } from "@/lib/app/i18n";

export default function Summary() {
  const { t } = useT();
  const latest = useLatestResult();
  return (
    <Gate query={latest} header={<Top title={t("sum.title")} />}>
      {(result) => (result ? <Result result={result} /> : <Empty />)}
    </Gate>
  );
}

function Empty() {
  const { t } = useT();
  return (
    <main className="screen">
      <Top title={t("sum.title")} />
      <p className="muted" style={{ textAlign: "center", marginTop: 60 }}>
        {t("sum.empty")}
      </p>
    </main>
  );
}

function Result({ result }: { result: SessionResult }) {
  const { t } = useT();
  const { data: notifications } = useNotifications();
  const announcement = notifications?.find(
    (n) => n.kind === "result_ready" && n.payload.sessionId === result.sessionId && n.readAt === null,
  );
  // Seeing the summary is reading the alert that announced it, so Home stops calling it new.
  useEffect(() => {
    if (announcement) markNotificationsRead([announcement.id]).catch(() => {});
  }, [announcement]);

  return (
    <main className="screen">
      <Top title={t("sum.title")} />
      <div className="card tile" style={{ marginBottom: 16 }}>
        <span className="t-label">{result.lessonTitle}</span>
        <span className="tile-big">
          {result.right}/{result.total}
        </span>
        <span className="t-cap">{t("sum.sub")}</span>
      </div>

      <ol className="list">
        {result.questions.map((q, i) => (
          <li key={q.id} className="item" style={{ alignItems: "flex-start" }}>
            <span className="rank">{i + 1}</span>
            <span className="grow">
              <span className="item__title" style={{ display: "block" }}>
                {q.prompt}
              </span>
              <span className="status" style={{ marginTop: 8 }}>
                {q.correct ? (
                  <CheckCircleIcon size={20} aria-hidden="true" />
                ) : (
                  <XCircleIcon size={20} aria-hidden="true" />
                )}
                {q.correct ? t("sum.right") : t("sum.wrong")}
              </span>
              {!q.correct && (
                <span className="t-cap" style={{ display: "block", marginTop: 4 }}>
                  {t("sum.answer", { a: q.correctAnswer })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
