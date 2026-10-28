"use client";

import { PlusCircleIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/teacher/PageHeader";
import { SoonCard } from "@/components/teacher/SoonCard";
import { useT } from "@/lib/teacher/i18n";

export default function NewLessonPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("lessonsNew.title")} back="/teacher/lessons" />
      <div className="content">
        <SoonCard icon={PlusCircleIcon} what={t("lessonsNew.what")} />
      </div>
    </>
  );
}
