import type { LibraryItem } from "./api/types";

/**
 * The templates in the Library (F-05, FR-LIB-01): lessons ready to read and copy, newest first. Nothing here touches the browser.
 */

/** The template saved last first. Two saved at the same moment keep a fixed order (by id), so the list does not shuffle. */
export function newestSavedFirst(items: readonly LibraryItem[]): LibraryItem[] {
  const savedAt = (i: LibraryItem) => (Number.isFinite(Date.parse(i.saved_at)) ? Date.parse(i.saved_at) : 0);
  return [...items].sort((a, b) => savedAt(b) - savedAt(a) || a.lesson_id.localeCompare(b.lesson_id, undefined, { numeric: true }));
}
