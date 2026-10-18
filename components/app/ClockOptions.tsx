"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { CLOCKS, currentLesson, demoTime } from "@/lib/app/clock";
import { formatTime, useRealNow } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { actions, useApp } from "@/lib/app/store";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The demo-time choices, each with the moment it stands for this week (which follows the shift). */
export function ClockOptions({ onDone }: { onDone?: () => void }) {
  const { t } = useT();
  const { clock } = useApp();
  const real = useRealNow();

  const detail = (c: (typeof CLOCKS)[number]) => {
    if (c === "real") return t("clock.realAt");
    if (real === null) return " ";
    const ms = demoTime(c, real);
    const lesson = c === "during" || c === "midday" ? currentLesson(ms) : undefined;
    return `${t(`dayLong.${WEEKDAYS[new Date(ms).getDay()]}`)} ${formatTime(ms)}${lesson ? `, ${t(`subj.${lesson.subject}`)}` : ""}`;
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
            actions.setClock(c);
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
