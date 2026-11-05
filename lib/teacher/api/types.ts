/**
 * The teacher app's view of the TeacherAid API: spec section 3 (entities and enums), section 4
 * (states), the flows F-01 to F-12 and the endpoints of 11.1. These types are the wire shapes
 * themselves (snake_case, ISO 8601 UTC times), so the live adapter hands the JSON through as it is
 * and the mock adapter answers in exactly the same words. The spec gives only paths for most
 * teacher endpoints; where a shape is derived from the entities it is marked `PROPOSED` and listed
 * in docs/handoff-pending-2.md.
 */

export type Id = string;
/** ISO 8601, UTC. */
export type IsoTime = string;
export type Locale = "mk" | "en";

// ---- Enumerations (spec 3.2) ---------------------------------------------------------------------

export type SessionState = "lobby" | "teaching" | "review" | "ended";
/** The states a pop-up question goes through (4.2). `ready` is a question that has not been fired. */
export type QuestionStatus = "ready" | "open" | "closed" | "revealed" | "skipped";
export type AttendanceStatus = "present" | "late" | "absent" | "present_no_device";
export type NoDeviceReason = "no_phone" | "battery" | "no_data" | "no_focus_authorization";
export type QuestionKind = "multiple_choice" | "true_false" | "numeric";
/** What a student has done with the open question, as the console shows it (FR-CON-01). */
export type AnswerState = "answered" | "not_answered" | "offline";
export type Refinement = "easier" | "harder" | "more_questions" | "shorter_timers";
export type AuthProvider = "google" | "microsoft";
export type SourceKind = "upload" | "typed";

/**
 * What kind of institution a school is (3.1 School.type: гимназија, стручно, уметничко, faculty).
 * PROPOSED codes. A `faculty` is a university: the app words it "студенти" and "група".
 */
export type SchoolKind = "gymnasium" | "vocational" | "arts" | "faculty";

// ---- Who is signed in (F-01) ---------------------------------------------------------------------

export type UserRole = "teacher" | "admin" | "staff";

/**
 * GET /me for a teacher. PROPOSED: the spec shapes `GET /me` only for a student (11.3). The fields
 * are User (3.1) and the school's name and type.
 */
export type Me = {
  id: Id;
  /** The name of the school account, in the script the API holds it (the English UI transliterates, EC-NAME-01). */
  name: string;
  email: string;
  role: UserRole;
  auth_provider: AuthProvider;
  /** False until the guided first lesson is done (FR-SUP-03). */
  first_run_done: boolean;
  school: { id: Id; name: string; type: SchoolKind };
};

/**
 * POST /auth/start for a teacher. PROPOSED: 11.1 lists `{ email, return_to? }`, with the school found from the typed email
 * (FR-AUTH-10). The teacher app types nothing: the teacher presses the button of the provider their school uses, as a
 * student does, so the body is `{ provider, return_to? }` and no email travels. `return_to` is the app path to come back
 * to: it starts with `/teacher` and may carry a query (the app sends its sign-in screen with the screen the teacher was
 * heading for, `/teacher/sign-in?next=%2Fteacher%2Fclasses`); the API accepts nothing else.
 */
export type SignInRequest = { provider: AuthProvider; return_to?: string };

/** The answer: where to send the browser, that provider's own sign-in address with no login hint. `redirect` is the only method. */
export type SignInRedirect = { method: "redirect"; url: string };

// ---- Courses and classes (3.1, OPEN-02) ----------------------------------------------------------

export type Subject = { id: Id; name: string };
/** A school class (II-4) or a study group at a faculty. `year` is I to IV as 1 to 4, or the study year. */
export type ClassRef = { id: Id; name: string; year: number };

/** One item of GET /teacher/courses. PROPOSED. */
export type CourseSummary = {
  id: Id;
  subject: Subject;
  class: ClassRef;
  student_count: number;
  /** BR-PTS-04: the teacher may switch the speed bonus off per course. */
  speed_bonus_on: boolean;
  /** Finished lessons run for this course. */
  lessons_run: number;
  last_session_at: IsoTime | null;
};

/** PATCH /courses/{id}. */
export type CoursePatch = { speed_bonus_on: boolean };

// ---- Questions and lessons (3.1, BR-Q-*, FR-LES-*) -----------------------------------------------

/** An image on a question (FR-LES-10, FR-LES-11). PROPOSED: the spec lists no upload endpoint. */
export type QuestionMedia = { id: Id; url: string; alt: string | null };

type QuestionBase = {
  id: Id;
  /** Position in the lesson, from 0. */
  order: number;
  prompt: string;
  media: QuestionMedia | null;
  /** Why the answer is what it is; shown at the reveal. */
  explanation: string | null;
  /** BR-TIME-01 suggests it by kind; the teacher may change it before the lesson runs (BR-TIME-02). */
  timer_seconds: number;
  /** The subject matter, for per-topic results (BR-TOP-01). */
  topic: string;
};

/** Two to four options (BR-Q-01). `correct` is the zero-based index as a string (3.2). */
export type MultipleChoiceQuestion = QuestionBase & { kind: "multiple_choice"; options: string[]; correct: string };
/** `correct` is "true" or "false". */
export type TrueFalseQuestion = QuestionBase & { kind: "true_false"; correct: "true" | "false" };
/**
 * `correct` is the number as plain text with a point (3.2). Right when `abs(answer - correct) <= tolerance` (BR-ANS-03);
 * `unit` is a display string only.
 */
export type NumericQuestion = QuestionBase & {
  kind: "numeric";
  correct: string;
  tolerance: number;
  unit: string | null;
  allow_negative: boolean;
};
export type Question = MultipleChoiceQuestion | TrueFalseQuestion | NumericQuestion;

/** What a teacher edits: the questions and the review summary, plus the title. */
export type LessonContent = {
  title: string;
  /** The text of the review, which the teacher reads out when the lesson turns to review (FR-LES-04). PROPOSED as one text. */
  review_summary: string;
  questions: Question[];
};

/** One item of GET /lessons. PROPOSED. */
export type LessonSummary = {
  id: Id;
  title: string;
  subject: Subject;
  /** The year the lesson is for (3.1 Lesson.year). */
  year: number;
  question_count: number;
  /** The number of the current version (FR-LES-09). */
  version: number;
  /** How many times it has been run, for any course. 0 is a prepared lesson that has not been run. */
  times_run: number;
  last_run_at: IsoTime | null;
  /** Set on a copy from the school library (F-05). */
  copied_from: { lesson_id: Id; owner_name: string } | null;
  created_at: IsoTime;
  updated_at: IsoTime;
};

/** GET /lessons/{id}: the current version's content. */
export type Lesson = LessonSummary &
  LessonContent & {
    source: { id: Id; kind: SourceKind; file_name: string | null } | null;
    /** The sentence of emphasis given when it was made (F-03). */
    emphasis: string | null;
  };

// ---- Making a lesson (F-03, F-04) ----------------------------------------------------------------

/** POST /lessons/sources: a PDF or .docx (BR-LES-05), or typed sentences (FR-LES-06). */
export type SourceInput = { kind: "upload"; file: File } | { kind: "typed"; text: string };
export type SourceCreated = { source_id: Id };

/** POST /lessons/generate. */
export type GenerateRequest = { source_id: Id; subject_id: Id; year: number; emphasis?: string | null };

/** What a draft is doing (3.2 `draft.status`): being written, written, or the AI could not. */
export type DraftStatus = "pending" | "ready" | "failed";

/**
 * A question while the teacher is still making it: what a finished one is, with the gaps a half-edited one has. The right answer
 * of a true or false question may not be chosen yet (`""`); an option may be empty; a timer or a count may be out of range. A draft
 * holds such a question without complaint (PROPOSED `PATCH /lessons/drafts/{id}` checks only the shape); `POST /lessons` and
 * `PUT /lessons/{id}` refuse it (BR-Q-04, BR-TIME-05, BR-ANS-04).
 */
export type DraftQuestion = MultipleChoiceQuestion | (Omit<TrueFalseQuestion, "correct"> & { correct: "true" | "false" | "" }) | NumericQuestion;

type DraftBase = {
  id: Id;
  /** The source it was made from; null for the draft of a lesson that has none (a copy from the library). */
  source_id: Id | null;
  /** PROPOSED: the item of `GET /lessons/drafts` has it, and the wait on the draft page needs to know a document from sentences. */
  source: { kind: SourceKind; file_name: string | null } | null;
  subject: Subject;
  year: number;
  emphasis: string | null;
  /** The refinements applied so far, oldest first. */
  refinements: Refinement[];
  /** The draft a refinement was made from, else null (BR-LES-08). */
  previous_draft_id: Id | null;
  created_at: IsoTime;
  /** PROPOSED: when the teacher last changed it. Equal to `created_at` for a draft nobody has edited. */
  updated_at: IsoTime;
  /** Set when the draft was saved as a lesson. A saved draft stays readable and leads to its lesson (BR-LES-08). */
  consumed_at: IsoTime | null;
  /**
   * PROPOSED reading: the lesson this draft is about. Set when the draft was made from a saved lesson (PROPOSED
   * `POST /lessons/{id}/drafts`), and so saved with `PUT /lessons/{id}`; for a draft of a new lesson it is null until it is saved
   * and then the lesson it became.
   */
  lesson_id: Id | null;
};

/**
 * A draft: the output of a generation or a refinement before the teacher saves it, and the job that makes it (BR-LES-08). Nothing
 * reaches students before the teacher reviews it (BR-LES-04). `title`, `review_summary` and `questions` are null until it is ready
 * (INTERPRETATION); `failure` is null unless it failed.
 */
export type LessonDraft = DraftBase &
  (
    | { status: "pending"; failure: null; title: null; review_summary: null; questions: null }
    | { status: "failed"; failure: "generation_failed"; title: null; review_summary: null; questions: null }
    | { status: "ready"; failure: null; title: string; review_summary: string; questions: DraftQuestion[] }
  );

export type ReadyDraft = Extract<LessonDraft, { status: "ready" }>;

/** One item of GET /lessons/drafts: an unsaved draft, the latest of its chain (FR-LES-20). `title` and `question_count` are null until ready. */
export type DraftSummary = {
  id: Id;
  status: DraftStatus;
  failure: "generation_failed" | null;
  title: string | null;
  subject: Subject;
  year: number;
  question_count: number | null;
  refinements: Refinement[];
  emphasis: string | null;
  source: { kind: SourceKind; file_name: string | null } | null;
  previous_draft_id: Id | null;
  /** PROPOSED: the lesson a draft edits, so Today can tell it from a new lesson. */
  lesson_id: Id | null;
  created_at: IsoTime;
  updated_at: IsoTime;
};

/**
 * PATCH /lessons/drafts/{id}. PROPOSED. Only what changed, each field replacing the draft's: `questions` is the whole list in order.
 * A ready draft only (`invalid_state`, 409, for a pending, failed or saved one). The draft may hold unfinished content (DraftQuestion);
 * the answer is the draft.
 */
export type DraftPatch = { title?: string; review_summary?: string; questions?: DraftQuestion[] };

/** POST /lessons: the draft as the teacher edited it (FR-LES-07) becomes a lesson at version 1. PROPOSED body. */
export type SaveLessonRequest = LessonContent & { draft_id: Id };

/** PUT /lessons/{id}: a new version; sessions that already ran keep theirs (BR-LES-03). `draft_id` (PROPOSED) is the draft it was edited in, which is consumed. */
export type UpdateLessonRequest = LessonContent & { draft_id?: Id };

// ---- School library (F-05) -----------------------------------------------------------------------

/** One item of GET /library: a lesson a colleague in the same school saved (FR-LIB-01). PROPOSED. */
export type LibraryItem = {
  lesson_id: Id;
  title: string;
  subject: Subject;
  year: number;
  question_count: number;
  owner: { id: Id; name: string };
  saved_at: IsoTime;
  /** The teacher already has a copy of this lesson. */
  already_copied: boolean;
};

// ---- Live questions (3.1 SessionQuestion, 4.2) ---------------------------------------------------

/** What `question.opened` carries and what the class view shows: never the right answer (11.2). */
export type PublicQuestion = {
  /** The session question's id. */
  id: Id;
  index: number;
  total: number;
  kind: QuestionKind;
  prompt: string;
  options: string[] | null;
  status: QuestionStatus;
  timer_seconds: number;
  fired_at: IsoTime | null;
  closes_at: IsoTime | null;
  numeric: { unit: string | null; tolerance: number; allow_negative: boolean } | null;
  /** The picture, with the words that name it. PROPOSED on `question.opened` too, since students need it (the snapshots carry it already). */
  media: QuestionMedia | null;
  /** PROPOSED: a question made on the spot (FR-POP-04); the projector calls it a quick question and not "question 3 of 8". */
  adhoc: boolean;
};

/** A question in the console's run order, with what only the teacher sees. PROPOSED. */
export type ConsoleQuestion = {
  /** The session question's id, the one fire, reveal and skip take. */
  id: Id;
  question: Question;
  status: QuestionStatus;
  /** True for a question made on the spot (FR-POP-04). */
  adhoc: boolean;
  fired_at: IsoTime | null;
  closes_at: IsoTime | null;
  closed_at: IsoTime | null;
  revealed_at: IsoTime | null;
  skipped_at: IsoTime | null;
  answered: number;
  /** How many students had joined when it opened. */
  joined: number;
  /** PROPOSED: the counts once the question has closed (right, wrong, unanswered, and by response), so the console can say them at the reveal. Null before. */
  counts: RevealCounts | null;
};

/** Counts at the reveal, for the class view's bars (11.2 `question.revealed`). PROPOSED fields. */
export type RevealCounts = {
  /** By response in the encoding of 3.2: option index, "true" or "false". Empty for a numeric question. */
  by_response: Record<string, number>;
  right: number;
  wrong: number;
  unanswered: number;
};

export type LeaderboardRow = { student_id: Id; name: string; points: number; rank: number };

// ---- Sessions (F-06, 4.1) ------------------------------------------------------------------------

/** A live run of a lesson for one course. */
export type SessionRef = {
  id: Id;
  course_id: Id;
  lesson: { id: Id; title: string; version: number };
  state: SessionState;
  started_at: IsoTime;
  ended_at: IsoTime | null;
};

/** POST /sessions. */
export type CreateSessionRequest = { lesson_id: Id; course_id: Id };

/** GET /sessions/open (FR-END-04): any open session of the teacher, so End works from anywhere. PROPOSED shape. */
export type OpenSession = {
  server_now: IsoTime;
  session: (SessionRef & { class_name: string; subject_name: string }) | null;
};

/** The QR token and the short code beside it, both rotating every 30 s (BR-JOIN-02). */
export type JoinToken = { token: string; short_code: string; valid_to: IsoTime };

export type ConsoleStudent = {
  id: Id;
  full_name: string;
  /** Null until the student joins. */
  attendance: AttendanceStatus | null;
  joined_at: IsoTime | null;
  no_device_reason: NoDeviceReason | null;
  /** Realtime presence: what tells `offline` from `not_answered` (FR-CON-02). */
  online: boolean;
  /** For the open question, else null. */
  answer_state: AnswerState | null;
  /** Times the student left the app during a question (FR-FOC-01). */
  focus_flags: number;
  points: number;
};

/** A student's question to the teacher, with the sender's name: the console only (BR-ANON-01, FR-CON-03). */
export type AnonQuestionItem = {
  id: Id;
  text: string;
  sender: { id: Id; name: string };
  created_at: IsoTime;
  /** The teacher marked it answered aloud. PROPOSED: the spec has `answered_at` on AnonQuestion and no endpoint. */
  answered_at: IsoTime | null;
};

export type FocusFlag = {
  student_id: Id;
  session_question_id: Id;
  lost_at: IsoTime;
  /** Null while the student is still away. */
  back_at: IsoTime | null;
};

/** GET /sessions/{id}/console: everything the teacher's own screen shows, for a reload or a reopened window (FR-SES-08). */
export type ConsoleSnapshot = {
  server_now: IsoTime;
  session: SessionRef & { class_name: string; subject_name: string };
  /**
   * PROPOSED: the code the console reads out, `short_code`, and the token behind the QR; null once students may no longer join. The
   * teacher's own screen may hold it (it is the teacher's lesson), unlike a channel students read.
   */
  join: JoinToken | null;
  questions: ConsoleQuestion[];
  students: ConsoleStudent[];
  anon_questions: AnonQuestionItem[];
  focus_flags: FocusFlag[];
  board: LeaderboardRow[];
  /** Set when no question has been fired for a while (FR-POP-06): how long it has been, in seconds. PROPOSED: the spec has a flag; the console says how long. */
  nudge: { idle_seconds: number } | null;
};

/** One of the most-missed questions, worst first (FR-REV-01). */
export type MissedQuestion = {
  session_question_id: Id;
  order: number;
  prompt: string;
  kind: QuestionKind;
  topic: string;
  /** Wrong or unanswered, among the students who joined. */
  missed: number;
  joined: number;
};

/** What the class view shows in review: no names anywhere (BR-PRIV-01). */
export type ClassViewReview = { most_missed: MissedQuestion[]; anon_questions: { id: Id; text: string }[] };

/** GET /sessions/{id}/class-view: the projected window's snapshot. No private data (FR-SES-02). */
export type ClassViewSnapshot = {
  server_now: IsoTime;
  session: {
    id: Id;
    state: SessionState;
    lesson_title: string;
    class_name: string;
    subject_name: string;
    joined_count: number;
    /** PROPOSED: the names of the last five to join, newest first, for the lobby (the `recent` of `joined.count`, so a reload shows them too). */
    recent: string[];
  };
  /** While students may still join; null after End. */
  join: JoinToken | null;
  question: PublicQuestion | null;
  progress: { answered: number; joined: number } | null;
  /** Once the teacher reveals the question. */
  reveal: { session_question_id: Id; correct_answer: string; explanation: string | null; counts: RevealCounts } | null;
  /** The open or last question was skipped: the view says it does not count (BR-SKIP-01). */
  skipped: boolean;
  board: LeaderboardRow[];
  review: ClassViewReview | null;
};

/** POST /sessions/{id}/advance. Forward only: lobby, teaching, review (4.1, INTERPRETATION). */
export type AdvanceRequest = { to: "teaching" | "review" };

/**
 * POST /sessions/{id}/adhoc (FR-POP-04). PROPOSED, and OPEN-14: its types and whether it scores are not decided.
 * This reading keeps both open: a question with `correct: null` is a poll and scores nothing.
 */
export type AdhocRequest = {
  /** PROPOSED: `numeric` too (the spec lists two kinds). */
  kind: QuestionKind;
  prompt: string;
  options?: string[];
  correct: string | null;
  timer_seconds: number;
  /** PROPOSED: for `numeric` only; the tolerance is 0 in a quick question. */
  numeric?: { unit: string | null; tolerance: number; allow_negative: boolean };
};

/** POST /sessions/{id}/attendance/{student_id}/no-device (FR-ATT-04, F-11). */
export type NoDeviceRequest = { reason: NoDeviceReason };

/** One row of the attendance list the teacher copies into e-Дневник: every enrolled student (FR-END-03, OPEN-06 on the format). */
export type AttendanceRow = {
  student_id: Id;
  full_name: string;
  status: AttendanceStatus;
  joined_at: IsoTime | null;
  no_device_reason: NoDeviceReason | null;
  /** Who wrote the mark (3.1 Attendance.marked_by). */
  marked_by: "student" | "teacher" | "system";
};

export type AttendanceTally = Record<AttendanceStatus, number> & { total: number };

/** POST /sessions/{id}/end (F-10, FR-END-02). PROPOSED shape. */
export type EndResult = {
  server_now: IsoTime;
  session: SessionRef;
  attendance: AttendanceRow[];
  tally: AttendanceTally;
  most_missed: MissedQuestion[];
};

/** GET /sessions/{id}/review (FR-REV-01, FR-REV-02). PROPOSED shape. */
export type SessionReview = {
  server_now: IsoTime;
  session: SessionRef;
  most_missed: MissedQuestion[];
  anon_questions: AnonQuestionItem[];
  /** The full list, once the session has ended. */
  attendance: AttendanceRow[] | null;
};

/** A practice set (3.1, BR-PRA-01). */
export type PracticeSetSummary = {
  id: Id;
  session_id: Id;
  course_id: Id;
  created_at: IsoTime;
  question_count: number;
};

/** POST /sessions/{id}/practice-set. `practice_set` is null when no question was missed (EC-PRA-07). PROPOSED. */
export type PracticeSetResult = { practice_set: PracticeSetSummary | null };

/** GET /sessions/{id}/practice-set (FR-PRA-04). PROPOSED: the spec says the teacher sees who did it, and lists no endpoint. */
export type PracticeResults = {
  practice_set: PracticeSetSummary;
  students: { student_id: Id; full_name: string; score: number | null; completed_at: IsoTime | null }[];
};

// ---- Course dashboard (FR-DASH-01, GET /courses/{id}/dashboard) ----------------------------------

/** All PROPOSED: the spec says what the screen shows and lists no payload. */
export type DashboardStudent = {
  id: Id;
  full_name: string;
  /** Joined the class partway through the year (FR-DASH-04, BR-ROS-01). */
  joined_mid_year: boolean;
  joined_class_at: IsoTime | null;
  /** The season's points in this course. */
  points: number;
};

/** One finished lesson in the course's history; `lesson_id` makes it reusable (FR-DASH-01). */
export type DashboardSession = {
  id: Id;
  lesson: { id: Id; title: string; version: number };
  started_at: IsoTime;
  ended_at: IsoTime;
  question_count: number;
  tally: AttendanceTally;
  /** Answers given per pop-up per joined student, 0 to 1 (the report's "engagement", OPEN-19). */
  participation: number;
  /** Right answers among the answers given, 0 to 1. */
  right_rate: number;
  /** Points the class earned in the lesson. */
  points: number;
};

/** One student at one lesson. A reason accompanies `present_no_device` so a zero is not read as disengagement (FR-DASH-03). */
export type DashboardAttendance = {
  session_id: Id;
  student_id: Id;
  status: AttendanceStatus;
  no_device_reason: NoDeviceReason | null;
};

/** How the class, and each student, did on a topic across all lessons (BR-TOP-01, FR-DASH-01). */
export type DashboardTopic = {
  topic: string;
  right: number;
  total: number;
  by_student: { student_id: Id; right: number; total: number }[];
};

export type DashboardFocusFlag = FocusFlag & { session_id: Id; away_seconds: number | null };

export type DashboardAnonQuestion = AnonQuestionItem & { session_id: Id };

export type DashboardPractice = {
  practice_set: PracticeSetSummary;
  /** Students in the class when it was sent. */
  students: number;
  completed: number;
  /** The mean of the completed students' scores, or null when nobody finished. */
  average_score: number | null;
};

export type CourseDashboard = {
  server_now: IsoTime;
  course: CourseSummary;
  students: DashboardStudent[];
  /** Newest first. */
  sessions: DashboardSession[];
  attendance: DashboardAttendance[];
  topics: DashboardTopic[];
  focus_flags: DashboardFocusFlag[];
  anon_questions: DashboardAnonQuestion[];
  practice: DashboardPractice[];
};

// ---- Realtime (11.2, 11.4) -----------------------------------------------------------------------

/**
 * `session.{id}.public`: what a student may read too (11.2). `session.{id}.class` (PROPOSED): the projected window's own channel,
 * for what only the class view and the teacher may read: the live join token and the text of anonymous questions in the review.
 * `session.{id}.console`: the teacher only, and everything the other two carry.
 */
export type PublicChannel = `session.${string}.public`;
export type ClassChannel = `session.${string}.class`;
export type ConsoleChannel = `session.${string}.console`;
export type TeacherChannel = PublicChannel | ClassChannel | ConsoleChannel;

type Event<T extends string, F = object> = { type: T; channel: TeacherChannel; server_now: IsoTime } & F;

/** On the public channel, which students read, and so on the class view's and the console's too. */
export type PublicEvent =
  | Event<"state.changed", { state: SessionState }>
  | Event<"joined.count", { joined_count: number; recent?: string[] }>
  | Event<"question.opened", { question: PublicQuestion }>
  | Event<"question.progress", { session_question_id: Id; answered: number; joined: number }>
  | Event<"question.closed", { session_question_id: Id }>
  | Event<
      "question.revealed",
      { session_question_id: Id; correct_answer: string; explanation: string | null; counts: RevealCounts }
    >
  | Event<"question.skipped", { session_question_id: Id }>
  | Event<"leaderboard.updated", { rows: LeaderboardRow[] }>;

/**
 * On the class channel (PROPOSED), and so on the console's: nothing a student may read. The spec puts `join_token.rotated` on the
 * public channel and calls it "class view only", and students subscribe to that channel (11.2), so a student at home could follow the
 * rotating token; the text of the review's anonymous questions conflicts with BR-ANON-06 the same way (OPEN-36).
 */
export type ClassOnlyEvent = Event<"join_token.rotated", JoinToken> | Event<"review.ready", ClassViewReview>;

/** Only on the console channel. All PROPOSED fields. */
export type ConsoleOnlyEvent =
  | Event<"student.joined", { student: ConsoleStudent }>
  | Event<"student.answer_state", { session_question_id: Id; student_id: Id; state: AnswerState }>
  | Event<"student.presence", { student_id: Id; online: boolean }>
  | Event<"anon_question.received", { question: AnonQuestionItem }>
  /** Sent when a student leaves during a question, and again with `back_at` when they return (FR-FOC-06). */
  | Event<"focus.flag", { flag: FocusFlag }>
  | Event<"nudge", { idle_seconds: number }>;

/** Sent by the stream itself every 20 s. */
export type PingEvent = Event<"ping">;

export type ChannelEvent = PublicEvent | ClassOnlyEvent | ConsoleOnlyEvent | PingEvent;
export type ChannelEventType = ChannelEvent["type"];

/** The event names a channel carries, for a client that wants to check what it was sent. */
export const PUBLIC_EVENT_TYPES = [
  "state.changed",
  "joined.count",
  "question.opened",
  "question.progress",
  "question.closed",
  "question.revealed",
  "question.skipped",
  "leaderboard.updated",
  "ping",
] as const satisfies readonly ChannelEventType[];

export const CLASS_EVENT_TYPES = [...PUBLIC_EVENT_TYPES, "join_token.rotated", "review.ready"] as const satisfies readonly ChannelEventType[];

export const CONSOLE_EVENT_TYPES = [
  ...CLASS_EVENT_TYPES,
  "student.joined",
  "student.answer_state",
  "student.presence",
  "anon_question.received",
  "focus.flag",
  "nudge",
] as const satisfies readonly ChannelEventType[];

export const publicChannel = (sessionId: Id): PublicChannel => `session.${sessionId}.public`;
export const classChannel = (sessionId: Id): ClassChannel => `session.${sessionId}.class`;
export const consoleChannel = (sessionId: Id): ConsoleChannel => `session.${sessionId}.console`;
