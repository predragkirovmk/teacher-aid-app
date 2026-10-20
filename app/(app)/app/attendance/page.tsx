"use client";

import { CheckCircleIcon, ClockIcon, ScanIcon, XCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Gate } from "@/components/app/QueryState";
import { Top } from "@/components/app/Top";
import { useAttendanceView } from "@/lib/app/api/hooks";
import type { AttendanceStatus, AttendanceSummary } from "@/lib/app/api/types";
import { formatDate } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";
import { subjectLabel } from "@/lib/app/subjects";
import { useTween } from "@/lib/app/tween";

const ICON = { present: CheckCircleIcon, late: ClockIcon, absent: XCircleIcon } as const;

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const { t } = useT();
  // A student without a working phone is present, never absent (BR-ATT-01).
  const shown = status === "present_no_device" ? "present" : status;
  const Icon = ICON[shown];
  return (
    <span className="status">
      <Icon size={20} aria-hidden="true" />
      {t(`att.status.${shown}`)}
    </span>
  );
}

export default function Attendance() {
  const { t } = useT();
  const attendance = useAttendanceView();
  return (
    <Gate query={attendance} header={<Top title={t("att.title")} />}>
      {(a) => <AttendanceView a={a} />}
    </Gate>
  );
}

function AttendanceView({ a }: { a: AttendanceSummary }) {
  const { t, locale } = useT();
  const { attended, total, percent, log } = a;
  const tween = useTween(percent, "teacheraid-shown-attendance-ring", true);
  const r = 86;
  const c = 2 * Math.PI * r;

  return (
    <main className="screen">
      <Top title={t("att.title")} />
      <div className="card" style={{ display: "grid", justifyItems: "center", padding: 24, marginBottom: 16 }}>
      <div className="ring" role="img" aria-label={`${percent}%`}>
        <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="16" />
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="var(--yellow)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - tween.value / 100)}
          />
        </svg>
        <div className="ring__val">
          <span className="t-num">
            {tween.value}%
          </span>
        </div>
      </div>
      <p className="t-cap" style={{ margin: "16px 0 0" }}>
        {t("att.attended", { a: attended, t: total })}
      </p>
      </div>

      <Link href="/app/scan" className="btn btn--ghost btn--block">
        <ScanIcon size={22} aria-hidden="true" />
        {t("att.scanCta")}
      </Link>

      <h2 className="section-h">{t("att.recent")}</h2>
      <ul className="list">
        {log.map((l) => (
          <li key={l.id} className="item" style={{ minHeight: 64 }}>
            <span className="grow item__main">
              <span className="item__text">
                <span className="item__title" style={{ display: "block" }}>
                  {subjectLabel(t, l.subjectId, l.subjectName)}
                </span>
                <span className="t-cap">
                  {formatDate(l.date, locale)}
                  {l.joinedAt !== null ? `, ${t("att.scanned")}` : ""}
                </span>
              </span>
              <StatusBadge status={l.status} />
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
