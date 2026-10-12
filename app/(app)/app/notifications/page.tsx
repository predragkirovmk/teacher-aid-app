"use client";

import { Bell, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Mark } from "@/components/app/Mark";
import { formatDate, useNotifs } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { actions } from "@/lib/app/store";

export default function Notifications() {
  const { t, locale } = useT();
  const items = useNotifs();
  const unread = items.filter((n) => n.unread);

  return (
    <main className="screen">
      <div className="brand">
        <Mark size={44} />
        <span className="brand__name">{t("notif.title")}</span>
      </div>

      {unread.length > 0 && (
        <button
          className="btn btn--ghost btn--block"
          style={{ minHeight: 48, fontSize: 15, marginBottom: 14 }}
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
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((n) => (
            <li key={n.id}>
              <Link href={`/app/notifications/${n.id}`} className={`item${n.unread ? " item--unread" : ""}`}>
                <span className="item__icon">
                  <Bell size={22} strokeWidth={2} />
                </span>
                <span className="grow">
                  <span className="item__title" style={{ display: "block" }}>
                    {n.kind === "checkin"
                      ? t("notif.checkin.title", { subject: t(`subj.${n.subject}`) })
                      : t(`notif.${n.id as "n-math"}.title`)}
                  </span>
                  <span className="t-cap" style={{ display: "flex", gap: 10, marginTop: 2 }}>
                    {formatDate(n.when, locale)}
                    {n.unread && <span className="dot-unread">{t("notif.unread")}</span>}
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
