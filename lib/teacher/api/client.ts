import { apiMode } from "./config";
import { createLiveApi } from "./live";
import { createBrowserMock, createServerMock } from "./mock-browser";
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
  SourceCreated,
  SourceInput,
  TeacherChannel,
  UpdateLessonRequest,
  AnonQuestionItem,
} from "./types";

export type Unsubscribe = () => void;

/**
 * The teacher endpoints of spec 11.1 as the app sees them: the wire types in and out, failures
 * thrown as ApiError. Two adapters implement it, `mock` and `live`; screens never call it
 * directly but go through the hooks in hooks.ts.
 *
 * Methods marked PROPOSED have no endpoint in 11.1 at all: a screen of the plan needs them, so
 * they are named here and listed in docs/handoff-pending-2.md for the backend.
 */
export interface TeacherApi {
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
  /** POST /lessons/sources: a PDF or .docx, or typed sentences. Rejects `validation_failed` with a reason (BR-LES-05, EC-LES-06). */
  createSource(input: SourceInput): Promise<SourceCreated>;
  /** POST /lessons/generate. Slow: the AI writes the lesson. Rejects `generation_failed` after the one retry (EC-LES-02). */
  generateLesson(request: GenerateRequest): Promise<LessonDraft>;
  /** PROPOSED, GET /lessons/drafts/{id}: a draft by id, so a reloaded review screen finds it again. */
  getDraft(draftId: Id): Promise<LessonDraft>;
  /** POST /lessons/drafts/{id}/refine: one of the four fixed refinements, no free text (FR-LES-08). Answers a new draft. */
  refineDraft(draftId: Id, refinement: Refinement): Promise<LessonDraft>;
  /** POST /lessons: the draft as edited, saved as version 1 (FR-LES-09). */
  saveLesson(request: SaveLessonRequest): Promise<Lesson>;
  /** PROPOSED, POST /lessons/media: an image for a question (FR-LES-10, FR-LES-11). */
  uploadMedia(file: Blob): Promise<QuestionMedia>;

  // ---- Lessons and the school library (F-05) ----
  /** GET /lessons. */
  listLessons(): Promise<LessonSummary[]>;
  /** GET /lessons/{id}. */
  getLesson(lessonId: Id): Promise<Lesson>;
  /** PUT /lessons/{id}: a new version. Sessions that ran keep theirs (BR-LES-03). */
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
};

// Both adapters are imported by name and the choice is made on a build-time constant, so a bundler can drop the one a
// build does not use.
const browserMock = apiMode === "mock" ? createBrowserMock() : null;

/** The adapter the app talks to, chosen by NEXT_PUBLIC_API_MODE when it is built. */
export const api: TeacherApi = browserMock ? browserMock.api : createLiveApi();

/**
 * What the server render, and the render that hydrates it, may know. In mock mode that is a fresh demo school, so both
 * sides draw the same first frame; live data cannot be known there, so it is null and the first frame is a loading state.
 */
export const serverApi: TeacherApi | null = apiMode === "mock" ? createServerMock() : null;

/** The demo's controls, or null on a live build. */
export const demo: DemoControls | null = browserMock ? browserMock.demo : null;
