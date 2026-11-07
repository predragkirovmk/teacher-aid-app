import type { DraftSummary, Id, LessonSummary } from "./api/types";
import { isOne } from "./format";
import type { Key } from "./i18n";
import type { Locale } from "./store";
import { matchesChoice, type SubjectChoice } from "./subjects";
import { relativeDay, sayWhen, type When } from "./when";

/**
 * What the Lessons page lists and in what order. Nothing here touches the browser, so all of it is unit tested.
 *
 * Three sections, each shown only when it has something: the lessons that are prepared (never run, `times_run == 0`), the lessons that
 * are not finished (drafts) and the lessons that were held (`times_run > 0`), in that order, as on Today (a few forgotten drafts must not
 * push the lesson for the day off the first screen, and the held lessons, which are the long ones, come last). In the first two the
 * lesson changed last comes first; in the held ones the lesson held last, since that is the date the card says. The API fixes no order
 * for `GET /lessons` (OPEN-37), so every list is sorted here.
 */

/** The id Today's link leads to: the section of the lessons that are not finished. */
export const UNFINISHED_ANCHOR = "nedovrseni";

const changedAt = (x: { updated_at: string }): number => {
  const ms = Date.parse(x.updated_at);
  return Number.isFinite(ms) ? ms : 0;
};

/** The newest change first. Two changed at the same moment keep a fixed order (by id), so a list does not shuffle between loads. */
export function newestChangeFirst<T extends { id: Id; updated_at: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => changedAt(b) - changedAt(a) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** The moment a lesson was held last; one with a count and no date (it should not be) is placed by when it was changed. */
const heldAt = (l: Pick<LessonSummary, "last_run_at" | "updated_at">): number => {
  const ms = l.last_run_at === null ? Number.NaN : Date.parse(l.last_run_at);
  return Number.isFinite(ms) ? ms : changedAt(l);
};

/** The lesson held last first, the one the card of a held lesson says "Одржана пред 3 дена" of. Ties keep a fixed order, as above. */
export function lastHeldFirst<T extends Pick<LessonSummary, "id" | "last_run_at" | "updated_at">>(lessons: readonly T[]): T[] {
  return [...lessons].sort((a, b) => heldAt(b) - heldAt(a) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export type LessonSections = {
  /** Never run: `times_run` is 0. A lesson in a session that has not ended is still here (FR-LES-17). */
  prepared: LessonSummary[];
  /** Run at least once, the one held last first. */
  held: LessonSummary[];
};

/** The lessons of the choice of subject, in their two sections. */
export function lessonSections(lessons: readonly LessonSummary[], choice: SubjectChoice): LessonSections {
  const shown = newestChangeFirst(lessons.filter((l) => matchesChoice(choice, l.subject)));
  return { prepared: shown.filter((l) => l.times_run === 0), held: lastHeldFirst(shown.filter((l) => l.times_run > 0)) };
}

/** The unfinished lessons of the choice of subject. */
export const unfinishedDrafts = (drafts: readonly DraftSummary[], choice: SubjectChoice): DraftSummary[] =>
  newestChangeFirst(drafts.filter((d) => matchesChoice(choice, d.subject)));

// ---- The words of the lists ----------------------------------------------------------------------------------------------

type Say = (key: Key, vars?: Record<string, string | number>) => string;

/** "Одржани (12)": a section's name and how many lessons are in it, so that a long one is known to be long before it is scrolled. */
export const withCount = (t: Say, label: string, n: number): string => t("list.count", { label, n });

/** "Прикажани се 5 лекции: Математика.": what a choice of subject has done to the list, said to a screen reader and not shown. */
export const shownWords = (t: Say, locale: Locale, n: number, what: string): string => t(isOne(n, locale) ? "list.shown.one" : "list.shown.many", { n, what });

// ---- When a lesson was held, and how often -------------------------------------------------------------------------

/** "Одржана пред 3 дена · 2 пати": when it was held last and how many times, in words. */
export type HeldLine = {
  /** Null if the API gave a count and no date (it should not): the count is then said alone. */
  when: When | null;
  times: { key: Extract<Key, "lesson.times.one" | "lesson.times.many">; n: number };
};

/** The line of a lesson that has been held; null for one that has not. `today` is the start of today on this computer. */
export function heldLine(lesson: Pick<LessonSummary, "times_run" | "last_run_at">, today: number, locale: Locale): HeldLine | null {
  if (lesson.times_run <= 0) return null;
  const last = lesson.last_run_at === null ? Number.NaN : Date.parse(lesson.last_run_at);
  return {
    when: Number.isFinite(last) ? relativeDay(last, today) : null,
    // The singular is every number that ends in 1 but 11 in Macedonian ("21 пат"), and only 1 in English.
    times: { key: isOne(lesson.times_run, locale) ? "lesson.times.one" : "lesson.times.many", n: lesson.times_run },
  };
}

/** The line in the words of the interface. */
export function heldText(t: Say, line: HeldLine): string {
  const times = t(line.times.key, { n: line.times.n });
  return line.when ? `${t("lesson.held", { when: sayWhen(t, line.when) })} · ${times}` : times;
}
