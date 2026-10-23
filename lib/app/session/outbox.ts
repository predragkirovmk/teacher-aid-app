import { toApiError, type ApiErrorCode } from "../api/errors";
import type { AnswerInput, AnswerReceipt, Id, SubmissionKind } from "../api/types";
import type { OutboxRecord, OutboxStore } from "./outbox-store";
import { backoffDelay } from "./transport";

/**
 * The student's answers on their way to the server (spec F-08, BR-NET-01, EC-NET-01, EC-NET-06).
 *
 * An answer is written to the store before the first attempt to send it, so nothing the student tapped
 * is lost to a dead signal, a reload or an app kill. It is then sent, and sent again, until the server
 * says something final about it:
 *
 *   accepted, or `already_answered`   delivered: the server has the student's answer (the first one stands)
 *   `question_closed`                 too late: the answer's own time was outside the question's window
 *   `session_ended`                   the lesson is over; nothing more can count
 *   `validation_failed`, `not_found`  the server will never take it; waiting would not help
 *
 * Anything else (no network, a server error, a rate limit) is "try again": the record stays, and is sent
 * again with the same key after a backoff, and at once when something says the connection may be back
 * (`flush()`: the `online` event, the page coming to the front, the realtime link reopening, the app
 * starting). The server stores one answer per key, so a repeat is harmless. Answers go in the order they
 * were given, one at a time, and a failure stops the line: the next would fail for the same reason.
 *
 * An opener's vote and its one-line reason travel the same way, under their own endpoints (`kind`): they are
 * answers too, and the same things go wrong with them. A reason sent before its vote is not a risk, because the
 * line is in the order they were given and stops at the first failure.
 *
 * An answer in a practice set (`kind` "practice", F-12) travels the same way, with the set's id as `sessionId` and no time that matters: the
 * server judges it by nothing but whether the question has been answered, and keeps the first answer. Its receipt carries the verdict.
 *
 * A question to the teacher (`kind` "ask", F-09) travels the same way, under its own endpoint, with no question to answer.
 * Besides the codes above it can be refused `limit_reached` (BR-ANON-02): final, because the count will not fall.
 *
 * The answer's time is the engine's server-clock time, taken when the student tapped, so it is the same
 * however late the answer arrives.
 */

/** A saved answer older than this is dropped unsent: the lesson it belonged to is long over. */
export const MAX_AGE_MS = 24 * 3_600_000;
/** An answer in a practice set has no lesson to be over and no time to be judged by, so the phone keeps it much longer. */
export const PRACTICE_MAX_AGE_MS = 30 * 24 * 3_600_000;

/** A student who is not signed in cannot send; their answers wait for them. */
const AUTH_CODES: ApiErrorCode[] = ["unauthenticated", "signed_in_elsewhere"];
/** Codes after which the server will never take this answer. */
const GIVE_UP_CODES: ApiErrorCode[] = ["validation_failed", "not_found", "limit_reached"];

export type AnswerOutcome =
  /** An attempt failed and the answer is kept: "saved, will send when you're back online". */
  | { type: "saved"; record: OutboxRecord }
  /** The server has it. `duplicate` when it already had it under this key or another; `receipt` is what it answered. */
  | { type: "delivered"; record: OutboxRecord; duplicate: boolean; receipt?: AnswerReceipt }
  /** Refused as outside the question's window: it arrived too late. */
  | { type: "late"; record: OutboxRecord }
  /** Refused because the session has ended. */
  | { type: "ended"; record: OutboxRecord }
  /** Refused for good for another reason. */
  | { type: "dropped"; record: OutboxRecord; code: ApiErrorCode }
  /** Older than MAX_AGE_MS, so dropped without being sent. */
  | { type: "expired"; record: OutboxRecord };

export type OutboxStatus = {
  /** Answers, votes, reasons and questions to the teacher of the signed-in student that have not reached the server. */
  pending: number;
  /** Of those, the questions to the teacher, which the connection note names apart from answers. */
  pendingAsks: number;
  /** The last attempt failed for want of a connection (or a server), and another is waiting. */
  failing: boolean;
};

export type OutboxDeps = {
  store: OutboxStore;
  /** The raw call, `POST /sessions/{id}/answers` or the opener's vote or reason by `kind`; see send.ts. */
  send(sessionId: Id, answer: AnswerInput, kind: SubmissionKind): Promise<AnswerReceipt>;
  now?: () => number;
  random?: () => number;
  /** An answer has been kept for a later try: ask the browser to wake the page when the network is back. */
  onSaved?: () => void;
};

export type NewAnswer = Omit<OutboxRecord, "savedAt">;

export type Outbox = {
  /** The student is signed in: their saved answers are read, and sent. */
  start(studentId: Id): Promise<void>;
  /** The student is not signed in any more: their answers stay saved, unsent. */
  stop(): void;
  /**
   * The app has opened and does not know yet who is signed in (it cannot reach the server), but remembers who
   * was: count that student's saved answers, so the student can be told they are safe. Nothing is sent: an
   * answer is only ever sent once the server has confirmed whose phone it is (`start`).
   */
  peek(studentId: Id): Promise<void>;
  /** Save the answer, then try to send it. Resolves once it is saved, not once it is sent. */
  enqueue(answer: NewAnswer): Promise<void>;
  /** Try to send what is waiting, now: the connection may have come back. */
  flush(): Promise<void>;
  /** Wait until what the store holds has been read. */
  load(): Promise<void>;
  /** What this student saved for this question and is still waiting, of one `kind` (any, when not given). */
  pendingFor(studentId: Id, sessionId: Id, sessionQuestionId: Id, kind?: SubmissionKind): OutboxRecord | null;
  /** Everything this student saved in this session and has still to send, of one `kind`. */
  pendingOf(studentId: Id, sessionId: Id, kind: SubmissionKind): OutboxRecord[];
  subscribe(listener: (outcome: AnswerOutcome) => void): () => void;
  onStatus(listener: () => void): () => void;
  getStatus(): OutboxStatus;
};

export function createOutbox(deps: OutboxDeps): Outbox {
  const { store, send } = deps;
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;

  const records = new Map<string, OutboxRecord>();
  const failures = new Map<string, number>();
  const outcomes = new Set<(o: AnswerOutcome) => void>();
  const statusListeners = new Set<() => void>();
  let studentId: Id | null = null;
  let peeked: Id | null = null;
  let loaded: Promise<void> | null = null;
  let failing = false;
  let flushing: Promise<void> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: OutboxStatus = { pending: 0, pendingAsks: 0, failing: false };

  const mine = () =>
    [...records.values()]
      .filter((r) => r.studentId === studentId)
      .sort((a, b) => a.answeredAt - b.answeredAt || a.savedAt - b.savedAt);

  const refreshStatus = () => {
    const who = studentId ?? peeked;
    const mineNow = [...records.values()].filter((r) => r.studentId === who);
    const pending = mineNow.length;
    const pendingAsks = mineNow.filter((r) => r.kind === "ask").length;
    if (pending === status.pending && pendingAsks === status.pendingAsks && failing === status.failing) return;
    status = { pending, pendingAsks, failing };
    statusListeners.forEach((l) => l());
  };

  const tell = (o: AnswerOutcome) => outcomes.forEach((l) => l(o));

  const forget = async (record: OutboxRecord) => {
    records.delete(record.key);
    failures.delete(record.key);
    await store.remove(record.key);
  };

  const load = () =>
    (loaded ??= store.all().then((all) => {
      for (const r of all) if (!records.has(r.key)) records.set(r.key, r);
      refreshStatus();
    }));

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };

  /** One pass over the line. Returns when the line is empty or has stopped on a failure. */
  async function pass() {
    for (const record of mine()) {
      if (now() - record.savedAt > (record.kind === "practice" ? PRACTICE_MAX_AGE_MS : MAX_AGE_MS)) {
        await forget(record);
        tell({ type: "expired", record });
        continue;
      }
      try {
        const receipt = await send(
          record.sessionId,
          {
            sessionQuestionId: record.sessionQuestionId,
            response: record.response,
            answeredAt: record.answeredAt,
            idempotencyKey: record.key,
          },
          record.kind,
        );
        failing = false;
        await forget(record);
        tell({ type: "delivered", record, duplicate: receipt.duplicate, receipt });
      } catch (e) {
        const error = toApiError(e);
        const code = error.code;
        if (code === "already_answered") {
          failing = false;
          await forget(record);
          tell({ type: "delivered", record, duplicate: true });
        } else if (code === "question_closed") {
          await forget(record);
          tell({ type: "late", record });
        } else if (code === "session_ended") {
          await forget(record);
          tell({ type: "ended", record });
        } else if (GIVE_UP_CODES.includes(code)) {
          await forget(record);
          tell({ type: "dropped", record, code });
        } else if (AUTH_CODES.includes(code)) {
          // Not a connection problem: nothing to retry until the student signs in again (`start`).
          tell({ type: "saved", record });
          return;
        } else {
          const attempt = failures.get(record.key) ?? 0;
          failures.set(record.key, attempt + 1);
          failing = true;
          const wait = Math.max(backoffDelay(attempt, random), (error.retryAfter ?? 0) * 1000);
          schedule(wait);
          tell({ type: "saved", record });
          return;
        }
      }
      refreshStatus();
    }
  }

  function flush(): Promise<void> {
    if (studentId === null) return Promise.resolve();
    // A flush asked for while one is running is run again after it, so a connection that came back
    // between two of its attempts is not missed.
    if (flushing) {
      again = true;
      return flushing;
    }
    clearTimeout(timer);
    flushing = (async () => {
      try {
        await load();
        do {
          again = false;
          await pass();
        } while (again);
      } finally {
        flushing = null;
        refreshStatus();
      }
    })();
    return flushing;
  }

  return {
    async start(id) {
      studentId = id;
      refreshStatus();
      await load();
      refreshStatus();
      await flush();
    },
    async peek(id) {
      if (studentId !== null) return;
      peeked = id;
      await load();
      refreshStatus();
    },
    stop() {
      studentId = null;
      peeked = null;
      clearTimeout(timer);
      failing = false;
      refreshStatus();
    },
    async enqueue(answer) {
      await load();
      const record: OutboxRecord = { ...answer, savedAt: now() };
      studentId ??= record.studentId;
      records.set(record.key, record);
      refreshStatus();
      // Written before the first attempt: whatever happens next, the answer is on the phone.
      await store.put(record);
      void flush().then(() => {
        if (records.has(record.key)) deps.onSaved?.();
      });
    },
    flush,
    load,
    pendingFor(student, sessionId, sessionQuestionId, kind) {
      return (
        [...records.values()].find(
          (r) => r.studentId === student && r.sessionId === sessionId && r.sessionQuestionId === sessionQuestionId && (kind === undefined || r.kind === kind),
        ) ?? null
      );
    },
    pendingOf(student, sessionId, kind) {
      return [...records.values()]
        .filter((r) => r.studentId === student && r.sessionId === sessionId && r.kind === kind)
        .sort((a, b) => a.answeredAt - b.answeredAt || a.savedAt - b.savedAt);
    },
    subscribe(listener) {
      outcomes.add(listener);
      return () => {
        outcomes.delete(listener);
      };
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    getStatus: () => status,
  };
}
