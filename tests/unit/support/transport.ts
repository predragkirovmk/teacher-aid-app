import { vi } from "vitest";
import type { ConnectionState, RealtimeMessage, RealtimeTransport } from "@/lib/app/session/transport";
import { iso } from "@/lib/app/api/wire";
import type { QuestionResult, SessionQuestion } from "@/lib/app/api/types";

/** A transport the test drives by hand: it says when the link is up and what arrives on it. */
export class FakeTransport implements RealtimeTransport {
  state: ConnectionState = "connecting";
  private handlers = new Map<string, (m: RealtimeMessage) => void>();
  private listeners = new Set<(s: ConnectionState) => void>();
  reconnect = vi.fn();
  close = vi.fn();

  subscribe(channel: string, handler: (m: RealtimeMessage) => void) {
    this.handlers.set(channel, handler);
    return () => void this.handlers.delete(channel);
  }
  onState(listener: (s: ConnectionState) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  channels() {
    return [...this.handlers.keys()].sort();
  }
  setState(next: ConnectionState) {
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }
  push(channel: string, type: string, data: unknown) {
    this.handlers.get(channel)?.({ channel, type, data });
  }
}

/** The wire bodies of the events a test sends. */
export const wireQuestion = (q: SessionQuestion) => ({
  id: q.id,
  index: q.index,
  total: q.total,
  kind: q.kind,
  prompt: q.prompt,
  options: q.options,
  status: q.status,
  timer_seconds: q.timerSeconds,
  fired_at: q.firedAt === null ? null : iso(q.firedAt),
  closes_at: q.closesAt === null ? null : iso(q.closesAt),
});

export const wireResult = (r: QuestionResult, sessionPoints: number, serverNow: number) => ({
  server_now: iso(serverNow),
  session_question_id: r.sessionQuestionId,
  correct: r.correct,
  points: r.points,
  speed_bonus: r.speedBonus,
  session_rank: r.sessionRank,
  session_points: sessionPoints,
  correct_answer: r.correctAnswer,
  explanation: r.explanation,
});

/** A promise a test settles when it likes. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
