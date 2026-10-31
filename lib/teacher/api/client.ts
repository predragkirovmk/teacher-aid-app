import { watchSession } from "./session";
import type {
  AdhocRequest,
  AdvanceRequest,
  ChannelEvent,
  ClassViewSnapshot,
  ConsoleSnapshot,
  CoursePatch,
  CourseDashboard,
  CourseSummary,
  CreateSessionRequest,
  DraftPatch,
  DraftSummary,
  EndResult,
  GenerateRequest,
  Id,
  Lesson,
  LessonDraft,
  LessonSummary,
  LibraryItem,
  Me,
  NoDeviceRequest,
  OpenSession,
  PracticeResults,
  PracticeSetResult,
  QuestionMedia,
  Refinement,
  SaveLessonRequest,
  SessionReview,
  SignInRedirect,
  SignInRequest,
  SourceCreated,
  SourceInput,
  TeacherChannel,
  UpdateLessonRequest,
  AnonQuestionItem,
} from "./types";

export type Unsubscribe = () => void;

/** What a slow call may be given: a way for the screen to stop waiting (Cancel, a connection that dropped, a limit that ran out). */
export type CallOptions = { signal?: AbortSignal };

/**
 * The teacher endpoints of spec 11.1 as the app sees them: the wire types in and out, failures
 * thrown as ApiError. Two adapters implement it, `mock` and `live`; screens never call it
 * directly but go through the hooks in hooks.ts.
 *
 * Methods marked PROPOSED have no endpoint in 11.1 at all: a screen of the plan needs them, so
 * they are named here and listed in docs/handoff-pending-2.md for the backend.
 */
export interface TeacherApi {
  // ---- Signing in (F-01) ----
  /**
   * POST /auth/start: the provider the teacher chose. Answers with where to send the browser (a full page load, not a fetch);
   * the provider returns to `GET /auth/callback/{provider}`, which signs the teacher in and redirects to `return_to`, or to
   * `return_to` with `?error=unknown_email` or `?error=sign_in_failed` and nobody signed in (EC-AUTH-09, EC-AUTH-10). Those two
   * codes never arrive as an HTTP error. Rejects `network`, `validation_failed` and `rate_limited` (EC-AUTH-07).
   */
  startSignIn(request: SignInRequest): Promise<SignInRedirect>;
  /** POST /auth/logout, 204. A session the server already ended answers `unauthenticated`, which counts as signed out (EC-AUTH-08). */
  signOut(): Promise<void>;

  // ---- Who is signed in (F-01) ----
  /** GET /me. Rejects `unauthenticated` when nobody is signed in. */
  getMe(): Promise<Me>;
  /** PROPOSED, PATCH /me: the guided first lesson is done (FR-SUP-03). Answers with the teacher. */
  setFirstRunDone(): Promise<Me>;

  // ---- Courses ----
  /** GET /teacher/courses. */
  listCourses(): Promise<CourseSummary[]>;
  /** GET /courses/{id}/dashboard (FR-DASH-01). */
  getDashboard(courseId: Id): Promise<CourseDashboard>;
  /** PATCH /courses/{id}: the speed bonus on or off (BR-PTS-04). */
  updateCourse(courseId: Id, patch: CoursePatch): Promise<CourseSummary>;

  // ---- Making a lesson (F-03, F-04) ----
  /**
   * POST /lessons/sources: a PDF or .docx, or typed sentences. Rejects `validation_failed` with a reason (BR-LES-05, EC-LES-06).
   * A file is slow (BR-LES-09); the `signal` stops the wait, and the call then rejects `network`.
   */
  createSource(input: SourceInput, options?: CallOptions): Promise<SourceCreated>;
  /**
   * POST /lessons/generate: asks for the questions and answers at once with the draft in `pending` (`202`), a job that goes on without the
   * screen (FR-LES-14, BR-LES-08). Rejects `not_found` for a source it no longer holds (BR-LES-13). The `signal` stops the wait for the answer.
   */
  generateLesson(request: GenerateRequest, options?: CallOptions): Promise<LessonDraft>;
  /** GET /lessons/drafts/{id}: a draft by id, whatever it is doing. The wait asks again every few seconds while it is `pending` (EC-LES-09). */
  getDraft(draftId: Id): Promise<LessonDraft>;
  /** GET /lessons/drafts: the unsaved drafts, the latest of each chain, newest first (FR-LES-20). */
  listDrafts(): Promise<DraftSummary[]>;
  /** PROPOSED, PATCH /lessons/drafts/{id}: the teacher's edits, saved as they are made. Rejects `invalid_state` for a draft that is not ready. */
  updateDraft(draftId: Id, patch: DraftPatch): Promise<LessonDraft>;
  /** DELETE /lessons/drafts/{id}: throws a draft away, which is how a `pending` one is cancelled (FR-LES-21). */
  deleteDraft(draftId: Id): Promise<void>;
  /** POST /lessons/drafts/{id}/retry: runs a `failed` draft again, with the same source (FR-LES-22). Answers the same draft, `pending`. */
  retryDraft(draftId: Id): Promise<LessonDraft>;
  /** POST /lessons/drafts/{id}/refine: one of the four fixed refinements, no free text (FR-LES-08). A job: answers a new draft, `pending`. */
  refineDraft(draftId: Id, refinement: Refinement): Promise<LessonDraft>;
  /** PROPOSED, POST /lessons/{id}/drafts: a draft of a saved lesson, to edit it. Answers the draft (ready), the unsaved one if there is one already. */
  startEditing(lessonId: Id): Promise<LessonDraft>;
  /** POST /lessons: the draft as edited, saved as version 1 (FR-LES-09). Consumes the draft. */
  saveLesson(request: SaveLessonRequest): Promise<Lesson>;
  /** PROPOSED, POST /lessons/media: an image for a question (FR-LES-10, FR-LES-11). */
  uploadMedia(file: Blob): Promise<QuestionMedia>;

  // ---- Lessons and the school library (F-05) ----
  /** GET /lessons. */
  listLessons(): Promise<LessonSummary[]>;
  /** GET /lessons/{id}. */
  getLesson(lessonId: Id): Promise<Lesson>;
  /** PUT /lessons/{id}: a new version. Sessions that ran keep theirs (BR-LES-03). With a `draft_id`, that draft is consumed. */
  updateLesson(lessonId: Id, request: UpdateLessonRequest): Promise<Lesson>;
  /** PROPOSED, DELETE /lessons/{id}. Copies and past sessions survive (EC-LES-04). */
  deleteLesson(lessonId: Id): Promise<void>;
  /** GET /library: lessons colleagues in the same school saved (FR-LIB-01). */
  listLibrary(): Promise<LibraryItem[]>;
  /** POST /library/{lesson_id}/copy: a new lesson owned by the teacher; the original is never touched (F-05). */
  copyFromLibrary(lessonId: Id): Promise<Lesson>;

  // ---- Running a lesson (F-06 to F-11) ----
  /** POST /sessions: starts in the lobby. Rejects `session_open` when the course already has one (EC-SES-02). */
  createSession(request: CreateSessionRequest): Promise<ConsoleSnapshot>;
  /** GET /sessions/open: the teacher's open session, if any, so End works from anywhere (FR-END-04). */
  getOpenSession(): Promise<OpenSession>;
  /** GET /sessions/{id}/console. */
  getConsole(sessionId: Id): Promise<ConsoleSnapshot>;
  /** GET /sessions/{id}/class-view: the public snapshot, no private data. */
  getClassView(sessionId: Id): Promise<ClassViewSnapshot>;
  /** POST /sessions/{id}/advance: forward only (4.1). Answers the fresh console snapshot, as do the calls below that change it. */
  advance(sessionId: Id, request: AdvanceRequest): Promise<ConsoleSnapshot>;
  /** POST /sessions/{id}/questions/{sqid}/fire. */
  fireQuestion(sessionId: Id, sessionQuestionId: Id): Promise<ConsoleSnapshot>;
  /** POST /sessions/{id}/questions/{sqid}/reveal. */
  revealQuestion(sessionId: Id, sessionQuestionId: Id): Promise<ConsoleSnapshot>;
  /** POST /sessions/{id}/questions/{sqid}/skip (BR-SKIP-01). */
  skipQuestion(sessionId: Id, sessionQuestionId: Id): Promise<ConsoleSnapshot>;
  /** POST /sessions/{id}/adhoc (FR-POP-04, OPEN-14). */
  fireAdhoc(sessionId: Id, request: AdhocRequest): Promise<ConsoleSnapshot>;
  /** POST /sessions/{id}/attendance/{student_id}/no-device (FR-ATT-04). */
  markNoDevice(sessionId: Id, studentId: Id, request: NoDeviceRequest): Promise<ConsoleSnapshot>;
  /** PROPOSED, PATCH /sessions/{id}/anon-questions/{id}: the teacher answered it aloud. */
  markAnonAnswered(sessionId: Id, anonQuestionId: Id): Promise<AnonQuestionItem>;
  /** POST /sessions/{id}/end: the full attendance list and the most-missed questions (F-10). */
  endSession(sessionId: Id): Promise<EndResult>;
  /** GET /sessions/{id}/review. */
  getReview(sessionId: Id): Promise<SessionReview>;
  /** POST /sessions/{id}/practice-set: one per session, from what was missed (F-12). */
  createPracticeSet(sessionId: Id): Promise<PracticeSetResult>;
  /** PROPOSED, GET /sessions/{id}/practice-set: who did it and how many they got right (FR-PRA-04). */
  getPracticeResults(sessionId: Id): Promise<PracticeResults>;

  // ---- Realtime (11.2, 11.4) ----
  /**
   * `GET /api/v1/realtime?channels=...` as Server-Sent Events. Calls `onEvent` for each event of the channel until the
   * returned function is called. The mock rejects it as `not_implemented` until the session driver exists.
   */
  openChannel(channel: TeacherChannel, onEvent: (event: ChannelEvent) => void): Unsubscribe;

  /**
   * Called when what the client knows may have changed behind the app's back: the mock when its data changes in another
   * window or is reset, the live adapter on a realtime event later. Returns the way to stop listening.
   */
  subscribe(listener: () => void): Unsubscribe;
}

/**
 * A promise that is already settled and says so, so a hook can read the answer in the render that
 * asked for it instead of showing a loading state first. The mock adapter returns these for reads;
 * the live adapter's promises are ordinary and settle later.
 */
export type SettledPromise<T> = Promise<T> & { settled: { ok: true; value: T } | { ok: false; error: unknown } };

/** The demo's own controls, which only the mock has. */
export type DemoControls = {
  /** Start the demo school over: the lessons the teacher made go, and the history is as of today. */
  reset(): void;
  /** Open a lesson that began twelve minutes ago, so Today and the rest can be seen while one is running. */
  simulateRunning(): void;
  /** Close the open lesson. Ending a lesson is step 9's; until then this is how the demo gets back to none running. */
  closeRunning(): void;
};

// The environment is read inside each condition, and the adapters are required inside them, so a build proves the other
// branch dead and leaves that adapter (the mock's demo schools, or the live fetch code) out of its bundle. An `import` at
// the top of the file would always ship both. Nothing that is unit tested imports this file.
/* eslint-disable @typescript-eslint/no-require-imports */

const browserMock =
  process.env.NEXT_PUBLIC_API_MODE === "live" ? null : (require("./mock-browser") as typeof import("./mock-browser")).createBrowserMock();

/**
 * The adapter the app talks to, chosen by NEXT_PUBLIC_API_MODE when it is built, with every call watched for the answer
 * "you are not signed in" (session.ts), which ends the session wherever in the app it comes from.
 */
export const api: TeacherApi = watchSession(
  process.env.NEXT_PUBLIC_API_MODE === "live" ? (require("./live") as typeof import("./live")).createLiveApi() : browserMock!.api,
);

/**
 * What the server render, and the render that hydrates it, may know. In mock mode that is a fresh demo school, so both
 * sides draw the same first frame; live data cannot be known there, so it is null and the first frame is a loading state.
 */
export const serverApi: TeacherApi | null =
  process.env.NEXT_PUBLIC_API_MODE === "live" ? null : (require("./mock-browser") as typeof import("./mock-browser")).createServerMock();

/** The demo's controls, or null on a live build. */
export const demo: DemoControls | null = process.env.NEXT_PUBLIC_API_MODE === "live" ? null : browserMock!.demo;
