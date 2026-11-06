"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { markNotificationsRead } from "@/lib/app/api/hooks";
import { invalidate } from "@/lib/app/api/query";
import { flow, refresh } from "@/lib/app/push";
import { safeNext } from "@/lib/app/signin";

/**
 * Keeps this phone's web push in step for as long as a student is signed in, and carries a tap on a notification to its
 * screen. It draws nothing.
 *
 * - When the app opens for a student, the phone and the API are brought into step without asking anyone anything (flow.resync).
 * - The worker tells an open page what happened: a push arrived (read the feed, in case the stream is down) or a notification
 *   was tapped (go to its screen, and mark it read).
 * - A notification tapped while the app was closed opens a window on its screen with `?from_push=<id>`: the alert is marked
 *   read and the address cleaned.
 */
export function PushRunner({ student }: { student: { id: string; notificationsOn: boolean } | undefined }) {
  const router = useRouter();
  const meId = student?.id;
  // The latest setting, read when the app opens for a student; a change of it is the switch's own business.
  const latest = useRef(student);
  useEffect(() => {
    latest.current = student;
  });

  useEffect(() => {
    if (!meId || !latest.current) return;
    void flow.resync(latest.current).then(refresh);
  }, [meId]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; id?: unknown; link?: unknown } | null;
      if (data?.type === "push-received") {
        invalidate("notifications", "results", "practice", "attendance", "badges", "leaderboard");
      } else if (data?.type === "open-alert" && meId) {
        if (typeof data.id === "string" && data.id) markNotificationsRead([data.id]).catch(() => {});
        router.push(safeNext(typeof data.link === "string" ? data.link : null) ?? "/app/notifications");
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [meId, router]);

  useEffect(() => {
    if (!meId) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("from_push");
    if (!id) return;
    markNotificationsRead([id]).catch(() => {});
    url.searchParams.delete("from_push");
    window.history.replaceState(window.history.state, "", url);
  }, [meId]);

  return null;
}
