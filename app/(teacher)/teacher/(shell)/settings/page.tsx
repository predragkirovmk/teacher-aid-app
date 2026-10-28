"use client";

import { Choices } from "@/components/teacher/Choices";
import { InstallCard } from "@/components/teacher/InstallCard";
import { PageHeader } from "@/components/teacher/PageHeader";
import { useT } from "@/lib/teacher/i18n";
import { actions } from "@/lib/teacher/store";

export default function SettingsPage() {
  const { t, locale, schoolType } = useT();
  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.who", { name: t("user.name") })} />
      <div className="content">
        <Choices
          name="locale"
          legend={t("settings.language")}
          value={locale}
          onChange={actions.setLocale}
          options={[
            { value: "mk", label: t("lang.mk"), lang: "mk" },
            { value: "en", label: t("lang.en"), lang: "en" },
          ]}
        />
        <Choices
          name="school"
          legend={t("settings.school")}
          tag={t("settings.school.demo")}
          value={schoolType}
          onChange={actions.setSchoolType}
          options={[
            { value: "school", label: t("school.school") },
            { value: "university", label: t("school.university") },
          ]}
          hint={<p>{t("settings.school.hint")}</p>}
        />
        <InstallCard />
      </div>
    </>
  );
}
