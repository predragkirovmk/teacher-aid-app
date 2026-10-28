"use client";

import { UsersThreeIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/teacher/PageHeader";
import { SoonCard } from "@/components/teacher/SoonCard";
import { useT } from "@/lib/teacher/i18n";

export default function ClassesPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("classes.title")} />
      <div className="content">
        <SoonCard icon={UsersThreeIcon} what={t("classes.what")} />
      </div>
    </>
  );
}
