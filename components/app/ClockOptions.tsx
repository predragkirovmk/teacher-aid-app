"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { CLOCKS, currentLesson, demoTime, useDemoClock, useRealNow } from "@/lib/app/demo";
import { formatTime } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";
import { subjectLabel } from "@/lib/app/subjects";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The demo-time choices, each with the moment it stands for this week (which follows the shift). */
export function ClockOptions({ onDone }: { onDone?: () => void }) {
  const { t } = useT();
  const { clock, setClock } = useDemoClock();
  const real = useRealNow();

  const detail = (c: (typeof CLOCKS)[number]) => {
    if (c === "real") return t("clock.realAt");
    if (real === null) return " ";
    const ms = demoTime(c, real);
    const lesson = c === "during" || c === "midday" ? currentLesson(ms) : undefined;
    return `${t(`dayLong.${WEEKDAYS[new Date(ms).getDay()]}`)} ${formatTime(ms)}${lesson ? `, ${subjectLabel(t, lesson.subject, lesson.subject)}` : ""}`;
  };

  return (
    <div className="list" role="radiogroup" aria-label={t("settings.clock")}>
      {CLOCKS.map((c) => (
        <button
          key={c}
          className="item"
          role="radio"
          aria-checked={clock === c}
          onClick={() => {
            setClock(c);
            onDone?.();
          }}
        >
          <span className="grow">
            <span className="item__title" style={{ display: "block" }}>
              {t(`clock.${c}`)}
            </span>
            <span className="t-cap">{detail(c)}</span>
          </span>
          {clock === c && <CheckIcon size={22} weight="bold" color="var(--yellow)" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
