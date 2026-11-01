import type { DraftSummary, Id, LessonSummary } from "./api/types";
import { isOne } from "./format";
import type { Key } from "./i18n";
import type { Locale } from "./store";
import { matchesChoice, type SubjectChoice } from "./subjects";
import { relativeDay, sayWhen, type When } from "./when";

/**
 * What the Lessons page lists and in what order. Nothing here touches the browser, so all of it is unit tested.
 *
 * Three sections, each shown only when it has something: the lessons that are not finished (drafts), the lessons that are prepared
 * (never run, `times_run == 0`) and the lessons that were held (`times_run > 0`). In each the lesson changed last comes first. The API
 * fixes no order for `GET /lessons` (OPEN-37), so every list is sorted here.
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

export type LessonSections = {
  /** Never run: `times_run` is 0. A lesson in a session that has not ended is still here (FR-LES-17). */
  prepared: LessonSummary[];
  /** Run at least once. */
  held: LessonSummary[];
};

/** The lessons of the choice of subject, in their two sections. */
export function lessonSections(lessons: readonly LessonSummary[], choice: SubjectChoice): LessonSections {
  const shown = newestChangeFirst(lessons.filter((l) => matchesChoice(choice, l.subject)));
  return { prepared: shown.filter((l) => l.times_run === 0), held: shown.filter((l) => l.times_run > 0) };
}

/** The unfinished lessons of the choice of subject. */
export const unfinishedDrafts = (drafts: readonly DraftSummary[], choice: SubjectChoice): DraftSummary[] =>
  newestChangeFirst(drafts.filter((d) => matchesChoice(choice, d.subject)));

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
export function heldText(t: (key: Key, vars?: Record<string, string | number>) => string, line: HeldLine): string {
  const times = t(line.times.key, { n: line.times.n });
  return line.when ? `${t("lesson.held", { when: sayWhen(t, line.when) })} · ${times}` : times;
}
