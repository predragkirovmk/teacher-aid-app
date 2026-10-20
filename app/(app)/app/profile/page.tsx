"use client";

import { CaretRightIcon, DownloadSimpleIcon, FileIcon, GearSixIcon, QuestionIcon, ShieldCheckIcon, SignOutIcon, TranslateIcon, TrophyIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/app/Avatar";
import { ProfileEditor } from "@/components/app/ProfileEditor";
import { Gate } from "@/components/app/QueryState";
import { Row } from "@/components/app/Row";
import { useUI } from "@/components/app/ui";
import { demoOnly } from "@/lib/app/api";
import { signOut, useAttendance, useLatestResult, useMe } from "@/lib/app/api/hooks";
import type { Student } from "@/lib/app/api/types";
import { promptInstall, useInstall } from "@/lib/app/install";
import { useT } from "@/lib/app/i18n";
import { useSelf } from "@/lib/app/profile";
import { useQT } from "@/lib/app/quiz-copy";
import { personName } from "@/lib/app/quiz";

export default function Profile() {
  const { t: qt } = useQT();
  const student = useMe();
  return (
    <Gate
      query={student}
      header={
        <div className="home-bar">
          <h1 className="large" style={{ margin: 0 }}>
            {qt("p.title")}
          </h1>
        </div>
      }
    >
      {(s) => <ProfileView student={s} />}
    </Gate>
  );
}

function ProfileView({ student }: { student: Student }) {
  const { t, locale } = useT();
  const { openLang, confirm, openInstall, toast } = useUI();
  const install = useInstall();
  const attendance = useAttendance();
  const latest = useLatestResult();
  const { t: qt } = useQT();
  const me = useSelf();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <main className="screen">
        <ProfileEditor onDone={() => setEditing(false)} />
      </main>
    );
  }

  return (
    <main className="screen">
      <div className="home-bar">
        <h1 className="large" style={{ margin: 0 }}>
          {qt("p.title")}
        </h1>
        <button className="btn btn--ghost pe-editbtn" onClick={() => setEditing(true)}>
          {qt("p.edit")}
        </button>
      </div>
      <div className="profile">
        <Avatar key={`${me.initials}-${!!me.photo}`} photo={me.photo} initials={me.initials} size={112} className="pe-pop" />
        <p className="profile__name" style={{ margin: "12px 0 0" }}>
          {me.name}
          <ShieldCheckIcon size={24} color="var(--yellow)" aria-label={t("user.verified")} />
        </p>
        <div className="t-cap">{qt("p.seen")}</div>
        <div className="t-cap">
          {t("user.role")} · {personName(student.school.name, locale)}
        </div>
      </div>

      <div className="grid2" style={{ marginBottom: 24 }}>
        <Link href="/app/attendance" className="card tile">
          <span className="tile__head t-label">
            {t("home.attendance")}
            <CaretRightIcon size={20} aria-hidden="true" />
          </span>
          <span className="tile-big">{attendance.data ? `${attendance.data.percent}%` : "–"}</span>
        </Link>
        <Link href="/app/summary" className="card tile">
          <span className="tile__head t-label">
            {t("home.summary")}
            <CaretRightIcon size={20} aria-hidden="true" />
          </span>
          <span className="tile-big">{latest.data ? `${latest.data.right}/${latest.data.total}` : "–"}</span>
        </Link>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {/* Gone once the app runs from the Home Screen. */}
        {install !== "installed" && (
          <div className="list">
            <Row
              icon={DownloadSimpleIcon}
              label={t("install.row")}
              value={t("install.rowHint")}
              onClick={async () => {
                if (install !== "prompt") return openInstall(install);
                const outcome = await promptInstall();
                if (outcome === "accepted") toast(t("install.added"));
                else if (outcome === "unavailable") openInstall("manual");
              }}
            />
          </div>
        )}
        <div className="list">
          {demoOnly && <Row icon={FileIcon} label={t("drawer.documents")} href="/app/documents" />}
          <Row icon={TrophyIcon} label={t("drawer.achievements")} href="/app/achievements" />
        </div>
        <div className="list">
          <Row icon={GearSixIcon} label={t("drawer.settings")} href="/app/settings" />
          <Row icon={TranslateIcon} label={t("profile.language")} value={t("profile.langValue")} onClick={openLang} />
          <Row icon={QuestionIcon} label={t("profile.faq")} href="/app/faq" />
        </div>
        <div className="list">
          <Row
            icon={SignOutIcon}
            label={t("drawer.logout")}
            chevron={false}
            onClick={() =>
              confirm({
                title: t("confirm.logout"),
                confirmLabel: t("drawer.logout"),
                // The shell replaces this screen with the welcome screen once signed out.
                onConfirm: () => void signOut(),
              })
            }
          />
        </div>
      </div>
    </main>
  );
}
