import type { Id, LessonSummary } from "./api/types";

/** Today shows this many prepared lessons; "Сите лекции" leads to the rest. */
export const TODAY_LESSONS_MAX = 5;

const changedAt = (l: LessonSummary): number => {
  const ms = Date.parse(l.updated_at);
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * What Today lists: the lessons that have never been run (`times_run` is 0; the server adds no filter, FR-LES-17), the one
 * running now left out because the band at the top is already about it, the lesson changed last first. The API does not fix
 * an order for `GET /lessons`, so it is sorted here.
 */
export function preparedLessons(lessons: readonly LessonSummary[], runningLessonId: Id | null = null): LessonSummary[] {
  return lessons.filter((l) => l.times_run === 0 && l.id !== runningLessonId).sort((a, b) => changedAt(b) - changedAt(a));
}

/** The first few lessons, and whether there are more than are shown. */
export function shownOnToday<T>(lessons: readonly T[], max: number = TODAY_LESSONS_MAX): { shown: T[]; more: boolean } {
  return { shown: lessons.slice(0, max), more: lessons.length > max };
}
