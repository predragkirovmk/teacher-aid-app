import { ApiError } from "../errors";
import { net } from "../../session/net";
import { ChannelTransport, type Connect, type RealtimeMessage, type RealtimeTransport } from "../../session/transport";
import { translate, type Key } from "../../i18n";
import type {
  AnonCount,
  AnswerInput,
  AnswerReceipt,
  AskInput,
  AttendanceEntry,
  BoardRow,
  FocusEventInput,
  JoinResult,
  Locale,
  OpenerPhase,
  QuestionProgress,
  QuestionResult,
  SessionQuestion,
  SessionSnapshot,
  SessionState,
  SessionSummary,
  StudentSessionState,
} from "../types";
import { formatNumeric, parseNumeric, withUnit, withinTolerance } from "../../numeric";
import { cleanReason } from "../../session/engine";
import { ANON_LIMIT, ANON_MAX_LENGTH, cleanAsk } from "../../session/ask";
import { iso } from "../wire";
import { subjectByCode, type ClassSubject } from "./data";
import { CLASSMATES, CORRECT_POINTS, DURATION, OPENER_TIMES, QUIZZES, REASON_MAX, REASON_POINTS, speedBonus, type Quiz } from "./quiz";
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
 * Every lesson opens with its opener (a prediction in maths and physics, a debate in Macedonian and English:
 * a vote, then one line of reason, then the class's votes and reasons) before the pop-up questions; maths and
 * physics each have a numeric question among them.
 *
 * Special codes (the class QR codes are MATH-7B, PHYS-7B, MKD-7B and ENG-7B):
 *   EXPIRED-7B  the code has expired (token_expired)    OTHER-8A   another class's code (not_enrolled)
 *   ENDED-7B    the lesson is over (session_ended)       OFFLINE-7B no connection the first time, then MATH-7B
 *   LATE-7B     joins a lesson in progress, marked late  FLAKY-7B   the connection drops during question 1
 *               (LATE-7B, FLAKY-7B and OFFLINE-ANSWER-7B skip the opener: they are about the pop-ups)
 *   OFFLINE-ANSWER-7B  the network drops for about 15 s the moment the student sends their first answer, so
 *               "saved, will send when you're back online" turns into "sent" with no airplane mode (BR-NET-01);
 *               its first question runs 45 s instead of 20, so "sent" is on screen before the question closes
 *   OPENER-7B   the maths lesson, straight into its prediction opener (no lobby)
 *   DEBATE-7B   the English lesson, straight into its debate opener, which has no right side (OPEN-07)
 *   NUMERIC-7B  the physics lesson, straight into its numeric question (a unit, a minus, a decimal, a tolerance)
 *   ASK-7B      the maths lesson as usual, with a limit of 2 questions to the teacher (the usual limit is 3), so the limit is easy to reach
 *   FOCUS-7B    the maths lesson from the lobby (where the focus notice is shown) into a first question that lasts a minute,
 *               so there is time to leave the quiz and come back (the web focus flag, 7.10)
 * Any other code is unknown (not_found).
 *
 * What the "teacher's console" received (the questions with the sender, the focus events and which were flagged) is kept in
 * localStorage under `teacheraid-mock-console`, so the demo and the tests can look at it; there is no console screen yet.
 *
 * The mock's network is the browser's: while the phone is offline (or this demo is pretending to be), answers
 * and snapshots fail with `network` and the lesson's link drops, so DevTools' offline switch, Playwright's
 * `setOffline` and OFFLINE-ANSWER-7B all exercise the same path as a dead signal.
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
  /** From the opener closing to the first question: the class's votes and reasons are worth reading, so it is longer. */
  afterOpener: 20_000,
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
  /** OFFLINE-ANSWER-7B: how long the network stays gone after the first answer, and how long its first question lasts, so the answer is still open when "sent" arrives. */
  answerOutage: 15_000,
  offlineFirstQuestion: 45_000,
  /** FOCUS-7B: its first question lasts this long, so there is time to leave the quiz during it. */
  focusFirstQuestion: 60_000,
} as const;

/** The server's grace on an answer's own time, past the question's end (PROPOSED, BR-NET-01 and EC-TIME-01; the fake API uses the same). */
export const ANSWER_GRACE_MS = 2000;

let outage: ReturnType<typeof setTimeout> | undefined;
/** Pretend the network is gone for `ms`, in the way the phone would notice it. */
function dropNetwork(ms: number) {
  clearTimeout(outage);
  net.setForcedOffline(true);
  outage = setTimeout(() => net.setForcedOffline(false), ms);
}

const STUDENT_ID = "student-marko";
const N = CLASSMATES.length;
/** How likely each classmate is to be right: a fixed spread so the ranking moves believably. */
const SKILL = CLASSMATES.map((_, i) => 0.35 + ((i * 37) % 40) / 100);

const text = (locale: Locale, key: string) => translate(locale, key as Key);

export type Scenario = "normal" | "late" | "flaky" | "offline-answer" | "opener" | "debate" | "numeric" | "ask" | "focus";

/** Where the mock keeps what its teacher's console received. */
export const MOCK_CONSOLE_KEY = "teacheraid-mock-console";

export type MockConsole = {
  sessionId: string;
  /** Questions to the teacher, with the sender's name: the teacher sees it, classmates never do (BR-ANON-01). */
  asks: { text: string; sender: string; at: number }[];
  /** Focus events, and whether each raised a flag: only a `lost` inside an open question does (AC-FOC-01, AC-FOC-02). */
  focus: { type: string; at: number; sessionQuestionId: string; flagged: boolean }[];
};

/** The opener as the server holds it: the class's schedule, the student's vote and reason, and where the phase is. */
type OpenerLive = {
  question: SessionQuestion;
  def: Quiz["opener"];
  /** The right option as a response ("1"), or null: a debate has no right side. */
  right: string | null;
  phase: OpenerPhase;
  /** When each classmate votes (ms after the opener opened) and for what. */
  votes: { at: number; response: string }[];
  /** When each classmate writes a reason, or null for one who writes none, and what. */
  reasonAt: (number | null)[];
  reasonText: string[];
  mine: { response: string; at: number; key: string } | null;
  myReason: { text: string; at: number; key: string } | null;
  result: QuestionResult | null;
  openedAt: number;
  /** When voting really ended, in server time: the planned time, or earlier when everyone had voted (BR-TIME-04). */
  voteEnd: number;
  /** When the question really ended. */
  end: number;
  closed: boolean;
};

const optionCount = (def: Quiz["opener"]) => (def.kind === "prediction" ? def.options.length : 2);

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
  return q.kind === "mc" ? String(q.answer) : q.kind === "num" ? q.answer : q.answer === 0 ? "true" : "false";
};

/** Whether a response is right for a question: the same answer, or for a number within the author's tolerance. */
const isRight = (q: Quiz["questions"][number], response: string, right: string) =>
  q.kind === "num" ? withinTolerance(response, right, q.tolerance) : response === right;

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
  /** The opener while it is the lesson's current question; null once the first pop-up has opened. */
  private openerNow: OpenerLive | null = null;
  /** Every opener the lesson has run, so a vote or reason that arrives after it moved on can still be judged by its own time. */
  private openers = new Map<string, OpenerLive>();
  private index = -1;
  private points = 0;
  private right = 0;
  private theirs: number[] = CLASSMATES.map(() => 0);
  private board: BoardRow[] | null = null;
  private summary: SessionSummary | null = null;
  private rank = 1;
  private revealed: { id: string; correctAnswer: string } | null = null;
  /** Every question the lesson has opened, so an answer that arrives after the class moved on can still be counted. */
  private lives = new Map<string, Live>();
  /** OFFLINE-ANSWER-7B: the one outage has happened. */
  private outageDone = false;
  /** Questions to the teacher, by key, so a resend is not counted twice (BR-NET-04). */
  private asks = new Map<string, string>();
  private console_: MockConsole;
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
    this.console_ = { sessionId: id, asks: [], focus: [] };
    this.saveConsole();
    if (scenario === "late") {
      // The lesson is already under way: a question has been open for six seconds.
      this.joined = N + 1;
      this.state = "teaching";
      this.fire(0, 6000);
    } else if (scenario === "opener" || scenario === "debate") {
      // Straight into the opener: everyone is already in the room.
      this.joined = N + 1;
      this.fireOpener();
    } else if (scenario === "numeric") {
      this.joined = N + 1;
      this.state = "teaching";
      this.fire(Math.max(0, quiz.questions.findIndex((x) => x.kind === "num")));
    } else {
      this.lobbyTick();
      // The two scenarios about the connection are about the pop-ups, so they go straight to the first one.
      this.after(SCRIPT.start, () => (scenario === "flaky" || scenario === "offline-answer" || scenario === "focus" ? this.fire(0) : this.fireOpener()));
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

  /** How long a question lasts. OFFLINE-ANSWER-7B gives its first one longer than the outage, so the student can watch "sent" arrive. */
  private durationOf(q: Quiz["questions"][number]) {
    if (q === this.quiz.questions[0]) {
      if (this.scenario === "offline-answer") return SCRIPT.offlineFirstQuestion;
      if (this.scenario === "focus") return SCRIPT.focusFirstQuestion;
    }
    return DURATION[q.kind];
  }

  private questionCopy(index: number, firedAt: number): SessionQuestion {
    const q = this.quiz.questions[index];
    const timer = this.durationOf(q) / 1000;
    return {
      id: q.id,
      index,
      total: this.quiz.questions.length,
      kind: q.kind === "mc" ? "multiple_choice" : q.kind === "num" ? "numeric" : "true_false",
      prompt: q.text[this.locale],
      options: q.kind === "mc" ? q.options.map((o) => o[this.locale]) : null,
      status: "open",
      timerSeconds: timer,
      firedAt,
      closesAt: firedAt + timer * 1000,
      numeric: q.kind === "num" ? { unit: q.unit ?? null, tolerance: q.tolerance, allowNegative: q.allowNegative ?? false } : null,
      opener: null,
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
      numeric: q.numeric && { unit: q.numeric.unit, tolerance: q.numeric.tolerance, allow_negative: q.numeric.allowNegative },
      opener: q.opener && { vote_closes_at: iso(q.opener.voteClosesAt), reason_max_length: q.opener.reasonMax },
    };
  }

  /** The teacher fires question `index`; `ago` lets a late joiner arrive after it began. */
  private fire(index: number, ago = 0) {
    if (this.ended) return;
    if (this.state === "lobby" || this.state === "opener") {
      this.state = "teaching";
      this.toClass("state.changed", { state: "teaching" });
    }
    this.openerNow = null;
    this.index = index;
    this.revealed = null;
    const q = this.quiz.questions[index];
    const duration = this.durationOf(q);
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
    this.lives.set(question.id, this.live);
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
    const duration = this.durationOf(q);
    live.question = { ...live.question, status: "closed" };

    const mine = live.mine;
    const correct = mine !== null && isRight(q, mine.response, live.right);
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
      reasonPoints: 0,
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
      correctAnswer: this.answerText(q, live.right),
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

  /** An answer as the summary shows it: the option's words, true or false, or the number with its unit. */
  private answerText(q: Quiz["questions"][number], response: string) {
    if (q.kind === "tf") return text(this.locale, response === "true" ? "q.true" : "q.false");
    if (q.kind === "num") return withUnit(formatNumeric(response, this.locale), q.unit ?? null);
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
    // The tally counts the pop-ups the class got to (a lesson joined at one question never opened the earlier ones); the opener is not one.
    const total = this.played.length;
    this.summary = { right: this.right, total };
    if (total > 0 && this.right === total) actions.markPerfectQuiz();
    actions.finishSession({
      sessionId: this.id,
      courseId: this.subject.id,
      lessonTitle: this.quiz.title[this.locale],
      endedAt: Date.now(),
      right: this.right,
      total,
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

  // ---- The opener (spec 4.3) -----------------------------------------------------------------

  /** The teacher starts the opener: the lesson moves to `opener` and the vote opens. */
  private fireOpener() {
    if (this.ended) return;
    const def = this.quiz.opener;
    this.state = "opener";
    this.toClass("state.changed", { state: "opener" });
    const firedAt = serverNow();
    const voteMs = OPENER_TIMES.vote;
    const total = voteMs + OPENER_TIMES.reason;
    const options = def.kind === "prediction" ? def.options.map((o) => o[this.locale]) : null;
    const question: SessionQuestion = {
      id: def.id,
      index: 0,
      total: this.quiz.questions.length,
      kind: def.kind === "prediction" ? "opener_prediction" : "opener_debate",
      prompt: def.text[this.locale],
      options,
      status: "open",
      timerSeconds: total / 1000,
      firedAt,
      closesAt: firedAt + total,
      numeric: null,
      opener: { voteClosesAt: firedAt + voteMs, reasonMax: REASON_MAX },
    };
    const sides = optionCount(def);
    const votes = CLASSMATES.map((_, i) => {
      const at = 1800 + Math.random() * (Math.random() < 0.85 ? voteMs * 0.6 : voteMs * 0.85 - 1800);
      if (def.kind === "prediction") {
        const wrong = [...Array(sides).keys()].filter((o) => o !== def.answer);
        const right = Math.random() < SKILL[i] + 0.1;
        return { at, response: String(right ? def.answer : wrong[Math.floor(Math.random() * wrong.length)]) };
      }
      return { at, response: Math.random() < def.agreeShare ? "agree" : "disagree" };
    });
    const reasonAt = votes.map((v) => (Math.random() < 0.7 ? v.at + 1500 + Math.random() * 7000 : null));
    const reasonText = votes.map((v, i) => {
      const pool = def.kind === "prediction" ? def.reasons : v.response === "agree" ? def.reasons.agree : def.reasons.disagree;
      return pool[i % pool.length][this.locale];
    });
    const live: OpenerLive = {
      question,
      def,
      right: def.kind === "prediction" ? String(def.answer) : null,
      phase: "voting",
      votes,
      reasonAt,
      reasonText,
      mine: null,
      myReason: null,
      result: null,
      openedAt: Date.now(),
      voteEnd: firedAt + voteMs,
      end: firedAt + total,
      closed: false,
    };
    this.openerNow = live;
    this.openers.set(def.id, live);
    this.live = null;
    this.toClass("question.opened", { question: this.wireQuestion(question) });
    this.after(voteMs, () => this.closeVoting(live));
    this.after(total, () => this.closeOpener(live));
    clearInterval(this.ticker);
    this.ticker = setInterval(() => this.openerProgress(live), SCRIPT.progressTick);
  }

  /** The class's votes so far, one count for each option (or [agree, disagree]); `final` takes everyone's. */
  private countVotes(live: OpenerLive, final: boolean): number[] {
    const elapsed = Date.now() - live.openedAt;
    const counts = Array.from({ length: optionCount(live.def) }, () => 0);
    for (const v of live.votes) if (final || v.at <= elapsed) counts[live.def.kind === "prediction" ? Number(v.response) : v.response === "agree" ? 0 : 1]++;
    if (live.mine) counts[live.def.kind === "prediction" ? Number(live.mine.response) : live.mine.response === "agree" ? 0 : 1]++;
    return counts;
  }

  private openerProgress(live: OpenerLive) {
    if (live.closed || live.phase !== "voting") return;
    const votes = this.countVotes(live, false);
    this.toClass("question.progress", { session_question_id: live.question.id, answered: votes.reduce((a, b) => a + b, 0), joined: N + 1 });
    // The live counts are for the class view; a student's phone shows them once voting has closed.
    this.toClass("opener.counts", { session_question_id: live.question.id, phase: "voting", votes });
  }

  /** Voting ends: by its timer, or because everyone has voted. The counts are final from here on. */
  private closeVoting(live: OpenerLive) {
    if (this.ended || live.closed || live.phase !== "voting") return;
    live.phase = "reasoning";
    live.voteEnd = Math.min(live.voteEnd, serverNow());
    this.toClass("opener.counts", { session_question_id: live.question.id, phase: "reasoning", votes: this.countVotes(live, true) });
  }

  /** The reason window ends: the student's vote and reason are worked out and sent; the reveal follows. */
  private closeOpener(live: OpenerLive) {
    if (this.ended || live.closed) return;
    this.closeVoting(live);
    live.closed = true;
    live.end = Math.min(live.end, serverNow());
    clearInterval(this.ticker);
    this.ticker = undefined;
    live.question = { ...live.question, status: "closed" };
    // The class: a right vote is worth 10 and a written reason 8, right or wrong (BR-PTS-02). A debate has no right vote (OPEN-07).
    this.theirs = this.theirs.map((p, i) => {
      const voteRight = live.right !== null && live.votes[i].response === live.right;
      return p + (voteRight ? CORRECT_POINTS : 0) + (live.reasonAt[i] !== null ? REASON_POINTS : 0);
    });
    this.settleOpener(live, false);
    this.toClass("question.closed", { session_question_id: live.question.id });
    this.sendOpenerResult(live);
    const id = live.question.id;
    this.after(SCRIPT.reveal, () => this.revealOpener(id));
    this.after(SCRIPT.afterOpener, () => this.fire(0));
  }

  /** Work out what the student's vote and reason are worth from what the server holds, and add the difference to their points. */
  private settleOpener(live: OpenerLive, announce: boolean) {
    const before = live.result?.points ?? 0;
    const voteRight = live.right !== null && live.mine !== null && live.mine.response === live.right;
    const reasonPoints = live.myReason ? REASON_POINTS : 0;
    const gain = (voteRight ? CORRECT_POINTS : 0) + reasonPoints;
    this.points += gain - before;
    this.rank = rankOf(this.points, this.theirs);
    live.result = {
      sessionQuestionId: live.question.id,
      // A debate has no right side; a prediction is right or not, and not voting is not right.
      correct: live.right === null ? null : voteRight,
      points: gain,
      reasonPoints,
      speedBonus: 0,
      sessionRank: this.rank,
      correctAnswer: live.question.status === "revealed" ? live.right : null,
      explanation: null,
    };
    this.board = this.makeBoard();
    if (gain > before) actions.addQuizPoints(gain - before);
    if (live.mine) actions.markQuizAnswered();
    if (announce) this.sendOpenerResult(live);
  }

  private sendOpenerResult(live: OpenerLive) {
    const r = live.result!;
    this.toMe("question.result", {
      session_question_id: r.sessionQuestionId,
      correct: r.correct,
      points: r.points,
      reason_points: r.reasonPoints,
      speed_bonus: 0,
      session_rank: r.sessionRank,
      session_points: this.points,
      correct_answer: r.correctAnswer,
      explanation: null,
    });
    this.toClass("leaderboard.updated", { rows: this.wireBoard() });
  }

  /** The anonymous reasons the class wrote (FR-OPN-03): no names, the student's own left out, each wording once. */
  private classReasons(live: OpenerLive) {
    return [...new Set(live.reasonText.filter((_, i) => live.reasonAt[i] !== null))];
  }

  private revealOpener(id: string) {
    const live = this.openers.get(id);
    if (!live || this.ended || live.question.status === "revealed") return;
    live.question = { ...live.question, status: "revealed" };
    if (live.result) live.result = { ...live.result, correctAnswer: live.right };
    this.toClass("opener.counts", { session_question_id: id, phase: "revealed", votes: this.countVotes(live, true) });
    this.toClass("opener.reasons", { session_question_id: id, reasons: this.classReasons(live) });
    this.toClass("question.revealed", { session_question_id: id, correct_answer: live.right, explanation: null });
  }

  /** POST /sessions/{id}/opener/vote. */
  submitVote(answer: AnswerInput): AnswerReceipt {
    if (this.ended) throw new ApiError("session_ended");
    if (this.keys.has(answer.idempotencyKey)) return { accepted: true, duplicate: true };
    const live = this.openers.get(answer.sessionQuestionId);
    if (!live) throw new ApiError("not_found");
    // Judged by the vote's own time against the end of voting, with the same little grace as an answer.
    if (answer.answeredAt > live.voteEnd + ANSWER_GRACE_MS) throw new ApiError("question_closed");
    if (live.mine) throw new ApiError("already_answered");
    const valid = live.def.kind === "prediction" ? live.def.options.map((_, i) => String(i)) : ["agree", "disagree"];
    if (!valid.includes(answer.response)) throw new ApiError("validation_failed");
    const at = Math.min(live.voteEnd, Math.max(live.question.firedAt!, answer.answeredAt));
    live.mine = { response: answer.response, at, key: answer.idempotencyKey };
    this.keys.set(answer.idempotencyKey, answer.response);
    if (live.closed) {
      this.settleOpener(live, true);
      return { accepted: true, duplicate: false };
    }
    if (live.phase === "voting") {
      // Once you have voted, the stragglers come in within a few seconds, and voting ends when the last of them has (BR-TIME-04).
      const elapsed = Date.now() - live.openedAt;
      live.votes = live.votes.map((v) => (v.at > elapsed ? { ...v, at: elapsed + 600 + Math.random() * 3200 } : v));
      const lastAt = Math.max(...live.votes.map((v) => v.at));
      if (lastAt < OPENER_TIMES.vote) this.after(Math.max(0, live.openedAt + lastAt - Date.now()), () => this.closeVoting(live));
      this.openerProgress(live);
    }
    return { accepted: true, duplicate: false };
  }

  /** POST /sessions/{id}/opener/reason. */
  submitReason(answer: AnswerInput): AnswerReceipt {
    if (this.ended) throw new ApiError("session_ended");
    if (this.keys.has(answer.idempotencyKey)) return { accepted: true, duplicate: true };
    const live = this.openers.get(answer.sessionQuestionId);
    if (!live) throw new ApiError("not_found");
    if (answer.answeredAt > live.end + ANSWER_GRACE_MS) throw new ApiError("question_closed");
    // A reason belongs to a vote (a reason given to nothing is nothing), and is one line of at most the limit (EC-Q-02).
    if (!live.mine) throw new ApiError("validation_failed");
    if (live.myReason) throw new ApiError("already_answered");
    const text = cleanReason(answer.response, REASON_MAX);
    if (text === "") throw new ApiError("validation_failed");
    const at = Math.min(live.end, Math.max(live.mine.at, answer.answeredAt));
    live.myReason = { text, at, key: answer.idempotencyKey };
    this.keys.set(answer.idempotencyKey, text);
    if (live.closed) {
      this.settleOpener(live, true);
      return { accepted: true, duplicate: false };
    }
    // The stragglers write theirs within a few seconds, and the question ends when the last has (BR-TIME-04).
    const elapsed = Date.now() - live.openedAt;
    live.reasonAt = live.reasonAt.map((t) => (t !== null && t > elapsed ? elapsed + 600 + Math.random() * 3000 : t));
    const lastAt = Math.max(elapsed, ...live.reasonAt.filter((t): t is number => t !== null));
    if (lastAt < OPENER_TIMES.vote + OPENER_TIMES.reason) this.after(Math.max(0, live.openedAt + lastAt - Date.now()), () => this.closeOpener(live));
    return { accepted: true, duplicate: false };
  }

  // ---- Questions to the teacher and the focus flag ------------------------------------------------

  /** How many questions to the teacher the student may send in this lesson (BR-ANON-02). ASK-7B lowers it to 2. */
  get anonLimit() {
    return this.scenario === "ask" ? 2 : ANON_LIMIT;
  }

  anonCount(): AnonCount {
    return { used: this.asks.size, limit: this.anonLimit };
  }

  private saveConsole() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(MOCK_CONSOLE_KEY, JSON.stringify(this.console_));
    } catch {
      // blocked storage: only the look into the console is lost
    }
  }

  /** POST /sessions/{id}/anon-questions. Stored with the sender; nothing is sent to the class (FR-ANON-02). */
  submitAsk(ask: AskInput): AnswerReceipt {
    if (this.ended) throw new ApiError("session_ended");
    if (this.asks.has(ask.idempotencyKey)) return { accepted: true, duplicate: true };
    const text = cleanAsk(ask.text, ANON_MAX_LENGTH);
    if (text === "") throw new ApiError("validation_failed");
    if (this.asks.size >= this.anonLimit) throw new ApiError("limit_reached");
    this.asks.set(ask.idempotencyKey, text);
    this.console_.asks.push({ text, sender: STUDENT_ID, at: ask.askedAt });
    this.saveConsole();
    return { accepted: true, duplicate: false };
  }

  /** POST /sessions/{id}/focus-events. A `lost` raises a flag only inside the question's open window (AC-FOC-01, AC-FOC-02). */
  recordFocus(events: FocusEventInput[]) {
    if (this.ended) throw new ApiError("session_ended");
    for (const e of events) {
      const q = this.lives.get(e.sessionQuestionId)?.question ?? this.openers.get(e.sessionQuestionId)?.question;
      if (!q) throw new ApiError("not_found");
      const flagged = e.type === "lost" && q.firedAt !== null && q.closesAt !== null && e.at >= q.firedAt && e.at <= q.closesAt;
      // The same event again (same type, time and question) is one event.
      if (this.console_.focus.some((f) => f.type === e.type && f.at === e.at && f.sessionQuestionId === e.sessionQuestionId)) continue;
      this.console_.focus.push({ type: e.type, at: e.at, sessionQuestionId: e.sessionQuestionId, flagged });
    }
    this.saveConsole();
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
    const opener = this.openerNow;
    if (opener) {
      return {
        session: this.snapshotOf(),
        serverNow: serverNow(),
        question: opener.question,
        myResponse: opener.mine?.response ?? null,
        myReason: opener.myReason?.text ?? null,
        result: opener.result,
        sessionPoints: this.points,
        sessionRank: this.rank,
        board: this.board,
        progress: opener.phase === "voting" ? { answered: this.countVotes(opener, false).reduce((a, b) => a + b, 0), joined: N + 1 } : null,
        summary: this.summary,
        anon: this.anonCount(),
        opener: {
          phase: opener.question.status === "revealed" ? "revealed" : opener.phase,
          votes: this.countVotes(opener, opener.phase !== "voting"),
          reasons: opener.question.status === "revealed" ? this.classReasons(opener) : [],
        },
      };
    }
    return {
      session: this.snapshotOf(),
      serverNow: serverNow(),
      question: live ? live.question : null,
      myResponse: live?.mine?.response ?? null,
      myReason: null,
      opener: null,
      result: live?.result ?? null,
      sessionPoints: this.points,
      sessionRank: this.rank,
      board: this.board,
      progress: live && live.question.status === "open" ? this.progressOf(live) : null,
      summary: this.summary,
      anon: this.anonCount(),
    };
  }

  /**
   * An answer given in time but delivered after its question closed is counted (BR-NET-01, EC-NET-02): the
   * result is worked out again with the time the student gave, and sent to them as a corrected `question.result`.
   */
  private creditLate(live: Live) {
    const q = this.quiz.questions.find((x) => x.id === live.question.id)!;
    const mine = live.mine!;
    const duration = this.durationOf(q);
    const correct = isRight(q, mine.response, live.right);
    const left = Math.max(0, duration - (mine.at - live.question.firedAt!));
    const bonus = correct ? speedBonus(left, duration) : 0;
    const gain = correct ? CORRECT_POINTS + bonus : 0;
    const before = live.result?.points ?? 0;
    this.points += gain - before;
    this.right += correct && !live.result?.correct ? 1 : 0;
    this.rank = rankOf(this.points, this.theirs);
    live.result = { ...live.result!, correct, points: gain, speedBonus: bonus, sessionRank: this.rank };
    this.board = this.makeBoard();
    const played = this.played.find((p) => p.id === q.id);
    if (played) {
      played.correct = correct;
      played.yourAnswer = this.answerText(q, mine.response);
    }
    if (gain > before) actions.addQuizPoints(gain - before);
    actions.markQuizAnswered();
    this.toMe("question.result", {
      session_question_id: live.question.id,
      correct,
      points: gain,
      speed_bonus: bonus,
      session_rank: this.rank,
      session_points: this.points,
      correct_answer: live.result.correctAnswer,
      explanation: null,
    });
    this.toClass("leaderboard.updated", { rows: this.wireBoard() });
  }

  /** Whether the server would take this as an answer to the question: an option, true or false, or a number it can read. */
  private validAnswer(q: Quiz["questions"][number], response: string) {
    if (q.kind === "num") return parseNumeric(response, q.allowNegative ?? false).ok;
    return (q.kind === "mc" ? ["0", "1", "2", "3"] : ["true", "false"]).includes(response);
  }

  /** POST /sessions/{id}/answers. */
  submit(answer: AnswerInput): AnswerReceipt {
    if (this.ended) throw new ApiError("session_ended");
    if (this.keys.has(answer.idempotencyKey)) return { accepted: true, duplicate: true };
    const live = this.lives.get(answer.sessionQuestionId);
    if (!live) throw new ApiError("not_found");
    // The one outage of OFFLINE-ANSWER-7B: the signal goes just as the first answer is sent.
    if (this.scenario === "offline-answer" && !this.outageDone) {
      this.outageDone = true;
      dropNetwork(SCRIPT.answerOutage);
      throw new ApiError("network");
    }
    const open = live.question.status === "open";
    // The answer's own time decides, not when it arrived: in the window (with a little grace), it counts.
    if (!open && answer.answeredAt > live.question.closesAt! + ANSWER_GRACE_MS) throw new ApiError("question_closed");
    if (live.mine) throw new ApiError("already_answered");
    const q = this.quiz.questions.find((x) => x.id === live.question.id)!;
    if (!this.validAnswer(q, answer.response)) throw new ApiError("validation_failed");

    // The answer time is the phone's claim, clamped to the question's window (EC-NET-07). A number is kept as the server reads it.
    const at = Math.min(live.question.closesAt!, Math.max(live.question.firedAt!, answer.answeredAt));
    const kept = q.kind === "num" ? parseNumeric(answer.response, q.allowNegative ?? false) : null;
    const response = kept?.ok ? kept.value : answer.response;
    live.mine = { response, at, key: answer.idempotencyKey };
    this.keys.set(answer.idempotencyKey, response);
    if (!open) {
      this.creditLate(live);
      return { accepted: true, duplicate: false };
    }

    // Once you have answered, the stragglers come in within a few seconds, and the question closes
    // when the last of them has (BR-TIME-04).
    const elapsed = Date.now() - live.openedAt;
    // (OFFLINE-ANSWER-7B waits longer, so "sent" is on screen for a few seconds before the class has all answered.)
    const lag = this.scenario === "offline-answer" ? 5000 : 600;
    live.answerAt = live.answerAt.map((t) => (t > elapsed ? elapsed + lag + Math.random() * 3200 : t));
    const duration = this.durationOf(q);
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
  offlineAnswer: "offline-answer-7b",
  opener: "opener-7b",
  debate: "debate-7b",
  numeric: "numeric-7b",
  ask: "ask-7b",
  focus: "focus-7b",
} as const;

/** The scenarios that open on a given question with the student already in the room. */
const JUMPS: Scenario[] = ["opener", "debate", "numeric"];

const MATH = subjectByCode("MATH-7B")!;
const ENGLISH = subjectByCode("ENG-7B")!;
const PHYSICS = subjectByCode("PHYS-7B")!;

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
  if (c === SPECIAL.offlineAnswer) return { subject: MATH, scenario: "offline-answer" };
  if (c === SPECIAL.opener) return { subject: MATH, scenario: "opener" };
  if (c === SPECIAL.debate) return { subject: ENGLISH, scenario: "debate" };
  if (c === SPECIAL.numeric) return { subject: PHYSICS, scenario: "numeric" };
  if (c === SPECIAL.ask) return { subject: MATH, scenario: "ask" };
  if (c === SPECIAL.focus) return { subject: MATH, scenario: "focus" };
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
  // The codes that jump into a question put the student in the room from the start; any other lesson joined after the lobby is late.
  session.joinedLate ??= session.state !== "lobby" && !JUMPS.includes(session.scenario);
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
  clearTimeout(outage);
  net.setForcedOffline(false);
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
    if (!session || Date.now() < session.outageUntil || net.isOffline()) {
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
    // A phone that loses its signal loses the link with it.
    const lost = () => {
      if (open && net.isOffline()) handlers.closed();
    };
    if (typeof window !== "undefined") window.addEventListener("offline", lost);
    return {
      close: () => {
        open = false;
        clearTimeout(opening);
        stop();
        if (typeof window !== "undefined") window.removeEventListener("offline", lost);
      },
    };
  };
  return new ChannelTransport(connect);
}
