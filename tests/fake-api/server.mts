/**
 * A tiny stand-in for the TeacherAid API, for the live-mode smoke test: just enough of spec 11.1
 * under /api/v1 for Home, Alerts and Profile to render from real HTTP. Run with Node 22.18+ (it
 * strips the types itself): `node tests/fake-api/server.mts`.
 *
 * Control endpoints for a test (not part of the API):
 *   GET  /__control/state          what the server holds, including the calls it received
 *   POST /__control/reset          back to the starting data
 *   POST /__control/signed-out     answer 401 `unauthenticated` to every call until the student signs in
 *   POST /__control/elsewhere      answer 401 `signed_in_elsewhere` to every call until the student signs in
 *   POST /__control/redirect       make sign-in answer with a redirect to the school's identity provider
 *   POST /__control/expire-code    make the emailed code stop working
 *
 * Sign-in is the proposed `/auth/student/start` and `/auth/student/verify`: the roster is one email,
 * the code is CODE, three wrong codes lock it for LOCK_SECONDS, and the session is a flag (the real
 * one is an httpOnly cookie, which a single test browser does not need to tell apart).
 *
 * A live session, student side: `POST /sessions/join`, `GET /sessions/{id}/student-state`, `POST
 * /sessions/{id}/answers` and the PROPOSED event stream `GET /realtime?channels=` (Server-Sent Events,
 * lib/app/session/sse.ts). The test plays the teacher through the control endpoints; nothing here moves
 * by itself, so a test decides when a question opens and closes:
 *   POST /__control/session/state     { state }                lobby | opener | teaching | review | ended
 *   POST /__control/session/fire      { index, timer? }        open question `index` of the lesson (timer in seconds, default 60)
 *   POST /__control/session/progress  { answered }             how many have answered
 *   POST /__control/session/close                              close the open question and send the student's result
 *   POST /__control/session/reveal                             show the right answer
 *   POST /__control/session/skip                               skip the open question
 *   POST /__control/session/end                                end the session: results, rank and the tally
 *   POST /__control/session/joined    { count }                the class gathering in the lobby
 *   POST /__control/session/opener    { kind?, vote?, reason? } start the opener: "prediction" (default) or "debate", with the seconds each part lasts (30 and 45)
 *   POST /__control/session/opener-voting-end                  voting closes: the class's final votes go out
 *   POST /__control/session/opener-close                       the opener ends: the student's vote and reason are worked out and sent
 *   POST /__control/session/opener-reveal                      the teacher reveals: the right answer, the final votes, the anonymous reasons
 *   POST /__control/session/anon-limit { limit }               how many questions to the teacher a student may send (3, BR-ANON-02)
 *   POST /__control/session/elsewhere                          tell the student's channel they signed in on another device
 *   POST /__control/skew              { ms }                   the server's clock runs this far ahead of the machine's
 *   POST /__control/drop-streams                               cut every event stream (the app reconnects)
 *   POST /__control/block-streams     { on }                   refuse new event streams while on
 *   POST /__control/expire-token                               the class code now answers token_expired (it rotated)
 *
 * Answers follow BR-NET-01: an answer counts by the time the student gave (`answered_at`), not by when it
 * arrives. It is accepted, and its question's result is worked out again and sent to the student as a
 * corrected `question.result`, when that time is no later than the question's `closes_at` plus GRACE_MS
 * (2 s, PROPOSED) and the session has not ended; later than that is refused as `question_closed`, and an
 * answer to a skipped question is refused the same way (EC-NET-03). A repeat of a key is `duplicate`, a
 * different key for a question already answered is `already_answered`. Closing a question early moves its
 * `closes_at` back to now, as a real server's early close does (BR-TIME-04).
 * The opener (spec 4.3) takes `POST /sessions/{id}/opener/vote` (an answer's body) and `/opener/reason` (`text`
 * instead of `response`), judged like answers: by the time the student gave, with the same grace, one of each,
 * a key seen before is `duplicate`. A reason needs a vote. A right prediction is worth 10, a written reason 8
 * whatever the vote (BR-PTS-02), a debate has no right side (OPEN-07). The fourth question of the lesson is a
 * number: 7 divided by 4, within 0.01, no minus. The server reads a comma or a point and keeps the number as text.
 * A question to the teacher (F-09) is `POST /sessions/{id}/anon-questions` (`text`, `asked_at`, `idempotency_key`): stored with the
 * sender (state.session.asks), a key seen before is `duplicate`, one past the limit is `limit_reached` (409), an empty text
 * `validation_failed`, a finished lesson `session_ended`; the text is trimmed, its white space collapsed and cut to ASK_MAX. The
 * snapshot says how many are used and the limit (`anon_questions`). The focus flag is `POST /sessions/{id}/focus-events`, a bare
 * array of `{ type, at, session_question_id }`: a `lost` inside that question's window is flagged, anything else is only stored
 * (AC-FOC-01, AC-FOC-02), the same event twice is one, and every batch is kept in state.session.focusBatches to see how they came.
 * Class codes: LIVE-7B joins; EXPIRED-7B, OTHER-8A and ENDED-7B are refused as the API would; any other is unknown.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  WireAttendance,
  WireBadge,
  WireCourse,
  WireLeaderboard,
  WireNotification,
  WireResult,
  WireStudent,
} from "../../lib/app/api/wire";

const PORT = Number(process.env.FAKE_API_PORT ?? 3101);

const ROSTER = ["live.student@school.example"];
const CODE = "424242";
const WRONG_ALLOWED = 3;
const LOCK_SECONDS = 2;
/** How far past a question's end an answer's own time may be and still count (PROPOSED, BR-NET-01, EC-TIME-01). */
const GRACE_MS = 2000;

/** An origin on this machine, which is the only kind a test browser sends. */
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const DAY = 86_400_000;

const subject = (id: string, name: string) => ({ id, name });
const COURSES: WireCourse[] = [
  { id: "c-math", subject: subject("math", "Mathematics"), teacher: { name: "J. Milev" }, class: { id: "cl-7b", name: "7B" } },
  { id: "c-eng", subject: subject("english", "English"), teacher: { name: "A. Stojanova" }, class: { id: "cl-7b", name: "7B" } },
  { id: "c-phys", subject: subject("physics", "Physics"), teacher: { name: "S. Petrov" }, class: { id: "cl-7b", name: "7B" } },
];


// ---- A live session ---------------------------------------------------------------------------------

type LessonQuestion = {
  id: string;
  kind: "multiple_choice" | "true_false" | "numeric";
  prompt: string;
  options: string[] | null;
  correct: string;
  numeric?: { unit: string | null; tolerance: number; allow_negative: boolean };
};
const LESSON: LessonQuestion[] = [
  { id: "fq1", kind: "multiple_choice", prompt: "2x = 10. What is x?", options: ["2", "5", "10", "20"], correct: "1" },
  { id: "fq2", kind: "true_false", prompt: "A triangle has four sides.", options: null, correct: "false" },
  { id: "fq3", kind: "multiple_choice", prompt: "What is 7 x 8?", options: ["54", "56", "58", "64"], correct: "1" },
  { id: "fq4", kind: "numeric", prompt: "What is 7 divided by 4?", options: null, correct: "1.75", numeric: { unit: null, tolerance: 0.01, allow_negative: false } },
];

/** What the opener asks, by kind; the class's votes are fixed, the student's is added to them. */
const OPENERS = {
  prediction: {
    id: "fo1",
    kind: "opener_prediction",
    prompt: "Which is the biggest fraction?",
    options: ["1/2", "1/3", "1/4"],
    correct: "0",
    class: [9, 3, 1],
    reasons: ["Half is more than a third.", "The bigger the bottom, the smaller the piece."],
  },
  debate: {
    id: "fo2",
    kind: "opener_debate",
    prompt: "Homework should be optional.",
    options: null,
    correct: null,
    class: [4, 8],
    reasons: ["I learn more when I choose.", "Without it nobody would practise."],
  },
} as const;
const REASON_MAX = 80;
/** The longest question to the teacher (PROPOSED, the app's ANON_MAX_LENGTH). */
const ASK_MAX = 280;
const SESSION_ID = "se-live-1";
const STUDENT_ID = "st-1";
type SessionStateName = "lobby" | "opener" | "teaching" | "review" | "ended";

type Live = { id: string; index: number; status: "open" | "closed" | "revealed" | "skipped"; firedAt: number; closesAt: number; timer: number };

function newSession() {
  return {
    state: "lobby" as SessionStateName,
    joined: 12,
    joinedStudent: false,
    joinedLate: false,
    current: null as Live | null,
    /** Every question the lesson has opened, by id, so an answer that arrives after the class moved on is judged by its own question. */
    fired: {} as Record<string, Live>,
    answers: {} as Record<string, { response: string; key: string; answeredAt: number; receivedAt: number }>,
    results: {} as Record<string, { correct: boolean; points: number; speedBonus: number; rank: number }>,
    revealed: [] as string[],
    answered: 0,
    points: 0,
    rank: 5,
    right: 0,
    summary: null as null | { right: number; total: number },
    /** The opener the teacher started, while it is the lesson's current question. */
    opener: null as null | OpenerLive,
    /** Questions to the teacher, with the sender (the teacher sees it; no student endpoint returns it). */
    asks: [] as { key: string; text: string; askedAt: number; sender: string }[],
    askLimit: 3,
    /** Focus events, and whether each raised a flag on the console. */
    focus: [] as { type: string; at: number; sessionQuestionId: string; flagged: boolean }[],
    /** Every request that carried focus events, as it came: to see that they were batched. */
    focusBatches: [] as { type: string; at: string; session_question_id: string }[][],
  };
}

type OpenerLive = {
  kind: "prediction" | "debate";
  status: "open" | "closed" | "revealed";
  phase: "voting" | "reasoning" | "revealed";
  firedAt: number;
  voteClosesAt: number;
  /** When voting really ended, which may be earlier than planned. */
  voteEnd: number;
  closesAt: number;
  mine: null | { response: string; key: string; answeredAt: number };
  reason: null | { text: string; key: string; answeredAt: number };
  result: null | { correct: boolean | null; points: number; reasonPoints: number };
};

const initial = () => ({
  /** Why every call is refused, or null while the student is signed in. */
  signedOut: null as null | "unauthenticated" | "signed_in_elsewhere",
  /** What `start` answers: a code to type, or a redirect to an identity provider. */
  method: "code" as "code" | "redirect",
  codeExpired: false,
  wrongCodes: 0,
  lockedUntil: 0,
  student: {
    id: "st-1",
    full_name: "Live Student",
    school_email: "live.student@school.example",
    display_name: null,
    photo_url: null,
    school: { id: "sc-1", name: "Test School" },
    class: { id: "cl-7b", name: "7B" },
    settings: { notifications_on: true, locale: "en" },
  } as WireStudent,
  notifications: [
    {
      id: "n-1",
      kind: "result_ready",
      payload: { course_id: "c-math", subject_id: "math", subject_name: "Mathematics", session_id: "se-1", right: 4, total: 5 },
      created_at: iso(DAY),
      read_at: null,
    },
    {
      id: "n-2",
      kind: "marked_late",
      payload: { course_id: "c-phys", subject_id: "physics", subject_name: "Physics", date: iso(3 * DAY) },
      created_at: iso(3 * DAY),
      read_at: null,
    },
    {
      id: "n-3",
      kind: "generic",
      payload: { title: "Parents evening", body: "On Thursday at 18:00." },
      created_at: iso(5 * DAY),
      read_at: iso(4 * DAY),
    },
  ] as WireNotification[],
  /** The live session a student joins with LIVE-7B. */
  session: newSession(),
  /** Results of live sessions that have ended, ahead of the fixed ones. */
  endedResults: [] as WireResult[],
  /** The server's clock runs this far ahead of this machine's. */
  skewMs: 0,
  blockStreams: false,
  tokenExpired: false,
  /** Every request the server saw, as "METHOD path", for a test to look at. */
  calls: [] as string[],
  /** The last body of each write, by "METHOD path". */
  bodies: {} as Record<string, unknown>,
});

let state = initial();

const ATTENDANCE: WireAttendance = {
  attended: 18,
  total: 20,
  percent: 90,
  percent_week_ago: 88,
  log: [
    { id: "a-1", course_id: "c-math", subject: subject("math", "Mathematics"), date: iso(DAY), status: "present", joined_at: null },
    { id: "a-2", course_id: "c-phys", subject: subject("physics", "Physics"), date: iso(3 * DAY), status: "late", joined_at: null },
  ],
};

const RESULTS: WireResult[] = [
  {
    session_id: "se-1",
    course_id: "c-math",
    subject: subject("math", "Mathematics"),
    lesson_title: "Linear equations",
    ended_at: iso(DAY),
    right: 4,
    total: 5,
    questions: [
      { id: "q-1", prompt: "2x = 10, x = ?", correct: true, correct_answer: "5", your_answer: "5" },
      { id: "q-2", prompt: "3x + 1 = 10, x = ?", correct: false, correct_answer: "3", your_answer: "4" },
    ],
  },
];

const LEADERBOARD = (): WireLeaderboard => ({
  scope: "class",
  season: null,
  rows: [
    { student_id: "st-9", name: "Ana G.", points: 140, rank: 1, is_me: false },
    { student_id: "st-8", name: "Luka S.", points: 120, rank: 2, is_me: false },
    { student_id: "st-1", name: state.student.display_name ?? state.student.full_name, points: 95, rank: 3, is_me: true },
    { student_id: "st-7", name: "Mila J.", points: 80, rank: 4, is_me: false },
  ],
});

const BADGES: WireBadge[] = [
  { code: "answer", title: "First answer", points: 20, earned: true, awarded_at: iso(2 * DAY) },
  { code: "ontime", title: "On time", points: 20, earned: false, awarded_at: null },
  { code: "perfect", title: "Perfect quiz", points: 20, earned: false, awarded_at: null },
];


/** Open event streams, with the channels each asked for. */
const streams = new Set<{ res: ServerResponse; channels: string[] }>();

const nowMs = () => Date.now() + state.skewMs;
const nowIso = () => new Date(nowMs()).toISOString();
const channelOf = (kind: "public" | "student") => (kind === "public" ? `session.${SESSION_ID}.public` : `student.${STUDENT_ID}`);

/** One event to every stream listening to the channel, in the proposed format of lib/app/session/sse.ts. */
function broadcast(kind: "public" | "student", type: string, data: Record<string, unknown> = {}) {
  const channel = channelOf(kind);
  const frame = `event: ${type}\ndata: ${JSON.stringify({ channel, server_now: nowIso(), ...data })}\n\n`;
  for (const s of streams) if (s.channels.includes(channel)) s.res.write(frame);
}

const wireSession = () => ({
  id: SESSION_ID,
  course_id: "c-math",
  state: state.session.state,
  lesson_title: "Linear equations",
  question_count: LESSON.length,
  joined_count: state.session.joined,
});

const wireQuestion = (cur: Live) => {
  const q = LESSON[cur.index];
  return {
    id: q.id,
    index: cur.index,
    total: LESSON.length,
    kind: q.kind,
    prompt: q.prompt,
    options: q.options,
    status: cur.status,
    timer_seconds: cur.timer,
    fired_at: new Date(cur.firedAt).toISOString(),
    closes_at: new Date(cur.closesAt).toISOString(),
    numeric: q.numeric ?? null,
    opener: null,
  };
};

/** A number the way the server reads it: a comma or a point, at most one, a minus only where allowed; kept as text with a point. */
function readNumber(raw: string, allowNegative: boolean): string | null {
  const m = /^\s*(-?)(\d+)(?:[.,](\d+))?\s*$/.exec(raw);
  if (!m || (m[1] && !allowNegative)) return null;
  return `${m[1]}${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

const isRight = (q: LessonQuestion, response: string) =>
  q.kind === "numeric" ? Math.abs(Number(response) - Number(q.correct)) <= (q.numeric?.tolerance ?? 0) + 1e-9 : response === q.correct;

// ---- The opener ----------------------------------------------------------------------------------------

const wireOpener = (o: OpenerLive) => {
  const def = OPENERS[o.kind];
  return {
    id: def.id,
    index: 0,
    total: LESSON.length,
    kind: def.kind,
    prompt: def.prompt,
    options: def.options,
    status: o.status,
    timer_seconds: (o.closesAt - o.firedAt) / 1000,
    fired_at: new Date(o.firedAt).toISOString(),
    closes_at: new Date(o.closesAt).toISOString(),
    numeric: null,
    opener: { vote_closes_at: new Date(o.voteClosesAt).toISOString(), reason_max_length: REASON_MAX },
  };
};

/** The class's votes plus the student's, one count for each option or side. */
const countsOf = (o: OpenerLive) => {
  const base: number[] = [...OPENERS[o.kind].class];
  if (o.mine) base[o.kind === "prediction" ? Number(o.mine.response) : o.mine.response === "agree" ? 0 : 1]++;
  return base;
};

/** What the student's vote and reason are worth from what the server holds (BR-PTS-02). */
function settleOpener(o: OpenerLive) {
  const def = OPENERS[o.kind];
  const voteRight = def.correct !== null && o.mine?.response === def.correct;
  const reasonPoints = o.reason ? 8 : 0;
  const points = (voteRight ? 10 : 0) + reasonPoints;
  const before = o.result?.points ?? 0;
  state.session.points += points - before;
  o.result = { correct: def.correct === null ? null : voteRight, points, reasonPoints };
}

const openerResultBody = (o: OpenerLive) => ({
  session_question_id: OPENERS[o.kind].id,
  correct: o.result!.correct,
  points: o.result!.points,
  reason_points: o.result!.reasonPoints,
  speed_bonus: 0,
  session_rank: state.session.rank,
  session_points: state.session.points,
  correct_answer: o.status === "revealed" ? OPENERS[o.kind].correct : null,
  explanation: null,
});

/** The opener's own two endpoints. The same rules as an answer: the student's own time decides, one of each, a repeated key is a duplicate. */
function openerGive(res: ServerResponse, part: "vote" | "reason", body: { session_question_id?: string; response?: string; text?: string; answered_at?: string; idempotency_key?: string }) {
  const sess = state.session;
  if (sess.state === "ended") return fail(res, 410, "session_ended");
  const o = sess.opener;
  if (!o || OPENERS[o.kind].id !== body.session_question_id) return fail(res, 404, "not_found");
  const key = body.idempotency_key ?? "";
  const had = part === "vote" ? o.mine : o.reason;
  if (had) return had.key === key ? send(res, 200, { accepted: true, duplicate: true }) : fail(res, 409, "already_answered");
  const claimed = Date.parse(body.answered_at ?? "");
  const at = Number.isNaN(claimed) ? nowMs() : claimed;
  if (part === "vote") {
    const valid = o.kind === "prediction" ? ["0", "1", "2"] : ["agree", "disagree"];
    if (!body.response || !valid.includes(body.response)) return fail(res, 422, "validation_failed");
    if (at > o.voteEnd + GRACE_MS) return fail(res, 409, "question_closed");
    o.mine = { response: body.response, key, answeredAt: Math.min(o.voteEnd, Math.max(o.firedAt, at)) };
  } else {
    // A reason belongs to a vote, is one line, and is cut to the limit.
    const text = (body.text ?? "").replace(/\s+/g, " ").trim().slice(0, REASON_MAX);
    if (!o.mine || text === "") return fail(res, 422, "validation_failed");
    if (at > o.closesAt + GRACE_MS) return fail(res, 409, "question_closed");
    o.reason = { text, key, answeredAt: Math.min(o.closesAt, Math.max(o.mine.answeredAt, at)) };
  }
  // It arrived after the opener closed: the result the student has was worked out without it.
  if (o.status !== "open") {
    settleOpener(o);
    broadcast("student", "question.result", openerResultBody(o));
    broadcast("public", "leaderboard.updated", { rows: board() });
  }
  return send(res, 200, { accepted: true, duplicate: false });
}

const resultBody = (id: string) => {
  const r = state.session.results[id];
  return {
    session_question_id: id,
    correct: r.correct,
    points: r.points,
    speed_bonus: r.speedBonus,
    session_rank: r.rank,
    session_points: state.session.points,
    correct_answer: state.session.revealed.includes(id) ? LESSON.find((q) => q.id === id)!.correct : null,
    explanation: null,
  };
};

function board() {
  const rows = [
    { student_id: "st-9", name: "Ана Георгиевска", points: 30 },
    { student_id: "st-8", name: "Лука Стојановски", points: 20 },
    { student_id: STUDENT_ID, name: "Live Student", points: state.session.points },
    { student_id: "st-7", name: "Мила Јованова", points: 10 },
  ].sort((a, b) => b.points - a.points || (a.student_id === STUDENT_ID ? -1 : b.student_id === STUDENT_ID ? 1 : 0));
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((x) => x.points > r.points).length }));
}

function snapshot() {
  const sess = state.session;
  const cur = sess.current;
  const o = sess.opener;
  if (o) {
    return {
      session: wireSession(),
      server_now: nowIso(),
      question: wireOpener(o),
      my_response: o.mine?.response ?? null,
      my_reason: o.reason?.text ?? null,
      result: o.result ? openerResultBody(o) : null,
      session_points: sess.points,
      session_rank: sess.rank,
      board: o.result ? board() : null,
      progress: o.phase === "voting" ? { answered: countsOf(o).reduce((a, b) => a + b, 0), joined: sess.joined } : null,
      summary: sess.summary,
      anon_questions: { used: sess.asks.length, limit: sess.askLimit },
      opener: {
        phase: o.phase,
        votes: countsOf(o),
        reasons: o.status === "revealed" ? [...OPENERS[o.kind].reasons] : [],
      },
    };
  }
  return {
    session: wireSession(),
    server_now: nowIso(),
    question: cur ? wireQuestion(cur) : null,
    my_response: cur ? (sess.answers[cur.id]?.response ?? null) : null,
    result: cur && sess.results[cur.id] ? resultBody(cur.id) : null,
    session_points: sess.points,
    session_rank: sess.rank,
    board: sess.points > 0 || Object.keys(sess.results).length > 0 ? board() : null,
    progress: cur?.status === "open" ? { answered: sess.answered, joined: sess.joined } : null,
    summary: sess.summary,
    anon_questions: { used: sess.asks.length, limit: sess.askLimit },
  };
}

/** POST /sessions/join, with the codes the tests use. */
function join(res: ServerResponse, code: string) {
  const sess = state.session;
  if (code === "EXPIRED-7B" || (code === "LIVE-7B" && state.tokenExpired)) return fail(res, 410, "token_expired");
  if (code === "OTHER-8A") return fail(res, 403, "not_enrolled");
  if (code === "ENDED-7B" || (code === "LIVE-7B" && sess.state === "ended")) return fail(res, 410, "session_ended");
  if (code !== "LIVE-7B") return fail(res, 404, "not_found");
  if (!sess.joinedStudent) {
    sess.joinedStudent = true;
    sess.joinedLate = sess.state !== "lobby";
    sess.joined++;
  }
  return send(res, 200, {
    session: wireSession(),
    attendance: {
      id: "a-live",
      course_id: "c-math",
      subject: subject("math", "Mathematics"),
      date: nowIso(),
      status: sess.joinedLate ? "late" : "present",
      joined_at: nowIso(),
    },
    server_now: nowIso(),
  });
}

/** Work out a question's result for the student from the answer the server holds, and send it. */
function settle(cur: Live, announce: boolean) {
  const sess = state.session;
  const mine = sess.answers[cur.id];
  const prior = sess.results[cur.id];
  const correct = !!mine && isRight(LESSON[cur.index], mine.response);
  const left = mine ? Math.max(0, cur.closesAt - mine.answeredAt) : 0;
  const speedBonus = correct ? Math.round((5 * left) / (cur.timer * 1000)) : 0;
  const points = correct ? 10 + speedBonus : 0;
  sess.points += points - (prior?.points ?? 0);
  sess.right += (correct ? 1 : 0) - (prior?.correct ? 1 : 0);
  sess.rank = Math.max(1, 5 - sess.right);
  sess.results[cur.id] = { correct, points, speedBonus, rank: sess.rank };
  if (announce) {
    broadcast("student", "question.result", resultBody(cur.id));
    broadcast("public", "leaderboard.updated", { rows: board() });
  }
}

/** POST /sessions/{id}/answers. */
function answer(res: ServerResponse, body: { session_question_id?: string; response?: string; answered_at?: string; idempotency_key?: string }) {
  const sess = state.session;
  if (sess.state === "ended") return fail(res, 410, "session_ended");
  const cur = sess.fired[body.session_question_id ?? ""];
  if (!cur) return fail(res, 404, "not_found");
  // A skipped question takes no answers (EC-NET-03).
  if (cur.status === "skipped") return fail(res, 409, "question_closed");
  const had = sess.answers[cur.id];
  if (had) return had.key === body.idempotency_key ? send(res, 200, { accepted: true, duplicate: true }) : fail(res, 409, "already_answered");
  const lq = LESSON[cur.index];
  const numeric = lq.kind === "numeric" ? readNumber(body.response ?? "", lq.numeric?.allow_negative ?? false) : null;
  const valid = lq.kind === "multiple_choice" ? ["0", "1", "2", "3"] : ["true", "false"];
  if (!body.response || (lq.kind === "numeric" ? numeric === null : !valid.includes(body.response))) return fail(res, 422, "validation_failed");
  const claimed = Date.parse(body.answered_at ?? "");
  const at = Number.isNaN(claimed) ? nowMs() : claimed;
  // The answer's own time decides, not when it arrived (BR-NET-01): inside the window, with a little grace.
  if (at > cur.closesAt + GRACE_MS) return fail(res, 409, "question_closed");
  sess.answers[cur.id] = {
    response: numeric ?? body.response,
    key: body.idempotency_key ?? "",
    // The answer's time is the phone's claim, clamped to the question's window (EC-NET-07).
    answeredAt: Math.min(cur.closesAt, Math.max(cur.firedAt, at)),
    receivedAt: nowMs(),
  };
  // It arrived after the question closed: the result the student already has was worked out without it.
  if (cur.status !== "open") settle(cur, true);
  return send(res, 200, { accepted: true, duplicate: false });
}

/** POST /sessions/{id}/anon-questions. */
function ask(res: ServerResponse, body: { text?: string; asked_at?: string; idempotency_key?: string }) {
  const sess = state.session;
  if (sess.state === "ended") return fail(res, 410, "session_ended");
  const key = body.idempotency_key ?? "";
  if (sess.asks.some((a) => a.key === key)) return send(res, 200, { accepted: true, duplicate: true });
  const text = Array.from((body.text ?? "").replace(/\s+/g, " ").trim()).slice(0, ASK_MAX).join("").trim();
  if (text === "") return fail(res, 422, "validation_failed");
  if (sess.asks.length >= sess.askLimit) return fail(res, 409, "limit_reached");
  const claimed = Date.parse(body.asked_at ?? "");
  sess.asks.push({ key, text, askedAt: Number.isNaN(claimed) ? nowMs() : claimed, sender: STUDENT_ID });
  return send(res, 200, { accepted: true, duplicate: false });
}

/** The time window a question was open in, or null for one this lesson never had. */
function windowOf(id: string): { from: number; to: number } | null {
  const sess = state.session;
  const q = sess.fired[id];
  if (q) return { from: q.firedAt, to: q.closesAt };
  const o = sess.opener;
  return o && OPENERS[o.kind].id === id ? { from: o.firedAt, to: o.closesAt } : null;
}

/** POST /sessions/{id}/focus-events. */
function focusEvents(res: ServerResponse, body: unknown) {
  const sess = state.session;
  if (sess.state === "ended") return fail(res, 410, "session_ended");
  if (!Array.isArray(body)) return fail(res, 422, "validation_failed");
  const batch = body as { type?: string; at?: string; session_question_id?: string }[];
  const parsed = batch.map((e) => ({ type: e.type ?? "", at: Date.parse(e.at ?? ""), id: e.session_question_id ?? "" }));
  if (parsed.some((e) => (e.type !== "lost" && e.type !== "back") || Number.isNaN(e.at))) return fail(res, 422, "validation_failed");
  if (parsed.some((e) => !windowOf(e.id))) return fail(res, 404, "not_found");
  sess.focusBatches.push(batch as { type: string; at: string; session_question_id: string }[]);
  for (const e of parsed) {
    if (sess.focus.some((f) => f.type === e.type && f.at === e.at && f.sessionQuestionId === e.id)) continue;
    const w = windowOf(e.id)!;
    sess.focus.push({ type: e.type, at: e.at, sessionQuestionId: e.id, flagged: e.type === "lost" && e.at >= w.from && e.at <= w.to });
  }
  return send(res, 204);
}

/** GET /realtime?channels=: the event stream. A pinger keeps a quiet lesson from looking dead. */
function stream(req: IncomingMessage, res: ServerResponse, channels: string) {
  if (state.blockStreams) return fail(res, 503, "server_error");
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const entry = { res, channels: channels.split(",").filter(Boolean) };
  streams.add(entry);
  const ping = () => res.write(`event: ping\ndata: ${JSON.stringify({ server_now: nowIso() })}\n\n`);
  ping();
  const beat = setInterval(ping, 15_000);
  req.on("close", () => {
    clearInterval(beat);
    streams.delete(entry);
  });
}

/** The test plays the teacher. */
function teacher(action: string, body: Record<string, unknown>) {
  const sess = state.session;
  const cur = sess.current;
  switch (action) {
    case "state": {
      sess.state = body.state as typeof sess.state;
      return broadcast("public", "state.changed", { state: sess.state });
    }
    case "fire": {
      const index = Number(body.index ?? 0);
      const timer = Number(body.timer ?? 60);
      if (sess.state === "lobby") {
        sess.state = "teaching";
        broadcast("public", "state.changed", { state: "teaching" });
      }
      sess.opener = null;
      sess.current = { id: LESSON[index].id, index, status: "open", firedAt: nowMs(), closesAt: nowMs() + timer * 1000, timer };
      sess.fired[sess.current.id] = sess.current;
      sess.answered = 0;
      return broadcast("public", "question.opened", { question: wireQuestion(sess.current) });
    }
    case "progress": {
      if (!cur) return;
      sess.answered = Number(body.answered ?? 0);
      return broadcast("public", "question.progress", { session_question_id: cur.id, answered: sess.answered, joined: sess.joined });
    }
    case "close": {
      if (!cur || cur.status !== "open") return;
      cur.status = "closed";
      // Closed early, the question ends now (BR-TIME-04).
      cur.closesAt = Math.min(cur.closesAt, nowMs());
      broadcast("public", "question.closed", { session_question_id: cur.id });
      return settle(cur, true);
    }
    case "reveal": {
      if (!cur || cur.status === "open") return;
      cur.status = "revealed";
      sess.revealed.push(cur.id);
      return broadcast("public", "question.revealed", { session_question_id: cur.id, correct_answer: LESSON[cur.index].correct, explanation: null });
    }
    case "skip": {
      if (!cur) return;
      cur.status = "skipped";
      delete sess.answers[cur.id];
      delete sess.results[cur.id];
      return broadcast("public", "question.skipped", { session_question_id: cur.id });
    }
    case "opener": {
      const kind = body.kind === "debate" ? "debate" : "prediction";
      const vote = Number(body.vote ?? 30) * 1000;
      const reason = Number(body.reason ?? 45) * 1000;
      const firedAt = nowMs();
      sess.state = "opener";
      broadcast("public", "state.changed", { state: "opener" });
      sess.current = null;
      sess.opener = { kind, status: "open", phase: "voting", firedAt, voteClosesAt: firedAt + vote, voteEnd: firedAt + vote, closesAt: firedAt + vote + reason, mine: null, reason: null, result: null };
      return broadcast("public", "question.opened", { question: wireOpener(sess.opener) });
    }
    case "opener-voting-end": {
      const o = sess.opener;
      if (!o || o.phase !== "voting") return;
      o.phase = "reasoning";
      o.voteEnd = Math.min(o.voteEnd, nowMs());
      return broadcast("public", "opener.counts", { session_question_id: OPENERS[o.kind].id, phase: "reasoning", votes: countsOf(o) });
    }
    case "opener-close": {
      const o = sess.opener;
      if (!o || o.status !== "open") return;
      if (o.phase === "voting") {
        o.phase = "reasoning";
        o.voteEnd = Math.min(o.voteEnd, nowMs());
        broadcast("public", "opener.counts", { session_question_id: OPENERS[o.kind].id, phase: "reasoning", votes: countsOf(o) });
      }
      o.status = "closed";
      o.closesAt = Math.min(o.closesAt, nowMs());
      settleOpener(o);
      broadcast("public", "question.closed", { session_question_id: OPENERS[o.kind].id });
      broadcast("student", "question.result", openerResultBody(o));
      return broadcast("public", "leaderboard.updated", { rows: board() });
    }
    case "opener-reveal": {
      const o = sess.opener;
      if (!o || o.status === "open") return;
      o.status = "revealed";
      o.phase = "revealed";
      if (o.result) o.result = { ...o.result };
      const def = OPENERS[o.kind];
      broadcast("public", "opener.counts", { session_question_id: def.id, phase: "revealed", votes: countsOf(o) });
      broadcast("public", "opener.reasons", { session_question_id: def.id, reasons: [...def.reasons] });
      return broadcast("public", "question.revealed", { session_question_id: def.id, correct_answer: def.correct, explanation: null });
    }
    case "anon-limit":
      sess.askLimit = Number(body.limit ?? 3);
      return;
    case "elsewhere":
      return broadcast("student", "signed_in_elsewhere");
    case "end": {
      sess.state = "ended";
      sess.summary = { right: sess.right, total: LESSON.length };
      state.endedResults.unshift({
        session_id: SESSION_ID,
        course_id: "c-math",
        subject: subject("math", "Mathematics"),
        lesson_title: "Linear equations",
        ended_at: nowIso(),
        right: sess.right,
        total: LESSON.length,
        questions: LESSON.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          correct: sess.results[q.id]?.correct ?? false,
          correct_answer: q.options ? q.options[Number(q.correct)] : q.correct,
          your_answer: sess.answers[q.id]?.response ?? null,
        })),
      });
      broadcast("public", "state.changed", { state: "ended" });
      return broadcast("student", "session.ended", { session_points: sess.points, session_rank: sess.rank, summary: sess.summary });
    }
    case "joined": {
      sess.joined = Number(body.count ?? sess.joined);
      return broadcast("public", "joined.count", { joined_count: sess.joined, recent: ["Ана Георгиевска", "Лука Стојановски"] });
    }
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

const fail = (res: ServerResponse, status: number, code: string) => send(res, status, { error: { code, message: code } });

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://fake");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (path === "/__control/state") return send(res, 200, { ...state, streams: streams.size });
  if (path === "/__control/reset" && method === "POST") {
    for (const stream of streams) stream.res.destroy();
    streams.clear();
    state = initial();
    return send(res, 204);
  }
  if (path === "/__control/signed-out" && method === "POST") {
    state.signedOut = "unauthenticated";
    return send(res, 204);
  }
  if (path === "/__control/elsewhere" && method === "POST") {
    state.signedOut = "signed_in_elsewhere";
    return send(res, 204);
  }
  if (path === "/__control/redirect" && method === "POST") {
    state.method = "redirect";
    return send(res, 204);
  }
  if (path === "/__control/expire-code" && method === "POST") {
    state.codeExpired = true;
    return send(res, 204);
  }
  if (path === "/__control/skew" && method === "POST") {
    state.skewMs = Number(((await readJson(req)) as { ms?: number } | undefined)?.ms ?? 0);
    return send(res, 204);
  }
  if (path === "/__control/drop-streams" && method === "POST") {
    for (const stream of streams) stream.res.destroy();
    streams.clear();
    return send(res, 204);
  }
  if (path === "/__control/block-streams" && method === "POST") {
    state.blockStreams = ((await readJson(req)) as { on?: boolean } | undefined)?.on !== false;
    return send(res, 204);
  }
  if (path === "/__control/expire-token" && method === "POST") {
    state.tokenExpired = true;
    return send(res, 204);
  }
  if (path.startsWith("/__control/session/") && method === "POST") {
    teacher(path.slice("/__control/session/".length), ((await readJson(req)) as Record<string, unknown> | undefined) ?? {});
    return send(res, 204);
  }
  // The school's identity provider, as far as a browser test needs one: a page to land on.
  if (path === "/__idp") {
    res.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>School sign-in</title><h1>School sign-in</h1>");
    return;
  }

  if (!path.startsWith("/api/v1/")) return fail(res, 404, "not_found");
  const api = path.slice("/api/v1".length);
  state.calls.push(`${method} ${api}`);

  if (method === "POST" && api === "/auth/student/start") {
    const body = (await readJson(req)) as { school_email?: string; return_to?: string } | undefined;
    state.bodies[`${method} ${api}`] = body;
    if (!ROSTER.includes((body?.school_email ?? "").toLowerCase())) return fail(res, 404, "unknown_email");
    if (state.method === "redirect") return send(res, 200, { method: "redirect", url: `http://127.0.0.1:${PORT}/__idp` });
    state.codeExpired = false;
    state.wrongCodes = 0;
    return send(res, 200, {
      method: "code",
      code_length: CODE.length,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      resend_at: new Date(Date.now() + 30_000).toISOString(),
    });
  }

  if (method === "POST" && api === "/auth/student/verify") {
    const body = (await readJson(req)) as { school_email?: string; code?: string } | undefined;
    state.bodies[`${method} ${api}`] = body;
    if (state.codeExpired) return fail(res, 410, "code_expired");
    if (Date.now() < state.lockedUntil) {
      res.setHeader("Retry-After", String(Math.ceil((state.lockedUntil - Date.now()) / 1000)));
      return fail(res, 429, "rate_limited");
    }
    if (body?.code !== CODE) {
      if (++state.wrongCodes >= WRONG_ALLOWED) {
        state.wrongCodes = 0;
        state.lockedUntil = Date.now() + LOCK_SECONDS * 1000;
        res.setHeader("Retry-After", String(LOCK_SECONDS));
        return fail(res, 429, "rate_limited");
      }
      return fail(res, 400, "invalid_code");
    }
    state.signedOut = null;
    return send(res, 200, state.student);
  }

  if (state.signedOut) return fail(res, 401, state.signedOut);

  if (method === "GET") {
    if (api === "/me") return send(res, 200, state.student);
    if (api === "/me/courses") return send(res, 200, COURSES);
    if (api === "/me/attendance") return send(res, 200, ATTENDANCE);
    if (api === "/me/results") return send(res, 200, [...state.endedResults, ...RESULTS]);
    if (api === "/me/topics") return send(res, 200, []);
    if (api === "/me/leaderboard") return send(res, 200, LEADERBOARD());
    if (api === "/me/badges") return send(res, 200, BADGES);
    if (api === "/me/notifications") return send(res, 200, [...state.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    if (api === "/me/practice-sets") return send(res, 200, []);
  }

  if (method === "POST" && api === "/me/notifications/read") {
    const body = (await readJson(req)) as { all?: boolean; ids?: string[] } | undefined;
    state.bodies[`${method} ${api}`] = body;
    for (const n of state.notifications) {
      if (n.read_at === null && (body?.all || body?.ids?.includes(n.id))) n.read_at = new Date().toISOString();
    }
    return send(res, 204);
  }

  if (method === "PATCH" && api === "/me/profile") {
    const body = (await readJson(req)) as { display_name?: string | null } | undefined;
    state.bodies[`${method} ${api}`] = body;
    const name = body?.display_name;
    if (typeof name === "string" && (name.length < 2 || name.length > 24)) return fail(res, 422, "validation_failed");
    if (name !== undefined) state.student.display_name = name;
    return send(res, 200, state.student);
  }

  if (method === "PATCH" && api === "/me/settings") {
    const body = (await readJson(req)) as { notifications_on?: boolean; locale?: "mk" | "en" } | undefined;
    state.bodies[`${method} ${api}`] = body;
    if (body?.notifications_on !== undefined) state.student.settings.notifications_on = body.notifications_on;
    if (body?.locale !== undefined) state.student.settings.locale = body.locale;
    return send(res, 200, state.student);
  }

  if (method === "POST" && api === "/auth/logout") {
    state.signedOut = "unauthenticated";
    return send(res, 204);
  }

  if (method === "POST" && api === "/sessions/join") {
    const body = (await readJson(req)) as { token?: string; short_code?: string } | undefined;
    state.bodies[`${method} ${api}`] = body;
    return join(res, (body?.token ?? body?.short_code ?? "").trim().toUpperCase());
  }

  const opener = /^\/sessions\/([^/]+)\/opener\/(vote|reason)$/.exec(api);
  if (opener && method === "POST") {
    if (decodeURIComponent(opener[1]) !== SESSION_ID) return fail(res, 404, "not_found");
    const body = (await readJson(req)) as Record<string, string> | undefined;
    state.bodies[`${method} ${api}`] = body;
    return openerGive(res, opener[2] as "vote" | "reason", body ?? {});
  }

  const extra = /^\/sessions\/([^/]+)\/(anon-questions|focus-events)$/.exec(api);
  if (extra && method === "POST") {
    if (decodeURIComponent(extra[1]) !== SESSION_ID) return fail(res, 404, "not_found");
    const body = await readJson(req);
    state.bodies[`${method} ${api}`] = body;
    return extra[2] === "anon-questions" ? ask(res, (body ?? {}) as Record<string, string>) : focusEvents(res, body);
  }

  const live = /^\/sessions\/([^/]+)\/(student-state|answers)$/.exec(api);
  if (live) {
    if (decodeURIComponent(live[1]) !== SESSION_ID) return fail(res, 404, "not_found");
    if (method === "GET" && live[2] === "student-state") return send(res, 200, snapshot());
    if (method === "POST" && live[2] === "answers") {
      const body = (await readJson(req)) as { session_question_id?: string; response?: string; answered_at?: string; idempotency_key?: string } | undefined;
      state.bodies[`${method} ${api}`] = body;
      return answer(res, body ?? {});
    }
  }

  if (method === "GET" && api === "/realtime") return stream(req, res, url.searchParams.get("channels") ?? "");

  return fail(res, 404, "not_found");
}

createServer((req, res) => {
  // The app and the API are on different ports, so the browser asks first and sends its cookies.
  const origin = req.headers.origin;
  if (origin && LOCAL_ORIGIN.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    // A browser hides every response header but a few from another origin; the app reads this one.
    res.setHeader("Access-Control-Expose-Headers", "Retry-After");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  route(req, res).catch((e) => {
    console.error(e);
    fail(res, 500, "server_error");
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake API on http://127.0.0.1:${PORT}/api/v1`));
