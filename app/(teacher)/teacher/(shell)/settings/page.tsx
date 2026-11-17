"use client";

import { Choices } from "@/components/teacher/Choices";
import { DemoRows } from "@/components/teacher/DemoRows";
import { GuideRow } from "@/components/teacher/GuideRow";
import { InstallRow } from "@/components/teacher/InstallRow";
import { PageHeader } from "@/components/teacher/PageHeader";
import { SettingRow } from "@/components/teacher/SettingRow";
import { useTeacherName } from "@/lib/teacher/api/hooks";
import { demoOnly } from "@/lib/teacher/api/config";
import { useT } from "@/lib/teacher/i18n";
import { actions } from "@/lib/teacher/store";

/**
 * Settings as a few calm groups of rows, the control of each at the right: how the app speaks, then what it can do for this
 * computer, then the demo's own. The choices are segmented controls over real radio buttons, so the arrow keys still work.
 */
export default function SettingsPage() {
  const { t, locale, schoolType } = useT();
  const teacher = useTeacherName();
  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={teacher ? t("settings.who", { name: teacher.full }) : undefined} />
      <div className="content">
        <div className="setgroup">
          <SettingRow
            title={t("settings.language")}
            control={({ heading }) => (
              <div className="seg">
                <Choices
                  name="locale"
                  labelledBy={heading}
                  segmented
                  value={locale}
                  onChange={actions.setLocale}
                  options={[
                    { value: "mk", label: t("lang.mk"), lang: "mk" },
                    { value: "en", label: t("lang.en"), lang: "en" },
                  ]}
                />
              </div>
            )}
          />
          {/* The school decides this for a real teacher; the demo lets you try both. */}
          {demoOnly && (
            <SettingRow
              title={t("settings.school")}
              tag={t("settings.school.demo")}
              hint={t("settings.school.hint")}
              control={({ heading, hint }) => (
                <div className="seg">
                  <Choices
                    name="school"
                    labelledBy={heading}
                    segmented
                    describedBy={hint}
                    value={schoolType}
                    onChange={actions.setSchoolType}
                    options={[
                      { value: "school", label: t("school.school") },
                      { value: "university", label: t("school.university") },
                    ]}
                  />
                </div>
              )}
            />
          )}
        </div>
        <div className="setgroup">
          <GuideRow />
          <InstallRow />
        </div>
        <DemoRows />
      </div>
    </>
  );
}
