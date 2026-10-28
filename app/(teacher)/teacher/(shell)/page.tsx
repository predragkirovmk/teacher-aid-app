"use client";

import { ChalkboardTeacherIcon, PlusIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { PageHeader } from "@/components/teacher/PageHeader";
import { useDayPart } from "@/lib/teacher/day";
import { useT } from "@/lib/teacher/i18n";

const GREETING = { morning: "today.greet.morning", day: "today.greet.day", evening: "today.greet.evening" } as const;

export default function TodayPage() {
  const { t } = useT();
  const part = useDayPart();
  const name = t("user.first");
  return (
    <>
      <PageHeader title={t("today.title")} subtitle={t(part ? GREETING[part] : "today.greet.neutral", { name })} />
      <div className="content">
        <div className="card card--stack">
          <span className="card__icon">
            <ChalkboardTeacherIcon size={32} aria-hidden="true" />
          </span>
          <h2>{t("today.empty.title")}</h2>
          <p>{t("today.empty.body")}</p>
          <Link href="/teacher/lessons/new" className="btn btn--primary">
            <PlusIcon size={24} weight="bold" aria-hidden="true" />
            {t("today.empty.cta")}
          </Link>
        </div>
      </div>
    </>
  );
}
