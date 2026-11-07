"use client";

import { CheckCircleIcon, CircleIcon, LightningIcon, MinusCircleIcon, PaperPlaneTiltIcon, type Icon } from "@phosphor-icons/react";
import { useState } from "react";
import { fireQuestion, skipQuestion } from "@/lib/teacher/api/hooks";
import type { ConsoleQuestion, ConsoleSnapshot } from "@/lib/teacher/api/types";
import { useT, type Key } from "@/lib/teacher/i18n";
import { canSendAnother, listStatus, type ListStatus } from "@/lib/teacher/questions";
import { AdhocDialog } from "./AdhocDialog";
import { Problem } from "./Problem";
import { SkipQuestion } from "./QuestionPanel";

const WORDS = {
  not_sent: "q.status.not_sent",
  sent: "q.status.sent",
  shown: "q.status.shown",
  skipped: "q.status.skipped",
} as const satisfies Record<ListStatus, Key>;

const ICONS: Record<ListStatus, Icon> = { not_sent: CircleIcon, sent: PaperPlaneTiltIcon, shown: CheckCircleIcon, skipped: MinusCircleIcon };

/**
 * Every question of the lesson, in order, each with where it stands in words (not sent, sent, answer shown, skipped) and an icon. A question not yet
 * sent can be sent out of order with an outlined "Send" and skipped with the quiet link; the yellow button is only ever in the panel above. A question
 * made on the spot is listed after the others. "Quick question" opens a small form.
 */
export function QuestionList({ snapshot }: { snapshot: ConsoleSnapshot }) {
  const { t, te } = useT();
  const sessionId = snapshot.session.id;
  const [adhoc, setAdhoc] = useState(false);
  const [skipping, setSkipping] = useState<ConsoleQuestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ title: string; error: unknown } | null>(null);
  const free = canSendAnother(snapshot.questions);
  const lessonTotal = snapshot.questions.filter((q) => !q.adhoc).length;

  const run = async (id: string, title: string, call: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(id);
    setProblem(null);
    try {
      await call();
    } catch (e) {
      setProblem({ title, error: e });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="qlist" aria-labelledby="q-list-title">
      <div className="qlist__head">
        <h2 className="section__title" id="q-list-title">
          {t("q.list.title")}
        </h2>
        <button type="button" className="btn btn--secondary" aria-haspopup="dialog" disabled={!free} onClick={() => setAdhoc(true)}>
          <LightningIcon size={24} aria-hidden="true" />
          {t("q.adhoc.open")}
        </button>
      </div>
      {!free && <p className="qlist__wait">{t("q.list.wait")}</p>}
      {problem && <Problem title={problem.title}>{te(problem.error)}</Problem>}
      <ol className="qlist__items">
        {snapshot.questions.map((q, i) => {
          const status = listStatus(q.status);
          const StatusIcon = ICONS[status];
          const n = q.adhoc ? 0 : snapshot.questions.slice(0, i + 1).filter((x) => !x.adhoc).length;
          return (
            <li key={q.id} className="qitem" data-status={status} data-adhoc={q.adhoc}>
              <p className="qitem__n">{q.adhoc ? t("q.adhoc.tag") : t("q.panel.label", { n, total: lessonTotal })}</p>
              <p className="qitem__prompt">{q.question.prompt}</p>
              <p className="qitem__status">
                <StatusIcon size={24} weight={status === "shown" ? "fill" : "regular"} aria-hidden="true" />
                <span className="sr">{t("q.status")}: </span>
                <span className="qitem__word">{t(WORDS[status])}</span>
              </p>
              {status === "not_sent" && (
                <div className="qitem__actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    data-send={q.id}
                    aria-label={t("q.list.send.name", { n })}
                    aria-disabled={!free || busy !== null}
                    onClick={() => free && void run(q.id, t("q.send.failed"), () => fireQuestion(sessionId, q.id))}
                  >
                    {t("q.list.send")}
                  </button>
                  <button type="button" className="btn btn--quiet" aria-label={t("q.skip.name", { n })} aria-haspopup="dialog" onClick={() => setSkipping(q)}>
                    {t("q.skip")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {adhoc && <AdhocDialog sessionId={sessionId} onClose={() => setAdhoc(false)} />}
      <SkipQuestion
        question={skipping}
        onStay={() => setSkipping(null)}
        onConfirm={async () => {
          const target = skipping;
          setSkipping(null);
          if (target) await run(target.id, t("q.skip.failed"), () => skipQuestion(sessionId, target.id));
        }}
      />
    </section>
  );
}
