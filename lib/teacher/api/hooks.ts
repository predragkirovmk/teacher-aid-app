"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DRAFT_POLL_MS } from "../lessons";
import { firstName, initials, personName, schoolTypeOf } from "../format";
import { authStatusOf, type AuthStatus, type EndReason } from "../guard";
import { applyClassEvent, applyConsoleEvent, consoleNeedsRead, serverOffset, tokenIsStale } from "../live";
import { preparedLessons } from "../today";
import { actions, useTeacher } from "../store";
import { apiMode } from "./config";
import { api, type CallOptions, type ChannelStatus, type TeacherApi } from "./client";
import { toApiError } from "./errors";
import { change, forget, invalidate, mapQuery, resetQueries, seed, slotFor, useQuery, type Query } from "./query";
import { endSession, useSessionEnd } from "./session";
import {
  classChannel,
  consoleChannel,
  type ChannelEvent,
  type ClassViewSnapshot,
  type ConsoleSnapshot,
  type NoDeviceReason,
  type TeacherChannel,
} from "./types";
import type {
  AdhocRequest,
  EndResult,
  PracticeResults,
  PracticeSetResult,
  SessionReview,
  CourseDashboard,
  CoursePatch,
  CourseSummary,
  CreateSessionRequest,
  DraftPatch,
  DraftSummary,
  GenerateRequest,
  Id,
  Lesson,
  LessonDraft,
  LessonSummary,
  LibraryItem,
  Me,
  OpenSession,
  QuestionMedia,
  Refinement,
  SaveLessonRequest,
  SignInRedirect,
  SignInRequest,
  SourceCreated,
  SourceInput,
  UpdateLessonRequest,
} from "./types";

export type { Query } from "./query";

/**
 * What screens use. Each read says whether it is loading, ready or failed (`status`), keeps the answer it had
 * while a refresh runs, and renders the same on the server and on the first client render. Each change goes
 * through the adapter and then loads again what it touched, so a list is right the moment a change has been made.
 *
 * Query keys: `me`, `courses`, `dashboard:<course>`, `lessons`, `lessons:<id>`, `draft-list`, `drafts:<id>`, `library`,
 * `open-session`, `console:<session>`, `class-view:<session>`. A change names the first part of the keys it touches.
 */

// ---- Reading --------------------------------------------------------------------------------------

/** The teacher who is signed in, and their school. */
export const useMe = (): Query<Me> => useQuery("me", (a) => a.getMe());

/** The teacher's courses: each a class and a subject. */
export const useCourses = (): Query<CourseSummary[]> => useQuery("courses", (a) => a.listCourses());

/** One course's results page (FR-DASH-01). `enabled: false` waits for an id. */
export const useDashboard = (courseId: Id | undefined): Query<CourseDashboard> =>
  useQuery(`dashboard:${courseId}`, (a) => a.getDashboard(courseId as Id), courseId !== undefined);

/** All the teacher's lessons, newest change first. */
export const useLessons = (): Query<LessonSummary[]> => useQuery("lessons", (a) => a.listLessons());

/** One lesson, whole: its questions and review summary. Also reads a lesson of the school library, to preview it. */
export function useLesson(lessonId: Id | undefined): Query<Lesson> {
  const q = useQuery(`lessons:${lessonId}`, (a) => a.getLesson(lessonId as Id), lessonId !== undefined);
  // A lesson that has just been deleted by the page that is showing it: the teacher is on the way to the list, so the page waits for
  // that and does not say, for the moment in between, that the lesson cannot be loaded.
  if (lessonId !== undefined && deletedLessons.has(lessonId)) return { ...q, status: "loading", data: undefined, error: null };
  return q;
}

/**
 * Ask again every few seconds for as long as `active` (11.4: a pending draft is read every 2 to 3 seconds). Nothing is asked while
 * the window is hidden, and the moment it is shown again it asks, so a teacher who comes back to the wait finds it as it now is.
 */
function usePolling(active: boolean, again: () => void) {
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") again();
    };
    const timer = setInterval(tick, DRAFT_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    // A connection that is back asks at once, rather than at the next tick.
    window.addEventListener("online", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [active, again]);
}

/**
 * A draft by id, whatever it is doing: a reload of the wait or of the editor finds it again (EC-LES-09). While it is `pending` it
 * is asked for again every few seconds, until it is ready or has failed.
 */
export function useDraft(draftId: Id | undefined): Query<LessonDraft> {
  const q = useQuery(`drafts:${draftId}`, (a) => a.getDraft(draftId as Id), draftId !== undefined);
  usePolling(q.data?.status === "pending", q.refetch);
  // A draft that has just been thrown away by the page that is showing it: the teacher is on the way elsewhere, so the page waits
  // for that, and does not say, for the moment in between, that the draft is not there.
  if (draftId !== undefined && thrownAway.has(draftId)) return { ...q, status: "loading", data: undefined, error: null };
  return q;
}

/** The teacher's unsaved drafts, the latest of each chain, newest first (FR-LES-20). One that is being written is asked for again until it is done. */
export function useDrafts(): Query<DraftSummary[]> {
  const q = useQuery("draft-list", (a) => a.listDrafts());
  usePolling(q.data?.some((d) => d.status === "pending") ?? false, q.refetch);
  return q;
}

/** The lessons colleagues saved in the school. */
export const useLibrary = (): Query<LibraryItem[]> => useQuery("library", (a) => a.listLibrary());

/** The teacher's open lesson, if there is one, so it can be ended from anywhere (FR-END-04). */
export const useOpenSession = (): Query<OpenSession> => useQuery("open-session", (a) => a.getOpenSession());

/**
 * The open lesson, for the frame that stays on screen on every page. It is the one reader that never lets go of the answer,
 * so it asks again by itself: when the teacher moves to another page (`page`) and when they come back to this window, since
 * a lesson may have been started or ended in another one.
 */
export function useOpenSessionAnywhere(page: string): Query<OpenSession> {
  const open = useOpenSession();
  const lastPage = useRef(page);
  useEffect(() => {
    if (lastPage.current === page) return;
    lastPage.current = page;
    invalidate("open-session");
  }, [page]);
  useEffect(() => {
    const lookAgain = () => {
      if (document.visibilityState === "visible") invalidate("open-session");
    };
    document.addEventListener("visibilitychange", lookAgain);
    return () => document.removeEventListener("visibilitychange", lookAgain);
  }, []);
  return open;
}

// ---- The live lesson ----------------------------------------------------------------------------------

/**
 * A snapshot that a stream keeps up to date: read once, then changed by each event of the channel, and read again every time the stream
 * opens, since what happened while it was down is not replayed (11.4). `connection` is where the stream stands, for the line that says
 * so calmly. A reload, or a window opened later, is the snapshot read again (FR-SES-08). Exported for the tests.
 */
export function watchSnapshot<T>(
  key: string,
  load: (a: TeacherApi) => Promise<T>,
  channel: TeacherChannel,
  reduce: (data: T, event: ChannelEvent) => T,
  onStatus: (s: ChannelStatus) => void,
  needsRead?: (data: T, event: ChannelEvent) => boolean,
) {
  const slot = slotFor(key, load);
  return api.openChannel(channel, {
    onEvent: (event) => {
      const held = slot.entry.data;
      if (held === undefined) return;
      const next = reduce(held, event);
      if (next !== held) slot.put(next);
      if (needsRead?.(held, event)) void slot.fetch(true);
    },
    onStatus: (status) => {
      onStatus(status);
      if (status === "open") void slot.fetch(true);
    },
  });
}

/** The teacher's own screen of a lesson: everything, with names (FR-CON-05). Its stream is the console channel, which carries every other channel's events too. */
export function useConsole(sessionId: Id): { query: Query<ConsoleSnapshot>; connection: ChannelStatus } {
  const query = useQuery(`console:${sessionId}`, (a) => a.getConsole(sessionId));
  const [connection, setConnection] = useState<ChannelStatus>("connecting");
  useEffect(
    () => watchSnapshot(`console:${sessionId}`, (a) => a.getConsole(sessionId), consoleChannel(sessionId), applyConsoleEvent, setConnection, consoleNeedsRead),
    [sessionId],
  );
  return { query, connection };
}

/**
 * The projected window's snapshot, and its own stream (PROPOSED `session.{id}.class`): the one a student does not read, since it carries the
 * live join token. It holds no private data (BR-PRIV-01).
 */
export function useClassView(sessionId: Id): { query: Query<ClassViewSnapshot>; connection: ChannelStatus } {
  const query = useQuery(`class-view:${sessionId}`, (a) => a.getClassView(sessionId));
  const [connection, setConnection] = useState<ChannelStatus>("connecting");
  useEffect(
    () => watchSnapshot(`class-view:${sessionId}`, (a) => a.getClassView(sessionId), classChannel(sessionId), applyClassEvent, setConnection),
    [sessionId],
  );
  return { query, connection };
}

/**
 * The code is read again when its time is up and nothing has replaced it: an event may have been missed, and a code that does not change is
 * a code nobody can join with. The time is the server's, carried on by this computer's clock (`serverNow` is when the snapshot was made).
 */
export function useFreshCode(serverNow: string | undefined, validTo: string | undefined, refetch: () => void): void {
  useEffect(() => {
    if (!serverNow || !validTo) return;
    const offset = serverOffset(serverNow, Date.now());
    const timer = setInterval(() => {
      if (tokenIsStale(validTo, offset, Date.now())) refetch();
    }, 1000);
    return () => clearInterval(timer);
  }, [serverNow, validTo, refetch]);
}

/** The lesson, moved on from the lobby to teaching (forward only, 4.1). The answer is the fresh console, put into the cache. */
export async function advanceSession(sessionId: Id, to: "teaching" | "review"): Promise<ConsoleSnapshot> {
  const snapshot = await change((a) => a.advance(sessionId, { to }));
  seed(`console:${sessionId}`, snapshot);
  seed("open-session", { server_now: snapshot.server_now, session: snapshot.session });
  return snapshot;
}

/** A student marked present without a phone, with the reason (FR-ATT-04). The answer is the fresh console. */
export async function markNoDevice(sessionId: Id, studentId: Id, reason: NoDeviceReason): Promise<ConsoleSnapshot> {
  try {
    const snapshot = await change((a) => a.markNoDevice(sessionId, studentId, { reason }));
    seed(`console:${sessionId}`, snapshot);
    return snapshot;
  } catch (e) {
    // The student joined with a phone while the teacher was choosing: the console is told how things stand now.
    if (toApiError(e).code === "invalid_state") invalidate(`console:${sessionId}`);
    throw e;
  }
}

/** The mark taken back: the student is as they were before it. The answer is the fresh console. */
export async function clearNoDevice(sessionId: Id, studentId: Id): Promise<ConsoleSnapshot> {
  const snapshot = await change((a) => a.clearNoDevice(sessionId, studentId));
  seed(`console:${sessionId}`, snapshot);
  return snapshot;
}

/**
 * A question sent, its answer shown or skipped, or a quick one made: each answers the fresh console, which is put into the cache, so the panel
 * moves at once and the next event finds it already there (FR-CON-06).
 */
async function control(sessionId: Id, call: (a: TeacherApi) => Promise<ConsoleSnapshot>): Promise<ConsoleSnapshot> {
  try {
    const snapshot = await change(call);
    seed(`console:${sessionId}`, snapshot);
    return snapshot;
  } catch (e) {
    // The lesson is not as the screen thought (another window moved it): read how it stands now.
    const code = toApiError(e).code;
    if (code === "invalid_state" || code === "question_open") invalidate(`console:${sessionId}`);
    throw e;
  }
}

/** Send a question to the students (one tap, FR-POP-01). */
export const fireQuestion = (sessionId: Id, sqId: Id): Promise<ConsoleSnapshot> => control(sessionId, (a) => a.fireQuestion(sessionId, sqId));
/** Show the right answer and the counts, once the question has closed. */
export const revealQuestion = (sessionId: Id, sqId: Id): Promise<ConsoleSnapshot> => control(sessionId, (a) => a.revealQuestion(sessionId, sqId));
/** Take a question out of the lesson: it does not count (BR-SKIP-01). */
export const skipQuestion = (sessionId: Id, sqId: Id): Promise<ConsoleSnapshot> => control(sessionId, (a) => a.skipQuestion(sessionId, sqId));
/** A quick question made on the spot, sent at once (FR-POP-04). */
export const fireAdhoc = (sessionId: Id, request: AdhocRequest): Promise<ConsoleSnapshot> => control(sessionId, (a) => a.fireAdhoc(sessionId, request));

/** Mark a student's question answered aloud, or take that back (FR-ANON-10). The console and the review are read again for it. */
export async function setAnonAnswered(sessionId: Id, anonId: Id, answered: boolean): Promise<void> {
  await change((a) => a.markAnonAnswered(sessionId, anonId, answered), [`console:${sessionId}`, `review:${sessionId}`]);
}

/** The review of a lesson (FR-REV-03), and, once it has ended, its whole register. `enabled` waits until the lesson has reached the review. */
export const useReview = (sessionId: Id, enabled = true): Query<SessionReview> => useQuery(`review:${sessionId}`, (a) => a.getReview(sessionId), enabled);

/** The practice set of a lesson and who has done it (FR-PRA-10); `not_found` while none has been sent. It looks again every 30 seconds while the page is open. */
export function usePracticeResults(sessionId: Id): Query<PracticeResults> {
  const query = useQuery(`practice:${sessionId}`, (a) => a.getPracticeResults(sessionId));
  const { refetch } = query;
  useEffect(() => {
    const timer = setInterval(refetch, 30_000);
    return () => clearInterval(timer);
  }, [refetch]);
  return query;
}

/**
 * End the lesson (F-10). On success the lesson is no longer the open one: the band and the reminder go, a console still showing it is told it ended, and the
 * review is read afresh. A lesson another window already ended is `invalid_state`: it is as good as ended, the screens look again, and the answer is null.
 */
export async function endLesson(sessionId: Id): Promise<EndResult | null> {
  try {
    const result = await change((a) => a.endSession(sessionId));
    seed("open-session", { server_now: result.server_now, session: null });
    invalidate("console", "review", "class-view", "lessons", "courses");
    return result;
  } catch (e) {
    if (toApiError(e).code === "invalid_state") {
      invalidate("open-session", "console", "review", "class-view");
      return null;
    }
    throw e;
  }
}

/** Make the practice set (F-12). `practice_set` is null when nothing was missed (EC-PRA-07). */
export async function sendPracticeSet(sessionId: Id): Promise<PracticeSetResult> {
  const result = await change((a) => a.createPracticeSet(sessionId));
  invalidate(`practice:${sessionId}`);
  return result;
}

// ---- Who is signed in -----------------------------------------------------------------------------

/**
 * Signed in or out, as the API says: `GET /me` answers a teacher or refuses (`unauthenticated`), or any call the app makes
 * refuses later (session.ts watches them all). The rules are `authStatusOf` in guard.ts.
 */
export function useAuth(): { status: AuthStatus; reason: EndReason | null; me: Query<Me> } {
  const me = useMe();
  const ended = useSessionEnd();
  return { status: authStatusOf({ ended, me: me.status, failure: me.error?.code ?? null }), reason: ended, me };
}

/** F-01: the provider the teacher chose. Answers with where to send the browser; the teacher comes back to a page loaded afresh. */
export const startSignIn = (request: SignInRequest): Promise<SignInRedirect> => api.startSignIn(request);

/**
 * Sign out: ends the session on the server, then forgets everything the teacher saw. A session the server had already ended
 * counts as signed out (EC-AUTH-08); a failure to reach the server throws and leaves the teacher signed in.
 */
export async function signOut(): Promise<void> {
  try {
    await api.signOut();
  } catch (e) {
    if (toApiError(e).code !== "unauthenticated") throw e;
  }
  endSession("signed_out");
  resetQueries();
}

// ---- Derived --------------------------------------------------------------------------------------

/** One course, from the list. Null when the teacher has no such course. */
export function useCourse(courseId: Id | undefined): Query<CourseSummary | null> {
  const q = useCourses();
  return useMemo(() => mapQuery(q, (all) => all.find((c) => c.id === courseId) ?? null), [q, courseId]);
}

/** The lessons that are prepared and have not been run, the one running now left out: what Today lists. */
export function usePreparedLessons(): Query<LessonSummary[]> {
  const lessons = useLessons();
  const running = useOpenSession().data?.session?.lesson.id ?? null;
  return useMemo(() => mapQuery(lessons, (all) => preparedLessons(all, running)), [lessons, running]);
}

/**
 * The teacher's name as the interface language writes it (the English interface uses Latin letters), with the first name
 * for greetings and the initials for the badge. Null until the API has answered.
 */
export function useTeacherName(): { full: string; first: string; initials: string } | null {
  const me = useMe().data;
  const { locale } = useTeacher();
  return useMemo(() => {
    if (!me) return null;
    const full = personName(me.name, locale);
    return { full, first: firstName(full), initials: initials(full) };
  }, [me, locale]);
}

// ---- Keeping the words in step with the school -----------------------------------------------------

/**
 * The school decides whether the app says "ученици" and "клас" or "студенти" and "група". The store keeps the last type
 * seen, so the words are right from the first paint; this updates it from the school once the API has answered. The demo
 * has no such step: there the switch in Settings is what chooses the school, and the store already holds the choice.
 */
export function useSchoolWording() {
  const kind = useMe().data?.school.type;
  useEffect(() => {
    if (!kind) return;
    // Either way the type is now known, so the sign-in screen can name the school (or the faculty) next time.
    if (apiMode === "live") actions.setSchoolType(schoolTypeOf(kind));
    else actions.setSchoolSeen();
  }, [kind]);
}

// ---- Changing -------------------------------------------------------------------------------------

/**
 * First run: the guide is finished or skipped (FR-SUP-03). The answer is the teacher as they now are, put straight into the
 * cache: the page the teacher goes on to must not still read "first run not done" and send them back to the guide.
 */
export async function setFirstRunDone(): Promise<Me> {
  const me = await change((a) => a.setFirstRunDone());
  seed("me", me);
  return me;
}

/** The speed bonus on or off for a course (BR-PTS-04). */
export const updateCourse = (courseId: Id, patch: CoursePatch): Promise<CourseSummary> =>
  change((a) => a.updateCourse(courseId, patch), ["courses", "dashboard"]);

/**
 * Add the material a lesson is made from: a document or typed sentences. Nothing is listed yet, so nothing is loaded again.
 * A document takes a while; the `signal` is how the screen stops waiting for it.
 */
export const createSource = (input: SourceInput, options?: CallOptions): Promise<SourceCreated> =>
  change((a) => a.createSource(input, options));

/**
 * Ask for a lesson. It answers at once with the draft, `pending`: the AI's work is a job that goes on without this page (BR-LES-08).
 * The draft is put straight into the cache, so the page it opens finds it without asking again.
 */
export async function generateLesson(request: GenerateRequest, options?: CallOptions): Promise<LessonDraft> {
  const draft = await change((a) => a.generateLesson(request, options), ["draft-list"]);
  // Nobody has read this draft yet, so there is no slot to seed: make it, with the draft in it.
  slotFor(`drafts:${draft.id}`, (a) => a.getDraft(draft.id)).put(draft);
  return draft;
}

/** The teacher's edits to a draft, sent as they are made (PROPOSED PATCH). The answer is the draft, which the page that reads it finds in the cache. */
export async function updateDraft(draftId: Id, patch: DraftPatch): Promise<LessonDraft> {
  const draft = await change((a) => a.updateDraft(draftId, patch), ["draft-list"]);
  seed(`drafts:${draftId}`, draft);
  return draft;
}

/** Drafts thrown away a moment ago, for `useDraft`; each is forgotten after a few seconds, when whoever threw it away has gone elsewhere. */
const thrownAway = new Set<Id>();

/** Throw a draft away, or cancel it while it is being written. Whoever has it open is going elsewhere, so it is forgotten rather than read again. */
export async function deleteDraft(draftId: Id): Promise<void> {
  await change((a) => a.deleteDraft(draftId), ["draft-list"]);
  thrownAway.add(draftId);
  setTimeout(() => thrownAway.delete(draftId), 5000);
  forget(`drafts:${draftId}`);
}

/** Run a failed draft again, with the same source: the same draft, `pending` once more. */
export async function retryDraft(draftId: Id): Promise<LessonDraft> {
  const draft = await change((a) => a.retryDraft(draftId), ["draft-list"]);
  slotFor(`drafts:${draftId}`, (a) => a.getDraft(draftId)).put(draft);
  return draft;
}

/** One of the four refinements of a draft: a new draft, `pending`, made from this one as it now is. */
export async function refineDraft(draftId: Id, refinement: Refinement): Promise<LessonDraft> {
  const draft = await change((a) => a.refineDraft(draftId, refinement), ["draft-list"]);
  slotFor(`drafts:${draft.id}`, (a) => a.getDraft(draft.id)).put(draft);
  return draft;
}

/** A draft of a saved lesson, to edit it. The one that is open already, if there is one. */
export async function startEditing(lessonId: Id): Promise<LessonDraft> {
  const draft = await change((a) => a.startEditing(lessonId), ["draft-list"]);
  slotFor(`drafts:${draft.id}`, (a) => a.getDraft(draft.id)).put(draft);
  return draft;
}

/** Save a draft, as the teacher edited it, as a lesson. The draft is saved with it: it leaves the list and leads to the lesson. */
export async function saveLesson(request: SaveLessonRequest): Promise<Lesson> {
  const lesson = await change((a) => a.saveLesson(request), ["lessons", "library", "draft-list"]);
  seed(`lessons:${lesson.id}`, lesson);
  invalidate(`drafts:${request.draft_id}`);
  return lesson;
}

/** Save the edited lesson as its next version, with the draft it was edited in. */
export async function updateLesson(lessonId: Id, request: UpdateLessonRequest): Promise<Lesson> {
  const lesson = await change((a) => a.updateLesson(lessonId, request), ["lessons", "draft-list"]);
  seed(`lessons:${lessonId}`, lesson);
  if (request.draft_id) invalidate(`drafts:${request.draft_id}`);
  return lesson;
}

/** Lessons deleted a moment ago, for `useLesson`; each is forgotten after a few seconds, when whoever deleted it has gone to the list. */
const deletedLessons = new Set<Id>();

/**
 * Delete a lesson. Copies of it and the lessons already run stay, and what was being changed in it goes with it. Whoever has it open is
 * going to the list, so it is forgotten rather than read again.
 */
export async function deleteLesson(lessonId: Id): Promise<void> {
  await api.deleteLesson(lessonId);
  deletedLessons.add(lessonId);
  setTimeout(() => deletedLessons.delete(lessonId), 5000);
  forget(`lessons:${lessonId}`);
  invalidate("lessons", "library", "draft-list", "drafts");
}

/** A picture for a question: the address it is served from, and the id the question holds. Nothing is listed, so nothing is loaded again. */
export const uploadMedia = (file: File): Promise<QuestionMedia> => change((a) => a.uploadMedia(file));

/** Copy a colleague's lesson into the teacher's own. */
export async function copyFromLibrary(lessonId: Id): Promise<Lesson> {
  const lesson = await change((a) => a.copyFromLibrary(lessonId), ["lessons", "library"]);
  seed(`lessons:${lesson.id}`, lesson);
  return lesson;
}

/**
 * Start a lesson with a class: it opens in the lobby and becomes the teacher's open lesson at once, so the screen they go to
 * finds it. A refusal because a lesson is already open (`session_open`, EC-SES-02) means this screen did not know: another
 * window may have started it, so the open lesson is asked for again and the window can say which one it is.
 */
export async function startSession(request: CreateSessionRequest): Promise<ConsoleSnapshot> {
  try {
    const snapshot = await change((a) => a.createSession(request));
    seed("open-session", { server_now: snapshot.server_now, session: snapshot.session });
    // The console it goes to opens with the lesson already in it.
    slotFor(`console:${snapshot.session.id}`, (a) => a.getConsole(snapshot.session.id)).put(snapshot);
    return snapshot;
  } catch (e) {
    if (toApiError(e).code === "session_open") invalidate("open-session");
    throw e;
  }
}
