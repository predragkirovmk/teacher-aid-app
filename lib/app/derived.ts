"use client";

import { useMemo } from "react";
import {
  BASE_ATTENDED,
  BASE_LOG,
  BASE_TOTAL,
  NOTIFS,
  type AttendanceStatus,
  type SubjectId,
} from "./data";
import { useApp } from "./store";

export type NotifItem = {
  id: string;
  subject: SubjectId;
  /** Static notifications carry a text key; check-ins are built from a template. */
  kind: "static" | "checkin";
  when: number;
  link: string;
  unread: boolean;
};

export function useNotifs(): NotifItem[] {
  const { checkins, read } = useApp();
  return useMemo(() => {
    const fromCheckins: NotifItem[] = checkins.map((c) => ({
      id: c.id,
      subject: c.subject,
      kind: "checkin",
      when: c.at,
      link: `/app/subject/${c.subject}`,
      unread: !read.includes(c.id),
    }));
    const fromStatic: NotifItem[] = NOTIFS.map((n) => ({
      id: n.id,
      subject: n.subject,
      kind: "static",
      when: new Date(n.when).getTime(),
      link: n.link,
      unread: !read.includes(n.id) && n.id !== "n-late",
    }));
    return [...fromCheckins, ...fromStatic];
  }, [checkins, read]);
}

export type LogEntry = {
  id: string;
  subject: SubjectId;
  when: number;
  status: AttendanceStatus;
  scanned: boolean;
};

export function useAttendance() {
  const { checkins } = useApp();
  return useMemo(() => {
    const attended = BASE_ATTENDED + checkins.length;
    const total = BASE_TOTAL + checkins.length;
    const log: LogEntry[] = [
      ...checkins.map((c) => ({ id: c.id, subject: c.subject, when: c.at, status: "present" as const, scanned: true })),
      ...BASE_LOG.map((l) => ({
        id: l.id,
        subject: l.subject,
        when: new Date(`${l.date}T12:00`).getTime(),
        status: l.status,
        scanned: false,
      })),
    ];
    return { attended, total, percent: Math.round((attended / total) * 100), log };
  }, [checkins]);
}

export function useAchievements() {
  const { checkins } = useApp();
  return useMemo(
    () => ({ first: checkins.length > 0, ontime: true, streak: false, perfect: false }),
    [checkins],
  );
}

const MONTHS = {
  mk: ["јан", "фев", "мар", "апр", "мај", "јун", "јул", "авг", "сеп", "окт", "ное", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// Hand-rolled instead of toLocaleDateString: Node and the browser disagree on Macedonian
// month names, which is a hydration mismatch.
export function formatDate(ms: number, locale: "mk" | "en") {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[locale][d.getMonth()]}`;
}

export function formatTime(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
