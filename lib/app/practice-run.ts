"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useMe, usePracticeSets } from "./api/hooks";
import { invalidate, mapQuery, type Query } from "./api/query";
import { onSessionEnd } from "./api/session";
import type { Id, PracticeSet } from "./api/types";
import { localVerdicts, practiceView, type LocalVerdict, type PracticeView } from "./practice";
import type { AnswerOutcome } from "./session/outbox";
import { outbox } from "./session/send";

/**
 * Where a student's practice answers have got to, on this phone (F-12). An answer is saved in the outbox first and sent from there, so
 * a practice set can be answered with no signal; the server's verdict arrives with the delivery, and is kept here until the set read
 * again carries it. What the screen draws is the fold of the set, those verdicts and the answers still waiting (practice.ts).
 */

const verdicts = new Map<string, LocalVerdict>();
const key = (setId: Id, questionId: Id) => `${setId}\u0000${questionId}`;
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

/** The outbox says an answer has been delivered or kept: remember the verdict, and read the sets again. */
export function onPracticeOutcome(o: AnswerOutcome) {
  if (o.record.kind !== "practice") return;
  const attempt = o.type === "delivered" ? o.receipt?.practice : undefined;
  if (attempt) {
    const told = localVerdicts(attempt, { [o.record.sessionQuestionId]: o.record.response })[o.record.sessionQuestionId];
    if (told) verdicts.set(key(o.record.sessionId, o.record.sessionQuestionId), told);
    invalidate("practice");
  }
  bump();
}

/** A different student may be next: nothing of this one's is kept. */
export function resetPractice() {
  verdicts.clear();
  bump();
}

onSessionEnd(resetPractice);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** One set with the student's progress in it. `view` is null until the set is known. */
export function usePracticeRun(setId: Id): { set: Query<PracticeSet | null>; view: PracticeView | null; answer: (questionId: Id, response: string) => Promise<void> } {
  const sets = usePracticeSets();
  const me = useMe();
  const studentId = me.data?.id;
  const tick = useSyncExternalStore(subscribe, () => version, () => 0);

  useEffect(() => {
    void outbox.load().then(bump);
    return outbox.onStatus(bump);
  }, []);

  const set = useMemo(() => mapQuery(sets, (all) => all.find((s) => s.id === setId) ?? null), [sets, setId]);

  const view = useMemo(() => {
    void tick;
    const s = set.data;
    if (!s) return null;
    const pending: Record<Id, string> = {};
    for (const r of studentId ? outbox.pendingOf(studentId, setId, "practice") : []) pending[r.sessionQuestionId] = r.response;
    const local: Record<Id, LocalVerdict> = {};
    for (const q of s.questions) {
      const told = verdicts.get(key(setId, q.id));
      if (told) local[q.id] = told;
    }
    return practiceView(s, pending, local);
  }, [set.data, studentId, setId, tick]);

  const answer = useCallback(
    async (questionId: Id, response: string) => {
      if (!studentId) return;
      // Written to the phone before it is sent: a lost signal, a reload or a closed app does not lose it.
      await outbox.enqueue({
        kind: "practice",
        // The student is in the key: two students on one phone answering the same question must not replace each other's waiting answer.
        key: `practice:${studentId}:${setId}:${questionId}`,
        studentId,
        sessionId: setId,
        sessionQuestionId: questionId,
        response,
        answeredAt: Date.now(),
      });
      bump();
    },
    [studentId, setId],
  );

  return { set, view, answer };
}
