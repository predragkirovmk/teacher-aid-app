/**
 * The one mapping layer between the wire (snake_case, ISO 8601 UTC times, spec section 11) and the
 * app's domain types (camelCase, times as milliseconds). The response shapes are PROPOSED in spec
 * 11.3; if the backend changes one, only this file changes.
 */
import { ApiError } from "./errors";
import type {
  AnswerInput,
  AnswerReceipt,
  AttendanceEntry,
  AttendanceStatus,
  AttendanceSummary,
  Badge,
  BoardRow,
  Course,
  JoinResult,
  Leaderboard,
  LeaderboardRow,
  Locale,
  Notification,
  NotificationKind,
  NotificationPayload,
  PracticeAttempt,
  PracticeQuestion,
  PracticeSet,
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

export type WirePracticeSet = {
  id: string;
  session_id: string;
  course_id: string;
  subject_id: string;
  created_at: string;
  completed_at: string | null;
  score: number | null;
  questions: { id: string; prompt: string; options: string[] }[];
};

export type WirePracticeAttempt = { score: number; total: number; points: number };

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
};

export type WireQuestionResult = {
  session_question_id: string;
  correct: boolean;
  points: number;
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

const practiceQuestion = (w: WirePracticeSet["questions"][number]): PracticeQuestion => ({
  id: w.id,
  prompt: w.prompt,
  options: w.options,
});

export const practiceSet = (w: WirePracticeSet): PracticeSet => ({
  id: w.id,
  sessionId: w.session_id,
  courseId: w.course_id,
  subjectId: w.subject_id,
  createdAt: ms(w.created_at),
  completedAt: msOrNull(w.completed_at),
  score: w.score,
  questions: w.questions.map(practiceQuestion),
});

export const practiceAttempt = (w: WirePracticeAttempt): PracticeAttempt => ({
  score: w.score,
  total: w.total,
  points: w.points,
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
});

const questionResult = (w: WireQuestionResult): QuestionResult => ({
  sessionQuestionId: w.session_question_id,
  correct: w.correct,
  points: w.points,
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
  "question.result",
  "session.ended",
  "signed_in_elsewhere",
  "notification.created",
] as const;

type Body = Record<string, unknown>;

const bad = (type: string): never => {
  throw new ApiError("invalid_response", { message: `bad ${type} event` });
};

/**
 * One realtime message as a domain event, or null for an event this build does not use (the opener's
 * counts, the class view's token rotation, ...). A known event whose body is not what the proposal says
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
        correctAnswer: str("correct_answer"),
        explanation: typeof d.explanation === "string" ? d.explanation : null,
      };
    case "leaderboard.updated":
      return Array.isArray(d.rows) ? { type, serverNow, rows: (d.rows as WireBoardRow[]).map(boardRow) } : bad(type);
    case "question.result":
      return {
        type,
        serverNow,
        result: questionResult({
          session_question_id: str("session_question_id"),
          correct: d.correct === true,
          points: num("points"),
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

export const settingsBody = (u: SettingsUpdate) => ({
  ...(u.notificationsOn !== undefined && { notifications_on: u.notificationsOn }),
  ...(u.locale !== undefined && { locale: u.locale }),
});

export const answerBody = (a: AnswerInput) => ({
  session_question_id: a.sessionQuestionId,
  response: a.response,
  answered_at: iso(a.answeredAt),
  idempotency_key: a.idempotencyKey,
});
