"use client";

import { NotifIcon } from "@/components/app/NotifIcon";
import { Gate } from "@/components/app/QueryState";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Top } from "@/components/app/Top";
import { markNotificationsRead } from "@/lib/app/api/hooks";
import { alertCopy, useAlerts, type AlertItem } from "@/lib/app/alerts";
import { formatDate, formatTime } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";

export default function NotificationDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const alerts = useAlerts();
  return (
    <Gate query={alerts} header={<Top title={t("notif.title")} />}>
      {(items) => <Detail n={items.find((x) => x.id === id)} />}
    </Gate>
  );
}

function Detail({ n }: { n: AlertItem | undefined }) {
  const { t, locale } = useT();

  // Opening an alert is reading it. A check-in is only a record, and has nothing to mark.
  useEffect(() => {
    if (n?.unread) void markNotificationsRead([n.id]);
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

  const { title, body, link, action } = alertCopy(t, locale, n);

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
      <Link href={link} className="btn btn--ghost btn--block" style={{ marginTop: 16 }}>
        {action}
      </Link>
    </main>
  );
}
