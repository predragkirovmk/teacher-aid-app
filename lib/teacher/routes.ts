import type { Id } from "./api/types";
import type { Key } from "./i18n";
import { TODAY } from "./signin";

/** The addresses of the screens that link to each other, and where a Back from a lesson goes. */

export const LESSONS = "/teacher/lessons";
export const NEW_LESSON = "/teacher/lessons/new";
export const SETTINGS = "/teacher/settings";

/** A screen that links to a lesson says where the teacher came from, so Back can go there (`?from=today`). */
export const FROM_TODAY = "today";

export const lessonUrl = (lessonId: Id, from?: typeof FROM_TODAY): string =>
  `${LESSONS}/${encodeURIComponent(lessonId)}${from ? `?from=${from}` : ""}`;

/** The live lesson of a session: the console. Step 7 builds it; until then it says it is coming. */
export const liveUrl = (sessionId: Id): string => `/teacher/live/${encodeURIComponent(sessionId)}`;

/** Where Back goes from a lesson, and what it is called: the screen the teacher came from, else the lessons. */
export function backFromLesson(from: string | null): { href: string; label: Key } {
  return from === FROM_TODAY ? { href: TODAY, label: "back.today" } : { href: LESSONS, label: "back.lessons" };
}

/**
 * Whether the page says, in its own way, that a lesson is running: Today (its band) and the lesson's own screen. Every other
 * page carries the reminder in the frame, so the teacher can always get back to the lesson in one press.
 */
export const showsOpenLesson = (pathname: string, sessionId: Id): boolean => pathname !== TODAY && pathname !== liveUrl(sessionId);
