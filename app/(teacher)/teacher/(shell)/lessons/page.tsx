"use client";

import { ChalkboardTeacherIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/teacher/PageHeader";
import { SoonCard } from "@/components/teacher/SoonCard";
import { useT } from "@/lib/teacher/i18n";

export default function LessonsPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("lessons.title")} />
      <div className="content">
        <SoonCard icon={ChalkboardTeacherIcon} what={t("lessons.what")} />
      </div>
    </>
  );
}
