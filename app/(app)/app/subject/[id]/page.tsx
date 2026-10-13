"use client";

import { CheckCircleIcon, ScanIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { ViewTransition } from "react";
import { notFound, useParams } from "next/navigation";
import { SubjectCard } from "@/components/app/SubjectCard";
import { Top } from "@/components/app/Top";
import { subjectById, WEEK } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";
import { useApp } from "@/lib/app/store";

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const subject = subjectById(id);
  const { t } = useT();
  const { checkins } = useApp();
  if (!subject) notFound();

  const next = WEEK.flatMap((d) => d.slots.map((s) => ({ ...s, day: d.day }))).find((s) => s.subject === subject.id);
  const done = checkins.some((c) => c.subject === subject.id);

  return (
    <main className="screen">
      <Top title={t(`subj.${subject.id}`)} />
      <ViewTransition name={`subject-${subject.id}`} share="morph" default="none">
        <SubjectCard subject={subject} hero />
      </ViewTransition>
      <div className="stack" style={{ marginTop: 16 }}>
        {next && (
          <div className="card">
            <div className="t-cap">{t("subject.next")}</div>
            <div className="t-title" style={{ marginTop: 4 }}>
              {t(`dayLong.${next.day}`)}, {next.time}
            </div>
            <div className="t-cap" style={{ marginTop: 4 }}>
              {t(`kind.${next.kind}`)}
            </div>
          </div>
        )}
        {done ? (
          <div className="card row">
            <CheckCircleIcon size={26} color="var(--yellow)" aria-hidden="true" />
            <span className="t-label" style={{ fontSize: 17 }}>
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
