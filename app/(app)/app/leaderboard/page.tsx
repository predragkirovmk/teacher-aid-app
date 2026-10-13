"use client";

import { Top } from "@/components/app/Top";
import { useStandings } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";

export default function Leaderboard() {
  const { t } = useT();
  const { rows, rank, me, above } = useStandings();

  return (
    <main className="screen">
      <Top title={t("lb.title")} />
      <p className="t-cap sub">
        {t("lb.sub")}. {t("lb.how")}
      </p>
      <p className="t-label" style={{ margin: "0 4px 14px" }}>
        {above ? t("lb.gap", { n: above.points - me.points, rank: rank - 1 }) : t("lb.top")}
      </p>
      <ol className="list">
        {rows.map((l, i) => (
          <li key={l.name} className={`item${l.me ? " item--me" : ""}`} style={{ minHeight: 64 }}>
            <span className="rank">{i + 1}</span>
            <span className="grow item__main">
              <span className="item__title">{l.me ? `${t("lb.you")}, ${l.name.split(" ")[0]}` : l.name}</span>
              <span className="t-cap" style={{ fontWeight: 650, color: l.me ? undefined : "#fff" }}>
                {t("lb.points", { n: l.points.toLocaleString("en-US") })}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
