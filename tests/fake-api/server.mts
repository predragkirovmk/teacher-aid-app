/**
 * A tiny stand-in for the TeacherAid API, for the live-mode smoke test: just enough of spec 11.1
 * under /api/v1 for Home, Alerts and Profile to render from real HTTP. Run with Node 22.18+ (it
 * strips the types itself): `node tests/fake-api/server.mts`.
 *
 * Control endpoints for a test (not part of the API):
 *   GET  /__control/state          what the server holds, including the calls it received
 *   POST /__control/reset          back to the starting data
 *   POST /__control/notice        { version }              the notice the student has acknowledged: a version string, or null for none
 *   POST /__control/signed-out     answer 401 `unauthenticated` to every call until the student signs in
 *   POST /__control/elsewhere      answer 401 `signed_in_elsewhere` to every call until the student signs in
 *   POST /__control/rate-limit     { seconds }              make the next sign-in start answer `rate_limited` with that Retry-After
 *
 * Sign-in is a redirect to Google or Microsoft (2026-10-27): `POST /auth/student/start` takes `{ provider, return_to }` and answers
 * `{ method: "redirect", url }` to this server's own stand-in for the provider's page, `GET /__provider/{provider}`, which offers three
 * accounts: the student on the roster, a personal account that is on no roster (EC-AUTH-09) and cancelling (EC-AUTH-10). Each goes to
 * `GET /api/v1/auth/callback/{provider}?account=&return_to=`, which signs the student in (the session is a flag; the real one is an
 * httpOnly cookie, which a single test browser does not need to tell apart) and redirects to `return_to` on the app's origin, or
 * redirects there with `?error=unknown_email` or `?error=sign_in_failed` and nothing created. Every sign-in is kept in state.signIns.
 *
 * A live session, student side: `POST /sessions/join`, `GET /sessions/{id}/student-state`, `POST
 * /sessions/{id}/answers` and the PROPOSED event stream `GET /realtime?channels=` (Server-Sent Events,
 * lib/app/session/sse.ts). The test plays the teacher through the control endpoints; nothing here moves
 * by itself, so a test decides when a question opens and closes:
 *   POST /__control/session/state     { state }                lobby | teaching | review | ended
 *   POST /__control/session/fire      { index, timer? }        open question `index` of the lesson (timer in seconds, default 60)
 *   POST /__control/session/progress  { answered }             how many have answered
 *   POST /__control/session/close                              close the open question and send the student's result
 *   POST /__control/session/reveal                             show the right answer
 *   POST /__control/session/skip                               skip the open question
 *   POST /__control/session/end                                end the session: results, rank and the tally
 *   POST /__control/session/joined    { count }                the class gathering in the lobby
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
 * A right answer is worth 10 plus up to 5 for speed, a wrong one 0 (BR-PTS-02). The fourth question of the lesson is a
 * number: 7 divided by 4, within 0.01, no minus. The server reads a comma or a point and keeps the number as text.
 * A question to the teacher (F-09) is `POST /sessions/{id}/anon-questions` (`text`, `asked_at`, `idempotency_key`): stored with the
 * sender (state.session.asks), a key seen before is `duplicate`, one past the limit is `limit_reached` (409), an empty text
 * `validation_failed`, a finished lesson `session_ended`; the text is trimmed, its white space collapsed and cut to ASK_MAX. The
 * snapshot says how many are used and the limit (`anon_questions`). The focus flag is `POST /sessions/{id}/focus-events`, a bare
 * array of `{ type, at, session_question_id }`: a `lost` inside that question's window is flagged, anything else is only stored
 * (AC-FOC-01, AC-FOC-02), the same event twice is one, and every batch is kept in state.session.focusBatches to see how they came.
 *
 * The history and practice (F-12, spec 11.3): `GET /me/results` (`?course=` filters it, the query of each call is kept in state.queries), `GET /me/topics`,
 * `GET /me/practice-sets` and `POST /practice-sets/{id}/answers`. The server holds the right answers: a set lists a question with what the student answered
 * and the verdict once there is one, and nothing before. An answer body is `{ answers: [{ question_id, response }] }`; the first answer to a question stands, a
 * repeat gets the stored verdict with `duplicate`, a right answer earns no points (BR-PTS-03), a response the question cannot have is `validation_failed` (422), a question
 * that is not the set's is `not_found` (404); a number is read with a comma or a point. Every body is kept in state.practiceBodies, in order.
 *   POST /__control/practice/send     the teacher sends a set from the live lesson's questions: a new set, and its alert
 *
 * Notifications (FR-NOT-01..03, spec 11.3): `GET /me/notifications` takes `?limit=` and `?before=` (the id of the last one of the page before,
 * PROPOSED paging); `PUT /me/push-token` takes the browser's subscription (`endpoint`, `expirationTime`, `keys`) and a `platform` and replaces the
 * student's one, `DELETE` removes it, and signing out removes it too (state.pushToken, the calls are in state.calls). The student's channel
 * carries `notification.created`.
 *   POST /__control/notify            { kind?, title?, body? }   the server creates a notification for the student and tells the stream
 *   POST /__control/notifications/seed { count }                 `count` older read notifications, to page through
 * Class codes: LIVE-7B joins; EXPIRED-7B, OTHER-8A and ENDED-7B are refused as the API would; any other is unknown.
 */
import { readFileSync } from "node:fs";
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

/** The privacy notice's version the app ships, read from its source so the two cannot drift apart (lib/app/privacy.ts). */
const NOTICE_VERSION = /NOTICE_VERSION = "([^"]+)"/.exec(readFileSync(new URL("../../lib/app/privacy.ts", import.meta.url), "utf8"))![1];

/** The origin of the app the browser comes back to after a sign-in (the callback redirects there). */
const APP_ORIGIN = process.env.FAKE_APP_ORIGIN ?? `http://localhost:${process.env.E2E_PORT ?? 3102}`;
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

/** The longest question to the teacher (PROPOSED, the app's ANON_MAX_LENGTH). */
const ASK_MAX = 280;
const SESSION_ID = "se-live-1";
const STUDENT_ID = "st-1";
type SessionStateName = "lobby" | "teaching" | "review" | "ended";

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
    /** Questions to the teacher, with the sender (the teacher sees it; no student endpoint returns it). */
    asks: [] as { key: string; text: string; askedAt: number; sender: string }[],
    askLimit: 3,
    /** Focus events, and whether each raised a flag on the console. */
    focus: [] as { type: string; at: number; sessionQuestionId: string; flagged: boolean }[],
    /** Every request that carried focus events, as it came: to see that they were batched. */
    focusBatches: [] as { type: string; at: string; session_question_id: string }[][],
  };
}

// ---- Practice sets (F-12) --------------------------------------------------------------------------------

type PracticeQuestionData = {
  id: string;
  kind: "multiple_choice" | "true_false" | "numeric";
  prompt: string;
  options: string[] | null;
  numeric: { unit: string | null; allow_negative: boolean } | null;
  /** In the encoding of spec 3.2. */
  correct: string;
  tolerance: number;
  explanation: string | null;
};
type PracticeSetData = {
  id: string;
  session_id: string;
  course_id: string;
  subject: { id: string; name: string };
  lesson_title: string;
  created_at: string;
  questions: PracticeQuestionData[];
};
/** The set the student starts with: three questions on the maths lesson that ended yesterday. */
function practiceSetOne(): PracticeSetData {
  return {
    id: "ps-1",
    session_id: "se-1",
    course_id: "c-math",
    subject: subject("math", "Mathematics"),
    lesson_title: "Linear equations",
    created_at: iso(DAY / 2),
    questions: [
      {
        id: "pq-1",
        kind: "multiple_choice",
        prompt: "2x = 6. What is x?",
        options: ["2", "3", "6", "12"],
        numeric: null,
        correct: "1",
        tolerance: 0,
        explanation: "Divide both sides by 2: x = 3.",
      },
      {
        id: "pq-2",
        kind: "true_false",
        prompt: "A square has four equal sides.",
        options: null,
        numeric: null,
        correct: "true",
        tolerance: 0,
        explanation: null,
      },
      {
        id: "pq-3",
        kind: "numeric",
        prompt: "What is 9 divided by 4?",
        options: null,
        numeric: { unit: null, allow_negative: false },
        correct: "2.25",
        tolerance: 0.01,
        explanation: "9 ÷ 4 is 2 and a quarter: 2.25.",
      },
    ],
  };
}

/** The topics: how the student did on each, lesson by lesson. */
const TOPICS = () => [
  {
    topic: "Linear equations",
    subject_id: "math",
    points: [
      { at: iso(20 * DAY), right: 2, total: 5 },
      { at: iso(13 * DAY), right: 3, total: 5 },
      { at: iso(DAY), right: 4, total: 5 },
    ],
  },
  { topic: "Motion", subject_id: "physics", points: [{ at: iso(5 * DAY), right: 3, total: 4 }] },
];

const initial = () => ({
  /** Why every call is refused, or null while the student is signed in. */
  signedOut: null as null | "unauthenticated" | "signed_in_elsewhere",
  /** Every sign-in the callback handled, oldest first: the provider and the account chosen at its page. */
  signIns: [] as { provider: string; account: string }[],
  /** The next sign-in start is refused as `rate_limited` with this Retry-After, once. */
  rateLimit: 0,
  student: {
    id: "st-1",
    full_name: "Live Student",
    school_email: "live.student@school.example",
    display_name: null,
    photo_url: null,
    school: { id: "sc-1", name: "Test School" },
    class: { id: "cl-7b", name: "7B" },
    settings: { notifications_on: true, locale: "en" },
    // The student has seen the notice of the version the app ships (a test about the notice changes this with /__control/notice).
    acknowledgement: { notice_version: NOTICE_VERSION, acknowledged_at: iso(DAY) },
  } as WireStudent,
  /** Every acknowledgement received, newest last: the API keeps one row for each version (PROPOSED). */
  acknowledgements: [{ notice_version: NOTICE_VERSION, acknowledged_at: iso(DAY) }] as { notice_version: string; acknowledged_at: string }[],
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
  /** The query string of the last call of each "METHOD path". */
  queries: {} as Record<string, string>,
  /** The practice sets the teacher sent, oldest first, and what the student answered in each. */
  practiceSets: [practiceSetOne()] as PracticeSetData[],
  practiceAnswers: {} as Record<string, Record<string, string>>,
  practiceDone: {} as Record<string, string>,
  /** The push subscription the API holds for the student, or null. */
  pushToken: null as null | Record<string, unknown>,
  /** Every body of `POST /practice-sets/{id}/answers`, in the order they came, with the set's id. */
  practiceBodies: [] as { id: string; body: unknown }[],
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
  {
    session_id: "se-0",
    course_id: "c-math",
    subject: subject("math", "Mathematics"),
    lesson_title: "Fractions",
    ended_at: iso(8 * DAY),
    right: 3,
    total: 5,
    questions: [{ id: "q-0", prompt: "1/2 + 1/4 = ?", correct: true, correct_answer: "3/4", your_answer: "3/4" }],
  },
  {
    session_id: "se-p1",
    course_id: "c-phys",
    subject: subject("physics", "Physics"),
    lesson_title: "Motion",
    ended_at: iso(5 * DAY),
    right: 3,
    total: 4,
    questions: [{ id: "q-p", prompt: "Speed is distance over what?", correct: true, correct_answer: "Time", your_answer: "Time" }],
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


/** GET /me/data-summary (PROPOSED): how many records of each kind the API holds about the student. Counts only. */
function dataSummary() {
  const sess = state.session;
  return {
    attendance: ATTENDANCE.attended + (sess.joinedStudent ? 1 : 0),
    answers: 12 + Object.keys(sess.answers).length,
    questions_to_teacher: sess.asks.length,
    focus_events: sess.focus.filter((f) => f.type === "lost").length,
    practice_answers: Object.values(state.practiceAnswers).reduce((n, answers) => n + Object.keys(answers).length, 0),
    notifications: state.notifications.length,
    push_subscription: state.pushToken !== null,
  };
}

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
  return q ? { from: q.firedAt, to: q.closesAt } : null;
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

// ---- Practice ---------------------------------------------------------------------------------------------

/** Whether `response` is right for the question: the same choice, or a number within the tolerance. */
const practiceRight = (q: PracticeQuestionData, response: string) =>
  q.kind === "numeric" ? Math.abs(Number(response) - Number(q.correct)) <= q.tolerance + 1e-9 : response === q.correct;

/** What the question keeps of a response, or null when it cannot be one: a number is read with a comma or a point. */
function practiceClean(q: PracticeQuestionData, response: unknown): string | null {
  if (typeof response !== "string") return null;
  if (q.kind === "true_false") return response === "true" || response === "false" ? response : null;
  if (q.kind === "multiple_choice") return /^\d+$/.test(response) && Number(response) < (q.options?.length ?? 0) ? response : null;
  const m = /^(-)?(\d+)(?:[.,](\d+))?$/.exec(response.trim());
  if (!m || (m[1] && !q.numeric?.allow_negative)) return null;
  return `${m[1] ?? ""}${Number(m[2])}${m[3] ? `.${m[3].replace(/0+$/, "")}`.replace(/\.$/, "") : ""}`;
}

const practiceVerdict = (q: PracticeQuestionData, response: string) => ({
  correct: practiceRight(q, response),
  correct_answer: q.correct,
  explanation: q.explanation,
});

/** A set as the student sees it: each question with the answer and verdict if there is one, and nothing else about the right answer. */
function practiceWire(set: PracticeSetData) {
  const answers = state.practiceAnswers[set.id] ?? {};
  const questions = set.questions.map((q) => ({
    id: q.id,
    kind: q.kind,
    prompt: q.prompt,
    options: q.options,
    numeric: q.numeric,
    answer: answers[q.id] === undefined ? null : { response: answers[q.id], ...practiceVerdict(q, answers[q.id]) },
  }));
  const right = set.questions.filter((q) => answers[q.id] !== undefined && practiceRight(q, answers[q.id])).length;
  return {
    id: set.id,
    session_id: set.session_id,
    course_id: set.course_id,
    subject_id: set.subject.id,
    lesson_title: set.lesson_title,
    created_at: set.created_at,
    completed_at: state.practiceDone[set.id] ?? null,
    score: Object.keys(answers).length > 0 ? right : null,
    questions,
  };
}

async function practiceAnswer(res: ServerResponse, req: IncomingMessage, id: string) {
  const body = (await readJson(req)) as { answers?: { question_id?: string; response?: unknown }[] } | undefined;
  state.bodies[`POST /practice-sets/${id}/answers`] = body;
  state.practiceBodies.push({ id, body });
  const set = state.practiceSets.find((p) => p.id === id);
  if (!set) return fail(res, 404, "not_found");
  if (!Array.isArray(body?.answers) || body.answers.length === 0) return fail(res, 422, "validation_failed");
  const held = state.practiceAnswers[id] ?? {};
  const fresh: Record<string, string> = {};
  for (const a of body.answers) {
    const q = set.questions.find((x) => x.id === a.question_id);
    if (!q) return fail(res, 404, "not_found");
    if (held[q.id] === undefined && fresh[q.id] === undefined) {
      const clean = practiceClean(q, a.response);
      if (clean === null) return fail(res, 422, "validation_failed");
      fresh[q.id] = clean;
    }
  }
  const all = { ...held, ...fresh };
  state.practiceAnswers[id] = all;
  if (set.questions.every((q) => all[q.id] !== undefined)) state.practiceDone[id] ??= new Date().toISOString();
  const wire = practiceWire(set);
  return send(res, 200, {
    score: wire.score ?? 0,
    total: set.questions.length,
    completed: wire.completed_at !== null,
    results: body.answers.map((a) => {
      const q = set.questions.find((x) => x.id === a.question_id)!;
      return { question_id: q.id, duplicate: held[q.id] !== undefined, ...practiceVerdict(q, all[q.id]) };
    }),
  });
}

/** The teacher sends the class a set built from the live lesson's questions (F-12), and the student gets an alert. */
function practiceSend() {
  const id = `ps-${state.practiceSets.length + 1}`;
  const pick = (q: LessonQuestion): PracticeQuestionData => ({
    id: `${id}-${q.id}`,
    kind: q.kind,
    prompt: q.prompt,
    options: q.options,
    numeric: q.numeric ? { unit: q.numeric.unit, allow_negative: q.numeric.allow_negative } : null,
    correct: q.correct,
    tolerance: q.numeric?.tolerance ?? 0,
    explanation: null,
  });
  state.practiceSets.push({
    id,
    session_id: SESSION_ID,
    course_id: "c-math",
    subject: subject("math", "Mathematics"),
    lesson_title: "Linear equations",
    created_at: new Date().toISOString(),
    questions: [LESSON[0], LESSON[2], LESSON[3]].map(pick),
  });
  state.notifications.unshift({
    id: `n-${id}`,
    kind: "practice_set_sent",
    payload: { course_id: "c-math", subject_id: "math", subject_name: "Mathematics", practice_set_id: id },
    created_at: new Date().toISOString(),
    read_at: null,
  });
  broadcast("student", "notification.created");
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
  if (path === "/__control/notice" && method === "POST") {
    // The student has acknowledged this version of the notice, or none (null): the app's own is the current one.
    const body = (await readJson(req)) as { version?: string | null } | undefined;
    const version = body?.version ?? null;
    state.student.acknowledgement = version === null ? null : { notice_version: version, acknowledged_at: nowIso() };
    state.acknowledgements = version === null ? [] : [{ notice_version: version, acknowledged_at: nowIso() }];
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
  if (path === "/__control/rate-limit" && method === "POST") {
    state.rateLimit = Number(((await readJson(req)) as { seconds?: number } | undefined)?.seconds ?? 30);
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
  if (path === "/__control/notify" && method === "POST") {
    const body = ((await readJson(req)) as { kind?: string; title?: string; body?: string } | undefined) ?? {};
    const n = state.notifications.length + 1;
    state.notifications.unshift({
      id: `n-new-${n}`,
      kind: body.kind ?? "generic",
      payload: { title: body.title ?? `Alert ${n}`, body: body.body ?? "Something new." },
      created_at: new Date().toISOString(),
      read_at: null,
    });
    broadcast("student", "notification.created");
    return send(res, 204);
  }
  if (path === "/__control/notifications/seed" && method === "POST") {
    const { count = 0 } = ((await readJson(req)) as { count?: number } | undefined) ?? {};
    for (let i = 0; i < count; i++) {
      const at = new Date(NOW - (10 + i) * DAY);
      state.notifications.push({
        id: `n-old-${String(i + 1).padStart(3, "0")}`,
        kind: "generic",
        payload: { title: `Older alert ${i + 1}`, body: "From a while ago." },
        created_at: at.toISOString(),
        read_at: at.toISOString(),
      });
    }
    return send(res, 204);
  }
  if (path === "/__control/practice/send" && method === "POST") {
    practiceSend();
    return send(res, 204);
  }
  if (path.startsWith("/__control/session/") && method === "POST") {
    teacher(path.slice("/__control/session/".length), ((await readJson(req)) as Record<string, unknown> | undefined) ?? {});
    return send(res, 204);
  }
  // The identity provider's own page, as far as a browser test needs one: three accounts to choose from (EC-AUTH-02, -09, -10).
  const providerPage = /^\/__provider\/(google|microsoft)$/.exec(path);
  if (providerPage) {
    const name = providerPage[1] === "google" ? "Google" : "Microsoft";
    const back = encodeURIComponent(url.searchParams.get("return_to") ?? "/app");
    const link = (account: string, label: string) =>
      `<p><a id="${account}" href="/api/v1/auth/callback/${providerPage[1]}?account=${account}&return_to=${back}">${label}</a></p>`;
    res
      .writeHead(200, { "Content-Type": "text/html" })
      .end(
        `<!doctype html><meta charset="utf-8"><title>${name} sign-in</title><h1>${name} sign-in</h1>` +
          link("marko", "Continue as the student on the roster") +
          link("personal", "Continue with a personal account") +
          link("cancel", "Cancel"),
      );
    return;
  }

  if (!path.startsWith("/api/v1/")) return fail(res, 404, "not_found");
  const api = path.slice("/api/v1".length);
  state.calls.push(`${method} ${api}`);
  state.queries[`${method} ${api}`] = url.search;

  if (method === "POST" && api === "/auth/student/start") {
    const body = (await readJson(req)) as { provider?: string; return_to?: string } | undefined;
    state.bodies[`${method} ${api}`] = body;
    if (state.rateLimit > 0) {
      res.setHeader("Retry-After", String(state.rateLimit));
      state.rateLimit = 0;
      return fail(res, 429, "rate_limited");
    }
    // The provider is one of the two, and the way back is a path of the app (the API accepts nothing else).
    if (body?.provider !== "google" && body?.provider !== "microsoft") return fail(res, 422, "validation_failed");
    const returnTo = body.return_to ?? "/app";
    if (!/^\/app(?![\w-])/.test(returnTo) || returnTo.startsWith("//")) return fail(res, 422, "validation_failed");
    return send(res, 200, { method: "redirect", url: `http://127.0.0.1:${PORT}/__provider/${body.provider}?return_to=${encodeURIComponent(returnTo)}` });
  }

  // Where the provider sends the browser back (PROPOSED): the student is signed in, or sent home with ?error= and nothing created.
  const callback = /^\/auth\/callback\/(google|microsoft)$/.exec(api);
  if (callback && method === "GET") {
    const account = url.searchParams.get("account") ?? "";
    const returnTo = url.searchParams.get("return_to") ?? "/app";
    if (!/^\/app(?![\w-])/.test(returnTo) || returnTo.startsWith("//")) return fail(res, 422, "validation_failed");
    state.signIns.push({ provider: callback[1], account });
    const refused = account === "personal" ? "unknown_email" : account === "marko" ? null : "sign_in_failed";
    if (!refused) state.signedOut = null;
    const to = `${APP_ORIGIN}${returnTo}${refused ? `${returnTo.includes("?") ? "&" : "?"}error=${refused}` : ""}`;
    res.writeHead(302, { Location: to }).end();
    return;
  }

  if (state.signedOut) return fail(res, 401, state.signedOut);

  if (method === "GET") {
    if (api === "/me") return send(res, 200, state.student);
    if (api === "/me/data-summary") return send(res, 200, dataSummary());
    if (api === "/me/courses") return send(res, 200, COURSES);
    if (api === "/me/attendance") return send(res, 200, ATTENDANCE);
    if (api === "/me/results") {
      const course = url.searchParams.get("course");
      return send(res, 200, [...state.endedResults, ...RESULTS].filter((r) => !course || r.course_id === course));
    }
    if (api === "/me/topics") return send(res, 200, TOPICS());
    if (api === "/me/leaderboard") return send(res, 200, LEADERBOARD());
    if (api === "/me/badges") return send(res, 200, BADGES);
    if (api === "/me/notifications") {
      const sorted = [...state.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 30));
      const before = url.searchParams.get("before");
      const from = before ? sorted.findIndex((n) => n.id === before) + 1 : 0;
      return send(res, 200, before && from === 0 ? [] : sorted.slice(from, from + limit));
    }
    if (api === "/me/practice-sets") return send(res, 200, [...state.practiceSets].reverse().map(practiceWire));
  }

  const practice = /^\/practice-sets\/([^/]+)\/answers$/.exec(api);
  if (practice && method === "POST") return practiceAnswer(res, req, decodeURIComponent(practice[1]));

  if (method === "POST" && api === "/me/notifications/read") {
    const body = (await readJson(req)) as { all?: boolean; ids?: string[] } | undefined;
    state.bodies[`${method} ${api}`] = body;
    for (const n of state.notifications) {
      if (n.read_at === null && (body?.all || body?.ids?.includes(n.id))) n.read_at = new Date().toISOString();
    }
    return send(res, 204);
  }

  if (method === "POST" && api === "/me/acknowledgements") {
    const body = (await readJson(req)) as { notice_version?: unknown } | undefined;
    state.bodies[`${method} ${api}`] = body;
    // 1 to 32 characters of letters, digits, dots, dashes and underscores (PROPOSED).
    const version = body?.notice_version;
    if (typeof version !== "string" || !/^[A-Za-z0-9._-]{1,32}$/.test(version)) return fail(res, 422, "validation_failed");
    // One row for each version: a repeat answers with the first and changes nothing.
    let row = state.acknowledgements.find((a) => a.notice_version === version);
    const first = !row;
    if (!row) state.acknowledgements.push((row = { notice_version: version, acknowledged_at: nowIso() }));
    state.student.acknowledgement = state.acknowledgements.reduce((a, b) => (b.acknowledged_at >= a.acknowledged_at ? b : a));
    // 201 the first time; a version already stored answers 200 with its row (PROPOSED, FR-PRIV-02).
    return send(res, first ? 201 : 200, row);
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

  if (api === "/me/push-token" && method === "PUT") {
    const body = (await readJson(req)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; platform?: unknown } | undefined;
    state.bodies[`${method} ${api}`] = body;
    const valid =
      typeof body?.endpoint === "string" &&
      typeof body.keys?.p256dh === "string" &&
      typeof body.keys.auth === "string" &&
      ["ios", "android", "desktop"].includes(body.platform as string);
    if (!valid) return fail(res, 422, "validation_failed");
    state.pushToken = body as Record<string, unknown>;
    return send(res, 204);
  }
  if (api === "/me/push-token" && method === "DELETE") {
    state.pushToken = null;
    return send(res, 204);
  }

  if (method === "POST" && api === "/auth/logout") {
    state.signedOut = "unauthenticated";
    // A student who signs out has no push subscription left (PROPOSED rule).
    state.pushToken = null;
    return send(res, 204);
  }

  if (method === "POST" && api === "/sessions/join") {
    const body = (await readJson(req)) as { token?: string; short_code?: string } | undefined;
    state.bodies[`${method} ${api}`] = body;
    return join(res, (body?.token ?? body?.short_code ?? "").trim().toUpperCase());
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
