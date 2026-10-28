"use client";

import { Choices } from "@/components/teacher/Choices";
import { DemoCard } from "@/components/teacher/DemoCard";
import { InstallCard } from "@/components/teacher/InstallCard";
import { PageHeader } from "@/components/teacher/PageHeader";
import { useTeacherName } from "@/lib/teacher/api/hooks";
import { demoOnly } from "@/lib/teacher/api/config";
import { useT } from "@/lib/teacher/i18n";
import { actions } from "@/lib/teacher/store";

export default function SettingsPage() {
  const { t, locale, schoolType } = useT();
  const teacher = useTeacherName();
  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={teacher ? t("settings.who", { name: teacher.full }) : undefined} />
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
        {/* The school decides this for a real teacher; the demo lets you try both. */}
        {demoOnly && (
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
        )}
        <InstallCard />
        <DemoCard />
      </div>
    </>
  );
}
