import type {
  AnonCount,
  BoardRow,
  Id,
  QuestionProgress,
  QuestionResult,
  QuestionStatus,
  SessionEvent,
  SessionQuestion,
  SessionSnapshot,
  SessionState,
  SessionSummary,
  StudentSessionState,
} from "../api/types";
import { askRemaining, cleanAsk } from "./ask";
import { mergeClock, sampleClock, toServer, type ClockSample } from "./clock";

/**
 * The student's side of a live session as a pure reducer (spec 4.4): server snapshots and realtime
 * events in, the state the quiz screen draws out. No timers, no network and no clock of its own; the
 * controller feeds it, and `view.ts` reads it.
 *
 * The rules that keep it right when the network is not:
 * - A snapshot is the truth up to its `serverNow`. It replaces what the app believed, and any event the
 *   server stamped earlier than that is dropped as already reflected.
 * - Events that arrive while a snapshot is awaited (first load, every reconnect) are held, then replayed
 *   on top of it, so a snapshot that was cut before an event cannot undo the event.
 * - Everything a session can do only moves forward: its state (4.1) and a question's status (4.2). An
 *   event that would move it back is a late duplicate and changes nothing, so the same event twice is
 *   the same as once, and two events in the wrong order end in the same place.
 * - An event about a question the app has never had is a sign it missed one: it asks for a snapshot.
 *
 * A question to the teacher (spec F-09) belongs to the session and not to a question: `asks` are the ones this phone has
 * written, each saved and sent on its own, and `anon` is the server's count of what it holds (BR-ANON-02).
 */

const STATE_ORDER: Record<SessionState, number> = { lobby: 0, teaching: 1, review: 2, ended: 3 };
const STATUS_ORDER: Record<QuestionStatus, number> = { ready: 0, open: 1, closed: 2, revealed: 3, skipped: 4 };

/** How long a fresh verdict (right or wrong) stays on screen before the ranking takes over. */
export const VERDICT_MS = 3800;
/** A wrong answer stays up this long after the teacher reveals the right one, so there is time to read it. */
export const VERDICT_AFTER_REVEAL_MS = 2500;
/** The longest a verdict waits for the teacher to reveal the answer. */
export const VERDICT_MAX_MS = 25_000;
/** A result that has not come this long after the question closed is not coming; the screen moves on and a snapshot is asked for. */
export const RESULT_WAIT_MS = 8000;
/** A result found in a snapshot is still news if its question closed less than this long ago. */
export const RECENT_VERDICT_MS = 12_000;

const PENDING_MAX = 200;
const SEEN_MAX = 50;

/** What the student answered, and where the answer has got to. */
export type OwnAnswer = {
  /** Option index as a string for multiple choice, "true" or "false" for true/false, the number as plain text for a numeric question (spec 3.2). */
  response: string;
  key: string;
  /** When it was given, in server time (EC-NET-07). 0 for an answer the server had before this app did. */
  at: number;
  /**
   * `sending`: handed to the outbox, no word from the server yet. `saved`: it is on the phone and an attempt
   * failed or is slow, so it waits for the connection. `sent`: the server has it. `late`: the server refused
   * it as outside the question's window.
   */
  status: "sending" | "saved" | "sent" | "late";
  /** It was waiting for the connection at some point, so a verdict that arrives after it is delivered is news, however long after the question. */
  held?: boolean;
};

/** An answer the app has not heard the server take. */
export const undelivered = (a: OwnAnswer | null): boolean => !!a && (a.status === "sending" || a.status === "saved");

/** Where a question to the teacher has got to. The last three are final: the server will not take it. */
export type AskStatus = "sending" | "saved" | "sent" | "limit_reached" | "session_ended" | "failed";

/** A question the student wrote to the teacher in this visit (F-09). */
export type OwnAsk = {
  key: string;
  /** As it is sent: cleaned, trimmed and capped. */
  text: string;
  /** When it was written, in server time. */
  at: number;
  status: AskStatus;
};

/** A question to the teacher the server has not yet taken: it is on the phone and will count against the limit. */
export const askWaiting = (a: OwnAsk): boolean => a.status === "sending" || a.status === "saved";

const ASKS_MAX = 20;

export type EngineState = {
  sessionId: Id;
  /** The student's id, to find their row on the ranking. */
  meId: Id;
  /** Joined after the lobby (attendance `late`, OPEN-05). */
  late: boolean;
  /** Null until the first snapshot. */
  session: SessionSnapshot | null;
  clock: ClockSample | null;
  /** The server time of the last snapshot; events stamped before it are already in it. */
  asOf: number;
  /** A snapshot has been asked for: events are held until it lands. */
  awaiting: boolean;
  pending: SessionEvent[];
  /** An event showed the app missed something; the controller should ask for a snapshot. */
  stale: boolean;
  question: SessionQuestion | null;
  mine: OwnAnswer | null;
  result: QuestionResult | null;
  /** The local time the result reached this phone, which starts the verdict's time on screen. Null for a result found long after. */
  resultAt: number | null;
  /** The teacher's reveal, which may come before or after the result. */
  reveal: { id: Id; correctAnswer: string | null; explanation: string | null; at: number } | null;
  sessionPoints: number;
  /** The student's rank in this session; null before the first snapshot. */
  sessionRank: number | null;
  /** The rank before the latest result, for "up two places"; null when the app did not see it. */
  rankBefore: number | null;
  board: BoardRow[] | null;
  progress: QuestionProgress | null;
  recent: string[];
  summary: SessionSummary | null;
  /** The student's questions to the teacher: how many the server holds and the limit. Null until the server says. */
  anon: AnonCount | null;
  /** What the student wrote to the teacher in this visit, oldest first. */
  asks: OwnAsk[];
  /** Ids of questions that were current and are not now, so a late event about one is not mistaken for a new question. */
  seen: Id[];
};

export type Action =
  /** A snapshot is about to be asked for (first load or a reconnect): hold events until it lands. */
  | { type: "resync" }
  | { type: "snapshot"; snapshot: StudentSessionState; sentAt: number; receivedAt: number }
  | { type: "event"; event: SessionEvent; receivedAt: number }
  /** Stop holding events for a snapshot that will not come (the snapshot call keeps failing) and apply them to what the app has. */
  | { type: "unhold"; receivedAt: number }
  /** The student tapped an answer at local time `now`. */
  | { type: "answer"; response: string; key: string; now: number }
  /** The outbox has the answer on the phone but could not send it yet, or is slow. */
  | { type: "answer.saved"; key: string }
  /** `now` is the local time it was told, so a verdict that was waiting on the answer starts its time on screen then. */
  | { type: "answer.sent"; key: string; now?: number }
  /** The server refused the answer as outside the question's window (EC-NET-02). */
  | { type: "answer.late"; key: string }
  /** The server will never take the answer (its question is gone): forget it. */
  | { type: "answer.failed"; key: string }
  /** The page was reloaded with an answer still waiting in the outbox: the student has given it. */
  | { type: "answer.restore"; key: string; sessionQuestionId: Id; response: string; at: number }
  /** The student wrote a question to the teacher at local time `now`. Cleaned and capped here, and refused when the limit is reached. */
  | { type: "ask"; text: string; key: string; now: number }
  | { type: "ask.saved"; key: string }
  /** The server has it. A `duplicate` was counted when it first arrived, so it adds nothing to the count here. */
  | { type: "ask.sent"; key: string; duplicate: boolean }
  /** The server will not take it: the limit is reached, the lesson has ended, or it was refused for good. */
  | { type: "ask.refused"; key: string; reason: "limit_reached" | "session_ended" | "failed" }
  /** The page was reloaded with a question to the teacher still waiting in the outbox. */
  | { type: "ask.restore"; key: string; text: string; at: number };

export function createEngine(init: { sessionId: Id; meId: Id; late?: boolean }): EngineState {
  return {
    sessionId: init.sessionId,
    meId: init.meId,
    late: init.late ?? false,
    session: null,
    clock: null,
    asOf: -Infinity,
    awaiting: true,
    pending: [],
    stale: false,
    question: null,
    mine: null,
    result: null,
    resultAt: null,
    reveal: null,
    sessionPoints: 0,
    sessionRank: null,
    rankBefore: null,
    board: null,
    progress: null,
    recent: [],
    summary: null,
    anon: null,
    asks: [],
    seen: [],
  };
}

/** A question the student has never had, versus the one they have or had. */
function isNewer(q: SessionQuestion, cur: SessionQuestion): boolean {
  if (q.firedAt !== null && cur.firedAt !== null && q.firedAt !== cur.firedAt) return q.firedAt > cur.firedAt;
  return q.index > cur.index;
}

type Known = "current" | "old" | "unknown";
const known = (s: EngineState, id: Id): Known => (s.question?.id === id ? "current" : s.seen.includes(id) ? "old" : "unknown");

const remember = (seen: Id[], id: Id | undefined) => (id ? [...seen, id].slice(-SEEN_MAX) : seen);

const sameRows = (a: BoardRow[] | null, b: BoardRow[]) =>
  !!a && a.length === b.length && a.every((r, i) => r.studentId === b[i].studentId && r.points === b[i].points && r.rank === b[i].rank);

function applyEvent(s: EngineState, ev: SessionEvent, at: number): EngineState {
  // The two events about the app itself carry no session time; the controller handles them.
  if (ev.serverNow === null) return s;
  // Stamped before the snapshot: the snapshot already says it.
  if (ev.serverNow < s.asOf) return s;
  const session = s.session;
  if (!session) return s;
  const cur = s.question;

  switch (ev.type) {
    case "state.changed": {
      if (STATE_ORDER[ev.state] <= STATE_ORDER[session.state]) return s;
      return { ...s, session: { ...session, state: ev.state } };
    }

    case "joined.count": {
      const recent = ev.recent.length > 0 ? ev.recent : s.recent;
      if (ev.joinedCount === session.joinedCount && recent === s.recent) return s;
      return { ...s, session: { ...session, joinedCount: ev.joinedCount }, recent };
    }

    case "question.opened": {
      if (session.state === "ended") return s;
      const q = ev.question;
      if (cur && cur.id === q.id) {
        // The same question again: only a step forward counts.
        if (STATUS_ORDER[q.status] <= STATUS_ORDER[cur.status]) return s;
        return { ...s, question: { ...cur, ...q } };
      }
      if (s.seen.includes(q.id)) return s;
      if (cur && !isNewer(q, cur)) return s;
      return {
        ...s,
        session: session.state === "lobby" ? { ...session, state: "teaching" } : session,
        question: q,
        mine: null,
        result: null,
        resultAt: null,
        reveal: null,
        progress: null,
        seen: remember(s.seen, cur?.id),
      };
    }

    case "question.progress": {
      if (!cur || cur.id !== ev.sessionQuestionId || cur.status !== "open") return s;
      if (s.progress?.answered === ev.answered && s.progress.joined === ev.joined) return s;
      return { ...s, progress: { answered: ev.answered, joined: ev.joined } };
    }

    case "question.closed": {
      const k = known(s, ev.sessionQuestionId);
      if (k === "old") return s;
      if (k === "unknown") return { ...s, stale: true };
      if (STATUS_ORDER[cur!.status] >= STATUS_ORDER.closed) return s;
      return { ...s, question: { ...cur!, status: "closed" }, progress: null };
    }

    case "question.revealed": {
      const k = known(s, ev.sessionQuestionId);
      if (k === "old") return s;
      if (k === "unknown") return { ...s, stale: true };
      if (cur!.status === "skipped") return s;
      const reveal = { id: ev.sessionQuestionId, correctAnswer: ev.correctAnswer, explanation: ev.explanation, at };
      const result =
        s.result && s.result.sessionQuestionId === reveal.id && s.result.correctAnswer === null
          ? { ...s.result, correctAnswer: reveal.correctAnswer, explanation: s.result.explanation ?? reveal.explanation }
          : s.result;
      const status = STATUS_ORDER[cur!.status] < STATUS_ORDER.revealed ? "revealed" : cur!.status;
      if (s.reveal?.id === reveal.id && result === s.result && status === cur!.status) return s;
      return { ...s, question: status === cur!.status ? cur : { ...cur!, status }, reveal: s.reveal?.id === reveal.id ? s.reveal : reveal, result, progress: null };
    }

    case "question.skipped": {
      if (known(s, ev.sessionQuestionId) !== "current") return s;
      // A question that was already revealed cannot be skipped; nobody scores on a skipped one (BR-SKIP-01).
      if (STATUS_ORDER[cur!.status] >= STATUS_ORDER.revealed) return s;
      return { ...s, question: { ...cur!, status: "skipped" }, mine: null, result: null, resultAt: null, progress: null };
    }

    case "leaderboard.updated":
      return sameRows(s.board, ev.rows) ? s : { ...s, board: ev.rows };

    case "question.result": {
      const id = ev.result.sessionQuestionId;
      const k = known(s, id);
      if (k === "old") return s;
      if (k === "unknown") return { ...s, stale: true };
      if (cur!.status === "skipped") return s;
      const have = s.result && s.result.sessionQuestionId === id ? s.result : null;
      if (have) {
        // The server counted an answer that reached it late (BR-NET-01): the result is corrected, and the student is told.
        if (have.correct !== ev.result.correct || have.points !== ev.result.points) {
          return {
            ...s,
            result: { ...ev.result, correctAnswer: ev.result.correctAnswer ?? have.correctAnswer, explanation: ev.result.explanation ?? have.explanation },
            resultAt: at,
            sessionPoints: ev.sessionPoints,
            sessionRank: ev.result.sessionRank,
            progress: null,
          };
        }
        // The same result again. It may know more than the first did (the right answer).
        if (have.correctAnswer !== null || ev.result.correctAnswer === null) return s;
        return { ...s, result: { ...have, correctAnswer: ev.result.correctAnswer, explanation: have.explanation ?? ev.result.explanation } };
      }
      const revealed = s.reveal && s.reveal.id === id ? s.reveal : null;
      const result: QuestionResult = {
        ...ev.result,
        correctAnswer: ev.result.correctAnswer ?? revealed?.correctAnswer ?? null,
        explanation: ev.result.explanation ?? revealed?.explanation ?? null,
      };
      return {
        ...s,
        question: STATUS_ORDER[cur!.status] < STATUS_ORDER.closed ? { ...cur!, status: "closed" } : cur,
        result,
        resultAt: at,
        sessionPoints: ev.sessionPoints,
        rankBefore: s.sessionRank,
        sessionRank: ev.result.sessionRank,
        progress: null,
      };
    }

    case "session.ended":
      return {
        ...s,
        session: { ...session, state: "ended" },
        summary: ev.summary ?? s.summary,
        sessionPoints: ev.sessionPoints ?? s.sessionPoints,
        sessionRank: ev.sessionRank ?? s.sessionRank,
      };
  }
  return s;
}

/** What the student's own answer is after a snapshot: the server's word, unless it simply has not heard yet. */
function answerAfter(prev: EngineState, snap: StudentSessionState): OwnAnswer | null {
  const q = snap.question;
  if (!q || q.status === "skipped") return null;
  const same = prev.question?.id === q.id ? prev.mine : null;
  if (snap.myResponse !== null) {
    // The first answer stands (BR-ANS-02), whatever the app had in mind.
    return { response: snap.myResponse, key: same?.key ?? "", at: same?.at ?? 0, status: "sent", held: same?.held };
  }
  // An answer the server has not heard yet is still on its way, even after the question closed: the server counts
  // it by the time it was given (BR-NET-01), and the outbox says when it has been taken or refused.
  if (same && undelivered(same)) return same;
  if (same && same.status === "late") return same;
  return null;
}

function applySnapshot(s: EngineState, snap: StudentSessionState, sentAt: number, receivedAt: number): EngineState {
  if (snap.session.id !== s.sessionId) return s;
  const q = snap.question;
  const result = q && snap.result && snap.result.sessionQuestionId === q.id ? snap.result : null;
  const haveResult =
    !!result && s.result?.sessionQuestionId === result.sessionQuestionId && s.result.correct === result.correct && s.result.points === result.points;
  // A result this phone has not shown yet is news if it is recent; one from long ago is not a verdict to show now.
  // An answer that was held back and has just been counted is news however long ago the question closed.
  const wasHeld = s.question?.id === q?.id && !!s.mine?.held;
  const recent = !!q && q.status !== "skipped" && (wasHeld || q.closesAt === null || snap.serverNow - q.closesAt <= RECENT_VERDICT_MS);
  const sameQuestion = !!q && s.question?.id === q.id;

  let next: EngineState = {
    ...s,
    session: snap.session,
    clock: mergeClock(s.clock, sampleClock(snap.serverNow, sentAt, receivedAt)),
    asOf: snap.serverNow,
    awaiting: false,
    stale: false,
    pending: [],
    question: q,
    mine: answerAfter(s, snap),
    result,
    resultAt: result ? (haveResult ? s.resultAt : recent ? receivedAt : null) : null,
    reveal: result?.correctAnswer || !sameQuestion ? null : s.reveal,
    sessionPoints: snap.sessionPoints,
    sessionRank: snap.sessionRank,
    rankBefore: haveResult ? s.rankBefore : result ? s.sessionRank : null,
    board: snap.board ?? s.board,
    progress: q?.status === "open" ? snap.progress : null,
    summary: snap.summary ?? s.summary,
    anon: snap.anon,
    seen: sameQuestion || !s.question ? s.seen : remember(s.seen, s.question.id),
  };
  // What arrived while the snapshot was on its way goes on top of it, oldest first; the older ones are dropped inside.
  const held = [...s.pending].sort((a, b) => (a.serverNow ?? 0) - (b.serverNow ?? 0));
  for (const ev of held) next = applyEvent(next, ev, receivedAt);
  return next;
}

const mapAsk = (s: EngineState, key: string, fn: (a: OwnAsk) => OwnAsk): EngineState => ({
  ...s,
  asks: s.asks.map((x) => (x.key === key ? fn(x) : x)),
});

export function reduce(s: EngineState, a: Action): EngineState {
  switch (a.type) {
    case "resync":
      return s.awaiting ? s : { ...s, awaiting: true };

    case "snapshot":
      return applySnapshot(s, a.snapshot, a.sentAt, a.receivedAt);

    case "event": {
      if (a.event.serverNow === null) return s;
      if (s.awaiting || !s.session) {
        // Held until the snapshot lands; a long outage keeps the newest.
        return { ...s, pending: [...s.pending, a.event].slice(-PENDING_MAX) };
      }
      return applyEvent(s, a.event, a.receivedAt);
    }

    case "unhold": {
      if (!s.awaiting || !s.session) return s;
      let next: EngineState = { ...s, awaiting: false, pending: [] };
      for (const ev of [...s.pending].sort((x, y) => (x.serverNow ?? 0) - (y.serverNow ?? 0))) next = applyEvent(next, ev, a.receivedAt);
      return next;
    }

    case "answer": {
      const q = s.question;
      if (!q || !s.session || s.session.state === "ended" || q.status !== "open" || s.mine) return s;
      const at = toServer(s.clock, a.now);
      // The clock says time is up: the screen already stopped taking taps, and the server would refuse it.
      if (q.closesAt !== null && at >= q.closesAt) return s;
      return { ...s, mine: { response: a.response, key: a.key, at: q.firedAt !== null ? Math.max(at, q.firedAt) : at, status: "sending" } };
    }

    case "answer.saved":
      return s.mine?.key === a.key && s.mine.status === "sending" ? { ...s, mine: { ...s.mine, status: "saved", held: true } } : s;

    case "answer.sent": {
      if (s.mine?.key !== a.key || !undelivered(s.mine)) return s;
      // A verdict that waited for the answer to arrive is read now, not when the result first came.
      const waited = s.mine.held && s.result !== null && a.now !== undefined;
      return { ...s, mine: { ...s.mine, status: "sent" }, resultAt: waited ? a.now! : s.resultAt };
    }

    case "answer.late":
      return s.mine?.key === a.key && undelivered(s.mine) ? { ...s, mine: { ...s.mine, status: "late" } } : s;

    case "answer.failed":
      return s.mine?.key === a.key && undelivered(s.mine) ? { ...s, mine: null } : s;

    case "ask": {
      if (!s.session || s.session.state === "ended") return s;
      const text = cleanAsk(a.text);
      if (text === "" || s.asks.some((x) => x.key === a.key)) return s;
      const room = askRemaining(s.anon, s.asks.filter(askWaiting).length);
      if (room !== null && room <= 0) return s;
      return { ...s, asks: [...s.asks, { key: a.key, text, at: toServer(s.clock, a.now), status: "sending" as const }].slice(-ASKS_MAX) };
    }

    case "ask.saved":
      return mapAsk(s, a.key, (x) => (x.status === "sending" ? { ...x, status: "saved" } : x));

    case "ask.sent": {
      const was = s.asks.find((x) => x.key === a.key);
      if (!was || !askWaiting(was)) return s;
      const counted = !a.duplicate && s.anon ? { ...s.anon, used: Math.min(s.anon.limit, s.anon.used + 1) } : s.anon;
      return { ...mapAsk(s, a.key, (x) => ({ ...x, status: "sent" })), anon: counted };
    }

    case "ask.refused": {
      const was = s.asks.find((x) => x.key === a.key);
      if (!was || !askWaiting(was)) return s;
      // The server says the limit is reached: whatever the phone believed, there is no room.
      const full = a.reason === "limit_reached" && s.anon ? { ...s.anon, used: s.anon.limit } : s.anon;
      return { ...mapAsk(s, a.key, (x) => ({ ...x, status: a.reason })), anon: full };
    }

    case "ask.restore": {
      if (s.asks.some((x) => x.key === a.key)) return s;
      return { ...s, asks: [...s.asks, { key: a.key, text: a.text, at: a.at, status: "saved" as const }].slice(-ASKS_MAX) };
    }

    case "answer.restore": {
      const q = s.question;
      if (!q || q.id !== a.sessionQuestionId || q.status === "skipped" || s.session?.state === "ended") return s;
      return s.mine ? s : { ...s, mine: { response: a.response, key: a.key, at: a.at, status: "saved", held: true } };
    }
  }
}
