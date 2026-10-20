import { ApiError } from "../errors";
import { ChannelTransport, type Connect, type RealtimeMessage, type RealtimeTransport } from "../../session/transport";
import { translate, type Key } from "../../i18n";
import type {
  AnswerInput,
  AnswerReceipt,
  AttendanceEntry,
  BoardRow,
  JoinResult,
  Locale,
  QuestionProgress,
  QuestionResult,
  SessionQuestion,
  SessionSnapshot,
  SessionState,
  SessionSummary,
  StudentSessionState,
} from "../types";
import { iso } from "../wire";
import { subjectByCode, type ClassSubject } from "./data";
import { CLASSMATES, CORRECT_POINTS, DURATION, QUIZZES, speedBonus, type Quiz } from "./quiz";
import { actions } from "./store";

/**
 * The teacher, the server and the class, played in the browser: a scripted lesson that speaks exactly
 * the API's language. It answers `join`, `student-state` and `answers` and pushes the realtime events
 * of spec 11.2 through a `RealtimeTransport`, so the quiz screen cannot tell it from the live API.
 *
 * The script: the class gathers in the lobby, the teacher starts, fires each question, the timer closes
 * it (or everyone answering does, BR-TIME-04), the student gets their result, the teacher reveals the
 * answer, a pause, the next question; after the last the lesson goes to review and the teacher ends it.
 * The server's clock deliberately runs ahead of the phone's by a few seconds, so a client that trusted
 * its own would visibly drift.
 *
 * Special codes (the class QR codes are MATH-7B, PHYS-7B, MKD-7B and ENG-7B):
 *   EXPIRED-7B  the code has expired (token_expired)    OTHER-8A   another class's code (not_enrolled)
 *   ENDED-7B    the lesson is over (session_ended)       OFFLINE-7B no connection the first time, then MATH-7B
 *   LATE-7B     joins a lesson in progress, marked late  FLAKY-7B   the connection drops during question 1
 * Any other code is unknown (not_found).
 */

/** How far the mock server's clock is ahead of the phone's. */
export const SKEW_MS = 3700;
export const serverNow = () => Date.now() + SKEW_MS;

/** The script's timing, in ms. */
export const SCRIPT = {
  /** From joining to the teacher starting the first question. */
  start: 8200,
  /** From a question closing to the teacher revealing it. */
  reveal: 1200,
  /** From a question closing to the next one opening. */
  next: 8600,
  /** From the last question closing to the lesson going to review, and from review to End. */
  review: 9000,
  end: 6000,
  /** The class joining in the lobby, one more every so often. */
  lobbyTick: 650,
  /** The class's progress through an open question. */
  progressTick: 1000,
  /** FLAKY-7B: the link drops this long into the first question, and stays down this long. */
  dropAfter: 12_000,
  downFor: 6000,
} as const;

const STUDENT_ID = "student-marko";
const N = CLASSMATES.length;
/** How likely each classmate is to be right: a fixed spread so the ranking moves believably. */
const SKILL = CLASSMATES.map((_, i) => 0.35 + ((i * 37) % 40) / 100);

const text = (locale: Locale, key: string) => translate(locale, key as Key);

export type Scenario = "normal" | "late" | "flaky";

type Live = {
  question: SessionQuestion;
  /** The right answer in the response format (option index, or "true" / "false"). */
  right: string;
  /** When each classmate answers (ms after the question opened) and whether they are right. */
  answerAt: number[];
  rightness: boolean[];
  mine: { response: string; at: number; key: string } | null;
  result: QuestionResult | null;
  /** The phone-clock time the question opened, for the script's own timers. */
  openedAt: number;
};

const correctOf = (quiz: Quiz, index: number): string => {
  const q = quiz.questions[index];
  return q.kind === "mc" ? String(q.answer) : q.answer === 0 ? "true" : "false";
};

const shuffle = (n: number) => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const rankOf = (mine: number, theirs: number[]) => 1 + theirs.filter((p) => p > mine).length;

export class MockSession {
  readonly channels: { public: string; student: string };
  state: SessionState = "lobby";
  joined = 10;
  private order = shuffle(N);
  private recentNames: string[] = [];
  private live: Live | null = null;
  private index = -1;
  private points = 0;
  private right = 0;
  private theirs: number[] = CLASSMATES.map(() => 0);
  private board: BoardRow[] | null = null;
  private summary: SessionSummary | null = null;
  private rank = 1;
  private revealed: { id: string; correctAnswer: string } | null = null;
  private played: { id: string; prompt: string; correct: boolean; correctAnswer: string; yourAnswer: string | null }[] = [];
  private keys = new Map<string, string>();
  private listeners = new Set<(m: RealtimeMessage) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private ticker: ReturnType<typeof setInterval> | undefined;
  /** Whether the student joined after the lobby, decided by their first join and the same on every repeat. */
  joinedLate: boolean | null = null;
  /** FLAKY-7B: the one outage has been planned. */
  dropPlanned = false;
  outageUntil = 0;

  constructor(
    readonly id: string,
    readonly subject: ClassSubject,
    readonly quiz: Quiz,
    readonly scenario: Scenario,
    readonly locale: Locale,
  ) {
    this.channels = { public: `session.${id}.public`, student: `student.${STUDENT_ID}` };
    if (scenario === "late") {
      // The lesson is already under way: a question has been open for six seconds.
      this.joined = N + 1;
      this.state = "teaching";
      this.fire(0, 6000);
    } else {
      this.lobbyTick();
      this.after(SCRIPT.start, () => this.fire(0));
    }
  }

  get ended() {
    return this.state === "ended";
  }

  // ---- The link --------------------------------------------------------------------------------

  /** Receive every message the server sends. Returns the way to stop. */
  listen(listener: (m: RealtimeMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(channel: string, type: string, data: Record<string, unknown>) {
    const message = { channel, type, data: { channel, server_now: iso(serverNow()), ...data } };
    this.listeners.forEach((l) => l(message));
  }
  private toClass(type: string, data: Record<string, unknown> = {}) {
    this.emit(this.channels.public, type, data);
  }
  private toMe(type: string, data: Record<string, unknown> = {}) {
    this.emit(this.channels.student, type, data);
  }

  private after(ms: number, fn: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  /** Stop all the script's timers (the lesson is over, or the mock is being thrown away). */
  stop() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    clearInterval(this.ticker);
    this.ticker = undefined;
  }

  // ---- The script ------------------------------------------------------------------------------

  /** Classmates keep arriving until the teacher starts. */
  private lobbyTick() {
    const tick = () => {
      if (this.state !== "lobby") return;
      if (this.joined < N + 1) {
        this.joined++;
        // The last few to arrive, newest first.
        this.recentNames = this.order.slice(0, this.joined - 1).slice(-5).reverse().map((i) => CLASSMATES[i]);
        this.toClass("joined.count", { joined_count: this.joined, recent: this.recentNames });
      }
      this.after(SCRIPT.lobbyTick, tick);
    };
    this.after(SCRIPT.lobbyTick, tick);
  }

  private questionCopy(index: number, firedAt: number): SessionQuestion {
    const q = this.quiz.questions[index];
    const timer = DURATION[q.kind] / 1000;
    return {
      id: q.id,
      index,
      total: this.quiz.questions.length,
      kind: q.kind === "mc" ? "multiple_choice" : "true_false",
      prompt: q.text[this.locale],
      options: q.kind === "mc" ? q.options.map((o) => o[this.locale]) : null,
      status: "open",
      timerSeconds: timer,
      firedAt,
      closesAt: firedAt + timer * 1000,
    };
  }

  private wireQuestion(q: SessionQuestion) {
    return {
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
    };
  }

  /** The teacher fires question `index`; `ago` lets a late joiner arrive after it began. */
  private fire(index: number, ago = 0) {
    if (this.ended) return;
    if (this.state === "lobby") {
      this.state = "teaching";
      this.toClass("state.changed", { state: "teaching" });
    }
    this.index = index;
    this.revealed = null;
    const q = this.quiz.questions[index];
    const duration = DURATION[q.kind];
    const firedAt = serverNow() - ago;
    const question = this.questionCopy(index, firedAt);
    // Most of the class answers in the first two thirds of the time, a few leave it late.
    const answerAt = CLASSMATES.map(() => 2500 + Math.random() * (Math.random() < 0.85 ? duration * 0.6 : duration * 0.9 - 2500));
    this.live = {
      question,
      right: correctOf(this.quiz, index),
      answerAt,
      rightness: SKILL.map((p) => Math.random() < p),
      mine: null,
      result: null,
      openedAt: Date.now() - ago,
    };
    this.toClass("question.opened", { question: this.wireQuestion(question) });
    this.after(Math.max(0, duration - ago), () => this.close(question.id));
    clearInterval(this.ticker);
    this.ticker = setInterval(() => this.progress(), SCRIPT.progressTick);
  }

  private answeredCount(live: Live) {
    const elapsed = Date.now() - live.openedAt;
    return live.answerAt.filter((t) => t <= elapsed).length + (live.mine ? 1 : 0);
  }

  private progressOf(live: Live): QuestionProgress {
    return { answered: this.answeredCount(live), joined: N + 1 };
  }

  private progress() {
    const live = this.live;
    if (!live || live.question.status !== "open") return;
    const p = this.progressOf(live);
    this.toClass("question.progress", { session_question_id: live.question.id, answered: p.answered, joined: p.joined });
  }

  /**
   * The question ends: by its timer, or because everyone has answered. A timer that was set for an
   * earlier question (the one that closed early still has its full-length timer pending) must not end
   * the one that is open now, so each carries the id of its own.
   */
  private close(id: string) {
    const live = this.live;
    if (!live || live.question.id !== id || live.question.status !== "open" || this.ended) return;
    clearInterval(this.ticker);
    this.ticker = undefined;
    const q = this.quiz.questions[this.index];
    const duration = DURATION[q.kind];
    live.question = { ...live.question, status: "closed" };

    const mine = live.mine;
    const correct = mine !== null && mine.response === live.right;
    const left = mine ? Math.max(0, duration - (mine.at - live.question.firedAt!)) : 0;
    const bonus = correct ? speedBonus(left, duration) : 0;
    const gain = correct ? CORRECT_POINTS + bonus : 0;
    this.theirs = this.theirs.map((p, i) => {
      if (!live.rightness[i]) return p;
      const theirLeft = Math.max(0, duration - Math.min(live.answerAt[i], duration));
      return p + CORRECT_POINTS + speedBonus(theirLeft, duration);
    });
    this.points += gain;
    this.right += correct ? 1 : 0;
    this.rank = rankOf(this.points, this.theirs);
    live.result = {
      sessionQuestionId: live.question.id,
      correct,
      points: gain,
      speedBonus: bonus,
      sessionRank: this.rank,
      // The teacher shows the answer a moment later (`question.revealed`).
      correctAnswer: null,
      explanation: null,
    };
    this.board = this.makeBoard();
    this.played.push({
      id: q.id,
      prompt: q.text[this.locale],
      correct,
      correctAnswer: q.kind === "mc" ? q.options[q.answer][this.locale] : text(this.locale, q.answer === 0 ? "q.true" : "q.false"),
      yourAnswer: mine ? this.answerText(q, mine.response) : null,
    });

    // The mock plays the server's ledger as well: points and achievements are kept as they are earned.
    if (gain > 0) actions.addQuizPoints(gain);
    if (mine) actions.markQuizAnswered();

    this.toClass("question.closed", { session_question_id: live.question.id });
    this.toMe("question.result", {
      session_question_id: live.question.id,
      correct,
      points: gain,
      speed_bonus: bonus,
      session_rank: this.rank,
      session_points: this.points,
      correct_answer: null,
      explanation: null,
    });
    this.toClass("leaderboard.updated", { rows: this.wireBoard() });

    const closed = live.question.id;
    this.after(SCRIPT.reveal, () => this.reveal(closed));
    if (this.index + 1 < this.quiz.questions.length) {
      this.after(SCRIPT.next, () => this.fire(this.index + 1));
    } else {
      this.after(SCRIPT.review, () => this.review());
    }
  }

  private answerText(q: Quiz["questions"][number], response: string) {
    if (q.kind === "tf") return text(this.locale, response === "true" ? "q.true" : "q.false");
    return q.options[Number(response)]?.[this.locale] ?? null;
  }

  private reveal(id: string) {
    const live = this.live;
    if (!live || live.question.id !== id || this.ended) return;
    live.question = { ...live.question, status: "revealed" };
    if (live.result) live.result = { ...live.result, correctAnswer: live.right };
    this.revealed = { id: live.question.id, correctAnswer: live.right };
    this.toClass("question.revealed", { session_question_id: live.question.id, correct_answer: live.right, explanation: null });
  }

  private review() {
    if (this.ended) return;
    this.state = "review";
    this.toClass("state.changed", { state: "review" });
    this.toClass("review.ready");
    this.after(SCRIPT.end, () => this.end());
  }

  /** The teacher presses End (F-10): points settle, and the student gets their results. */
  private end() {
    if (this.ended) return;
    this.stop();
    this.state = "ended";
    this.summary = { right: this.right, total: this.quiz.questions.length };
    if (this.right === this.quiz.questions.length) actions.markPerfectQuiz();
    actions.finishSession({
      sessionId: this.id,
      courseId: this.subject.id,
      lessonTitle: this.quiz.title[this.locale],
      endedAt: Date.now(),
      right: this.right,
      total: this.quiz.questions.length,
      questions: this.played,
    });
    this.toClass("state.changed", { state: "ended" });
    this.toMe("session.ended", { session_points: this.points, session_rank: this.rank, summary: this.summary });
  }

  private makeBoard(): BoardRow[] {
    const rows = [
      { studentId: STUDENT_ID, name: text(this.locale, "user.name"), points: this.points, me: true, at: -1 },
      ...CLASSMATES.map((name, i) => ({ studentId: `mock-classmate-${i}`, name, points: this.theirs[i], me: false, at: i })),
    ].sort((a, b) => b.points - a.points || (a.me ? -1 : b.me ? 1 : a.at - b.at));
    return rows.map((r) => ({ studentId: r.studentId, name: r.name, points: r.points, rank: 1 + rows.filter((x) => x.points > r.points).length }));
  }

  private wireBoard() {
    return (this.board ?? []).map((r) => ({ student_id: r.studentId, name: r.name, points: r.points, rank: r.rank }));
  }

  // ---- The API ---------------------------------------------------------------------------------

  snapshotOf(): SessionSnapshot {
    return {
      id: this.id,
      courseId: this.subject.id,
      state: this.state,
      lessonTitle: this.quiz.title[this.locale],
      questionCount: this.quiz.questions.length,
      joinedCount: this.joined,
    };
  }

  /** GET /sessions/{id}/student-state. */
  studentState(): StudentSessionState {
    const live = this.live;
    return {
      session: this.snapshotOf(),
      serverNow: serverNow(),
      question: live ? live.question : null,
      myResponse: live?.mine?.response ?? null,
      result: live?.result ?? null,
      sessionPoints: this.points,
      sessionRank: this.rank,
      board: this.board,
      progress: live && live.question.status === "open" ? this.progressOf(live) : null,
      summary: this.summary,
    };
  }

  /** POST /sessions/{id}/answers. */
  submit(answer: AnswerInput): AnswerReceipt {
    if (this.ended) throw new ApiError("session_ended");
    if (this.keys.has(answer.idempotencyKey)) return { accepted: true, duplicate: true };
    const live = this.live;
    if (!live || live.question.id !== answer.sessionQuestionId) throw new ApiError("not_found");
    if (live.question.status !== "open") throw new ApiError("question_closed");
    if (live.mine) throw new ApiError("already_answered");
    const q = this.quiz.questions[this.index];
    const valid = q.kind === "mc" ? ["0", "1", "2", "3"] : ["true", "false"];
    if (!valid.includes(answer.response)) throw new ApiError("validation_failed");

    // The answer time is the phone's claim, clamped to the question's window (EC-NET-07).
    const at = Math.min(live.question.closesAt!, Math.max(live.question.firedAt!, answer.answeredAt));
    live.mine = { response: answer.response, at, key: answer.idempotencyKey };
    this.keys.set(answer.idempotencyKey, answer.response);

    // Once you have answered, the stragglers come in within a few seconds, and the question closes
    // when the last of them has (BR-TIME-04).
    const elapsed = Date.now() - live.openedAt;
    live.answerAt = live.answerAt.map((t) => (t > elapsed ? elapsed + 600 + Math.random() * 3200 : t));
    const duration = DURATION[q.kind];
    const lastAt = Math.max(...live.answerAt);
    if (lastAt < duration) this.after(Math.max(0, live.openedAt + lastAt - Date.now()), () => this.close(live.question.id));
    this.progress();
    return { accepted: true, duplicate: false };
  }
}

// ---- Joining ----------------------------------------------------------------------------------

const sessions = new Map<string, MockSession>();
let runs = 0;
/** Codes whose first try fails with no connection, once per page. */
const triedOffline = new Set<string>();

const SPECIAL = {
  expired: "expired-7b",
  other: "other-8a",
  ended: "ended-7b",
  offline: "offline-7b",
  late: "late-7b",
  flaky: "flaky-7b",
} as const;

const MATH = subjectByCode("MATH-7B")!;

/** What a code opens, or the error the API would answer it with. */
function resolve(code: string): { subject: ClassSubject; scenario: Scenario } {
  const c = code.trim().toLowerCase();
  if (c === SPECIAL.expired) throw new ApiError("token_expired");
  if (c === SPECIAL.other) throw new ApiError("not_enrolled");
  if (c === SPECIAL.ended) throw new ApiError("session_ended");
  if (c === SPECIAL.offline) {
    if (!triedOffline.has(c)) {
      triedOffline.add(c);
      throw new ApiError("network");
    }
    return { subject: MATH, scenario: "normal" };
  }
  if (c === SPECIAL.late) return { subject: MATH, scenario: "late" };
  if (c === SPECIAL.flaky) return { subject: MATH, scenario: "flaky" };
  const subject = subjectByCode(c);
  if (!subject || !QUIZZES[subject.id]) throw new ApiError("not_found");
  return { subject, scenario: "normal" };
}

/** POST /sessions/join. Joining a lesson that is already running again is the same session (EC-JOIN-04). */
export function joinMock(code: string, locale: Locale): JoinResult {
  const { subject, scenario } = resolve(code);
  const key = `${subject.id}:${scenario}`;
  let session = [...sessions.values()].find((s) => `${s.subject.id}:${s.scenario}` === key && !s.ended);
  if (!session) {
    session = new MockSession(`mock-session-${subject.id}-${scenario}-${++runs}`, subject, QUIZZES[subject.id]!, scenario, locale);
    sessions.set(session.id, session);
  }
  // Joining is the attendance (BR-JOIN-01); it earns no points (BR-PTS-01).
  session.joinedLate ??= session.state !== "lobby";
  const late = session.joinedLate;
  const entry = actions.checkIn(subject.id, late);
  const attendance: AttendanceEntry = {
    id: entry.id,
    courseId: subject.id,
    subjectId: subject.id,
    subjectName: text(locale, `subj.${subject.id}`),
    date: entry.at,
    status: entry.late ? "late" : "present",
    joinedAt: entry.at,
  };
  return { session: session.snapshotOf(), attendance, serverNow: serverNow() };
}

export const mockSessionFor = (id: string) => sessions.get(id);

/** Forget every session and every once-only failure; for tests. */
export function resetMockSessions() {
  sessions.forEach((s) => s.stop());
  sessions.clear();
  triedOffline.clear();
  runs = 0;
}

// ---- The realtime link --------------------------------------------------------------------------

/**
 * The scripted lesson as a realtime transport. It is the real `ChannelTransport` (backoff, silence
 * watchdog, reconnects) over a link that listens to the mock session, so the demo exercises the same
 * code as the live API. FLAKY-7B drops the link once, during the first question, and keeps it down for
 * a few seconds; what the lesson does meanwhile is lost to the student, as on a real network.
 */
export function mockTransport(sessionId: string): RealtimeTransport {
  const session = sessions.get(sessionId);
  const connect: Connect = (channels, handlers) => {
    if (!session || Date.now() < session.outageUntil) {
      // Nothing to reach: the connection fails the way an unreachable server does.
      const failing = setTimeout(() => handlers.closed(), 50);
      return { close: () => clearTimeout(failing) };
    }
    let open = true;
    const stop = session.listen((m) => {
      if (!open || !channels.includes(m.channel)) return;
      handlers.message(m);
      // FLAKY-7B: the connection drops a while into the first question.
      if (session.scenario === "flaky" && !session.dropPlanned && m.type === "question.opened") {
        session.dropPlanned = true;
        setTimeout(() => {
          session.outageUntil = Date.now() + SCRIPT.downFor;
          handlers.closed();
        }, SCRIPT.dropAfter);
      }
    });
    const opening = setTimeout(() => handlers.open(), 0);
    return {
      close: () => {
        open = false;
        clearTimeout(opening);
        stop();
      },
    };
  };
  return new ChannelTransport(connect);
}
