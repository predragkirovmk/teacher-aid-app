/**
 * The one mapping layer between the wire (snake_case, ISO 8601 UTC times, spec section 11) and the
 * app's domain types (camelCase, times as milliseconds). The response shapes are PROPOSED in spec
 * 11.3; if the backend changes one, only this file changes.
 */
import { ApiError } from "./errors";
import type {
  AnswerInput,
  AskInput,
  FocusEventInput,
  AnswerReceipt,
  AttendanceEntry,
  AttendanceStatus,
  AttendanceSummary,
  Badge,
  BoardRow,
  Course,
  DataSummary,
  JoinResult,
  Leaderboard,
  LeaderboardRow,
  Locale,
  Notification,
  NotificationKind,
  OpenerPhase,
  NotificationPayload,
  PracticeAttempt,
  PracticeKind,
  PracticeQuestion,
  PracticeSet,
  PracticeVerdict,
  PushRegistration,
  QuestionKind,
  QuestionResult,
  QuestionStatus,
  ResultQuestion,
  Season,
  SessionEvent,
  SessionQuestion,
  SessionSummary,
  SessionResult,
  SessionSnapshot,
  SessionState,
  SettingsUpdate,
  SignInChallenge,
  Student,
  StudentSessionState,
  TopicProgress,
} from "./types";

// ---- Wire types ---------------------------------------------------------------------------------

/** POST /auth/student/start (PROPOSED): what the sign-in does next. */
export type WireSignInChallenge =
  | { method: "code"; code_length: number; expires_at: string; resend_at: string }
  | { method: "redirect"; url: string };

export type WireStudent = {
  id: string;
  full_name: string;
  school_email: string;
  display_name: string | null;
  photo_url: string | null;
  school: { id: string; name: string };
  class: { id: string; name: string };
  settings: { notifications_on: boolean; locale: Locale };
  /** PROPOSED: the latest notice the student acknowledged. */
  acknowledgement?: { notice_version: string; acknowledged_at: string } | null;
};

/** GET /me/data-summary (PROPOSED). */
export type WireDataSummary = {
  attendance: number;
  answers: number;
  questions_to_teacher: number;
  focus_events: number;
  practice_answers: number;
  notifications: number;
  push_subscription: boolean;
};

export type WireCourse = {
  id: string;
  subject: { id: string; name: string };
  teacher: { name: string };
  class: { id: string; name: string };
};

export type WireAttendanceEntry = {
  id: string;
  course_id: string;
  subject: { id: string; name: string };
  date: string;
  status: AttendanceStatus;
  joined_at: string | null;
};

export type WireAttendance = {
  attended: number;
  total: number;
  percent: number;
  percent_week_ago: number | null;
  log: WireAttendanceEntry[];
};

export type WireResult = {
  session_id: string;
  course_id: string;
  subject: { id: string; name: string };
  lesson_title: string;
  ended_at: string;
  right: number;
  total: number;
  questions: {
    id: string;
    prompt: string;
    correct: boolean;
    correct_answer: string;
    your_answer: string | null;
  }[];
};

export type WireTopic = {
  topic: string;
  subject_id: string;
  points: { at: string; right: number; total: number }[];
};

export type WireLeaderboard = {
  scope: "class" | "school";
  season: { id: string; school_year: string; semester: 1 | 2; starts_on: string; ends_on: string } | null;
  rows: { student_id: string; name: string; points: number; rank: number; is_me: boolean }[];
};

export type WireBadge = { code: string; title: string; points: number; earned: boolean; awarded_at: string | null };

export type WireNotification = {
  id: string;
  kind: string;
  payload: {
    course_id?: string;
    subject_id?: string;
    subject_name?: string;
    session_id?: string;
    practice_set_id?: string;
    badge_code?: string;
    right?: number;
    total?: number;
    date?: string;
    title?: string;
    body?: string;
  };
  created_at: string;
  read_at: string | null;
};

export type WirePracticeVerdict = { correct: boolean; correct_answer: string; explanation: string | null };

export type WirePracticeSet = {
  id: string;
  session_id: string;
  course_id: string;
  subject_id: string;
  lesson_title: string | null;
  created_at: string;
  completed_at: string | null;
  score: number | null;
  points: number;
  questions: {
    id: string;
    kind: PracticeKind;
    prompt: string;
    options: string[] | null;
    numeric: { unit: string | null; allow_negative: boolean } | null;
    answer: ({ response: string } & WirePracticeVerdict) | null;
  }[];
};

export type WirePracticeAttempt = {
  score: number;
  total: number;
  points: number;
  completed: boolean;
  results: ({ question_id: string; duplicate: boolean } & WirePracticeVerdict)[];
};

export type WireSession = {
  id: string;
  course_id: string;
  state: SessionState;
  lesson_title: string | null;
  question_count: number | null;
  joined_count: number;
};

export type WireJoin = { session: WireSession; attendance: WireAttendanceEntry; server_now: string };

export type WireQuestion = {
  id: string;
  index: number;
  total: number;
  kind: QuestionKind;
  prompt: string;
  options: string[] | null;
  status: QuestionStatus;
  timer_seconds: number;
  fired_at: string | null;
  closes_at: string | null;
  /** PROPOSED: for `numeric`. Absent or null from a server that has none. */
  numeric?: { unit: string | null; tolerance: number; allow_negative: boolean } | null;
  /** PROPOSED: for the opener kinds. */
  opener?: { vote_closes_at: string; reason_max_length: number } | null;
};

export type WireQuestionResult = {
  session_question_id: string;
  correct: boolean | null;
  points: number;
  /** PROPOSED: the part of `points` a written reason earned (opener only). */
  reason_points?: number;
  speed_bonus: number;
  session_rank: number;
  correct_answer: string | null;
  explanation: string | null;
};

export type WireStudentState = {
  session: WireSession;
  server_now: string;
  question: WireQuestion | null;
  my_response: string | null;
  result: WireQuestionResult | null;
  session_points: number;
  session_rank: number;
  /** PROPOSED additions: absent or null from a server that does not send them. */
  board?: WireBoardRow[] | null;
  progress?: { answered: number; joined: number } | null;
  summary?: { right: number; total: number } | null;
  my_reason?: string | null;
  opener?: { phase: OpenerPhase; votes: number[] | null; reasons: string[] } | null;
  /** PROPOSED: the student's questions to the teacher in this lesson, sent so far and the limit (BR-ANON-02). */
  anon_questions?: { used: number; limit: number } | null;
};

export type WireBoardRow = { student_id: string; name: string; points: number; rank: number };

export type WireAnswerReceipt = { accepted: boolean; duplicate: boolean };

// ---- Time -----------------------------------------------------------------------------------------

/** An ISO 8601 time as milliseconds; a malformed one is the server's fault, not a screen's. */
export function ms(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new ApiError("invalid_response", { message: `bad time: ${iso}` });
  return t;
}
const msOrNull = (iso: string | null | undefined) => (iso == null ? null : ms(iso));
export const iso = (t: number) => new Date(t).toISOString();

// ---- Wire to domain -----------------------------------------------------------------------------------

export const student = (w: WireStudent): Student => ({
  id: w.id,
  fullName: w.full_name,
  schoolEmail: w.school_email,
  displayName: w.display_name,
  photoUrl: w.photo_url,
  school: w.school,
  class: w.class,
  settings: { notificationsOn: w.settings.notifications_on, locale: w.settings.locale },
  acknowledgement: w.acknowledgement ? { version: w.acknowledgement.notice_version, at: ms(w.acknowledgement.acknowledged_at) } : null,
});

export const dataSummary = (w: WireDataSummary): DataSummary => ({
  attendance: w.attendance,
  answers: w.answers,
  questionsToTeacher: w.questions_to_teacher,
  focusEvents: w.focus_events,
  practiceAnswers: w.practice_answers,
  notifications: w.notifications,
  pushSubscription: w.push_subscription,
});

export const signInChallenge = (w: WireSignInChallenge): SignInChallenge =>
  w.method === "redirect"
    ? { method: "redirect", url: w.url }
    : { method: "code", codeLength: w.code_length, expiresAt: ms(w.expires_at), resendAt: ms(w.resend_at) };

export const course = (w: WireCourse): Course => ({
  id: w.id,
  subjectId: w.subject.id,
  subjectName: w.subject.name,
  teacherName: w.teacher.name,
  classId: w.class.id,
  className: w.class.name,
});

export const attendanceEntry = (w: WireAttendanceEntry): AttendanceEntry => ({
  id: w.id,
  courseId: w.course_id,
  subjectId: w.subject.id,
  subjectName: w.subject.name,
  date: ms(w.date),
  status: w.status,
  joinedAt: msOrNull(w.joined_at),
});

export const attendance = (w: WireAttendance): AttendanceSummary => ({
  attended: w.attended,
  total: w.total,
  percent: w.percent,
  percentWeekAgo: w.percent_week_ago,
  log: w.log.map(attendanceEntry),
});

const resultQuestion = (w: WireResult["questions"][number]): ResultQuestion => ({
  id: w.id,
  prompt: w.prompt,
  correct: w.correct,
  correctAnswer: w.correct_answer,
  yourAnswer: w.your_answer,
});

export const result = (w: WireResult): SessionResult => ({
  sessionId: w.session_id,
  courseId: w.course_id,
  subjectId: w.subject.id,
  subjectName: w.subject.name,
  lessonTitle: w.lesson_title,
  endedAt: ms(w.ended_at),
  right: w.right,
  total: w.total,
  questions: w.questions.map(resultQuestion),
});

export const topic = (w: WireTopic): TopicProgress => ({
  topic: w.topic,
  subjectId: w.subject_id,
  points: w.points.map((p) => ({ at: ms(p.at), right: p.right, total: p.total })),
});

const season = (w: NonNullable<WireLeaderboard["season"]>): Season => ({
  id: w.id,
  schoolYear: w.school_year,
  semester: w.semester,
  startsOn: ms(w.starts_on),
  endsOn: ms(w.ends_on),
});

const leaderboardRow = (w: WireLeaderboard["rows"][number]): LeaderboardRow => ({
  studentId: w.student_id,
  name: w.name,
  points: w.points,
  rank: w.rank,
  isMe: w.is_me,
});

export const leaderboard = (w: WireLeaderboard): Leaderboard => ({
  scope: w.scope,
  season: w.season && season(w.season),
  rows: w.rows.map(leaderboardRow),
});

export const badge = (w: WireBadge): Badge => ({
  code: w.code,
  title: w.title,
  points: w.points,
  earned: w.earned,
  awardedAt: msOrNull(w.awarded_at),
});

const KINDS: readonly NotificationKind[] = ["result_ready", "practice_set_sent", "marked_late", "badge_earned", "generic"];

export const notification = (w: WireNotification): Notification => {
  const p = w.payload ?? {};
  const payload: NotificationPayload = {
    courseId: p.course_id,
    subjectId: p.subject_id,
    subjectName: p.subject_name,
    sessionId: p.session_id,
    practiceSetId: p.practice_set_id,
    badgeCode: p.badge_code,
    right: p.right,
    total: p.total,
    date: p.date === undefined ? undefined : ms(p.date),
    title: p.title,
    body: p.body,
  };
  return {
    id: w.id,
    // A kind this build does not know is shown with the server's own title and body, if it sent them.
    kind: KINDS.includes(w.kind as NotificationKind) ? (w.kind as NotificationKind) : "generic",
    payload,
    createdAt: ms(w.created_at),
    readAt: msOrNull(w.read_at),
  };
};

const practiceVerdict = (w: WirePracticeVerdict): PracticeVerdict => ({
  correct: w.correct,
  correctAnswer: w.correct_answer,
  explanation: w.explanation ?? null,
});

const practiceQuestion = (w: WirePracticeSet["questions"][number]): PracticeQuestion => ({
  id: w.id,
  kind: w.kind,
  prompt: w.prompt,
  options: w.options,
  numeric: w.numeric && { unit: w.numeric.unit, allowNegative: w.numeric.allow_negative },
  answer: w.answer && { response: w.answer.response, ...practiceVerdict(w.answer) },
});

export const practiceSet = (w: WirePracticeSet): PracticeSet => ({
  id: w.id,
  sessionId: w.session_id,
  courseId: w.course_id,
  subjectId: w.subject_id,
  lessonTitle: w.lesson_title ?? null,
  createdAt: ms(w.created_at),
  completedAt: msOrNull(w.completed_at),
  score: w.score,
  points: w.points,
  questions: w.questions.map(practiceQuestion),
});

export const practiceAttempt = (w: WirePracticeAttempt): PracticeAttempt => ({
  score: w.score,
  total: w.total,
  points: w.points,
  completed: w.completed,
  results: w.results.map((r) => ({ questionId: r.question_id, duplicate: r.duplicate, ...practiceVerdict(r) })),
});

export const session = (w: WireSession): SessionSnapshot => ({
  id: w.id,
  courseId: w.course_id,
  state: w.state,
  lessonTitle: w.lesson_title,
  questionCount: w.question_count,
  joinedCount: w.joined_count,
});

export const join = (w: WireJoin): JoinResult => ({
  session: session(w.session),
  attendance: attendanceEntry(w.attendance),
  serverNow: ms(w.server_now),
});

const question = (w: WireQuestion): SessionQuestion => ({
  id: w.id,
  index: w.index,
  total: w.total,
  kind: w.kind,
  prompt: w.prompt,
  options: w.options,
  status: w.status,
  timerSeconds: w.timer_seconds,
  firedAt: msOrNull(w.fired_at),
  closesAt: msOrNull(w.closes_at),
  numeric: w.numeric ? { unit: w.numeric.unit ?? null, tolerance: w.numeric.tolerance, allowNegative: w.numeric.allow_negative === true } : null,
  opener: w.opener ? { voteClosesAt: ms(w.opener.vote_closes_at), reasonMax: w.opener.reason_max_length } : null,
});

const questionResult = (w: WireQuestionResult): QuestionResult => ({
  sessionQuestionId: w.session_question_id,
  correct: w.correct,
  points: w.points,
  reasonPoints: w.reason_points ?? 0,
  speedBonus: w.speed_bonus,
  sessionRank: w.session_rank,
  correctAnswer: w.correct_answer,
  explanation: w.explanation,
});

const boardRow = (w: WireBoardRow): BoardRow => ({ studentId: w.student_id, name: w.name, points: w.points, rank: w.rank });

export const studentState = (w: WireStudentState): StudentSessionState => ({
  session: session(w.session),
  serverNow: ms(w.server_now),
  question: w.question && question(w.question),
  myResponse: w.my_response,
  result: w.result && questionResult(w.result),
  sessionPoints: w.session_points,
  sessionRank: w.session_rank,
  board: w.board?.map(boardRow) ?? null,
  progress: w.progress ?? null,
  summary: w.summary ?? null,
  myReason: w.my_reason ?? null,
  opener: w.opener ? { phase: w.opener.phase, votes: w.opener.votes ?? null, reasons: w.opener.reasons ?? [] } : null,
  anon: w.anon_questions ? { used: w.anon_questions.used, limit: w.anon_questions.limit } : null,
});

export const answerReceipt = (w: WireAnswerReceipt): AnswerReceipt => ({ accepted: w.accepted, duplicate: w.duplicate });

// ---- Realtime events -------------------------------------------------------------------------------------------

/** The event types the student app listens for (spec 11.2; the PROPOSED ones are marked in the spec). */
export const SESSION_EVENT_TYPES = [
  "state.changed",
  "joined.count",
  "question.opened",
  "question.progress",
  "question.closed",
  "question.revealed",
  "question.skipped",
  "leaderboard.updated",
  "opener.counts",
  "opener.reasons",
  "question.result",
  "session.ended",
  "signed_in_elsewhere",
  "notification.created",
] as const;

type Body = Record<string, unknown>;

const OPENER_PHASES: readonly OpenerPhase[] = ["voting", "reasoning", "revealed"];

const bad = (type: string): never => {
  throw new ApiError("invalid_response", { message: `bad ${type} event` });
};

/**
 * One realtime message as a domain event, or null for an event this build does not use (the class
 * view's token rotation, ...). A known event whose body is not what the proposal says
 * throws `invalid_response`; the caller drops it and asks for a snapshot.
 */
export function sessionEvent(type: string, data: unknown): SessionEvent | null {
  if (!(SESSION_EVENT_TYPES as readonly string[]).includes(type)) return null;
  const d = (data && typeof data === "object" ? data : {}) as Body;
  if (type === "signed_in_elsewhere") return { type, serverNow: null };
  if (type === "notification.created") return { type, serverNow: null };
  if (typeof d.server_now !== "string") return bad(type);
  const serverNow = ms(d.server_now);
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : bad(type));
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : bad(type));
  switch (type) {
    case "state.changed":
      return { type, serverNow, state: str("state") as SessionState };
    case "joined.count":
      return {
        type,
        serverNow,
        joinedCount: num("joined_count"),
        recent: Array.isArray(d.recent) ? d.recent.filter((n): n is string => typeof n === "string") : [],
      };
    case "question.opened":
      return d.question && typeof d.question === "object" ? { type, serverNow, question: question(d.question as WireQuestion) } : bad(type);
    case "question.progress":
      return { type, serverNow, sessionQuestionId: str("session_question_id"), answered: num("answered"), joined: num("joined") };
    case "question.closed":
    case "question.skipped":
      return { type, serverNow, sessionQuestionId: str("session_question_id") };
    case "question.revealed":
      return {
        type,
        serverNow,
        sessionQuestionId: str("session_question_id"),
        // Null for a debate, which has no right side (EC-Q-03).
        correctAnswer: d.correct_answer === null ? null : str("correct_answer"),
        explanation: typeof d.explanation === "string" ? d.explanation : null,
      };
    case "opener.counts": {
      const phase = str("phase");
      if (!OPENER_PHASES.includes(phase as OpenerPhase) || !Array.isArray(d.votes) || !d.votes.every((n) => typeof n === "number")) return bad(type);
      return { type, serverNow, sessionQuestionId: str("session_question_id"), phase: phase as OpenerPhase, votes: d.votes as number[] };
    }
    case "opener.reasons":
      if (!Array.isArray(d.reasons)) return bad(type);
      return { type, serverNow, sessionQuestionId: str("session_question_id"), reasons: d.reasons.filter((r): r is string => typeof r === "string") };
    case "leaderboard.updated":
      return Array.isArray(d.rows) ? { type, serverNow, rows: (d.rows as WireBoardRow[]).map(boardRow) } : bad(type);
    case "question.result":
      return {
        type,
        serverNow,
        result: questionResult({
          session_question_id: str("session_question_id"),
          correct: d.correct === null ? null : d.correct === true,
          points: num("points"),
          reason_points: typeof d.reason_points === "number" ? d.reason_points : 0,
          speed_bonus: typeof d.speed_bonus === "number" ? d.speed_bonus : 0,
          session_rank: num("session_rank"),
          correct_answer: typeof d.correct_answer === "string" ? d.correct_answer : null,
          explanation: typeof d.explanation === "string" ? d.explanation : null,
        }),
        sessionPoints: num("session_points"),
      };
    case "session.ended": {
      const s = d.summary as Partial<SessionSummary> | null | undefined;
      return {
        type,
        serverNow,
        summary: s && typeof s.right === "number" && typeof s.total === "number" ? { right: s.right, total: s.total } : null,
        sessionPoints: typeof d.session_points === "number" ? d.session_points : null,
        sessionRank: typeof d.session_rank === "number" ? d.session_rank : null,
      };
    }
  }
  return null;
}

// ---- Domain to wire (request bodies) -------------------------------------------------------------------------

/** `POST /me/acknowledgements`: the version of the notice the student saw, and nothing else (the server stamps the time). */
export const acknowledgementBody = (version: string) => ({ notice_version: version });

export const settingsBody = (u: SettingsUpdate) => ({
  ...(u.notificationsOn !== undefined && { notifications_on: u.notificationsOn }),
  ...(u.locale !== undefined && { locale: u.locale }),
});

/**
 * `PUT /me/push-token`: the browser's own subscription object (`endpoint`, `expirationTime`, `keys`) and the platform it
 * is on, nothing else. The names stay the browser's so the API can pass the object to a web-push library as it is.
 */
export const pushTokenBody = (r: PushRegistration) => ({
  endpoint: r.endpoint,
  expirationTime: r.expirationTime,
  keys: { p256dh: r.keys.p256dh, auth: r.keys.auth },
  platform: r.platform,
});

export const answerBody = (a: AnswerInput) => ({
  session_question_id: a.sessionQuestionId,
  response: a.response,
  answered_at: iso(a.answeredAt),
  idempotency_key: a.idempotencyKey,
});

/** `POST /sessions/{id}/opener/vote`: the same body as an answer; `response` is an option index or "agree" / "disagree". */
export const voteBody = answerBody;

/** `POST /sessions/{id}/opener/reason`: the reason is `text`, with the answer's time and key. */
export const reasonBody = (a: AnswerInput) => ({
  session_question_id: a.sessionQuestionId,
  text: a.response,
  answered_at: iso(a.answeredAt),
  idempotency_key: a.idempotencyKey,
});

/** `POST /sessions/{id}/anon-questions`: the text, when it was written, and the key that makes a resend harmless (BR-NET-04). */
export const askBody = (a: AskInput) => ({ text: a.text, asked_at: iso(a.askedAt), idempotency_key: a.idempotencyKey });

/**
 * `POST /sessions/{id}/focus-events`: a bare array, one item for each time the student left the quiz or came back during
 * an open question. A time and a question and nothing else (spec 7.10): no address, no app name, no page.
 */
export const focusBody = (events: FocusEventInput[]) =>
  events.map((e) => ({ type: e.type, at: iso(e.at), session_question_id: e.sessionQuestionId }));
