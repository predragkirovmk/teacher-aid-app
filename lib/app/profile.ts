"use client";

import { useMe as useStudent } from "./api/hooks";
import { useT } from "./i18n";
import { initials, personName } from "./quiz";

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
