import { ApiError, toApiError } from "../api/errors";
import type { AnswerInput, AnswerReceipt, Id, StudentSessionState } from "../api/types";
import { sessionEvent } from "../api/wire";
import { toLocal } from "./clock";
import { createEngine, reduce, type Action, type EngineState } from "./engine";
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
  /** The one way an answer leaves the app (lib/app/session/send.ts). */
  sendAnswer(sessionId: Id, answer: AnswerInput): Promise<AnswerReceipt>;
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
/** An answer that could not be delivered is given up this long after the question's end. */
const DELIVER_UNTIL_MS = 10_000;
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
  const timers: { retry?: ReturnType<typeof setTimeout>; deadline?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> } = {};
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
      // Whatever happened while the link was down is gone; the link being up again is the cue to ask.
      if (next === "open") refresh();
      else emit();
    }),
  ];

  refresh();

  async function deliver(qid: Id, key: string) {
    for (let attempt = 0; !disposed; attempt++) {
      const mine = state.mine;
      if (!mine || mine.key !== key || state.question?.id !== qid) return;
      try {
        await deps.sendAnswer(sessionId, { sessionQuestionId: qid, response: mine.response, answeredAt: mine.at, idempotencyKey: key });
        if (!disposed) dispatch({ type: "answer.sent", key });
        return;
      } catch (e) {
        if (disposed) return;
        const code = toApiError(e).code;
        if (code === "question_closed") {
          dispatch({ type: "answer.late", key });
          refresh();
          return;
        }
        if (code === "already_answered") {
          dispatch({ type: "answer.sent", key });
          refresh();
          return;
        }
        // Not a thing waiting will fix.
        if (["session_ended", "not_found", "validation_failed", "unauthenticated", "signed_in_elsewhere"].includes(code)) {
          refresh();
          return;
        }
        // The network or the server: try again while the question can still take the answer.
        const q = state.question;
        const until = q?.closesAt != null ? toLocal(state.clock, q.closesAt) + DELIVER_UNTIL_MS : now();
        if (now() > until) {
          dispatch({ type: "answer.late", key });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt, random)));
      }
    }
  }

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
      if (after.mine?.key === key && after.question) void deliver(after.question.id, key);
    },
    retry() {
      failed = null;
      failures = 0;
      refresh();
    },
    wake() {
      if (disposed) return;
      if (connection !== "open") transport.reconnect();
      else refresh();
    },
    dispose() {
      disposed = true;
      stops.forEach((stop) => stop());
      clearTimeout(timers.retry);
      clearTimeout(timers.deadline);
      clearInterval(timers.tick);
      listeners.clear();
      transport.close();
    },
  };
}
