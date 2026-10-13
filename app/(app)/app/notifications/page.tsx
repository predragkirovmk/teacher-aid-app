"use client";

import { Bell, ChevronRight } from "lucide-react";
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
      <h1 className="large" style={{ marginTop: 14 }}>
        {t("notif.title")}
      </h1>

      {unread.length > 0 && (
        <button
          className="btn btn--ghost btn--block"
          style={{ minHeight: 48, fontSize: "0.9375rem", marginBottom: 14 }}
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
                  <Bell size={22} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="grow">
                  <span className="item__title" style={{ display: "block" }}>
                    {n.kind === "checkin"
                      ? t("notif.checkin.title", { subject: t(`subj.${n.subject}`) })
                      : t(`notif.${n.id as "n-math"}.title`)}
                  </span>
                  <span className="t-cap" style={{ display: "flex", gap: 10, marginTop: 2 }}>
                    {formatDate(n.when, locale)}
                    <span className="dot-unread" data-on={n.unread} aria-hidden={!n.unread}>
                      {t("notif.unread")}
                    </span>
                  </span>
                </span>
                <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
