"use client";

import { ChevronRight, FileText, Languages, LogOut, Settings, ShieldCheck, Trophy, CircleHelp } from "lucide-react";
import Link from "next/link";
import { Row } from "@/components/app/Row";
import { useState } from "react";
import { Avatar } from "@/components/app/Avatar";
import { ProfileEditor } from "@/components/app/ProfileEditor";
import { useUI } from "@/components/app/ui";
import { useAttendance } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { actions } from "@/lib/app/store";
import { useMe } from "@/lib/app/profile";
import { useQT } from "@/lib/app/quiz-copy";

export default function Profile() {
  const { t } = useT();
  const { openLang, confirm } = useUI();
  const { percent } = useAttendance();

  const { t: qt } = useQT();
  const me = useMe();
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
      <div className="profile">
      <div className="home-bar">
        <h1 className="large" style={{ margin: 0 }}>
          {qt("p.title")}
        </h1>
        <button className="btn btn--ghost pe-editbtn" onClick={() => setEditing(true)}>
          {qt("p.edit")}
        </button>
      </div>
        <Avatar key={`${me.avatar}-${me.initials}`} avatar={me.avatar} initials={me.initials} size={112} className="pe-pop" />
        <p className="profile__name" style={{ margin: "12px 0 0" }}>
          {me.name}
          <ShieldCheck size={24} strokeWidth={2} color="var(--yellow)" aria-label={t("user.verified")} />
        </p>
        <div className="t-cap">{qt("p.seen")}</div>
        <div className="t-cap">
          {t("user.role")} · {t("user.school")}
        </div>
      </div>

      <div className="grid2" style={{ marginBottom: 22 }}>
        <Link href="/app/attendance" className="card" style={{ padding: 16 }}>
          <div className="row row--between">
            <span className="t-label">{t("home.attendance")}</span>
            <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="tile-big" style={{ marginTop: 8 }}>
            {percent}%
          </div>
        </Link>
        <Link href="/app/summary" className="card" style={{ padding: 16 }}>
          <div className="row row--between">
            <span className="t-label">{t("home.summary")}</span>
            <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="tile-big" style={{ marginTop: 8 }}>
            4/5
          </div>
        </Link>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <div className="list">
          <Row icon={FileText} label={t("drawer.documents")} href="/app/documents" />
          <Row icon={Trophy} label={t("drawer.achievements")} href="/app/achievements" />
        </div>
        <div className="list">
          <Row icon={Settings} label={t("drawer.settings")} href="/app/settings" />
          <Row icon={Languages} label={t("profile.language")} value={t("profile.langValue")} onClick={openLang} />
          <Row icon={CircleHelp} label={t("profile.faq")} href="/app/faq" />
        </div>
        <div className="list">
          <Row
            icon={LogOut}
            label={t("drawer.logout")}
            chevron={false}
            onClick={() =>
              confirm({
                title: t("confirm.logout"),
                confirmLabel: t("drawer.logout"),
                // The shell replaces this screen with the welcome screen once signed out.
                onConfirm: () => actions.setSignedIn(false),
              })
            }
          />
        </div>
      </div>
    </main>
  );
}
