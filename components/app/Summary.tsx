"use client";

import { CheckCircleIcon, NotePencilIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { stateText } from "@/components/app/practice/PracticeRows";
import { Row } from "@/components/app/Row";
import { Top } from "@/components/app/Top";
import { markNotificationsRead, usePracticeSets, useNotifications } from "@/lib/app/api/hooks";
import type { SessionResult } from "@/lib/app/api/types";
import { formatLongDate } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";

export function SummaryEmpty() {
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

export function SummaryResult({ result }: { result: SessionResult }) {
  const { t, locale } = useT();
  const practice = usePracticeSets().data?.find((p) => p.sessionId === result.sessionId);
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
        <span className="t-cap">
          {t("sum.sub")} · {formatLongDate(result.endedAt, locale)}
        </span>
      </div>

      {/* The set the teacher built from this lesson's missed questions, when there is one: optional, so a row and not a button. */}
      {practice && (
        <div className="list" style={{ marginBottom: 16 }}>
          <Row icon={NotePencilIcon} label={t("pr.fromLesson")} value={stateText(t, practice)} href={`/app/practice/${encodeURIComponent(practice.id)}`} />
        </div>
      )}

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
              {!q.correct && q.yourAnswer !== null && (
                <span className="t-cap" style={{ display: "block", marginTop: 4 }}>
                  {t("sum.yours", { a: q.yourAnswer })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
