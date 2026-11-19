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

export type SessionState = "lobby" | "teaching" | "ended";
/**
 * The states a pop-up question goes through (4.2). `ready` is a question that has not been fired. `revealed` is a question that
 * has ended: the right answer shows by itself the moment it does.
 */
export type QuestionStatus = "ready" | "open" | "revealed" | "skipped";
export type QuestionKind = "multiple_choice" | "true_false" | "numeric";
/** What a student has done with the open question, as the console shows it (FR-CON-01). */
export type AnswerState = "answered" | "not_answered" | "offline";
export type Refinement = "easier" | "harder" | "more_questions" | "shorter_timers";
export type AuthProvider = "google" | "microsoft";
export type SourceKind = "upload" | "typed";

/**
 * What kind of institution a school is (3.1 School.type: гимназија, стручно, уметничко, faculty).
 * PROPOSED codes. A `faculty` is a university: the app words it "студенти".
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

/** What a teacher edits: the title and the questions. */
export type LessonContent = {
  title: string;
  questions: Question[];
};

/** One item of GET /lessons. PROPOSED. */
export type LessonSummary = {
  id: Id;
  title: string;
  question_count: number;
  /** The number of the current version (FR-LES-09). */
  version: number;
  /** How many times it has been run. 0 is a prepared lesson that has not been run. */
  times_run: number;
  last_run_at: IsoTime | null;
  /** Set on a copy from the school library (F-05). */
  copied_from: { lesson_id: Id; owner_name: string } | null;
  created_at: IsoTime;
  updated_at: IsoTime;
  /** PROPOSED: the latest session of this lesson that has ended, so a held lesson leads to its end page; null when it has none. */
  last_session_id: Id | null;
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
export type GenerateRequest = { source_id: Id; emphasis?: string | null };

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
 * reaches students before the teacher reviews it (BR-LES-04). `title` and `questions` are null until it is ready
 * (INTERPRETATION); `failure` is null unless it failed.
 */
export type LessonDraft = DraftBase &
  (
    | { status: "pending"; failure: null; title: null; questions: null }
    | { status: "failed"; failure: "generation_failed"; title: null; questions: null }
    | { status: "ready"; failure: null; title: string; questions: DraftQuestion[] }
  );

export type ReadyDraft = Extract<LessonDraft, { status: "ready" }>;

/** One item of GET /lessons/drafts: an unsaved draft, the latest of its chain (FR-LES-20). `title` and `question_count` are null until ready. */
export type DraftSummary = {
  id: Id;
  status: DraftStatus;
  failure: "generation_failed" | null;
  title: string | null;
  question_count: number | null;
  refinements: Refinement[];
  emphasis: string | null;
  source: { kind: SourceKind; file_name: string | null } | null;
  previous_draft_id: Id | null;
  /** PROPOSED: the lesson a draft edits, so the list can tell it from a new lesson. */
  lesson_id: Id | null;
  created_at: IsoTime;
  updated_at: IsoTime;
};

/**
 * PATCH /lessons/drafts/{id}. PROPOSED. Only what changed, each field replacing the draft's: `questions` is the whole list in order.
 * A ready draft only (`invalid_state`, 409, for a pending, failed or saved one). The draft may hold unfinished content (DraftQuestion);
 * the answer is the draft.
 */
export type DraftPatch = { title?: string; questions?: DraftQuestion[] };

/** POST /lessons: the draft as the teacher edited it (FR-LES-07) becomes a lesson at version 1. PROPOSED body. */
export type SaveLessonRequest = LessonContent & { draft_id: Id };

/** PUT /lessons/{id}: a new version; sessions that already ran keep theirs (BR-LES-03). `draft_id` (PROPOSED) is the draft it was edited in, which is consumed. */
export type UpdateLessonRequest = LessonContent & { draft_id?: Id };

// ---- School library (F-05) -----------------------------------------------------------------------

/** One item of GET /library: a lesson a colleague in the same school saved (FR-LIB-01). PROPOSED. */
export type LibraryItem = {
  lesson_id: Id;
  title: string;
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
  /** The session question's id, the one fire and skip take. */
  id: Id;
  question: Question;
  status: QuestionStatus;
  /** True for a question made on the spot (FR-POP-04). */
  adhoc: boolean;
  fired_at: IsoTime | null;
  closes_at: IsoTime | null;
  /** When the question ended and its answer showed: at its time, or sooner when everyone there and online had answered (BR-TIME-04). */
  revealed_at: IsoTime | null;
  skipped_at: IsoTime | null;
  answered: number;
  /** How many students had joined when it opened. */
  joined: number;
  /** PROPOSED: the counts once the question has ended (right, wrong, unanswered, and by response), so the console can say them at the reveal. Null before. */
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

/** A live run of a lesson. */
export type SessionRef = {
  id: Id;
  lesson: { id: Id; title: string; version: number };
  state: SessionState;
  started_at: IsoTime;
  ended_at: IsoTime | null;
};

/** POST /sessions. */
export type CreateSessionRequest = { lesson_id: Id };

/** GET /sessions/open (FR-END-04): any open session of the teacher, so End works from anywhere. PROPOSED shape. */
export type OpenSession = {
  server_now: IsoTime;
  session: SessionRef | null;
};

/** The QR token and the short code beside it, both rotating every 30 s (BR-JOIN-02). */
export type JoinToken = { token: string; short_code: string; valid_to: IsoTime };

/** A student who has scanned the code and joined. The console lists no one else (owner's simplification, 2026-11-17). */
export type ConsoleStudent = {
  id: Id;
  full_name: string;
  joined_at: IsoTime;
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
  session: SessionRef;
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

/** GET /sessions/{id}/class-view: the projected window's snapshot. No private data (FR-SES-02). */
export type ClassViewSnapshot = {
  server_now: IsoTime;
  session: {
    id: Id;
    state: SessionState;
    lesson_title: string;
    joined_count: number;
    /** PROPOSED: the names of the last five to join, newest first, for the lobby (the `recent` of `joined.count`, so a reload shows them too). */
    recent: string[];
  };
  /** While students may still join; null after End. */
  join: JoinToken | null;
  question: PublicQuestion | null;
  progress: { answered: number; joined: number } | null;
  /** Once the question has ended. */
  reveal: { session_question_id: Id; correct_answer: string; explanation: string | null; counts: RevealCounts } | null;
  /** The open or last question was skipped: the view says it does not count (BR-SKIP-01). */
  skipped: boolean;
  board: LeaderboardRow[];
};

/** POST /sessions/{id}/advance: from the lobby to teaching (4.1, INTERPRETATION). There is no review phase after it. */
export type AdvanceRequest = { to: "teaching" };

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

/** A student who joined, with how many of the questions put to them they got right (the end page). */
export type ResultRow = { student_id: Id; full_name: string; correct: number; asked: number };

/**
 * GET /sessions/{id}/review and POST /sessions/{id}/end (FR-END-02). PROPOSED shape. The review answers only once the session has
 * ended (`invalid_state`, 409, before). `students` are those who joined, by surname. `asked` counts the questions sent after the
 * student joined that were not skipped and have a right answer (an ad-hoc question with `correct: null` is a poll and counts for
 * nobody); `correct` is how many of those they answered right.
 */
export type SessionReview = {
  server_now: IsoTime;
  session: SessionRef;
  students: ResultRow[];
};

// ---- Realtime (11.2, 11.4) -----------------------------------------------------------------------

/**
 * `session.{id}.public`: what a student may read too (11.2). `session.{id}.class` (PROPOSED): the projected window's own channel,
 * for what only the class view and the teacher may read: the live join token.
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
  | Event<
      "question.revealed",
      { session_question_id: Id; correct_answer: string; explanation: string | null; counts: RevealCounts }
    >
  | Event<"question.skipped", { session_question_id: Id }>
  | Event<"leaderboard.updated", { rows: LeaderboardRow[] }>;

/**
 * On the class channel (PROPOSED), and so on the console's: nothing a student may read. The spec puts `join_token.rotated` on the
 * public channel and calls it "class view only", and students subscribe to that channel (11.2), so a student at home could follow the
 * rotating token; the text of anonymous questions would conflict with BR-ANON-06 the same way (OPEN-36).
 */
export type ClassOnlyEvent = Event<"join_token.rotated", JoinToken>;

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
  "question.revealed",
  "question.skipped",
  "leaderboard.updated",
  "ping",
] as const satisfies readonly ChannelEventType[];

export const CLASS_EVENT_TYPES = [...PUBLIC_EVENT_TYPES, "join_token.rotated"] as const satisfies readonly ChannelEventType[];

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
