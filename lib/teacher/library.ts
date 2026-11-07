import type { Id, LibraryItem, Subject } from "./api/types";
import { ALL, choiceOf, effectiveChoice, matchesChoice, MINE, needsSubjectRow, subjectsOf, type SubjectChoice } from "./subjects";

/**
 * What the Library lists (F-05, FR-LIB-01): the lessons colleagues of the same school saved, newest first. A short library is shown
 * whole. A long one is shown for the teacher's own subjects first, since those are the lessons that can be used, and says so in the
 * row of subjects, where "All subjects" is one press away. Nothing here touches the browser.
 */

/** Past this many lessons the library opens on the teacher's own subjects. PROPOSED, and a named constant so it is easy to change. */
export const LIBRARY_LONG = 12;

/** The lessons of a colleague saved last first. */
export function newestSavedFirst(items: readonly LibraryItem[]): LibraryItem[] {
  const savedAt = (i: LibraryItem) => (Number.isFinite(Date.parse(i.saved_at)) ? Date.parse(i.saved_at) : 0);
  return [...items].sort((a, b) => savedAt(b) - savedAt(a) || a.lesson_id.localeCompare(b.lesson_id, undefined, { numeric: true }));
}

/** The items that are in one of the teacher's own subjects. */
const ofMine = (items: readonly LibraryItem[], mine: ReadonlySet<Id>): LibraryItem[] => items.filter((i) => mine.has(i.subject.id));

/** Whether the row offers "My subjects": only for a long library, and only when there is something of the teacher's subjects in it. */
export const offersMine = (items: readonly LibraryItem[], mine: ReadonlySet<Id>): boolean => items.length > LIBRARY_LONG && ofMine(items, mine).length > 0;

/** What the library opens on, before the teacher chooses. */
export const defaultChoice = (items: readonly LibraryItem[], mine: ReadonlySet<Id>): SubjectChoice => (offersMine(items, mine) ? MINE : ALL);

/** The choices the row holds, in order: "My subjects" when it is offered, "All subjects", then each subject. */
export function libraryChoices(items: readonly LibraryItem[], mine: ReadonlySet<Id>): { value: SubjectChoice; subject: Subject | null }[] {
  const out: { value: SubjectChoice; subject: Subject | null }[] = [];
  if (offersMine(items, mine)) out.push({ value: MINE, subject: null });
  out.push({ value: ALL, subject: null });
  for (const subject of subjectsOf(items)) out.push({ value: choiceOf(subject.id), subject });
  return out;
}

/** Whether the library has a row of subjects at all: more than one subject to choose between, or "My subjects" to go back from. */
export const showsRow = (items: readonly LibraryItem[], mine: ReadonlySet<Id>): boolean => needsSubjectRow(subjectsOf(items)) || offersMine(items, mine);

/** The choice that counts, whatever the teacher chose: one that is not offered any more is "All subjects". */
export function libraryChoice(chosen: SubjectChoice | null, items: readonly LibraryItem[], mine: ReadonlySet<Id>): SubjectChoice {
  const available = offersMine(items, mine) ? [MINE] : [];
  return effectiveChoice(chosen, subjectsOf(items), available) ?? defaultChoice(items, mine);
}

/** What the library shows under a choice, the newest saved first. */
export function shownLibrary(items: readonly LibraryItem[], choice: SubjectChoice, mine: ReadonlySet<Id>): LibraryItem[] {
  const pool = choice === MINE ? ofMine(items, mine) : items.filter((i) => matchesChoice(choice, i.subject));
  return newestSavedFirst(pool);
}
