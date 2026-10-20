"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { NotifIcon } from "@/components/app/NotifIcon";
import { Gate } from "@/components/app/QueryState";
import Link from "next/link";
import { markNotificationsRead } from "@/lib/app/api/hooks";
import { alertCopy, useAlerts, type AlertItem } from "@/lib/app/alerts";
import { formatDate } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";

export default function Notifications() {
  const { t } = useT();
  const alerts = useAlerts();
  const title = (
    <h1 className="large" style={{ marginTop: 16 }}>
      {t("notif.title")}
    </h1>
  );
  return (
    <Gate query={alerts} header={title}>
      {(items) => <List items={items} title={title} />}
    </Gate>
  );
}

function List({ items, title }: { items: AlertItem[]; title: React.ReactNode }) {
  const { t, locale } = useT();
  const unread = items.filter((n) => n.unread);

  return (
    <main className="screen">
      {title}

      {unread.length > 0 && (
        <button
          className="btn btn--ghost btn--block"
          style={{ minHeight: 48, fontSize: "var(--fs-callout)", marginBottom: 16 }}
          onClick={() => void markNotificationsRead("all")}
        >
          {t("notif.markAll")}
        </button>
      )}

      {items.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 60 }}>
          {t("notif.empty")}
        </p>
      ) : (
        <ul className="list">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={`/app/notifications/${n.id}`} className={`item${n.unread ? " item--unread" : ""}`}>
                <span className="item__icon">
                  <NotifIcon n={n} />
                </span>
                <span className="grow">
                  <span className="item__title" style={{ display: "block" }}>
                    {alertCopy(t, locale, n).title}
                  </span>
                  <span className="t-cap" style={{ display: "flex", flexWrap: "wrap", columnGap: 8, marginTop: 4 }}>
                    {formatDate(n.when, locale)}
                    <span className="dot-unread" data-on={n.unread} aria-hidden={!n.unread}>
                      {t("notif.unread")}
                    </span>
                  </span>
                </span>
                <CaretRightIcon size={22} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
