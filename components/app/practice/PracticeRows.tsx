"use client";

import { CaretRightIcon, CheckCircleIcon, CircleHalfIcon, NotePencilIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Row } from "@/components/app/Row";
import { useCourses } from "@/lib/app/api/hooks";
import type { PracticeSet } from "@/lib/app/api/types";
import { formatDate } from "@/lib/app/format";
import { useT, type TFn } from "@/lib/app/i18n";
import { answeredIn, openSets, practiceStatus } from "@/lib/app/practice";
import { usePracticeSets } from "@/lib/app/api/hooks";
import { subjectLabel } from "@/lib/app/subjects";

/** "1 question", "4 questions" / "1 прашање", "4 прашања". */
export const questionCount = (t: TFn, n: number) => t(n === 1 ? "pr.count.one" : "pr.count.other", { n });

/** Where a set stands, in words. */
export function stateText(t: TFn, set: PracticeSet): string {
  const status = practiceStatus(set);
  if (status === "new") return t("pr.state.new");
  if (status === "started") return t("pr.state.started", { done: answeredIn(set), n: set.questions.length });
  return t("pr.state.done", { score: set.score ?? 0, n: set.questions.length });
}

/** Where a set stands, for a row: a word, with an icon once there is something to show. */
function State({ set }: { set: PracticeSet }) {
  const { t } = useT();
  const status = practiceStatus(set);
  if (status === "new") return <span className="pill">{stateText(t, set)}</span>;
  if (status === "started") {
    return (
      <span className="status">
        <CircleHalfIcon size={18} weight="bold" aria-hidden="true" />
        {stateText(t, set)}
      </span>
    );
  }
  return (
    <span className="status">
      <CheckCircleIcon size={18} weight="bold" aria-hidden="true" />
      {stateText(t, set)}
    </span>
  );
}

/** One practice set in a list: the lesson it came from, how many questions, when it was sent, and where the student is in it. */
export function PracticeRow({ set, withSubject = true }: { set: PracticeSet; withSubject?: boolean }) {
  const { t, locale } = useT();
  const courses = useCourses();
  const course = courses.data?.find((c) => c.id === set.courseId);
  const subject = course ? subjectLabel(t, course.subjectId, course.subjectName) : "";
  const meta = t("pr.meta", { count: questionCount(t, set.questions.length), date: formatDate(set.createdAt, locale) });
  const Icon = practiceStatus(set) === "done" ? CheckCircleIcon : NotePencilIcon;
  return (
    <Link href={`/app/practice/${encodeURIComponent(set.id)}`} className="item">
      <span className="item__icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="grow item__main">
        <span className="item__text">
          <span className="item__title" style={{ display: "block" }}>
            {withSubject && subject ? subject : (set.lessonTitle ?? subject)}
          </span>
          <span className="t-cap">{withSubject && set.lessonTitle ? `${set.lessonTitle} · ${meta}` : meta}</span>
        </span>
        <State set={set} />
      </span>
      <CaretRightIcon size={22} aria-hidden="true" />
    </Link>
  );
}

/**
 * Home's quiet row, there only while a set is waiting (new, or started and not finished). With one it opens that set, with more it
 * opens the list. It is a plain row, never the yellow object of the screen: practice is optional.
 */
export function PracticeHomeRow({ space }: { space: "above" | "below" }) {
  const { t } = useT();
  const sets = usePracticeSets();
  const courses = useCourses();
  const waiting = openSets(sets.data ?? []);
  if (waiting.length === 0) return null;
  const fresh = waiting.filter((s) => practiceStatus(s) === "new");
  const first = waiting[0];
  const course = courses.data?.find((c) => c.id === first.courseId);
  const subject = course ? subjectLabel(t, course.subjectId, course.subjectName) : "";
  const value =
    fresh.length > 1
      ? t("pr.home.newN", { n: fresh.length })
      : fresh.length === 1
        ? t("pr.home.new1", { subject })
        : t("pr.home.resume", { subject });
  return (
    <div className="list" style={space === "above" ? { marginTop: 16 } : { marginBottom: 16 }}>
      <Row
        icon={NotePencilIcon}
        label={t("pr.title")}
        value={value}
        href={waiting.length === 1 ? `/app/practice/${encodeURIComponent(first.id)}` : "/app/practice"}
      />
    </div>
  );
}
