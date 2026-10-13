"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { NotifIcon } from "@/components/app/NotifIcon";
import Link from "next/link";
import { formatDate, useNotifs } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { actions } from "@/lib/app/store";

export default function Notifications() {
  const { t, locale } = useT();
  const items = useNotifs();
  const unread = items.filter((n) => n.unread);

  return (
    <main className="screen">
      <h1 className="large" style={{ marginTop: 16 }}>
        {t("notif.title")}
      </h1>

      {unread.length > 0 && (
        <button
          className="btn btn--ghost btn--block"
          style={{ minHeight: 48, fontSize: "0.9375rem", marginBottom: 16 }}
          onClick={() => actions.markAllRead(items.map((n) => n.id))}
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
                    {n.kind === "checkin"
                      ? t("notif.checkin.title", { subject: t(`subj.${n.subject}`) })
                      : t(`notif.${n.id as "n-math"}.title`)}
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
