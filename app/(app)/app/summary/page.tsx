"use client";

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { Top } from "@/components/app/Top";
import { QUIZ } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";

export default function Summary() {
  const { t } = useT();
  const right = QUIZ.filter((q) => q.correct).length;

  return (
    <main className="screen">
      <Top title={t("sum.title")} />
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="t-label">{t("sum.lesson")}</div>
        <div className="t-num" style={{ margin: "8px 0" }}>
          {right}/5
        </div>
        <div className="t-cap">{t("sum.sub")}</div>
      </div>

      <ol className="list">
        {QUIZ.map((q, i) => (
          <li key={q.id} className="item" style={{ alignItems: "flex-start" }}>
            <span className="rank">{i + 1}</span>
            <span className="grow">
              <span className="item__title" style={{ display: "block" }}>
                {t(`q.${q.id}`)}
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
                  {t("sum.answer", { a: t(`a.${q.id}`) })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
