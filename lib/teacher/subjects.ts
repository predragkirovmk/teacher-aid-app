import type { Id, Subject } from "./api/types";

/**
 * The row of subjects at the top of the Lessons page and the Library: "All subjects" and one choice per subject. A choice is a
 * string, because it is a radio button's value: `all`, `mine` (the Library only, see library.ts) or `s:` and a subject's id.
 */
export type SubjectChoice = string;

export const ALL: SubjectChoice = "all";
export const MINE: SubjectChoice = "mine";

export const choiceOf = (subjectId: Id): SubjectChoice => `s:${subjectId}`;

/** The subject a choice names, or null for the choices that are not one subject. */
export const subjectOfChoice = (choice: SubjectChoice): Id | null => (choice.startsWith("s:") ? choice.slice(2) : null);

/** The subjects the lists hold, each once, by name. A teacher's list is short, so this sorts the whole of it. */
export function subjectsOf(...lists: readonly (readonly { subject: Subject }[])[]): Subject[] {
  const found = new Map<Id, Subject>();
  for (const list of lists) for (const { subject } of list) if (!found.has(subject.id)) found.set(subject.id, subject);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, "mk") || a.id.localeCompare(b.id));
}

/** A teacher with one subject has nothing to choose between: the row is not shown (a single choice is a line, never a row). */
export const needsSubjectRow = (subjects: readonly Subject[]): boolean => subjects.length > 1;

/**
 * The choice that counts: the one the teacher made, unless the subject it names is not in the lists any more (the last lesson of a
 * subject was deleted, or thrown away), and then everything is shown. `available` are the choices the row offers besides "all".
 */
export function effectiveChoice(chosen: SubjectChoice | null, subjects: readonly Subject[], available: readonly SubjectChoice[] = []): SubjectChoice | null {
  if (chosen === null) return null;
  if (chosen === ALL || available.includes(chosen)) return chosen;
  const id = subjectOfChoice(chosen);
  return id !== null && subjects.some((s) => s.id === id) ? chosen : ALL;
}

/** Whether an item with this subject is shown under the choice. */
export function matchesChoice(choice: SubjectChoice, subject: Subject): boolean {
  const id = subjectOfChoice(choice);
  return id === null || id === subject.id;
}
