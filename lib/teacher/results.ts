import type { Id, Locale, ResultRow } from "./api/types";
import { personName } from "./format";

/**
 * The end page's list: every student who joined, in the register's order, with how many of the questions put to them they got right. The format of
 * the copied list is open (OPEN-06), so the decisions live here and nowhere else:
 * - the order is the register's: by surname, then by name, in the Macedonian alphabet (`sortRegister`);
 * - a student is written surname first, "Петровска Ана" (`registerName`), as the e-Дневник register has it;
 * - a line is the name, a tab, and the score in words, "4 од 6" (`resultsText`).
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
export function sortRegister<T extends { full_name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const x = splitName(a.full_name);
    const y = splitName(b.full_name);
    return collator.compare(x.surname, y.surname) || collator.compare(x.given, y.given) || collator.compare(a.full_name, b.full_name);
  });
}

/** A question that counts towards the scores: sent, not skipped, with a right answer. `right` holds the ids of the students who answered it rightly. */
export type ScoredQuestion = { fired_at: number; right: ReadonlySet<Id> };

/**
 * One row for each student who joined, in the register's order. A question was put to a student when it was sent after they joined, so a late joiner is asked fewer. The caller passes only the questions that count: a skipped
 * question, one never sent and a poll (a quick question with no right answer) are left out before they get here.
 */
export function resultRows(students: readonly { student_id: Id; full_name: string; joined_at: number }[], questions: readonly ScoredQuestion[]): ResultRow[] {
  const rows = students.map((s) => {
    const put = questions.filter((q) => s.joined_at <= q.fired_at);
    return { student_id: s.student_id, full_name: s.full_name, correct: put.filter((q) => q.right.has(s.student_id)).length, asked: put.length };
  });
  return sortRegister(rows);
}

/** The words a line is written with, in the language of the screen: "4 од 6", "4 of 6". */
export type ResultWords = { score: (correct: number, asked: number) => string };

/** The whole list as plain text a teacher can paste: one student a line, "name, a tab, score", in the register's order, with no heading. */
export function resultsText(rows: readonly ResultRow[], locale: Locale, words: ResultWords): string {
  return sortRegister(rows)
    .map((r) => `${registerName(r.full_name, locale)}\t${words.score(r.correct, r.asked)}`)
    .join("\n");
}
