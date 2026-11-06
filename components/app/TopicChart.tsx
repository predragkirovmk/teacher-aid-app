"use client";

import { useState, type CSSProperties } from "react";
import type { TopicProgress } from "@/lib/app/api/types";
import { formatDate } from "@/lib/app/format";
import { useT, type TFn } from "@/lib/app/i18n";
import { drawable, topicSeries, topicTrend, type TopicPoint, type TopicTrend } from "@/lib/app/topics";

/** The trend in words, for the line under a chart and for the one-lesson case. */
export function trendText(t: TFn, trend: TopicTrend): string {
  if (trend.kind === "one") return t("topic.one", { right: trend.right, total: trend.total });
  if (trend.kind === "same") return t("topic.same", { pct: trend.pct, n: trend.n });
  return t("topic.range", { from: trend.from, to: trend.to, n: trend.n });
}

/** Where a point sits on the plot: even steps along, its percentage up. */
const xOf = (i: number, n: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);

/**
 * One topic: how much of its questions the student got right in each lesson that covered it (FR-STU-05, own data only). A single line in one
 * ink on the card, past lessons as open dots and the latest as a solid one, 0 to 100 on a quiet grid, the first value written on the chart (the latest is the number at the top) and any other when tapped. The words under it say where the line started and where it is; a table is there for a screen reader.
 * From a single lesson there is no line: only the words.
 */
export function TopicCard({ topic }: { topic: TopicProgress }) {
  const { t, locale } = useT();
  const points = topicSeries(topic);
  const trend = topicTrend(points);
  const [active, setActive] = useState<number | null>(null);
  if (!trend) return null;
  const last = points[points.length - 1];
  const n = points.length;
  const shown = active === null ? null : points[active];
  const pointText = (p: TopicPoint) => t("topic.point", { date: formatDate(p.at, locale), right: p.right, total: p.total, pct: p.pct });

  return (
    <figure className="tc">
      <div className="tc__head">
        <h3 className="item__title">{topic.topic}</h3>
        <span className="tc__now" aria-hidden="true">
          {last.pct}%
        </span>
      </div>

      {drawable(points) && (
        <div className="tc__chart" aria-hidden="true">
          <div className="tc__plot">
            {[100, 50, 0].map((v) => (
              <span key={v} className="tc__tick" style={{ "--v": `${v}%` } as CSSProperties}>
                <span className="tc__tick-label">{v}%</span>
              </span>
            ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="tc__svg">
              <polygon className="tc__area" points={`0,100 ${points.map((p, i) => `${xOf(i, n)},${100 - p.pct}`).join(" ")} 100,100`} />
              <polyline className="tc__line" fill="none" vectorEffect="non-scaling-stroke" points={points.map((p, i) => `${xOf(i, n)},${100 - p.pct}`).join(" ")} />
            </svg>
            {points.map((p, i) => (
              <button
                key={p.at}
                type="button"
                tabIndex={-1}
                className="tc__dot"
                data-last={i === n - 1}
                data-active={active === i}
                style={{ "--x": `${xOf(i, n)}%`, "--y": `${p.pct}%` } as CSSProperties}
                onClick={() => setActive(active === i ? null : i)}
              >
                <i />
              </button>
            ))}
            {points.map(
              (p, i) =>
                (i === 0 || active === i) && (
                  <span key={`l${p.at}`} className="tc__value" style={{ "--x": `${xOf(i, n)}%`, "--y": `${p.pct}%` } as CSSProperties}>
                    {p.pct}%
                  </span>
                ),
            )}
          </div>
          <div className="tc__x">
            <span>{formatDate(points[0].at, locale)}</span>
            <span>{formatDate(last.at, locale)}</span>
          </div>
        </div>
      )}

      <figcaption className="t-cap tc__cap" aria-live="polite">
        {shown ? pointText(shown) : trendText(t, trend)}
      </figcaption>

      {/* The same numbers for a screen reader, which the chart above hides. */}
      <table className="sr">
        <caption>{t("topic.table", { topic: topic.topic })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("topic.table.date")}</th>
            <th scope="col">{t("topic.table.right")}</th>
            <th scope="col">{t("topic.table.total")}</th>
            <th scope="col">{t("topic.table.pct")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.at}>
              <th scope="row">{formatDate(p.at, locale)}</th>
              <td>{p.right}</td>
              <td>{p.total}</td>
              <td>{p.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
