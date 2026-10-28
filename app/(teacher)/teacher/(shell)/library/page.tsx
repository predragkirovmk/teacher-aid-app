"use client";

import { BooksIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/teacher/PageHeader";
import { SoonCard } from "@/components/teacher/SoonCard";
import { useT } from "@/lib/teacher/i18n";

export default function LibraryPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("library.title")} />
      <div className="content">
        <SoonCard icon={BooksIcon} what={t("library.what")} />
      </div>
    </>
  );
}
