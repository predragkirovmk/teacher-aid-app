"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, ChatCenteredTextIcon, ProjectorScreenIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { setAnonAnswered } from "@/lib/teacher/api/hooks";
import type { AnonQuestionItem } from "@/lib/teacher/api/types";
import { personName } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { arrivedIds, sortInbox } from "@/lib/teacher/questions";
import { clockTime } from "@/lib/teacher/when";
import { Problem } from "./Problem";

/**
 * "Анонимни прашања (N)" (FR-ANON, FR-CON-03): what the class writes to the teacher, with the sender's name (BR-ANON-01: classmates never see it, the teacher
 * does), the text and the time, newest first. "Одговорено" marks one answered aloud (FR-ANON-10); it moves down and dims, and "Не е одговорено" takes that back.
 * A new one is announced once, politely, in a line that is read out; it never opens a window. The text is for this screen alone: it goes to no student and,
 * until the review, not to the projector either.
 */
export function AnonInbox({ sessionId, items, onProjector }: { sessionId: string; items: readonly AnonQuestionItem[]; onProjector?: ReadonlySet<string> }) {
  const { t, te, locale } = useT();
  const sorted = sortInbox(items);
  const [problem, setProblem] = useState<{ id: string; error: unknown } | null>(null);
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Which questions this screen has already seen: what arrives after that is announced, and what was there when the screen opened is not.
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(items.map((i) => i.id));
      return;
    }
    const fresh = arrivedIds(seen.current, items);
    if (fresh.length === 0) return;
    fresh.forEach((id) => seen.current?.add(id));
    const first = items.find((i) => i.id === fresh[0]);
    const line = fresh.length === 1 && first ? t("q.inbox.new", { name: personName(first.sender.name, locale) }) : t("q.inbox.new.many", { n: fresh.length });
    const later = setTimeout(() => setSaid(line), 0);
    return () => clearTimeout(later);
  }, [items, t, locale]);

  const toggle = async (item: AnonQuestionItem) => {
    if (busy) return;
    setBusy(item.id);
    setProblem(null);
    try {
      await setAnonAnswered(sessionId, item.id, item.answered_at === null);
    } catch (e) {
      setProblem({ id: item.id, error: e });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card inbox" aria-labelledby="inbox-title">
      <h2 id="inbox-title" className="inbox__title">
        <ChatCenteredTextIcon size={32} aria-hidden="true" />
        {t("list.count", { label: t("q.inbox.title"), n: items.length })}
      </h2>
      <p className="inbox__hint">{t("q.inbox.hint")}</p>
      <p className="sr" role="status" data-testid="inbox-said">
        {said}
      </p>
      {sorted.length === 0 ? (
        <p className="inbox__none">{t("q.inbox.none")}</p>
      ) : (
        <ul className="inbox__list">
          {sorted.map((item) => {
            const done = item.answered_at !== null;
            const name = personName(item.sender.name, locale);
            return (
              <li key={item.id} className="inbox__item" data-answered={done} data-now={onProjector?.has(item.id) || undefined} data-testid="anon">
                <p className="inbox__who">
                  <strong>{name}</strong>
                  <span>{clockTime(Date.parse(item.created_at))}</span>
                  {onProjector?.has(item.id) && (
                    <span className="inbox__on" data-testid="on-projector">
                      <ProjectorScreenIcon size={24} aria-hidden="true" />
                      {t("rev.on")}
                    </span>
                  )}
                </p>
                <p className="inbox__text">{item.text}</p>
                {done ? (
                  <div className="inbox__actions">
                    <p className="inbox__done">
                      <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
                      {t("q.inbox.state.done")}
                    </p>
                    <button type="button" className="btn btn--quiet" aria-label={t("q.inbox.undo.name", { name })} aria-disabled={busy !== null} onClick={() => void toggle(item)}>
                      <ArrowCounterClockwiseIcon size={24} aria-hidden="true" />
                      {t("q.inbox.undo")}
                    </button>
                  </div>
                ) : (
                  <div className="inbox__actions">
                    <button type="button" className="btn btn--secondary btn--small" aria-label={t("q.inbox.done.name", { name })} aria-disabled={busy !== null} onClick={() => void toggle(item)}>
                      <CheckCircleIcon size={24} aria-hidden="true" />
                      {t("q.inbox.done")}
                    </button>
                  </div>
                )}
                {problem?.id === item.id && <Problem title={t("q.inbox.failed")}>{te(problem.error)}</Problem>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
