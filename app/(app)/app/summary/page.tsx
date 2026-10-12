"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { Top } from "@/components/app/Top";
import { QUIZ } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";

export default function Summary() {
  const { t } = useT();
  const right = QUIZ.filter((q) => q.correct).length;

  return (
    <main className="screen">
      <Top title={t("sum.title")} />
      <div className="card" style={{ padding: 24, marginBottom: 18 }}>
        <div className="t-label">{t("sum.lesson")}</div>
        <div className="t-num" style={{ margin: "8px 0 6px", fontSize: 56 }}>
          {right}/5
        </div>
        <div className="t-cap">{t("sum.sub", { n: right })}</div>
      </div>

      <ol className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {QUIZ.map((q, i) => (
          <li key={q.id} className="item" style={{ alignItems: "flex-start" }}>
            <span className="rank">{i + 1}</span>
            <span className="grow">
              <span className="item__title" style={{ display: "block" }}>
                {t(`q.${q.id}`)}
              </span>
              <span className="status" style={{ marginTop: 6 }}>
                {q.correct ? (
                  <CircleCheck size={20} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <CircleX size={20} strokeWidth={2} aria-hidden="true" />
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
