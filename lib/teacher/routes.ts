import type { Id } from "./api/types";
import type { Key } from "./i18n";
import { UNFINISHED_ANCHOR } from "./lessons-list";
import { GUIDE, HOME } from "./signin";

/** The addresses of the screens that link to each other, and where a Back from a lesson goes. */

/** The lessons are the app's home: the page it opens on. A lesson, a draft and the page that prepares one live under LESSON_PAGES. */
export const LESSONS = HOME;
const LESSON_PAGES = "/teacher/lessons";
export const NEW_LESSON = `${LESSON_PAGES}/new`;
export const LIBRARY = "/teacher/library";
export const SETTINGS = "/teacher/settings";

/** The lessons that are not finished, on the Lessons page. */
export const UNFINISHED = `${LESSONS}#${UNFINISHED_ANCHOR}`;

/** The Lessons page, with the line that a lesson has just been deleted (told once, then taken off the address). */
export const LESSONS_DELETED = `${LESSONS}?deleted=1`;

/** The templates' shelf of the Library has its own address, so Back from a template comes back to it. */
export const TEMPLATES_ANCHOR = "sabloni";
const TEMPLATES = `${LIBRARY}#${TEMPLATES_ANCHOR}`;

/** A template in the Library, to read and copy. */
export const libraryLessonUrl = (lessonId: Id): string => `${LIBRARY}/${encodeURIComponent(lessonId)}`;

/** A screen that links to a lesson says where the teacher came from, so Back can go there: a held lesson is opened from the Library (`?from=library`). */
export const FROM_LIBRARY = "library";
/** The first lesson of a first run is prepared from the guide's last screen, and Back goes back to it. */
export const FROM_GUIDE = "guide";
export type From = typeof FROM_LIBRARY | typeof FROM_GUIDE;

export const lessonUrl = (lessonId: Id, from?: typeof FROM_LIBRARY): string =>
  `${LESSON_PAGES}/${encodeURIComponent(lessonId)}${from ? `?from=${from}` : ""}`;

/** What a lesson page says once, on arriving: a new lesson was saved, a saved one was changed, or a colleague's lesson was copied. */
export type Saved = "new" | "changes" | "copied";
export const isSaved = (v: unknown): v is Saved => v === "new" || v === "changes" || v === "copied";

/** The lesson, as the teacher lands on it after saving. The address is cleaned as soon as the line has been said. */
export const savedLessonUrl = (lessonId: Id, saved: Saved, from?: typeof FROM_LIBRARY): string =>
  `${LESSON_PAGES}/${encodeURIComponent(lessonId)}?${from ? `from=${from}&` : ""}saved=${saved}`;

/** The page that prepares a lesson; it too is told where the teacher came from, so its Back can go there. */
export const newLessonUrl = (from?: From): string => `${NEW_LESSON}${from ? `?from=${from}` : ""}`;

/**
 * A lesson that has been made and not saved yet: where the questions of a generation are read, and found again after a reload.
 * It carries where the teacher started (`?from=library`) as a lesson's page does, so its Back can go there.
 */
export const draftUrl = (draftId: Id, from?: From, undone = false): string =>
  `${LESSON_PAGES}/drafts/${encodeURIComponent(draftId)}${from || undone ? `?${[from ? `from=${from}` : "", undone ? "undone=1" : ""].filter(Boolean).join("&")}` : ""}`;

/** The live lesson of a session: the console, with the names of the students. It is for the teacher's own screen and never for the projector. */
export const liveUrl = (sessionId: Id): string => `/teacher/live/${encodeURIComponent(sessionId)}`;

/** The projected window of the same lesson (the class view): no sidebar, no names of students who are not here. A protected page like every other. */
export const classViewUrl = (sessionId: Id): string => `${liveUrl(sessionId)}/class`;

/** The steps that make the projector show only the class view, on the Help page (it opens at them). */
export const PROJECTOR_HELP_ID = "projector";
export const PROJECTOR_HELP = `/teacher/help#${PROJECTOR_HELP_ID}`;

/** Where Back goes from a lesson or from the page that prepares one, and what it is called: the screen the teacher came from, else the lessons. */
export function backFromLesson(from: string | null): { href: string; label: Key } {
  if (from === FROM_LIBRARY) return { href: LIBRARY, label: "back.library" };
  if (from === FROM_GUIDE) return { href: GUIDE, label: "back.guide" };
  return { href: LESSONS, label: "back.lessons" };
}

/** Where Back goes from a template: the templates. */
export const backFromLibraryLesson = (): { href: string; label: Key } => ({ href: TEMPLATES, label: "back.library" });

/**
 * Where Back goes from the page of a draft. A draft of a saved lesson (`lessonId`) goes back to that lesson, in every state it is
 * in (being refined, failed, ready, saved); one of a new lesson goes where the teacher started, as the page that prepares it does.
 */
export function backFromDraft(from: string | null, lessonId: Id | null | undefined): { href: string; label: Key } {
  if (lessonId) return { href: lessonUrl(lessonId, from === FROM_LIBRARY ? FROM_LIBRARY : undefined), label: "back.lesson" };
  return backFromLesson(from);
}

/** The `from` a page passes on to the next one it opens, so the chain of Backs stays the same: only the two it knows. */
export const fromOf = (from: string | null): From | undefined => (from === FROM_LIBRARY || from === FROM_GUIDE ? from : undefined);

/** Whether the frame shows the way back to a running lesson: on every page but the lesson's own screen, so the teacher can always get back in one press. */
export const showsOpenLesson = (pathname: string, sessionId: Id): boolean => pathname !== liveUrl(sessionId);

/**
 * The screens the offline worker keeps so the installed app opens with no signal (public/teacher-sw.js). Only pages that are
 * the same for everybody: a lesson, a class view and the end page are never in the list, so nothing with a student's name
 * is ever stored.
 */
export const SHELL_ROUTES: readonly string[] = [
  LESSONS,
  NEW_LESSON,
  LIBRARY,
  SETTINGS,
  "/teacher/help",
  "/teacher/sign-in",
  GUIDE,
];
