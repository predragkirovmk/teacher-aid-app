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
import type { Course } from "@/lib/app/api/types";
import { useT } from "@/lib/app/i18n";
import { initials, personName } from "@/lib/app/quiz";
import { subjectLabel, subjectStyle } from "@/lib/app/subjects";

const MARK_ICONS: Record<string, Icon> = {
  biology: DnaIcon,
  history: ScrollIcon,
  geography: GlobeHemisphereEastIcon,
  informatics: CodeIcon,
  art: PaintBrushIcon,
  music: MusicNotesIcon,
  pe: SoccerBallIcon,
};

type SubjectRef = Pick<Course, "subjectId" | "subjectName">;

/** A subject's sign: its letter, or an icon where it has none. It takes the size of the text around it. */
export function SubjectMark({ subject }: { subject: SubjectRef }) {
  const Icon = MARK_ICONS[subject.subjectId];
  return Icon ? <Icon size="1em" weight="bold" aria-hidden="true" /> : <>{subjectStyle(subject.subjectId, subject.subjectName).mark}</>;
}

/**
 * The header of a subject's own screen. It is not a link: it is the page it would lead to. The
 * name is the screen's large title; the bar above keeps it only for screen readers.
 */
export function SubjectCard({ course }: { course: Course }) {
  const { t, locale } = useT();
  const style = subjectStyle(course.subjectId, course.subjectName);
  const teacher = personName(course.teacherName, locale);
  return (
    <div className={`subject tone-${style.tone}`} data-morph={`subject-${course.id}`}>
      <span className="subject__glyphs" aria-hidden="true">
        {style.glyphs}
      </span>
      <span className="subject__name" aria-hidden="true">
        {subjectLabel(t, course.subjectId, course.subjectName)}
      </span>
      <span className="subject__foot">
        <span className="monogram" aria-hidden="true">
          {initials(teacher)}
        </span>
        <span className="grow">{teacher}</span>
      </span>
    </div>
  );
}

/**
 * A subject in a grouped list: the subject's own sign, the teacher underneath unless a caption is
 * given, and an optional status before the chevron.
 */
export function SubjectRow({
  course,
  shared = true,
  caption,
  status,
}: {
  course: Course;
  shared?: boolean;
  caption?: ReactNode;
  status?: ReactNode;
}) {
  const { t, locale } = useT();
  const row = (
    <Link
      href={`/app/subject/${course.id}`}
      className="item"
      data-morph={shared ? `subject-${course.id}` : undefined}
    >
      <span className="mark" aria-hidden="true">
        <SubjectMark subject={course} />
      </span>
      <span className="grow">
        <span className="item__title" style={{ display: "block" }}>
          {subjectLabel(t, course.subjectId, course.subjectName)}
        </span>
        <span className="t-cap">{caption ?? personName(course.teacherName, locale)}</span>
      </span>
      {status}
      <CaretRightIcon size={22} aria-hidden="true" />
    </Link>
  );
  // A view-transition name must be unique on the page: the next-lesson card owns this subject's name.
  return shared ? (
    <ViewTransition name={`subject-${course.id}`} share="morph" default="none">
      {row}
    </ViewTransition>
  ) : (
    row
  );
}
