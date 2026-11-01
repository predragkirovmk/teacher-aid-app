import type { Id } from "./api/types";
import type { Key } from "./i18n";
import { UNFINISHED_ANCHOR } from "./lessons-list";
import { GUIDE, TODAY } from "./signin";

/** The addresses of the screens that link to each other, and where a Back from a lesson goes. */

export const LESSONS = "/teacher/lessons";
export const NEW_LESSON = "/teacher/lessons/new";
export const LIBRARY = "/teacher/library";
export const SETTINGS = "/teacher/settings";

/** The lessons that are not finished, on the Lessons page: where Today's "Сите недовршени" leads. */
export const UNFINISHED = `${LESSONS}#${UNFINISHED_ANCHOR}`;

/** The Lessons page, with the line that a lesson has just been deleted (told once, then taken off the address). */
export const LESSONS_DELETED = `${LESSONS}?deleted=1`;

/** A colleague's lesson in the Library, to read and copy. */
export const libraryLessonUrl = (lessonId: Id): string => `${LIBRARY}/${encodeURIComponent(lessonId)}`;

/** A screen that links to a lesson says where the teacher came from, so Back can go there (`?from=today`). */
export const FROM_TODAY = "today";
/** The first lesson of a first run is prepared from the guide's last screen, and Back goes back to it. */
export const FROM_GUIDE = "guide";
export type From = typeof FROM_TODAY | typeof FROM_GUIDE;

export const lessonUrl = (lessonId: Id, from?: typeof FROM_TODAY): string =>
  `${LESSONS}/${encodeURIComponent(lessonId)}${from ? `?from=${from}` : ""}`;

/** What a lesson page says once, on arriving: a new lesson was saved, a saved one was changed, or a colleague's lesson was copied. */
export type Saved = "new" | "changes" | "copied";
export const isSaved = (v: unknown): v is Saved => v === "new" || v === "changes" || v === "copied";

/** The lesson, as the teacher lands on it after saving. The address is cleaned as soon as the line has been said. */
export const savedLessonUrl = (lessonId: Id, saved: Saved, from?: typeof FROM_TODAY): string =>
  `${LESSONS}/${encodeURIComponent(lessonId)}?${from ? `from=${from}&` : ""}saved=${saved}`;

/** The page that prepares a lesson; it too is told where the teacher came from, so its Back can go there. */
export const newLessonUrl = (from?: From): string => `${NEW_LESSON}${from ? `?from=${from}` : ""}`;

/**
 * A lesson that has been made and not saved yet: where the questions of a generation are read, and found again after a reload.
 * It carries where the teacher started (`?from=today`) as a lesson's page does, so its Back can go there.
 */
export const draftUrl = (draftId: Id, from?: From, undone = false): string =>
  `${LESSONS}/drafts/${encodeURIComponent(draftId)}${from || undone ? `?${[from ? `from=${from}` : "", undone ? "undone=1" : ""].filter(Boolean).join("&")}` : ""}`;

/** The live lesson of a session: the console. Step 7 builds it; until then it says it is coming. */
export const liveUrl = (sessionId: Id): string => `/teacher/live/${encodeURIComponent(sessionId)}`;

/** Where Back goes from a lesson or from the page that prepares one, and what it is called: the screen the teacher came from, else the lessons. */
export function backFromLesson(from: string | null): { href: string; label: Key } {
  if (from === FROM_TODAY) return { href: TODAY, label: "back.today" };
  if (from === FROM_GUIDE) return { href: GUIDE, label: "back.guide" };
  return { href: LESSONS, label: "back.lessons" };
}

/** Where Back goes from a colleague's lesson. */
export const backFromLibraryLesson = (): { href: string; label: Key } => ({ href: LIBRARY, label: "back.library" });

/**
 * Where Back goes from the page of a draft. A draft of a saved lesson (`lessonId`) goes back to that lesson, in every state it is
 * in (being refined, failed, ready, saved); one of a new lesson goes where the teacher started, as the page that prepares it does.
 */
export function backFromDraft(from: string | null, lessonId: Id | null | undefined): { href: string; label: Key } {
  if (lessonId) return { href: lessonUrl(lessonId, from === FROM_TODAY ? FROM_TODAY : undefined), label: "back.lesson" };
  return backFromLesson(from);
}

/** The `from` a page passes on to the next one it opens, so the chain of Backs stays the same: only the two it knows. */
export const fromOf = (from: string | null): From | undefined => (from === FROM_TODAY || from === FROM_GUIDE ? from : undefined);

/**
 * Whether the page says, in its own way, that a lesson is running: Today (its band) and the lesson's own screen. Every other
 * page carries the reminder in the frame, so the teacher can always get back to the lesson in one press.
 */
export const showsOpenLesson = (pathname: string, sessionId: Id): boolean => pathname !== TODAY && pathname !== liveUrl(sessionId);
