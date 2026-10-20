"use client";

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { Top } from "@/components/app/Top";
import { QUIZ } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";
import { actions } from "@/lib/app/store";

export default function Summary() {
  const { t } = useT();
  const right = QUIZ.filter((q) => q.correct).length;
  // Seeing the summary is reading the alert that announced it, so Home stops calling it new.
  useEffect(() => actions.markRead("n-math"), []);

  return (
    <main className="screen">
      <Top title={t("sum.title")} />
      <div className="card tile" style={{ marginBottom: 16 }}>
        <span className="t-label">{t("sum.lesson")}</span>
        <span className="tile-big">{right}/5</span>
        <span className="t-cap">{t("sum.sub")}</span>
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
