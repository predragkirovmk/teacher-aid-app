import type {
  AnswerInput,
  AnswerReceipt,
  AttendanceSummary,
  Badge,
  Course,
  Id,
  JoinInput,
  JoinResult,
  Leaderboard,
  LeaderboardScope,
  Notification,
  PhotoUpload,
  PracticeAnswer,
  PracticeAttempt,
  PracticeSet,
  ProfileUpdate,
  SessionResult,
  SettingsUpdate,
  Student,
  StudentSessionState,
  SignInChallenge,
  StudentSignIn,
  StudentSignInCode,
  TopicProgress,
} from "./types";

/**
 * The student endpoints of spec 11.1, as the app sees them: domain types in and out, errors thrown
 * as ApiError. Two adapters implement it: `mock` over the demo's local data and `live` over
 * `/api/v1`. Screens never call it directly; they go through the hooks in hooks.ts.
 */
export interface ApiClient {
  // Auth
  /**
   * POST /auth/student/start: the school email begins a sign-in (F-02). Answers with the next stage,
   * a code to type or a redirect (OPEN-01). Rejects `unknown_email` for an email on no roster (EC-AUTH-02).
   */
  startSignIn(input: StudentSignIn): Promise<SignInChallenge>;
  /**
   * POST /auth/student/verify: the code from the mailbox. Signs the student in, ending any other
   * session of theirs (BR-AUTH-03), and answers with the student. Rejects `invalid_code`,
   * `code_expired` or `rate_limited`.
   */
  completeSignIn(input: StudentSignInCode): Promise<Student>;
  /** POST /auth/logout. */
  signOut(): Promise<void>;
  /** GET /me. Rejects with `unauthenticated` when nobody is signed in. */
  getMe(): Promise<Student>;

  // Profile and settings
  /** PATCH /me/profile. */
  updateProfile(update: ProfileUpdate): Promise<Student>;
  /** PUT /me/profile/photo: a JPEG of up to 200 KB. */
  setPhoto(photo: PhotoUpload): Promise<Student>;
  /** DELETE /me/profile/photo. */
  removePhoto(): Promise<Student>;
  /** PATCH /me/settings. */
  updateSettings(update: SettingsUpdate): Promise<Student>;

  // Reading
  /** GET /me/courses. */
  listCourses(): Promise<Course[]>;
  /** GET /me/attendance. */
  getAttendance(): Promise<AttendanceSummary>;
  /** GET /me/results, newest first; `courseId` is `?course=`. */
  listResults(courseId?: Id): Promise<SessionResult[]>;
  /** GET /me/topics. */
  listTopics(): Promise<TopicProgress[]>;
  /** GET /me/leaderboard?scope=. */
  getLeaderboard(scope?: LeaderboardScope): Promise<Leaderboard>;
  /** GET /me/badges. */
  listBadges(): Promise<Badge[]>;

  // Notifications
  /** GET /me/notifications, newest first. */
  listNotifications(): Promise<Notification[]>;
  /** POST /me/notifications/read: some ids, or "all". */
  markNotificationsRead(ids: Id[] | "all"): Promise<void>;

  // Practice sets
  /** GET /me/practice-sets. */
  listPracticeSets(): Promise<PracticeSet[]>;
  /** POST /practice-sets/{id}/answers. */
  submitPracticeAnswers(id: Id, answers: PracticeAnswer[]): Promise<PracticeAttempt>;

  // Live session, student side
  /** POST /sessions/join: the QR token or the short code. Idempotent (FR-JOIN-07). */
  joinSession(input: JoinInput): Promise<JoinResult>;
  /** GET /sessions/{id}/student-state: the snapshot after a reconnect. */
  getStudentState(sessionId: Id): Promise<StudentSessionState>;
  /** POST /sessions/{id}/answers. Idempotent on `idempotencyKey` (EC-NET-06). */
  submitAnswer(sessionId: Id, answer: AnswerInput): Promise<AnswerReceipt>;
  /** POST /sessions/{id}/opener/vote: the student's vote on the opener (PROPOSED body: an answer's). Idempotent on `idempotencyKey`. */
  submitVote(sessionId: Id, vote: AnswerInput): Promise<AnswerReceipt>;
  /** POST /sessions/{id}/opener/reason: the one-line reason; `response` holds the text (PROPOSED). Idempotent on `idempotencyKey`. */
  submitReason(sessionId: Id, reason: AnswerInput): Promise<AnswerReceipt>;

  /**
   * Called when what the client knows may have changed behind the app's back: the mock when its
   * local data changes (this tab or another), the live adapter on a realtime event. Returns the
   * way to stop listening.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * A promise that is already settled and says so, so a hook can read the value in the render that
 * asked for it instead of showing a loading state first. The mock adapter returns these; the live
 * adapter's promises are ordinary and settle later.
 */
export type SettledPromise<T> = Promise<T> & { settled: { ok: true; value: T } | { ok: false; error: unknown } };
