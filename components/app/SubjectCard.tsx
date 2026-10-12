"use client";

import Link from "next/link";
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
