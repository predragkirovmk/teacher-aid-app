import type {
  AnswerInput,
  AskInput,
  FocusEventInput,
  AnswerReceipt,
  AttendanceSummary,
  Badge,
  Course,
  DataSummary,
  Id,
  JoinInput,
  JoinResult,
  Leaderboard,
  LeaderboardScope,
  Notification,
  NotificationPage,
  PhotoUpload,
  PracticeAnswer,
  PracticeAttempt,
  PracticeSet,
  ProfileUpdate,
  PushRegistration,
  SessionResult,
  SettingsUpdate,
  Student,
  StudentSessionState,
  SignInRedirect,
  StudentSignIn,
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
   * POST /auth/student/start: the provider the student chose (Google or Microsoft) begins a sign-in (F-02). Always answers with
   * a redirect to that provider; the student comes back through `GET /auth/callback/{provider}`, which signs them in and sends the
   * browser to `return_to`, with `?error=unknown_email` or `?error=sign_in_failed` when it could not (EC-AUTH-02, -09, -10).
   * Rejects `rate_limited`.
   */
  startSignIn(input: StudentSignIn): Promise<SignInRedirect>;
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

  // Privacy
  /**
   * POST /me/acknowledgements (PROPOSED): the student saw the privacy notice and terms of this version and tapped Continue. Stored with the
   * version and the time; repeating a version changes nothing. Answers with the student, whose `acknowledgement` is now this one.
   */
  acknowledgeNotice(version: string): Promise<Student>;
  /** GET /me/data-summary (PROPOSED): what the server holds about the student, as counts. */
  getDataSummary(): Promise<DataSummary>;

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
  /** GET /me/notifications, newest first, a page at a time (PROPOSED: `?limit=&before=`). */
  listNotifications(page?: NotificationPage): Promise<Notification[]>;
  /** POST /me/notifications/read: some ids, or "all". */
  markNotificationsRead(ids: Id[] | "all"): Promise<void>;

  // Web push
  /** PUT /me/push-token (PROPOSED): this phone's push subscription replaces the student's previous one. */
  setPushToken(registration: PushRegistration): Promise<void>;
  /** DELETE /me/push-token (PROPOSED): no more pushes to this student. Not an error when there was none. */
  removePushToken(): Promise<void>;

  // Practice sets
  /** GET /me/practice-sets, newest first: the sets the teacher sent, with the student's progress in each. */
  listPracticeSets(): Promise<PracticeSet[]>;
  /**
   * POST /practice-sets/{id}/answers (PROPOSED: one answer or several). The first answer to a question stands: a repeat
   * answers with the stored verdict and `duplicate`. Rejects `not_found` for a question that is not the set's and
   * `validation_failed` for a response the question cannot have.
   */
  submitPracticeAnswers(id: Id, answers: PracticeAnswer[]): Promise<PracticeAttempt>;

  // Live session, student side
  /** POST /sessions/join: the QR token or the short code. Idempotent (FR-JOIN-07). */
  joinSession(input: JoinInput): Promise<JoinResult>;
  /** GET /sessions/{id}/student-state: the snapshot after a reconnect. */
  getStudentState(sessionId: Id): Promise<StudentSessionState>;
  /** POST /sessions/{id}/answers. Idempotent on `idempotencyKey` (EC-NET-06). */
  submitAnswer(sessionId: Id, answer: AnswerInput): Promise<AnswerReceipt>;
  /**
   * POST /sessions/{id}/anon-questions: a question to the teacher (F-09). The teacher sees the sender; classmates never do
   * (BR-ANON-01). Idempotent on `idempotencyKey`. Rejects `limit_reached` (BR-ANON-02), `session_ended`, `validation_failed`.
   */
  submitAsk(sessionId: Id, ask: AskInput): Promise<AnswerReceipt>;
  /** POST /sessions/{id}/focus-events: the times the student left the quiz and came back during open questions (PROPOSED, 7.10). */
  sendFocusEvents(sessionId: Id, events: FocusEventInput[]): Promise<void>;

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
