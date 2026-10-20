/**
 * The student app's domain types, mirroring spec section 3 for the student-facing entities.
 * The wire is snake_case with ISO 8601 times (wire.ts); the app speaks camelCase with times as
 * milliseconds since the epoch, so a time can go straight into Date and the format helpers.
 * Nothing outside wire.ts and the adapters should know the wire shape.
 */

export type Locale = "mk" | "en";
export type Id = string;

// ---- The student ------------------------------------------------------------------------------

export type StudentSettings = {
  notificationsOn: boolean;
  /** The interface language (OPEN-15). */
  locale: Locale;
};

/** GET /me. Identity is the school email; class and school come from the school account. */
export type Student = {
  id: Id;
  fullName: string;
  schoolEmail: string;
  /** What the student chose to be called, 2 to 24 characters (BR-STU-01); null means the full name. */
  displayName: string | null;
  /** The profile picture the API serves, or null: clients then show initials on a yellow circle. */
  photoUrl: string | null;
  school: { id: Id; name: string };
  class: { id: Id; name: string };
  settings: StudentSettings;
};

/** PATCH /me/profile. */
export type ProfileUpdate = { displayName: string | null };

/** The cropped profile photo: the JPEG the API takes (up to 200 KB) and a URL the client can show at once. */
export type PhotoUpload = { blob: Blob; preview: string };

export type SettingsUpdate = Partial<StudentSettings>;

/**
 * Sign-in is email first (F-02): the school email starts it, and what comes next depends on the method
 * OPEN-01 lands on. `returnTo` is the app path to come back to after a redirect to an identity provider.
 */
export type StudentSignIn = { schoolEmail: string; returnTo?: string };

/**
 * The next stage of a sign-in, behind one method so the screen does not care which method wins
 * OPEN-01: a code the student types (emailed to the school mailbox), or a redirect to the school's
 * identity provider (Google or Microsoft).
 */
export type SignInChallenge =
  | {
      method: "code";
      codeLength: number;
      /** When the code stops working, and when a new one may be asked for. */
      expiresAt: number;
      resendAt: number;
    }
  | { method: "redirect"; url: string };

/** The code a student typed for the email that asked for it. */
export type StudentSignInCode = { schoolEmail: string; code: string };

// ---- Courses (class + subject + teacher, OPEN-02) -----------------------------------------------

export type Course = {
  id: Id;
  /** A stable code for the subject; the app has its own name and look for the ones it knows. */
  subjectId: string;
  /** The subject's name as the school wrote it, shown where the app has no copy of its own. */
  subjectName: string;
  teacherName: string;
  classId: Id;
  className: string;
  /** Extra strings the subject search should match, such as a name in the other script. */
  searchTerms?: string[];
};

// ---- Attendance -----------------------------------------------------------------------------------

export type AttendanceStatus = "present" | "late" | "absent" | "present_no_device";

export type AttendanceEntry = {
  id: Id;
  courseId: Id;
  subjectId: string;
  subjectName: string;
  /** When the lesson took place. */
  date: number;
  status: AttendanceStatus;
  /** When the student joined by QR; null for a mark the teacher wrote. */
  joinedAt: number | null;
};

/** GET /me/attendance: the percentage and the log (FR-STU-02, FR-ATT-03). */
export type AttendanceSummary = {
  attended: number;
  total: number;
  percent: number;
  /** The percentage a week ago, for Home's weekly change; null when the server does not say. */
  percentWeekAgo: number | null;
  log: AttendanceEntry[];
};

// ---- Results and topics -----------------------------------------------------------------------------

export type ResultQuestion = {
  id: Id;
  prompt: string;
  correct: boolean;
  /** The right answer as text, shown for a question the student got wrong. */
  correctAnswer: string;
  /** What the student answered; null when they did not. */
  yourAnswer: string | null;
};

/** One finished session as the student sees it (FR-STU-03). */
export type SessionResult = {
  sessionId: Id;
  courseId: Id;
  subjectId: string;
  subjectName: string;
  /** The lesson's title, for the summary's header. */
  lessonTitle: string;
  endedAt: number;
  right: number;
  total: number;
  questions: ResultQuestion[];
};

/** GET /me/topics: how the student did on a topic over time (FR-STU-05), own data only. */
export type TopicProgress = {
  topic: string;
  subjectId: string;
  points: { at: number; right: number; total: number }[];
};

// ---- Points, leaderboard, badges --------------------------------------------------------------------------

export type LeaderboardScope = "class" | "school";

export type Season = {
  id: Id;
  schoolYear: string;
  semester: 1 | 2;
  startsOn: number;
  endsOn: number;
};

export type LeaderboardRow = {
  studentId: Id;
  name: string;
  points: number;
  rank: number;
  isMe: boolean;
};

export type Leaderboard = {
  scope: LeaderboardScope;
  season: Season | null;
  rows: LeaderboardRow[];
};

export type Badge = {
  /** The badge's code; the app has copy for the ones it knows and shows `title` for the rest. */
  code: string;
  title: string;
  points: number;
  earned: boolean;
  awardedAt: number | null;
};

// ---- Notifications ------------------------------------------------------------------------------------------

/**
 * The triggers of FR-NOT-01 (names PROPOSED). `generic` carries its own `title` and `body` in the
 * payload: it is what a kind this build does not know becomes, and what the mock uses for the
 * notices it invents.
 */
export type NotificationKind = "result_ready" | "practice_set_sent" | "marked_late" | "badge_earned" | "generic";

export type NotificationPayload = {
  courseId?: Id;
  subjectId?: string;
  subjectName?: string;
  sessionId?: Id;
  practiceSetId?: Id;
  badgeCode?: string;
  right?: number;
  total?: number;
  /** For `marked_late`: the lesson's date. */
  date?: number;
  title?: string;
  body?: string;
};

export type Notification = {
  id: Id;
  kind: NotificationKind;
  payload: NotificationPayload;
  createdAt: number;
  readAt: number | null;
};

// ---- Practice sets (F-12) -----------------------------------------------------------------------------------------

export type PracticeQuestion = {
  id: Id;
  prompt: string;
  options: string[];
};

export type PracticeSet = {
  id: Id;
  sessionId: Id;
  courseId: Id;
  subjectId: string;
  createdAt: number;
  completedAt: number | null;
  /** Right answers of the last attempt, when there was one. */
  score: number | null;
  questions: PracticeQuestion[];
};

export type PracticeAnswer = { questionId: Id; response: string };
export type PracticeAttempt = { score: number; total: number; points: number };

// ---- Live session, student side (F-07, F-08, section 4.4) ---------------------------------------------------------

export type SessionState = "lobby" | "opener" | "teaching" | "review" | "ended";

/** Spec 3.2. The student app renders the multiple-choice and true-false kinds for now. */
export type QuestionKind = "multiple_choice" | "true_false" | "numeric" | "opener_prediction" | "opener_debate";

export type QuestionStatus = "ready" | "open" | "closed" | "revealed" | "skipped";

/** What the student sees of a question; never the correct answer before it is revealed. */
export type SessionQuestion = {
  /** The session_question_id the answer is sent against. */
  id: Id;
  index: number;
  total: number;
  kind: QuestionKind;
  prompt: string;
  options: string[] | null;
  status: QuestionStatus;
  timerSeconds: number;
  /** The server's times, so the client can count down on the server's clock (BR-TIME-03). */
  firedAt: number | null;
  closesAt: number | null;
};

/** What a closed question was worth to this student. */
export type QuestionResult = {
  sessionQuestionId: Id;
  correct: boolean;
  points: number;
  speedBonus: number;
  /** The student's rank in this session after the question (BR-PTS-09). */
  sessionRank: number;
  correctAnswer: string | null;
  explanation: string | null;
};

export type SessionSnapshot = {
  id: Id;
  courseId: Id;
  state: SessionState;
  lessonTitle: string | null;
  questionCount: number | null;
  joinedCount: number;
};

export type JoinInput = { token: string } | { shortCode: string };

/** The answer to a join: the session, the attendance it recorded, and the server's clock (F-07). */
export type JoinResult = {
  session: SessionSnapshot;
  attendance: AttendanceEntry;
  serverNow: number;
};

/** GET /sessions/{id}/student-state: one snapshot that rebuilds every state of section 4.4 after a reconnect. */
export type StudentSessionState = {
  session: SessionSnapshot;
  serverNow: number;
  /** The question that is open, or the last one closed or revealed; null before the first. */
  question: SessionQuestion | null;
  /** This student's answer to `question`, when there is one. */
  myResponse: string | null;
  result: QuestionResult | null;
  sessionPoints: number;
  sessionRank: number;
};

/** The student's place in section 4.4's table. */
export type StudentStage = "waiting_start" | "answering" | "waiting_others" | "right" | "wrong" | "waiting_next" | "ended";

export type AnswerInput = {
  sessionQuestionId: Id;
  response: string;
  /** When the student answered, in server-clock terms (EC-NET-07). */
  answeredAt: number;
  /** One per answer, so a retry is stored once (EC-NET-06). */
  idempotencyKey: string;
};

export type AnswerReceipt = {
  accepted: boolean;
  /** True when the key had been seen before: the first answer stands. */
  duplicate: boolean;
};
