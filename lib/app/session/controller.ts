import { ApiError, toApiError } from "../api/errors";
import type { Id, StudentSessionState, SubmissionKind } from "../api/types";
import { sessionEvent } from "../api/wire";
import { toLocal, toServer } from "./clock";
import { createEngine, reduce, type Action, type EngineState } from "./engine";
import { createFocusTracker, type FocusSignal, type FocusTracker } from "./focus";
import type { FocusQueue } from "./focus-queue";
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
  /**
   * Where the focus events go (spec 7.10). Without it the student leaving the quiz is not noticed at all, which is what
   * the tests that are not about it want.
   */
  focus?: FocusQueue;
  /** Whether the student has been told that leaving is visible to the teacher (default: yes). Nothing is recorded before they have. */
  focusEnabled?(): boolean;
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
  /** The student taps an answer, or votes on an opener. Final once sent (BR-ANS-02). */
  answer(response: string): void;
  /** The student sends the opener's one-line reason. Final once sent. */
  reason(text: string): void;
  /** The student gives no reason. */
  skipReason(): void;
  /**
   * The student sends a question to the teacher (F-09). Returns its key, to find it in the view's `asks`, or null when it
   * was not taken: nothing written, the limit reached, or the lesson over.
   */
  ask(text: string): string | null;
  /** The page was hidden, came back, lost the window's focus or got it again (focus.ts). */
  focus(signal: FocusSignal): void;
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
  const timers: { retry?: ReturnType<typeof setTimeout>; deadline?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> } = {};
  /** One per answer, vote or reason that has been handed to the outbox and not yet heard back on. */
  const savedTimers = new Set<ReturnType<typeof setTimeout>>();
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

  /** After a reload the answer (or vote, or reason) the student gave is still in the outbox; the question must not ask for it again. */
  function restorePending() {
    void deps.outbox.load().then(() => {
      const q = state.question;
      if (disposed) return;
      // Questions to the teacher belong to the lesson, not to a question.
      for (const saved of deps.outbox.pendingOf(deps.meId, sessionId, "ask")) dispatch({ type: "ask.restore", key: saved.key, text: saved.response, at: saved.answeredAt });
      if (!q) return;
      // The vote first: a reason is only restored on a question the student has voted on.
      for (const kind of q.opener ? (["vote", "reason"] as const) : (["answer"] as const)) {
        const saved = deps.outbox.pendingFor(deps.meId, sessionId, q.id, kind);
        if (saved) dispatch({ type: "answer.restore", kind, key: saved.key, sessionQuestionId: saved.sessionQuestionId, response: saved.response, at: saved.answeredAt });
      }
    });
  }

  /** What the outbox found out about an answer of this session. */
  const onOutcome = (o: AnswerOutcome) => {
    if (disposed || o.record.sessionId !== sessionId) return;
    if (o.record.kind === "ask") return onAskOutcome(o);
    const { key, sessionQuestionId } = o.record;
    const current = state.question?.id === sessionQuestionId;
    switch (o.type) {
      case "saved":
        dispatch({ type: "answer.saved", key });
        return;
      case "delivered": {
        // Delivered after the question moved on, or after waiting for the connection: the points and the
        // verdict are the server's to say, so ask.
        const behind = !current || state.question?.status !== "open" || !!state.mine?.held || !!state.reason?.held || o.duplicate;
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

  /** What the outbox found out about a question to the teacher. */
  function onAskOutcome(o: AnswerOutcome) {
    const { key } = o.record;
    switch (o.type) {
      case "saved":
        dispatch({ type: "ask.saved", key });
        return;
      case "delivered":
        dispatch({ type: "ask.sent", key, duplicate: o.duplicate });
        // The server's count is the truth (a repeat, or another device, may have changed it).
        refresh();
        return;
      case "ended":
        dispatch({ type: "ask.refused", key, reason: "session_ended" });
        refresh();
        return;
      case "dropped":
        dispatch({ type: "ask.refused", key, reason: o.code === "limit_reached" ? "limit_reached" : "failed" });
        refresh();
        return;
      case "late":
      case "expired":
        dispatch({ type: "ask.refused", key, reason: "failed" });
        return;
    }
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

  /**
   * The question that is open for this student at a local time, for the focus flag: open by the engine's state and by the
   * server's clock, so a question whose time has run out but whose `closed` has not arrived is not counted.
   */
  const openQuestion = (at: number): Id | null => {
    const q = state.question;
    if (!q || q.status !== "open" || !state.session || state.session.state === "ended") return null;
    const server = toServer(state.clock, at);
    if (q.firedAt !== null && server < q.firedAt) return null;
    if (q.closesAt !== null && server >= q.closesAt) return null;
    return q.id;
  };
  const tracker: FocusTracker | null = deps.focus
    ? createFocusTracker({
        openQuestion,
        toServer: (at) => toServer(state.clock, at),
        emit: (e) => deps.focus!.add({ ...e, studentId: deps.meId, sessionId }),
        enabled: deps.focusEnabled ?? (() => true),
        now,
      })
    : null;

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

  /**
   * The student gave an answer (or a vote), or a reason. It goes into the engine first, which cleans it and
   * stamps it with the server-clock time of the tap; what the engine kept is saved in the outbox, then sent.
   */
  function give(kind: "answer" | "reason", action: (key: string) => Action) {
    const key = (deps.newKey ?? randomKey)();
    dispatch(action(key));
    const q = state.question;
    const own = kind === "reason" ? state.reason : state.mine;
    if (own?.key !== key || !q) return;
    const submission: SubmissionKind = kind === "reason" ? "reason" : q.opener ? "vote" : "answer";
    void deps.outbox.enqueue({ kind: submission, key, studentId: deps.meId, sessionId, sessionQuestionId: q.id, response: own.response, answeredAt: own.at });
    // A send that is slow is, to the student, an answer saved for later.
    const timer = setTimeout(() => {
      savedTimers.delete(timer);
      if (!disposed) dispatch({ type: "answer.saved", key });
    }, SAVED_AFTER_MS);
    savedTimers.add(timer);
  }

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
      if (!state.mine) give("answer", (key) => ({ type: "answer", response, key, now: now() }));
    },
    reason(text) {
      if (!state.reason) give("reason", (key) => ({ type: "reason", text, key, now: now() }));
    },
    skipReason() {
      dispatch({ type: "reason.skip" });
    },
    ask(text) {
      const key = (deps.newKey ?? randomKey)();
      dispatch({ type: "ask", text, key, now: now() });
      const own = state.asks.find((a) => a.key === key);
      if (!own) return null;
      // Saved on the phone first, then sent until the server has spoken (outbox.ts). There is no question to answer, so none is named.
      void deps.outbox.enqueue({ kind: "ask", key, studentId: deps.meId, sessionId, sessionQuestionId: "", response: own.text, answeredAt: own.at });
      const timer = setTimeout(() => {
        savedTimers.delete(timer);
        if (!disposed) dispatch({ type: "ask.saved", key });
      }, SAVED_AFTER_MS);
      savedTimers.add(timer);
      return key;
    },
    focus(signal) {
      tracker?.signal(signal);
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
      savedTimers.forEach(clearTimeout);
      savedTimers.clear();
      tracker?.dispose();
      clearInterval(timers.tick);
      listeners.clear();
      transport.close();
    },
  };
}
