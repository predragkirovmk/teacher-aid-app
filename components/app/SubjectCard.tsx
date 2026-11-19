import {
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
import { subjectStyle } from "@/lib/app/subjects";

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
