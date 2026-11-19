"use client";

import { ArrowSquareOutIcon, CheckCircleIcon, HourglassIcon, PlugsIcon, type Icon } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import type { AnswerState, ConsoleStudent } from "@/lib/teacher/api/types";
import { personName } from "@/lib/teacher/format";
import { useT, type Key } from "@/lib/teacher/i18n";
import { studentState } from "@/lib/teacher/live";

const ANSWER_WORDS = {
  answered: "q.answer.answered",
  not_answered: "q.answer.not_answered",
  offline: "q.answer.offline",
} as const satisfies Record<AnswerState, Key>;

const ANSWER_ICONS: Record<AnswerState, Icon> = { answered: CheckCircleIcon, not_answered: HourglassIcon, offline: PlugsIcon };

/** How long the joined count must stay as it is before it is read out. */
export const CALM_COUNT_MS = 4000;

/** The text once it has stopped changing for a while; the first text is there at once and is not announced. */
export function useCalm(text: string, ms = CALM_COUNT_MS): string {
  const [calm, setCalm] = useState(text);
  useEffect(() => {
    const id = setTimeout(() => setCalm(text), ms);
    return () => clearTimeout(id);
  }, [text, ms]);
  return calm;
}

function AnswerLine({ state }: { state: AnswerState }) {
  const { t } = useT();
  const AnswerIcon = ANSWER_ICONS[state];
  return (
    <span className="person__answer" data-answer={state}>
      <AnswerIcon size={20} weight={state === "answered" ? "fill" : "regular"} aria-hidden="true" />
      {t(ANSWER_WORDS[state])}
    </span>
  );
}

/**
 * The students who have scanned the code, by name, in the order they joined, with where each one stands in an icon and a word (never
 * colour alone): the connection lost, and, while a question is open, whether they have answered. Nobody is listed before they join, and a student who joins later, at any point until End,
 * simply appears. Before anyone has joined it says that students appear when they scan the code.
 */
export function LiveRoster({ students }: { students: readonly ConsoleStudent[] }) {
  const { t, locale } = useT();
  const title = useId();
  const calmCount = useCalm(t("live.count", { n: students.length }));

  const row = (s: ConsoleStudent) => {
    const state = studentState(s);
    // A row is one line: the name, and only what is worth saying: that the connection is lost, or, while a question is open, whether they have answered.
    // A student who is here and has nothing to say is just the name (the count above says they joined).
    const answering = s.answer_state && s.answer_state !== "offline" && state === "joined" ? s.answer_state : null;
    return (
      <li key={s.id} className="person" data-state={state} data-answer={answering ?? undefined}>
        <span className="person__name">{personName(s.full_name, locale)}</span>
        <span className="person__state">
          {!answering && state === "offline" && (
            <span className="person__what">
              <PlugsIcon size={24} aria-hidden="true" />
              <span className="person__word">{t("live.student.offline")}</span>
            </span>
          )}
          {/* While a question is open, each student who is here also says whether they have answered: an icon and a word. */}
          {answering && <AnswerLine state={answering} />}
          {/* A student who left the app during a question: said quietly, in an icon and words, never in red (FR-FOC). */}
          {s.focus_flags > 0 && (
            <span className="person__detail person__focus" data-testid="focus">
              <ArrowSquareOutIcon size={20} aria-hidden="true" />
              {t(s.focus_flags === 1 ? "q.focus.one" : "q.focus", { n: s.focus_flags })}
            </span>
          )}
        </span>
      </li>
    );
  };

  return (
    <section className="card roster" aria-labelledby={title}>
      <h2 id={title}>{t("live.joined.title")}</h2>
      <p className="roster__count">{t("live.count", { n: students.length })}</p>
      {/* Joins come in a stream; a screen reader hears the count once they have slowed, not every name. */}
      <p className="sr" role="status" data-testid="calm-count">
        {calmCount}
      </p>
      {students.length > 0 ? (
        <ul className="roster__list">{students.map(row)}</ul>
      ) : (
        <p className="roster__none">
          <HourglassIcon size={28} aria-hidden="true" />
          {t("live.joined.none")}
        </p>
      )}
    </section>
  );
}
