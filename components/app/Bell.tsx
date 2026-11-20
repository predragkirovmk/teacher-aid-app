"use client";

import { BellSimpleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { NOTIFICATIONS_PAGE } from "@/lib/app/api/config";
import { useNotifications } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";

/** Home's bell: opens Alerts, and carries the unread count. The announcement of a new alert lives in Shell, so it is made on every screen. */
export function Bell() {
  const { t } = useT();
  const feed = useNotifications().data;
  const count = (feed ?? []).filter((n) => n.readAt === null).length;
  // A feed of a full page that is all unread may have more behind it: say "30+" rather than a number that is too low.
  const shownCount = count >= NOTIFICATIONS_PAGE ? `${NOTIFICATIONS_PAGE}+` : count;
  // Keep the last non-zero count so the badge can shrink away showing it, instead of vanishing.
  const [lastCount, setLastCount] = useState(shownCount);
  if (count > 0 && shownCount !== lastCount) setLastCount(shownCount);
  return (
    <Link href="/app/notifications" transitionTypes={["nav-forward"]} className="bell press" aria-label={count > 0 ? `${t("notif.title")}, ${t("notif.unreadCount", { n: shownCount })}` : t("notif.title")}>
      <BellSimpleIcon size={26} aria-hidden="true" />
      <span className="tab__badge" data-on={count > 0} aria-hidden="true">
        <span key={lastCount} className="tab__count">
          {lastCount}
        </span>
      </span>
    </Link>
  );
}
