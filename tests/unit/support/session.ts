import type {
  QuestionResult,
  SessionEvent,
  SessionQuestion,
  SessionSnapshot,
  StudentSessionState,
} from "@/lib/app/api/types";
import { createEngine, reduce, type Action, type EngineState } from "@/lib/app/session/engine";

/** Server time zero for the session tests; the phone's clock is set against it per test. */
export const T0 = 1_800_000_000_000;

export const session = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  id: "s1",
  courseId: "math",
  state: "teaching",
  lessonTitle: "Linear equations",
  questionCount: 5,
  joinedCount: 20,
  ...over,
});

/** Question number `n` (1-based), fired `n * 30 s` into the lesson with a 20 s timer, open. */
export const question = (n: number, over: Partial<SessionQuestion> = {}): SessionQuestion => {
  const firedAt = T0 + n * 30_000;
  return {
    id: `q${n}`,
    index: n - 1,
    total: 5,
    kind: "multiple_choice",
    prompt: `Question ${n}`,
    options: ["a", "b", "c", "d"],
    status: "open",
    timerSeconds: 20,
    firedAt,
    closesAt: firedAt + 20_000,
    ...over,
  };
};

export const result = (n: number, over: Partial<QuestionResult> = {}): QuestionResult => ({
  sessionQuestionId: `q${n}`,
  correct: true,
  points: 13,
  speedBonus: 3,
  sessionRank: 4,
  correctAnswer: "1",
  explanation: null,
  ...over,
});

export const snapshot = (over: Partial<StudentSessionState> = {}): StudentSessionState => ({
  session: session(),
  serverNow: T0,
  question: null,
  myResponse: null,
  result: null,
  sessionPoints: 0,
  sessionRank: 5,
  board: null,
  progress: null,
  summary: null,
  ...over,
});

export const events = {
  opened: (n: number, serverNow = question(n).firedAt!, over: Partial<SessionQuestion> = {}): SessionEvent => ({
    type: "question.opened",
    serverNow,
    question: question(n, over),
  }),
  closed: (n: number, serverNow: number): SessionEvent => ({ type: "question.closed", serverNow, sessionQuestionId: `q${n}` }),
  revealed: (n: number, serverNow: number, correctAnswer = "1"): SessionEvent => ({
    type: "question.revealed",
    serverNow,
    sessionQuestionId: `q${n}`,
    correctAnswer,
    explanation: null,
  }),
  result: (n: number, serverNow: number, over: Partial<QuestionResult> = {}, sessionPoints = 13): SessionEvent => ({
    type: "question.result",
    serverNow,
    result: result(n, over),
    sessionPoints,
  }),
  state: (state: SessionSnapshot["state"], serverNow: number): SessionEvent => ({ type: "state.changed", serverNow, state }),
  skipped: (n: number, serverNow: number): SessionEvent => ({ type: "question.skipped", serverNow, sessionQuestionId: `q${n}` }),
  ended: (serverNow: number): SessionEvent => ({
    type: "session.ended",
    serverNow,
    summary: { right: 3, total: 5 },
    sessionPoints: 31,
    sessionRank: 2,
  }),
};

/** The engine after these actions, from a new one for the student `me` in session `s1`. */
export const play = (...actions: Action[]): EngineState => actions.reduce(reduce, createEngine({ sessionId: "s1", meId: "me" }));
export const from = (state: EngineState, ...actions: Action[]): EngineState => actions.reduce(reduce, state);

/** A snapshot taken and received at the same local time, on a phone whose clock is `skew` ms ahead of the server's. */
export const snap = (snapshot_: StudentSessionState, skew = 0): Action => {
  const local = snapshot_.serverNow + skew;
  return { type: "snapshot", snapshot: snapshot_, sentAt: local, receivedAt: local };
};

export const event = (event_: SessionEvent, receivedAt = 0): Action => ({ type: "event", event: event_, receivedAt });
