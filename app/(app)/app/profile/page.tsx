"use client";

import { ChevronRight, Languages, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Mark } from "@/components/app/Mark";
import { useUI } from "@/components/app/ui";
import { useAttendance } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";

export default function Profile() {
  const { t } = useT();
  const { openLang } = useUI();
  const { percent } = useAttendance();

  return (
    <main className="screen">
      <div className="profile">
        <span className="avatar avatar--xl" aria-hidden="true">
          МТ
        </span>
        <h1 className="profile__name">
          {t("user.name")}
          <ShieldCheck size={24} strokeWidth={2} color="var(--yellow)" aria-label={t("user.verified")} />
        </h1>
        <div className="t-cap">{t("user.role")}</div>
        <div className="t-cap">{t("user.school")}</div>
      </div>

      <div className="grid2" style={{ position: "relative", zIndex: 1 }}>
        <Link href="/app/attendance" className="card" style={{ padding: 16 }}>
          <div className="row row--between">
            <span className="t-label">{t("home.attendance")}</span>
            <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="t-num" style={{ marginTop: 8, fontSize: 38 }}>
            {percent}%
          </div>
        </Link>
        <Link href="/app/faq" className="card row" style={{ padding: 16, justifyContent: "center" }}>
          <span className="t-title" style={{ fontSize: 26 }}>
            {t("profile.faq")}
          </span>
        </Link>
        <Link href="/app/summary" className="card" style={{ padding: 16 }}>
          <div className="row row--between">
            <span className="t-label">{t("home.summary")}</span>
            <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="t-num" style={{ marginTop: 8, fontSize: 38 }}>
            4/5
          </div>
        </Link>
        <button className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8 }} onClick={openLang}>
          <span className="row row--between" style={{ width: "100%" }}>
            <span className="t-label">{t("profile.language")}</span>
            <Languages size={22} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="t-title" style={{ fontSize: 22 }}>
            {t("profile.langValue")}
          </span>
        </button>
      </div>

      <Mark size={220} className="ghost-mark" />
    </main>
  );
}
