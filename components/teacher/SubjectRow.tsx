"use client";

import { useId } from "react";
import { useT } from "@/lib/teacher/i18n";
import type { SubjectChoice } from "@/lib/teacher/subjects";
import { Choices } from "./Choices";

/**
 * "Предмет": the row of subjects at the top of the Lessons page and the Library. It is a few large radio choices, the first of which
 * is every subject, so the arrow keys work and the chosen one has a tick, a bold label and a white edge. The page shows it only for
 * a teacher who has more than one subject: with one there is nothing to choose.
 */
export function SubjectRow({
  choices,
  value,
  onChange,
}: {
  choices: { value: SubjectChoice; label: string }[];
  value: SubjectChoice;
  onChange: (value: SubjectChoice) => void;
}) {
  const { t } = useT();
  const heading = useId();
  return (
    <section className="subjects" aria-labelledby={heading}>
      <h2 className="subjects__label" id={heading}>
        {t("lessons.subject")}
      </h2>
      <div className="prepare__tiles">
        <Choices<SubjectChoice> name="subject" labelledBy={heading} value={value} options={choices} onChange={onChange} />
      </div>
    </section>
  );
}
