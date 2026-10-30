"use client";

import { useEffect, useMemo, useRef } from "react";
import { firstName, initials, personName, schoolTypeOf } from "../format";
import { authStatusOf, type AuthStatus, type EndReason } from "../guard";
import { preparedLessons } from "../today";
import { actions, useTeacher } from "../store";
import { apiMode } from "./config";
import { api, type CallOptions } from "./client";
import { toApiError } from "./errors";
import { change, invalidate, mapQuery, resetQueries, seed, slotFor, useQuery, type Query } from "./query";
import { endSession, useSessionEnd } from "./session";
import type {
  ConsoleSnapshot,
  CourseDashboard,
  CoursePatch,
  CourseSummary,
  CreateSessionRequest,
  GenerateRequest,
  Id,
  Lesson,
  LessonDraft,
  LessonSummary,
  LibraryItem,
  Me,
  OpenSession,
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
 * Query keys: `me`, `courses`, `dashboard:<course>`, `lessons`, `lessons:<id>`, `drafts:<id>`, `library`,
 * `open-session`. A change names the first part of the keys it touches.
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
export const useLesson = (lessonId: Id | undefined): Query<Lesson> =>
  useQuery(`lessons:${lessonId}`, (a) => a.getLesson(lessonId as Id), lessonId !== undefined);

/** A draft that is not saved yet, by id, so a reload of the review screen finds it again. */
export const useDraft = (draftId: Id | undefined): Query<LessonDraft> =>
  useQuery(`drafts:${draftId}`, (a) => a.getDraft(draftId as Id), draftId !== undefined);

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
 * Ask for a lesson. Takes a while: the AI writes it. The draft is put straight into the cache, so the page it opens finds
 * it without asking again; a reload of that page asks the API (EC-LES-09).
 */
export async function generateLesson(request: GenerateRequest, options?: CallOptions): Promise<LessonDraft> {
  const draft = await change((a) => a.generateLesson(request, options));
  // Nobody has read this draft yet, so there is no slot to seed: make it, with the draft in it.
  slotFor(`drafts:${draft.id}`, (a) => a.getDraft(draft.id)).put(draft);
  return draft;
}

/** One of the four refinements of a draft: a new draft. */
export const refineDraft = (draftId: Id, refinement: Refinement): Promise<LessonDraft> =>
  change((a) => a.refineDraft(draftId, refinement));

/** Save a draft, as the teacher edited it, as a lesson. */
export async function saveLesson(request: SaveLessonRequest): Promise<Lesson> {
  const lesson = await change((a) => a.saveLesson(request), ["lessons", "library"]);
  seed(`lessons:${lesson.id}`, lesson);
  return lesson;
}

/** Save the edited lesson as its next version. */
export async function updateLesson(lessonId: Id, request: UpdateLessonRequest): Promise<Lesson> {
  const lesson = await change((a) => a.updateLesson(lessonId, request), ["lessons"]);
  seed(`lessons:${lessonId}`, lesson);
  return lesson;
}

/** Delete a lesson. Copies of it and the lessons already run stay. */
export const deleteLesson = (lessonId: Id): Promise<void> => change((a) => a.deleteLesson(lessonId), ["lessons", "library"]);

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
    return snapshot;
  } catch (e) {
    if (toApiError(e).code === "session_open") invalidate("open-session");
    throw e;
  }
}
