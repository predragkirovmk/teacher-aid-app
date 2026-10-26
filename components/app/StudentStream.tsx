"use client";

import { useEffect } from "react";
import { invalidate } from "@/lib/app/api/query";
import { endSession } from "@/lib/app/api/session";
import { createStudentTransport } from "@/lib/app/session/connect";
import { createStudentStream } from "@/lib/app/session/student-stream";

/**
 * Listens to the student's own channel for as long as a student is signed in and the page is shown (student-stream.ts), so
 * an alert is in the feed, and on the Alerts tab's badge, the moment the server creates it, wherever the student is.
 */
export function StudentStream({ meId }: { meId: string | undefined }) {
  useEffect(() => {
    if (!meId) return;
    const stream = createStudentStream({
      meId,
      createTransport: createStudentTransport,
      // An alert can mean a new result, a practice set, a late mark or a badge: read what each of them changes.
      onNotification: () => invalidate("notifications", "results", "practice", "attendance", "badges", "leaderboard"),
      onSignedInElsewhere: () => endSession("signed_in_elsewhere"),
      visible: () => document.visibilityState === "visible",
    });
    const onVisibility = () => (document.visibilityState === "visible" ? stream.show() : stream.hide());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stream.dispose();
    };
  }, [meId]);

  return null;
}
