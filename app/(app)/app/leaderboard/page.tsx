"use client";

import { Top } from "@/components/app/Top";
import { formatPoints, useStandings } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { useMe } from "@/lib/app/profile";

export default function Leaderboard() {
  const { t, locale } = useT();
  const { rows, rank, me, above } = useStandings();
  const self = useMe();

  return (
    <main className="screen">
      <Top title={t("lb.title")} />
      <p className="t-cap sub">
        {t("lb.sub")}. {t("lb.how")}
      </p>
      <div className="card tile" style={{ marginBottom: 16 }}>
        <span className="t-label">{t("lb.place")}</span>
        <span className="tile-big">#{rank}</span>
        <span className="t-cap">{above ? t("lb.gap", { n: above.points - me.points, rank: rank - 1 }) : t("lb.top")}</span>
      </div>
      <ol className="list">
        {rows.map((l, i) => (
          <li key={l.id} className={`item${l.me ? " item--me" : ""}`} style={{ minHeight: 64 }}>
            <span className="rank">{i + 1}</span>
            <span className="grow item__main">
              <span className="item__title">{l.me ? `${t("lb.you")}, ${self.first}` : l.name[locale]}</span>
              <span className="t-cap" style={{ fontWeight: 650, color: l.me ? undefined : "#fff" }}>
                {t("lb.points", { n: formatPoints(l.points, locale) })}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
