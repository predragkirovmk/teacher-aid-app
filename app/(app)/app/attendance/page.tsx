"use client";

import { CircleCheck, CircleX, Clock, QrCode } from "lucide-react";
import Link from "next/link";
import { Top } from "@/components/app/Top";
import type { AttendanceStatus } from "@/lib/app/data";
import { formatDate, useAttendance } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { useTween } from "@/lib/app/tween";

const ICON = { present: CircleCheck, late: Clock, absent: CircleX } as const;

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const { t } = useT();
  const Icon = ICON[status];
  return (
    <span className="status">
      <Icon size={20} strokeWidth={2} aria-hidden="true" />
      {t(`att.status.${status}`)}
    </span>
  );
}

export default function Attendance() {
  const { t, locale } = useT();
  const { attended, total, percent, log } = useAttendance();
  const tween = useTween(percent, "teacheraid-shown-attendance-ring", true);
  const r = 86;
  const c = 2 * Math.PI * r;

  return (
    <main className="screen">
      <Top title={t("att.title")} />
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
          <span className="t-num" style={{ fontSize: 52 }}>
            {tween.value}%
          </span>
        </div>
      </div>
      <p className="t-cap" style={{ textAlign: "center", margin: "0 0 22px" }}>
        {t("att.attended", { a: attended, t: total })}
      </p>

      <Link href="/app/scan" className="btn btn--primary btn--block">
        <QrCode size={22} strokeWidth={2} aria-hidden="true" />
        {t("att.scanCta")}
      </Link>

      <h2 className="section-h">{t("att.recent")}</h2>
      <ul className="list">
        {log.map((l) => (
          <li key={l.id} className="item" style={{ minHeight: 64 }}>
            <span className="grow item__main">
              <span className="item__text">
                <span className="item__title" style={{ display: "block" }}>
                  {t(`subj.${l.subject}`)}
                </span>
                <span className="t-cap">
                  {formatDate(l.when, locale)}
                  {l.scanned ? `, ${t("att.scanned")}` : ""}
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
