import type { CourseSummary, Id, Subject } from "./api/types";

/**
 * The rules of "Започни час": which of the teacher's classes a lesson can be started with, when one is chosen for them, and
 * what the window says. Nothing here touches the browser, so all of it is unit tested.
 */

/** What a lesson is, as far as starting it goes: the subject decides the class, the year orders them. */
export type StartableLesson = { subject: Pick<Subject, "id">; year: number };

/**
 * The teacher's classes for this lesson's subject, the ones in the lesson's own year first (a lesson for the second year is
 * most likely meant for II-4, not IV-1), the API's order otherwise. The course list holds every course of the teacher, so
 * the filter is here (`GET /teacher/courses` has no subject parameter).
 */
export function offeredCourses(courses: readonly CourseSummary[], lesson: StartableLesson): CourseSummary[] {
  const forSubject = courses.filter((c) => c.subject.id === lesson.subject.id);
  return [...forSubject.filter((c) => c.class.year === lesson.year), ...forSubject.filter((c) => c.class.year !== lesson.year)];
}

/** The class that is chosen before the teacher chooses: only when there is no other. */
export const onlyCourse = (offered: readonly CourseSummary[]): Id | null => (offered.length === 1 ? offered[0].id : null);

/** The class to start with, if the teacher's pick (or the only one) is among those offered; else null and nothing starts. */
export function chosenCourse(offered: readonly CourseSummary[], picked: Id | null): CourseSummary | null {
  const id = picked ?? onlyCourse(offered);
  return offered.find((c) => c.id === id) ?? null;
}

/**
 * What the window shows. A lesson that is already running comes first, whatever else is true: a teacher has one open lesson at
 * a time (EC-SES-02, FR-END-05), so there is nothing to choose. Then no class for the subject, then the choice.
 */
export type StartView = "running" | "no-class" | "choose";

export function startView(running: boolean, offered: readonly CourseSummary[]): StartView {
  if (running) return "running";
  return offered.length === 0 ? "no-class" : "choose";
}

/** "Математика, II-4": what a running lesson is for, in a line. */
export const courseLabel = (subjectName: string, className: string): string => `${subjectName}, ${className}`;
