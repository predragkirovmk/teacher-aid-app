import type { AttendanceRow, AttendanceStatus, AttendanceTally, Locale, NoDeviceReason } from "./api/types";
import { personName } from "./format";

/**
 * The attendance list a teacher copies into e-Дневник (FR-END-03, OPEN-06). The format of the list is open (OPEN-06), so the three decisions live
 * here and nowhere else:
 * - the order is the register's: by surname, then by name, in the Macedonian alphabet (`sortAttendance`);
 * - a student is written surname first, "Петровска Ана" (`registerName`), as the e-Дневник register has it;
 * - a line is the name, a colon, and the status in words, with the reason in brackets for a student present without a phone (`attendanceLine`).
 * Change the format by changing `attendanceLine` and the words it is given.
 */

const collator = new Intl.Collator("mk", { sensitivity: "base", numeric: true });

/** Names here are given name first and surname last ("Ана Петровска"); the surname is the last word, the given name the rest. */
export function splitName(fullName: string): { surname: string; given: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { surname: words[0] ?? "", given: "" };
  return { surname: words[words.length - 1], given: words.slice(0, -1).join(" ") };
}

/** "Петровска Ана": surname first, as a register writes it. In English the letters are Latin (EC-NAME-01). */
export function registerName(fullName: string, locale: Locale): string {
  const { surname, given } = splitName(fullName);
  return personName(given ? `${surname} ${given}` : surname, locale);
}

/** The list in the register's order: surname, then given name, then the whole name so that two of the same name keep a fixed order. */
export function sortAttendance<T extends { full_name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const x = splitName(a.full_name);
    const y = splitName(b.full_name);
    return collator.compare(x.surname, y.surname) || collator.compare(x.given, y.given) || collator.compare(a.full_name, b.full_name);
  });
}

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ["present", "late", "absent", "present_no_device"];

/** The counts at the top of the list, from the rows themselves, so the list and the counts can never disagree. */
export function tallyOf(rows: readonly Pick<AttendanceRow, "status">[]): AttendanceTally {
  const t: AttendanceTally = { present: 0, late: 0, absent: 0, present_no_device: 0, total: rows.length };
  for (const r of rows) t[r.status]++;
  return t;
}

/** The words a line is written with, in the language of the screen. */
export type AttendanceWords = { status: Record<AttendanceStatus, string>; reason: Record<NoDeviceReason, string> };

/** What follows the name on a line: the status, and for a student without a phone the reason in brackets. */
export function statusWords(row: Pick<AttendanceRow, "status" | "no_device_reason">, words: AttendanceWords): string {
  const status = words.status[row.status];
  return row.status === "present_no_device" && row.no_device_reason ? `${status} (${words.reason[row.no_device_reason].toLowerCase()})` : status;
}

const lowerWords = (words: AttendanceWords): AttendanceWords => ({
  ...words,
  status: Object.fromEntries(Object.entries(words.status).map(([k, v]) => [k, v.toLowerCase()])) as AttendanceWords["status"],
});

/** One student, one line: "Петровска Ана: присутен/а". The status is in lower case in a line; the page writes it with a capital. */
export function attendanceLine(row: AttendanceRow, words: AttendanceWords, locale: Locale): string {
  return `${registerName(row.full_name, locale)}: ${statusWords(row, lowerWords(words))}`;
}

/** The whole list as plain text a teacher can paste: one student a line, in the register's order, with no heading. */
export function attendanceText(rows: readonly AttendanceRow[], words: AttendanceWords, locale: Locale): string {
  return sortAttendance(rows)
    .map((r) => attendanceLine(r, words, locale))
    .join("\n");
}
