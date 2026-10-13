"use client";

import Link from "next/link";
import { ViewTransition } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
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
        <CaretRightIcon size={22} aria-hidden="true" />
      </span>
    </Link>
  );
}

/** A subject in Home's grouped list: the subject's tone on its monogram, the teacher underneath. */
export function SubjectRow({ subject, shared = true }: { subject: Subject; shared?: boolean }) {
  const { t } = useT();
  const row = (
    <Link href={`/app/subject/${subject.id}`} className="item">
      <span className={`monogram tone-${subject.tone}`} aria-hidden="true">
        {subject.initials}
      </span>
      <span className="grow">
        <span className="item__title" style={{ display: "block" }}>
          {t(`subj.${subject.id}`)}
        </span>
        <span className="t-cap">{t(`teacher.${subject.id}`)}</span>
      </span>
      <CaretRightIcon size={22} aria-hidden="true" />
    </Link>
  );
  // A view-transition name must be unique on the page: the next-lesson card owns this subject's name.
  return shared ? (
    <ViewTransition name={`subject-${subject.id}`} share="morph" default="none">
      {row}
    </ViewTransition>
  ) : (
    row
  );
}
