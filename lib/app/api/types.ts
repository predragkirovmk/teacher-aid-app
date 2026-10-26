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

/**
 * One page of the feed (PROPOSED, spec 11.3): the newest `limit` notifications, or the `limit` that come after the one
 * named by `before` (the last of the page before). A page shorter than `limit` is the last.
 */
export type NotificationPage = { limit?: number; before?: Id };

/**
 * What the browser hands over when a phone subscribes to web push: where the push service takes a message for it and the
 * keys that encrypt the message. The names are the browser's own (`PushSubscription.toJSON()`), so the API can hand the
 * object to a web-push library as it is.
 */
export type PushSubscriptionData = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

/** The kind of phone a subscription is on: enough for the API to know what a push must be able to carry, not a device identifier (BR-SEC-05). */
export type PushPlatform = "ios" | "android" | "desktop";

/** PUT /me/push-token (PROPOSED): the subscription and the platform it is on. */
export type PushRegistration = PushSubscriptionData & { platform: PushPlatform };

// ---- Practice sets (F-12) -----------------------------------------------------------------------------------------

/** The kinds a practice set can hold: an opener is a live thing and is never practised. */
export type PracticeKind = "multiple_choice" | "true_false" | "numeric";

/**
 * What the server says about an answered practice question (PROPOSED, spec 11.3). `correctAnswer` is in the
 * encoding of `response` (3.2). The right answer stays on the server until the student has answered, so reading
 * the set gives nothing away (points are earned per right answer, BR-PTS-03).
 */
export type PracticeVerdict = { correct: boolean; correctAnswer: string; explanation: string | null };

export type PracticeQuestion = {
  id: Id;
  kind: PracticeKind;
  prompt: string;
  /** The choices of a multiple-choice question, else null. */
  options: string[] | null;
  /** For a numeric question the unit to show and whether a minus key is offered (as in a live question), else null. */
  numeric: { unit: string | null; allowNegative: boolean } | null;
  /** What the student answered and the server's verdict on it; null while the question is unanswered (the server keeps the progress). */
  answer: ({ response: string } & PracticeVerdict) | null;
};

export type PracticeSet = {
  id: Id;
  sessionId: Id;
  courseId: Id;
  subjectId: string;
  /** The title of the lesson the set was built from, when the server says. */
  lessonTitle: string | null;
  /** When the teacher sent it. There is no deadline (OPEN-08 assumption). */
  createdAt: number;
  completedAt: number | null;
  /** Right answers so far; null before the first answer. */
  score: number | null;
  /** Points earned in this set so far (BR-PTS-03). */
  points: number;
  questions: PracticeQuestion[];
};

export type PracticeAnswer = { questionId: Id; response: string };

/** The server's word on one answer; `duplicate` when the question had been answered already (the first answer stands). */
export type PracticeResult = { questionId: Id; duplicate: boolean } & PracticeVerdict;

/** The answer to `POST /practice-sets/{id}/answers`: a verdict for each answer sent, and the set's tally now. */
export type PracticeAttempt = {
  score: number;
  total: number;
  points: number;
  /** Every question of the set has been answered. */
  completed: boolean;
  results: PracticeResult[];
};

// ---- Live session, student side (F-07, F-08, section 4.4) ---------------------------------------------------------

export type SessionState = "lobby" | "opener" | "teaching" | "review" | "ended";

/** Spec 3.2. The two opener kinds are the lesson's first question: a vote, then one line of reason (4.3). */
export type QuestionKind = "multiple_choice" | "true_false" | "numeric" | "opener_prediction" | "opener_debate";

export type QuestionStatus = "ready" | "open" | "closed" | "revealed" | "skipped";

/**
 * What a numeric question adds (PROPOSED, spec 3.1 `tolerance` and FR-ANS-02): a unit to show beside the
 * answer, the author's absolute tolerance (a value within it counts as right, edges included, AC-ANS-04),
 * and whether the answer may be negative, which decides if the minus key is offered. The flag belongs to the
 * question's subject and not to its answer, so the key does not give a negative answer away.
 */
export type NumericInfo = { unit: string | null; tolerance: number; allowNegative: boolean };

/**
 * What an opener question adds (PROPOSED, spec 4.3): voting runs until `voteClosesAt`, reasons until the
 * question's `closesAt`, and a reason has at most `reasonMax` characters (BR-Q-03).
 */
export type OpenerInfo = { voteClosesAt: number; reasonMax: number };

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
  /** Set for `numeric`, else null. */
  numeric: NumericInfo | null;
  /** Set for the two opener kinds, else null. */
  opener: OpenerInfo | null;
};

/** Where an opener is (spec 4.3): voting, then reasoning, then revealed. */
export type OpenerPhase = "voting" | "reasoning" | "revealed";

/** What a closed question was worth to this student. */
export type QuestionResult = {
  sessionQuestionId: Id;
  /** Null for a debate opener, which has no right side (EC-Q-03, OPEN-07). */
  correct: boolean | null;
  /** The question's whole worth to the student: for an opener the vote's points and `reasonPoints` together. */
  points: number;
  /** The part of `points` that came from the written reason (BR-PTS-02); 0 for everything but an opener. */
  reasonPoints: number;
  speedBonus: number;
  /** The student's rank in this session after the question (BR-PTS-09). */
  sessionRank: number;
  /** Null until the teacher reveals the question (`question.revealed`). */
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

/** A row of the session's own ranking (BR-PTS-09): points earned in this session only, real names (BR-LB-01). */
export type BoardRow = { studentId: Id; name: string; points: number; rank: number };

/** How many of the joined students have answered the open question (PROPOSED, `question.progress`). */
export type QuestionProgress = { answered: number; joined: number };

/** The student's tally of a finished session (PROPOSED, in `session.ended` and the snapshot after End). */
export type SessionSummary = { right: number; total: number };

export type JoinInput = { token: string } | { shortCode: string };

/** The answer to a join: the session, the attendance it recorded, and the server's clock (F-07). */
export type JoinResult = {
  session: SessionSnapshot;
  attendance: AttendanceEntry;
  serverNow: number;
};

/**
 * A session the student is in. A fresh join knows the attendance it recorded; a student who comes
 * back to a session they joined (the code on their screen has rotated since) does not.
 */
export type JoinedSession = Omit<JoinResult, "attendance"> & { attendance: AttendanceEntry | null };

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
  /** The session's ranking, when the server sends it (PROPOSED). */
  board: BoardRow[] | null;
  /** Answers in so far for the open question (PROPOSED). */
  progress: QuestionProgress | null;
  /** The tally once the session has ended (PROPOSED), else null. */
  summary: SessionSummary | null;
  /** This student's written reason for the opener in `question` (PROPOSED), when there is one. */
  myReason: string | null;
  /** The opener in `question`: its phase, the class's votes once voting has closed, and the anonymous reasons (PROPOSED). */
  opener: OpenerSnapshot | null;
  /** How many questions to the teacher this student has sent in this lesson, and how many they may (BR-ANON-02, PROPOSED); null from a server that does not say. */
  anon: AnonCount | null;
};

/** The student's questions to the teacher in one lesson: sent so far and the limit (BR-ANON-02). */
export type AnonCount = { used: number; limit: number };

/** What the class did in an opener, without names (FR-OPN-03). `votes` lines up with the options, or is [agree, disagree]. */
export type OpenerSnapshot = { phase: OpenerPhase; votes: number[] | null; reasons: string[] };

/**
 * The student's place in section 4.4's table. `waiting_result` is the moment between a question
 * closing and the student's own result arriving; `syncing` is before the first snapshot.
 */
export type StudentStage =
  | "syncing"
  | "waiting_start"
  | "answering"
  | "waiting_others"
  | "waiting_result"
  | "right"
  | "wrong"
  | "waiting_next"
  | "ended"
  /** An opener: the student has not voted yet and voting is open. */
  | "voting"
  /** An opener: the vote is in and a reason can be written. */
  | "reasoning"
  /** An opener: nothing more to do but wait for the class and the result. */
  | "opener_wait"
  /** An opener: the result, the class's votes and the reasons. */
  | "opener_result";

/**
 * What the phone sends to the server: an answer, an opener vote (`/opener/vote`), an opener reason (`/opener/reason`,
 * `response` holds its text), a question to the teacher (`/anon-questions`, `response` holds its text and there is
 * no question to answer, so `sessionQuestionId` is empty) or an answer in a practice set (`/practice-sets/{id}/answers`:
 * `sessionId` holds the set's id and `sessionQuestionId` the practice question's).
 */
export type SubmissionKind = "answer" | "vote" | "reason" | "ask" | "practice";

export type AnswerInput = {
  sessionQuestionId: Id;
  response: string;
  /** When the student answered, in server-clock terms (EC-NET-07). */
  answeredAt: number;
  /** One per answer, so a retry is stored once (EC-NET-06). */
  idempotencyKey: string;
};

/** A question to the teacher (F-09), as the phone sends it: the text, when it was written in server-clock terms, and the key that makes a resend harmless. */
export type AskInput = { text: string; askedAt: number; idempotencyKey: string };

/** A student left the quiz (`lost`) or came back (`back`) during an open question (spec 7.10, pilot). */
export type FocusEventType = "lost" | "back";

/** One focus event: when, in server-clock terms, and during which question. Nothing else is ever reported. */
export type FocusEventInput = { type: FocusEventType; at: number; sessionQuestionId: Id };

export type AnswerReceipt = {
  accepted: boolean;
  /** True when the key had been seen before: the first answer stands. */
  duplicate: boolean;
  /** For a practice answer: what the server said (its verdict and the set's tally). */
  practice?: PracticeAttempt;
};

// ---- Realtime events, student side (spec 11.2) -----------------------------------------------------------------------

/**
 * What the student's channels (`session.{id}.public` and `student.{id}`) tell the app, in domain terms.
 * Every one carries the server's time, which orders it against a snapshot (the engine drops what a
 * snapshot already reflects). Names and payloads are the PROPOSED ones of spec 11.2.
 */
export type SessionEvent =
  | { type: "state.changed"; serverNow: number; state: SessionState }
  | { type: "joined.count"; serverNow: number; joinedCount: number; recent: string[] }
  | { type: "question.opened"; serverNow: number; question: SessionQuestion }
  | { type: "question.progress"; serverNow: number; sessionQuestionId: Id; answered: number; joined: number }
  | { type: "question.closed"; serverNow: number; sessionQuestionId: Id }
  | { type: "question.revealed"; serverNow: number; sessionQuestionId: Id; correctAnswer: string | null; explanation: string | null }
  | { type: "question.skipped"; serverNow: number; sessionQuestionId: Id }
  | { type: "leaderboard.updated"; serverNow: number; rows: BoardRow[] }
  | { type: "opener.counts"; serverNow: number; sessionQuestionId: Id; phase: OpenerPhase; votes: number[] }
  | { type: "opener.reasons"; serverNow: number; sessionQuestionId: Id; reasons: string[] }
  | { type: "question.result"; serverNow: number; result: QuestionResult; sessionPoints: number }
  | { type: "session.ended"; serverNow: number; summary: SessionSummary | null; sessionPoints: number | null; sessionRank: number | null }
  // Not about the session: the app reacts to these itself (session.ts, the notifications query).
  | { type: "signed_in_elsewhere"; serverNow: null }
  | { type: "notification.created"; serverNow: null };
