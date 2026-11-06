"use client";

import { Gate } from "@/components/app/QueryState";
import { Top } from "@/components/app/Top";
import { useMe, useStandings, type Standings } from "@/lib/app/api/hooks";
import { formatPoints } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";
import { useSelf } from "@/lib/app/profile";
import { personName } from "@/lib/app/quiz";

export default function Leaderboard() {
  const { t } = useT();
  const standings = useStandings();
  return (
    <Gate query={standings} header={<Top title={t("lb.title")} />}>
      {(s) => (s ? <Board s={s} /> : null)}
    </Gate>
  );
}

function Board({ s: { rows, rank, me, above } }: { s: Standings }) {
  const { t, locale } = useT();
  const self = useSelf();
  const student = useMe().data;

  return (
    <main className="screen">
      <Top title={t("lb.title")} />
      <p className="t-cap sub">
        {t("lb.sub", { class: student?.class.name ?? "" })}. {t("lb.how")}
      </p>
      <div className="card tile" style={{ marginBottom: 16 }}>
        <span className="t-label">{t("lb.place")}</span>
        <span className="tile-big">#{rank}</span>
        <span className="t-cap">{above ? t("lb.gap", { n: above.points - me.points, rank: rank - 1 }) : t("lb.top")}</span>
      </div>
      <ol className="list">
        {rows.map((l) => (
          <li key={l.studentId} className={`item${l.isMe ? " item--me" : ""}`} style={{ minHeight: 64 }}>
            <span className="rank">{l.rank}</span>
            <span className="grow item__main">
              <span className="item__title">{l.isMe ? `${t("lb.you")}, ${self.first}` : personName(l.name, locale)}</span>
              <span className="t-cap" style={{ fontWeight: 650, color: l.isMe ? undefined : "#fff" }}>
                {t("lb.points", { n: formatPoints(l.points, locale) })}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
