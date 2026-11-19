"use client";

import { useMemo } from "react";
import { demoOnly } from "./api";
import { useAttendance, useNotifications, type Query } from "./api/hooks";
import type { NotificationKind, NotificationPayload } from "./api/types";
import { formatLongDate } from "./format";
import type { TFn } from "./i18n";
import { subjectLabel } from "./subjects";
import type { Locale } from "./api/types";

/**
 * An alert as the Alerts tab shows it: a notification from the API, or (in the demo only) the
 * record of a check-in the student made, which the API has no notification for.
 */
export type AlertItem = {
  id: string;
  kind: NotificationKind | "checkin";
  when: number;
  unread: boolean;
  courseId?: string;
  subjectId?: string;
  subjectName?: string;
  payload: NotificationPayload;
};

export function useAlerts(): Query<AlertItem[]> {
  const q = useNotifications();
  // A check-in is a record of the student's own scan: listed, but never news, so it never raises the badge.
  const log = useAttendance(demoOnly);
  return useMemo(() => {
    if (q.data === undefined) return { ...q, data: undefined };
    const checkins: AlertItem[] = (log.data?.log ?? []).flatMap((e) =>
      e.joinedAt === null
        ? []
        : [
            {
              id: e.id,
              kind: "checkin" as const,
              when: e.joinedAt,
              unread: false,
              courseId: e.courseId,
              subjectId: e.subjectId,
              subjectName: e.subjectName,
              payload: {},
            },
          ],
    );
    const items: AlertItem[] = q.data.map((n) => ({
      id: n.id,
      kind: n.kind,
      when: n.createdAt,
      unread: n.readAt === null,
      courseId: n.payload.courseId,
      subjectId: n.payload.subjectId,
      subjectName: n.payload.subjectName,
      payload: n.payload,
    }));
    return { ...q, data: demoOnly ? [...checkins, ...items] : items };
  }, [q, log.data]);
}

export type AlertCopy = { title: string; body: string; link: string; action: string };

/** The words and the destination of an alert, by what it is about. */
export function alertCopy(t: TFn, locale: Locale, n: AlertItem): AlertCopy {
  const subject = n.subjectId ? subjectLabel(t, n.subjectId, n.subjectName ?? "") : "";
  // An alert with nowhere else to go opens its own detail; that screen shows no button for it.
  const toSelf = `/app/notifications/${n.id}`;
  const openSelf = t("notif.all");
  switch (n.kind) {
    case "checkin":
      return { title: t("notif.checkin.title", { subject }), body: t("notif.checkin.body"), link: toSelf, action: openSelf };
    case "result_ready":
      return {
        title: t("notif.result_ready.title", { subject }),
        body: t("notif.result_ready.body", { right: n.payload.right ?? 0, total: n.payload.total ?? 0 }),
        link: n.payload.sessionId ? `/app/summary/${encodeURIComponent(n.payload.sessionId)}` : "/app/summary",
        action: t("notif.open.summary"),
      };
    case "marked_late":
      return {
        title: t("notif.marked_late.title"),
        body: t("notif.marked_late.body", { subject, date: formatLongDate(n.payload.date ?? n.when, locale) }),
        link: "/app/attendance",
        action: t("notif.open.attendance"),
      };
    case "practice_set_sent":
      return {
        title: t("notif.practice_set_sent.title", { subject }),
        body: t("notif.practice_set_sent.body"),
        link: n.payload.practiceSetId ? `/app/practice/${encodeURIComponent(n.payload.practiceSetId)}` : "/app/practice",
        action: t("notif.open.practice"),
      };
    case "badge_earned":
      return { title: t("notif.badge_earned.title"), body: t("notif.badge_earned.body"), link: "/app/achievements", action: t("notif.open.achievements") };
    case "generic":
      return { title: n.payload.title ?? "", body: n.payload.body ?? "", link: toSelf, action: openSelf };
  }
}
