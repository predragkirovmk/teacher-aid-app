import type { Locale, Student } from "./api/types";

/**
 * What the privacy notice and the terms of use say about the app, as constants the screens and the tests share.
 *
 * Who is responsible (spec 1.3, 13.4, feature-spec 11.2): the school is the data controller and TeacherAid the processor, under a
 * data processing agreement (ДПА) with each school. The notice therefore informs; it does not ask for consent. What the first
 * sign-in records is that the student was shown it (`POST /me/acknowledgements`, PROPOSED), not that they agreed to anything.
 * Whether a school uses a consent form for parents instead (some private schools may) is OPEN-24; it would live outside this app.
 *
 * Values that are not in the spec are marked PROPOSED here and in the handoff docs and are never labelled so on screen.
 */

/**
 * The version of the privacy notice and the terms, which change together. It is the date of the last change that matters, as
 * text, because the API only stores it and the app compares it (PROPOSED: the server keeps whatever version string it is sent,
 * 1 to 32 characters of letters, digits, dots, dashes and underscores). Change it when either document changes in a way a student
 * should be told about: the notice screen then shows again at the next sign-in or the next time the app opens.
 */
export const NOTICE_VERSION = "2026-10-27";

/** The date of that version, for the line under the title. */
export const NOTICE_DATE = Date.UTC(2026, 9, 27);

const MONTHS = {
  mk: ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври", "ноември", "декември"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** "27 October 2026" / "27 октомври 2026": the date of the version, in UTC so every time zone reads the same day. */
export function noticeDateLabel(locale: Locale): string {
  const d = new Date(NOTICE_DATE);
  return `${d.getUTCDate()} ${MONTHS[locale][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Where a question about the app itself goes (PROPOSED: the address the marketing site already gives; the spec names no privacy
 * contact, OPEN-27). A request about a student's data goes through the school first (F-16), so the notice always names the school.
 */
export const CONTACT_EMAIL = "hello@teacheraid.education";

/** A student who leaves the school has their data deleted within this many days of the school's request (BR-RET-03, DECIDED). */
export const LEAVER_DELETION_DAYS = 30;

/** Whether the notice has to be shown: the student has not acknowledged this version (a first sign-in, or the notice changed). */
export const needsNotice = (student: Pick<Student, "acknowledgement">): boolean => student.acknowledgement?.version !== NOTICE_VERSION;

/** Whether the student has acknowledged an earlier version, which makes the screen say the notice was updated. */
export const noticeWasUpdated = (student: Pick<Student, "acknowledgement">): boolean =>
  student.acknowledgement !== null && student.acknowledgement.version !== NOTICE_VERSION;

/**
 * The screens that can be read without signing in: the sign-in screen (a student reads the notice before any data is
 * collected), the notice and the terms. They are also what the notice screen links to, so they are never behind it.
 */
export const OPEN_PATHS = ["/app/welcome", "/app/privacy", "/app/terms"] as const;

/**
 * Screens the notice waits for: a lesson or a practice set in progress is not interrupted, the notice comes after it. (A QR
 * check-in is not one of them: the notice comes before the join, so no attendance is recorded before the student has seen it.)
 */
export const NOTICE_WAITS_FOR = ["/app/play", "/app/practice/"] as const;

export const isOpenPath = (pathname: string) => (OPEN_PATHS as readonly string[]).includes(pathname);

export const noticeWaits = (pathname: string) => NOTICE_WAITS_FOR.some((p) => pathname.startsWith(p));
