"use client";

import { CheckCircleIcon, ScanIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { ViewTransition } from "react";
import { notFound, useParams } from "next/navigation";
import { Gate } from "@/components/app/QueryState";
import { SubjectCard } from "@/components/app/SubjectCard";
import { Top } from "@/components/app/Top";
import { demoOnly } from "@/lib/app/api";
import { useAttendance, useCourse } from "@/lib/app/api/hooks";
import type { Course } from "@/lib/app/api/types";
import { daysFrom, nextLesson, roomLabel, useNow, type Lesson } from "@/lib/app/demo";
import { useT } from "@/lib/app/i18n";
import { subjectLabel } from "@/lib/app/subjects";

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const course = useCourse(id);
  return (
    <Gate query={course} header={<Top title={t("subjects.title")} />}>
      {(c) => {
        if (!c) notFound();
        return <CourseView course={c} />;
      }}
    </Gate>
  );
}

function CourseView({ course }: { course: Course }) {
  const { t } = useT();
  const attendance = useAttendance();
  // The lesson card and today's check-in wait for the phone's clock: the server cannot know the time there.
  const now = useNow();

  const next = demoOnly && now !== null ? nextLesson(now, course.subjectId) : undefined;
  const done =
    now !== null &&
    !!attendance.data?.log.some((e) => e.courseId === course.id && e.joinedAt !== null && daysFrom(now, e.joinedAt) === 0);
  const when = (l: Lesson) => {
    const d = daysFrom(now!, l.start);
    return d === 0 ? t("home.today") : d === 1 ? t("home.tomorrow") : t(`dayLong.${l.day}`);
  };

  return (
    <main className="screen">
      <Top title={subjectLabel(t, course.subjectId, course.subjectName)} quiet />
      <ViewTransition name={`subject-${course.id}`} share="morph" default="none">
        <SubjectCard course={course} />
      </ViewTransition>
      <div className="stack" style={{ marginTop: 16 }}>
        {next && (
          <div className="card tile">
            <span className="t-label">{t("subject.next")}</span>
            <span className="tile-big" style={{ fontSize: "var(--fs-display)" }}>
              {when(next)}, {next.from}
            </span>
            <span className="t-cap">
              {t(`kind.${next.kind}`)} · {roomLabel(t, course.subjectId)}
            </span>
          </div>
        )}
        {done ? (
          <div className="card row">
            <CheckCircleIcon size={26} color="var(--yellow)" aria-hidden="true" />
            <span className="t-label" style={{ fontSize: "var(--fs-body)" }}>
              {t("subject.checkedIn")}
            </span>
          </div>
        ) : (
          <Link href="/app/scan" className="btn btn--ghost btn--block">
            <ScanIcon size={22} aria-hidden="true" />
            {t("subject.checkin")}
          </Link>
        )}
      </div>
    </main>
  );
}
