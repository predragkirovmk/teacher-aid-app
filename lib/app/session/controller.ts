import { ApiError, toApiError } from "../api/errors";
import type { Id, StudentSessionState } from "../api/types";
import { sessionEvent } from "../api/wire";
import { toLocal } from "./clock";
import { createEngine, reduce, type Action, type EngineState } from "./engine";
import type { AnswerOutcome, Outbox } from "./outbox";
import { backoffDelay, type ConnectionState, type RealtimeMessage, type RealtimeTransport } from "./transport";
import { needsTick, sameView, viewOf, type SessionView } from "./view";

/**
 * Runs one live session for the student: it owns the engine's state, feeds it from the transport and
 * the snapshot call, and sends the student's answer. Nothing here knows React, `fetch` or a provider;
 * those are handed in, so the same code runs on the mock lesson and on the live API, and in tests.
 *
 * The snapshot (`GET /sessions/{id}/student-state`) is asked for when the session starts, every time
 * the link comes back (the events of the gap are gone for good), when the engine notices it missed
 * something, when a question's result is overdue, and when the phone wakes up.
 */

export type SessionRunView = SessionView & {
  /** The link to the server's events; "reconnecting" shows the student that what they see may be behind. */
  connection: ConnectionState;
  /** The snapshot call is failing and is being retried. */
  syncing: boolean;
  /** The session cannot be loaded at all (it is gone), so the screen has nothing to show. */
  failed: ApiError | null;
};

export type SessionDeps = {
  sessionId: Id;
  meId: Id;
  late?: boolean;
  transport: RealtimeTransport;
  getSnapshot(sessionId: Id): Promise<StudentSessionState>;
  /** The one way an answer leaves the app: saved on the phone first, then sent until the server has said what it makes of it (outbox.ts). */
  outbox: Outbox;
  /** The student's channel said they signed in elsewhere. */
  onSignedInElsewhere?(): void;
  /** The student has a new notification. */
  onNotification?(): void;
  /** The session has ended: results, attendance and points are worth asking for again. */
  onEnded?(): void;
  now?: () => number;
  random?: () => number;
  newKey?: () => string;
};

export type SessionHandle = {
  getView(): SessionRunView;
  getState(): EngineState;
  subscribe(listener: () => void): () => void;
  /** The student taps an answer. Final once sent (BR-ANS-02). */
  answer(response: string): void;
  /** Load again after the session failed to load. */
  retry(): void;
  /** The phone came back to the foreground or the network came back. */
  wake(): void;
  dispose(): void;
};

export const publicChannel = (sessionId: Id) => `session.${sessionId}.public`;
export const studentChannel = (studentId: Id) => `student.${studentId}`;

/** How long after a question closes its result may be late before the app asks the server. */
const RESULT_GRACE_MS = 3000;
/** After this many failed snapshot calls, events are applied to what the app has instead of waiting. */
const UNHOLD_AFTER = 2;
/** An answer the server has not acknowledged by now is shown as saved on the phone rather than as being sent. */
const SAVED_AFTER_MS = 3000;
const TICK_MS = 250;

const randomKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export function createSessionHandle(deps: SessionDeps): SessionHandle {
  const { sessionId, transport } = deps;
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;

  let state = createEngine({ sessionId, meId: deps.meId, late: deps.late });
  let connection: ConnectionState = transport.state;
  let syncing = false;
  let failed: ApiError | null = null;
  let disposed = false;
  let inflight = false;
  let queued = false;
  let failures = 0;
  let endedTold = false;
  const listeners = new Set<() => void>();
  const timers: { retry?: ReturnType<typeof setTimeout>; deadline?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval>; saved?: ReturnType<typeof setTimeout> } = {};
  let deadlineKey = "";

  const compute = (): SessionRunView => ({ ...viewOf(state, now()), connection, syncing, failed });
  let view = compute();

  const emit = () => {
    const next = compute();
    const changed = !sameView(view, next);
    view = next;
    // Something has to tick while the screen depends on the passing of time.
    if (needsTick(view.stage)) {
      timers.tick ??= setInterval(emit, TICK_MS);
    } else if (timers.tick !== undefined) {
      clearInterval(timers.tick);
      timers.tick = undefined;
    }
    if (changed) listeners.forEach((l) => l());
  };

  /** A result that is overdue is asked for, once, shortly after the question should have closed. */
  const armDeadline = () => {
    const q = state.question;
    const wanted = q && !state.result && (q.status === "open" || q.status === "closed") && q.closesAt !== null ? q : null;
    const key = wanted ? `${wanted.id}:${wanted.status}` : "";
    if (key === deadlineKey) return;
    deadlineKey = key;
    clearTimeout(timers.deadline);
    timers.deadline = undefined;
    if (!wanted) return;
    const at = toLocal(state.clock, wanted.closesAt!) + RESULT_GRACE_MS;
    timers.deadline = setTimeout(() => {
      timers.deadline = undefined;
      deadlineKey = "";
      if (!disposed && state.question?.id === wanted.id && !state.result) refresh();
    }, Math.max(0, at - now()));
  };

  const dispatch = (action: Action) => {
    state = reduce(state, action);
    if (state.stale && !state.awaiting) refresh();
    armDeadline();
    emit();
  };

  const tellEnded = () => {
    if (endedTold || state.session?.state !== "ended") return;
    endedTold = true;
    deps.onEnded?.();
  };

  function refresh() {
    if (disposed || failed) return;
    if (inflight) {
      queued = true;
      return;
    }
    inflight = true;
    clearTimeout(timers.retry);
    dispatch({ type: "resync" });
    const sentAt = now();
    deps.getSnapshot(sessionId).then(
      (snapshot) => {
        inflight = false;
        if (disposed) return;
        failures = 0;
        syncing = false;
        dispatch({ type: "snapshot", snapshot, sentAt, receivedAt: now() });
        tellEnded();
        restorePending();
        if (queued) {
          queued = false;
          refresh();
        }
      },
      (e) => {
        inflight = false;
        if (disposed) return;
        const error = toApiError(e);
        // The session is not there, or the student is not: no amount of asking helps. (Sign-in problems are
        // the shell's to show; session.ts has already heard of them.)
        if (error.code === "not_found" || error.code === "unauthenticated" || error.code === "signed_in_elsewhere") {
          failed = error;
          syncing = false;
          emit();
          return;
        }
        syncing = true;
        if (++failures >= UNHOLD_AFTER) dispatch({ type: "unhold", receivedAt: now() });
        else emit();
        queued = false;
        timers.retry = setTimeout(refresh, backoffDelay(failures - 1, random));
      },
    );
  }

  /** After a reload the answer the student gave is still in the outbox; the question must not ask for it again. */
  function restorePending() {
    void deps.outbox.load().then(() => {
      const q = state.question;
      if (disposed || state.mine || !q) return;
      const saved = deps.outbox.pendingFor(deps.meId, sessionId, q.id);
      if (saved) dispatch({ type: "answer.restore", key: saved.key, sessionQuestionId: saved.sessionQuestionId, response: saved.response, at: saved.answeredAt });
    });
  }

  /** What the outbox found out about an answer of this session. */
  const onOutcome = (o: AnswerOutcome) => {
    if (disposed || o.record.sessionId !== sessionId) return;
    const { key, sessionQuestionId } = o.record;
    const current = state.question?.id === sessionQuestionId;
    switch (o.type) {
      case "saved":
        dispatch({ type: "answer.saved", key });
        return;
      case "delivered": {
        // Delivered after the question moved on, or after waiting for the connection: the points and the
        // verdict are the server's to say, so ask.
        const behind = !current || state.question?.status !== "open" || !!state.mine?.held || o.duplicate;
        dispatch({ type: "answer.sent", key, now: now() });
        if (behind) refresh();
        return;
      }
      case "late":
        dispatch({ type: "answer.late", key });
        refresh();
        return;
      case "ended":
        // Too late all the same: the lesson ended before the answer arrived.
        dispatch({ type: "answer.late", key });
        refresh();
        return;
      case "dropped":
      case "expired":
        dispatch({ type: "answer.failed", key });
        refresh();
        return;
    }
  };

  const onMessage = (m: RealtimeMessage) => {
    if (disposed) return;
    let event;
    try {
      event = sessionEvent(m.type, m.data);
    } catch {
      // A message the app cannot read is a message it did not get: ask for the truth instead.
      refresh();
      return;
    }
    if (!event) return;
    if (event.type === "signed_in_elsewhere") return void deps.onSignedInElsewhere?.();
    if (event.type === "notification.created") return void deps.onNotification?.();
    dispatch({ type: "event", event, receivedAt: now() });
    tellEnded();
  };

  const stops = [
    transport.subscribe(publicChannel(sessionId), onMessage),
    transport.subscribe(studentChannel(deps.meId), onMessage),
    transport.onState((next) => {
      connection = next;
      // Whatever happened while the link was down is gone; the link being up again is the cue to ask,
      // and to send what the phone has been holding.
      if (next === "open") {
        refresh();
        void deps.outbox.flush();
      } else emit();
    }),
    deps.outbox.subscribe(onOutcome),
  ];

  refresh();

  return {
    getView: () => view,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    answer(response) {
      if (state.mine) return;
      const key = (deps.newKey ?? randomKey)();
      dispatch({ type: "answer", response, key, now: now() });
      const after: EngineState = state;
      if (after.mine?.key !== key || !after.question) return;
      // Saved first, sent after: the record carries the time the engine gave the tap, in the server's terms.
      void deps.outbox.enqueue({ key, studentId: deps.meId, sessionId, sessionQuestionId: after.question.id, response, answeredAt: after.mine.at });
      // A send that is slow is, to the student, an answer saved for later.
      clearTimeout(timers.saved);
      timers.saved = setTimeout(() => {
        if (!disposed) dispatch({ type: "answer.saved", key });
      }, SAVED_AFTER_MS);
    },
    retry() {
      failed = null;
      failures = 0;
      refresh();
    },
    wake() {
      if (disposed) return;
      void deps.outbox.flush();
      if (connection !== "open") transport.reconnect();
      else refresh();
    },
    dispose() {
      disposed = true;
      stops.forEach((stop) => stop());
      clearTimeout(timers.retry);
      clearTimeout(timers.deadline);
      clearTimeout(timers.saved);
      clearInterval(timers.tick);
      listeners.clear();
      transport.close();
    },
  };
}
