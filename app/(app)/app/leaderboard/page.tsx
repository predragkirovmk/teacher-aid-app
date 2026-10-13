"use client";

import { Top } from "@/components/app/Top";
import { LEADERBOARD } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";

export default function Leaderboard() {
  const { t } = useT();
  const [, , third] = LEADERBOARD;
  const me = LEADERBOARD.find((l) => l.me)!;

  return (
    <main className="screen">
      <Top title={t("lb.title")} />
      <p className="t-cap sub">{t("lb.sub")}</p>
      <p className="t-label" style={{ margin: "0 4px 14px" }}>
        {t("lb.gap", { n: third.points - me.points })}
      </p>
      <ol className="list">
        {LEADERBOARD.map((l, i) => (
          <li key={l.name} className={`item${l.me ? " item--me" : ""}`} style={{ minHeight: 64 }}>
            <span className="rank">{i + 1}</span>
            <span className="grow item__title">
              {l.me ? `${t("lb.you")}, ${l.name.split(" ")[0]}` : l.name}
            </span>
            <span className="t-cap" style={{ fontWeight: 650, color: l.me ? undefined : "#fff" }}>
              {t("lb.points", { n: l.points.toLocaleString("en-US") })}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
