"use client";

import { useEffect, useMemo } from "react";
import { firstName, initials, personName, schoolTypeOf } from "../format";
import { actions, useTeacher } from "../store";
import { apiMode } from "./config";
import { change, mapQuery, seed, useQuery, type Query } from "./query";
import type {
  CourseDashboard,
  CoursePatch,
  CourseSummary,
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

// ---- Derived --------------------------------------------------------------------------------------

/** One course, from the list. Null when the teacher has no such course. */
export function useCourse(courseId: Id | undefined): Query<CourseSummary | null> {
  const q = useCourses();
  return useMemo(() => mapQuery(q, (all) => all.find((c) => c.id === courseId) ?? null), [q, courseId]);
}

/** The lessons that are prepared and have not been run: what Today lists. */
export function usePreparedLessons(): Query<LessonSummary[]> {
  const q = useLessons();
  return useMemo(() => mapQuery(q, (all) => all.filter((l) => l.times_run === 0)), [q]);
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
    if (apiMode === "live" && kind) actions.setSchoolType(schoolTypeOf(kind));
  }, [kind]);
}

// ---- Changing -------------------------------------------------------------------------------------

/** First run: the guided first lesson is done (FR-SUP-03). */
export const setFirstRunDone = (): Promise<Me> => change((a) => a.setFirstRunDone(), ["me"]);

/** The speed bonus on or off for a course (BR-PTS-04). */
export const updateCourse = (courseId: Id, patch: CoursePatch): Promise<CourseSummary> =>
  change((a) => a.updateCourse(courseId, patch), ["courses", "dashboard"]);

/** Add the material a lesson is made from: a document or typed sentences. Nothing is listed yet, so nothing is loaded again. */
export const createSource = (input: SourceInput): Promise<SourceCreated> => change((a) => a.createSource(input));

/** Ask for a lesson. Takes a while: the AI writes it. */
export const generateLesson = (request: GenerateRequest): Promise<LessonDraft> => change((a) => a.generateLesson(request));

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
