"use client";

import { NotifIcon } from "@/components/app/NotifIcon";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Top } from "@/components/app/Top";
import { formatDate, formatTime, useNotifs } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { actions } from "@/lib/app/store";

export default function NotificationDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useT();
  const n = useNotifs().find((x) => x.id === id);

  useEffect(() => {
    if (n) actions.markRead(n.id);
  }, [n?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!n) {
    return (
      <main className="screen screen--bare">
        <Top title={t("notif.title")} />
        <p className="muted">{t("notif.missing")}</p>
        <Link href="/app/notifications" replace className="btn btn--ghost btn--block" style={{ marginTop: 16 }}>
          {t("notif.all")}
        </Link>
      </main>
    );
  }

  const title =
    n.kind === "checkin"
      ? t("notif.checkin.title", { subject: t(`subj.${n.subject}`) })
      : t(`notif.${n.id as "n-math"}.title`);
  const body = n.kind === "checkin" ? t("notif.checkin.body") : t(`notif.${n.id as "n-math"}.body`);
  // The button names where it goes instead of a bare "Open".
  const action =
    n.link === "/app/summary"
      ? t("notif.open.summary")
      : n.link === "/app/attendance"
        ? t("notif.open.attendance")
        : t("notif.open.subject", { subject: t(`subj.${n.subject}`) });

  return (
    <main className="screen screen--bare">
      <Top title={t("notif.title")} />
      <div className="card" style={{ padding: 24 }}>
        <span className="item__icon" style={{ marginBottom: 16 }}>
          <NotifIcon n={n} />
        </span>
        <h2 className="t-title">{title}</h2>
        <p className="t-cap" style={{ margin: "8px 0 16px" }}>
          {formatDate(n.when, locale)}, {formatTime(n.when)}
        </p>
        <p className="t-body" style={{ margin: 0 }}>
          {body}
        </p>
      </div>
      <Link href={n.link} className="btn btn--ghost btn--block" style={{ marginTop: 16 }}>
        {action}
      </Link>
    </main>
  );
}
