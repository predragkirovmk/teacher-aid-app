"use client";

import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import {
  CaretRightIcon,
  CodeIcon,
  DnaIcon,
  GlobeHemisphereEastIcon,
  MusicNotesIcon,
  PaintBrushIcon,
  ScrollIcon,
  SoccerBallIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { Subject, SubjectId } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";
import { initials } from "@/lib/app/quiz";

const MARK_ICONS: Partial<Record<SubjectId, Icon>> = {
  biology: DnaIcon,
  history: ScrollIcon,
  geography: GlobeHemisphereEastIcon,
  informatics: CodeIcon,
  art: PaintBrushIcon,
  music: MusicNotesIcon,
  pe: SoccerBallIcon,
};

/** A subject's sign: its letter, or an icon where it has none. It takes the size of the text around it. */
export function SubjectMark({ subject }: { subject: Subject }) {
  const Icon = MARK_ICONS[subject.id];
  return Icon ? <Icon size="1em" weight="bold" aria-hidden="true" /> : <>{subject.mark}</>;
}

/** Where a subject is taught: its room, or the gym. */
export const roomLabel = (t: ReturnType<typeof useT>["t"], subject: Subject) =>
  subject.room === "gym" ? t("home.gym") : t("home.room", { n: subject.room });

/**
 * The header of a subject's own screen. It is not a link: it is the page it would lead to. The
 * name is the screen's large title; the bar above keeps it only for screen readers.
 */
export function SubjectCard({ subject }: { subject: Subject }) {
  const { t } = useT();
  return (
    <div className={`subject tone-${subject.tone}`} data-morph={`subject-${subject.id}`}>
      <span className="subject__glyphs" aria-hidden="true">
        {subject.glyphs}
      </span>
      <span className="subject__name" aria-hidden="true">
        {t(`subj.${subject.id}`)}
      </span>
      <span className="subject__foot">
        <span className="monogram" aria-hidden="true">
          {initials(t(`teacher.${subject.id}`))}
        </span>
        <span className="grow">{t(`teacher.${subject.id}`)}</span>
      </span>
    </div>
  );
}

/**
 * A subject in a grouped list: the subject's own sign, the teacher underneath unless a caption is
 * given, and an optional status before the chevron.
 */
export function SubjectRow({
  subject,
  shared = true,
  caption,
  status,
}: {
  subject: Subject;
  shared?: boolean;
  caption?: ReactNode;
  status?: ReactNode;
}) {
  const { t } = useT();
  const row = (
    <Link
      href={`/app/subject/${subject.id}`}
      className="item"
      data-morph={shared ? `subject-${subject.id}` : undefined}
    >
      <span className="mark" aria-hidden="true">
        <SubjectMark subject={subject} />
      </span>
      <span className="grow">
        <span className="item__title" style={{ display: "block" }}>
          {t(`subj.${subject.id}`)}
        </span>
        <span className="t-cap">{caption ?? t(`teacher.${subject.id}`)}</span>
      </span>
      {status}
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
