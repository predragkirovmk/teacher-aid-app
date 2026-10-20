"use client";

import { useMe as useStudent } from "./api/hooks";
import { useT } from "./i18n";
import { initials, personName } from "./quiz";

/** The photo the API takes: a JPEG of up to 200 KB (spec 3.2). */
export const PHOTO_MAX_BYTES = 200 * 1024;

export const NAME_MIN = 2;
export const NAME_MAX = 24;

/** Collapse runs of spaces and trim, the way the name is stored and shown. */
export const cleanName = (raw: string) => raw.replace(/\s+/g, " ").trim();

/** Letters of any script, with single spaces, hyphens, apostrophes and full stops between them. */
const NAME_RE = /^\p{L}[\p{L}\p{M}'’.\- ]*$/u;

export function nameError(raw: string): "empty" | "short" | "chars" | null {
  const name = cleanName(raw);
  if (!name) return "empty";
  if (Array.from(name).length < NAME_MIN) return "short";
  if (!NAME_RE.test(name)) return "chars";
  return null;
}

/**
 * The signed-in student as classmates see them: the display name if they chose one, else the school
 * account's name (in Latin letters for the English interface). Empty until the API has answered.
 */
export function useSelf() {
  const { data: student } = useStudent();
  const { locale } = useT();
  const name = student ? (student.displayName ?? personName(student.fullName, locale)) : "";
  return {
    loaded: !!student,
    name,
    first: name.split(" ")[0],
    initials: initials(name),
    photo: student?.photoUrl ?? null,
  };
}
