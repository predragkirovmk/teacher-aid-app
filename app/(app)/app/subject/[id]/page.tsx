"use client";

import { CheckCircleIcon, ScanIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { ViewTransition } from "react";
import { notFound, useParams } from "next/navigation";
import { SubjectCard, roomLabel } from "@/components/app/SubjectCard";
import { Top } from "@/components/app/Top";
import { daysFrom, nextLesson, type Lesson } from "@/lib/app/clock";
import { subjectById } from "@/lib/app/data";
import { useNow } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { useApp } from "@/lib/app/store";

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const subject = subjectById(id);
  const { t } = useT();
  const { checkins } = useApp();
  // The lesson card waits for the phone's clock: the server cannot know the time there.
  const now = useNow();
  if (!subject) notFound();

  const next = now === null ? undefined : nextLesson(now, subject.id);
  const done = now !== null && checkins.some((c) => c.subject === subject.id && daysFrom(now, c.at) === 0);
  const when = (l: Lesson) => {
    const d = daysFrom(now!, l.start);
    return d === 0 ? t("home.today") : d === 1 ? t("home.tomorrow") : t(`dayLong.${l.day}`);
  };

  return (
    <main className="screen">
      <Top title={t(`subj.${subject.id}`)} quiet />
      <ViewTransition name={`subject-${subject.id}`} share="morph" default="none">
        <SubjectCard subject={subject} />
      </ViewTransition>
      <div className="stack" style={{ marginTop: 16 }}>
        {next && (
          <div className="card">
            <div className="t-cap">{t("subject.next")}</div>
            <div className="t-title" style={{ marginTop: 4 }}>
              {when(next)}, {next.from}
            </div>
            <div className="t-cap" style={{ marginTop: 4 }}>
              {t(`kind.${next.kind}`)} · {roomLabel(t, subject)}
            </div>
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
