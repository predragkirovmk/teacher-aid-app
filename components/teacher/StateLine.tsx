"use client";

import { CheckCircleIcon, CircleIcon, PlayCircleIcon } from "@phosphor-icons/react";
import type { SessionState } from "@/lib/teacher/api/types";
import { useT, type Key } from "@/lib/teacher/i18n";
import { stateSteps } from "@/lib/teacher/live";

const WORDS = {
  lobby: "live.state.lobby",
  teaching: "live.state.teaching",
  review: "live.state.review",
  ended: "live.state.ended",
} as const satisfies Record<SessionState, Key>;

/**
 * Where the lesson stands, in four plain words in the order the lesson goes: waiting for the students, teaching, review, the end. The one
 * the lesson is in has a filled mark and the word "Сега" under it, the ones behind it a tick, the ones ahead an empty ring, and a screen
 * reader is told each: never colour alone. It is only read, and it never offers a way back (4.1).
 */
export function StateLine({ state, compact }: { state: SessionState; compact?: boolean }) {
  const { t } = useT();
  return (
    <ol className={compact ? "states states--compact" : "states"} aria-label={t("live.states.label")}>
      {stateSteps(state).map(({ state: step, position }) => (
        <li key={step} className="states__item" data-position={position} aria-current={position === "current" ? "step" : undefined}>
          {position === "done" && <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />}
          {position === "current" && <PlayCircleIcon size={28} weight="fill" aria-hidden="true" />}
          {position === "next" && <CircleIcon size={28} aria-hidden="true" />}
          <span className="states__word">
            {t(WORDS[step])}
            {position !== "current" && <span className="sr">{`, ${t(position === "done" ? "live.state.done" : "live.state.next")}`}</span>}
          </span>
          {position === "current" && <span className="states__now">{t("live.state.now")}</span>}
        </li>
      ))}
    </ol>
  );
}
