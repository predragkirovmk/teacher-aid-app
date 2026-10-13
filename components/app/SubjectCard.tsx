"use client";

import Link from "next/link";
import { ViewTransition } from "react";
import { ChevronRight } from "lucide-react";
import type { Subject } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";

export function SubjectCard({ subject, hero = false }: { subject: Subject; hero?: boolean }) {
  const { t } = useT();
  return (
    <Link
      href={`/app/subject/${subject.id}`}
      className={`subject tone-${subject.tone}${hero ? " subject--hero" : ""}`}
    >
      <span className="subject__glyphs" aria-hidden="true">
        {subject.glyphs}
      </span>
      <span className="subject__name">{t(`subj.${subject.id}`)}</span>
      <span className="subject__foot">
        <span className="monogram" aria-hidden="true">
          {subject.initials}
        </span>
        <span className="grow">{t(`teacher.${subject.id}`)}</span>
        <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
      </span>
    </Link>
  );
}

/** Compact subject entry for a grid: a flat card with the subject's tone on its monogram. */
export function SubjectTile({ subject, shared = true }: { subject: Subject; shared?: boolean }) {
  const { t } = useT();
  const card = (
    <Link href={`/app/subject/${subject.id}`} className="stile">
      <span className={`monogram tone-${subject.tone}`} aria-hidden="true">
        {subject.initials}
      </span>
      <span>
        <span className="stile__name" style={{ display: "block" }}>
          {t(`subj.${subject.id}`)}
        </span>
        <span className="stile__teacher">{t(`teacher.${subject.id}`)}</span>
      </span>
    </Link>
  );
  // A view-transition name must be unique on the page: the next-lesson card owns this subject's name.
  return shared ? (
    <ViewTransition name={`subject-${subject.id}`} share="morph" default="none">
      {card}
    </ViewTransition>
  ) : (
    card
  );
}
