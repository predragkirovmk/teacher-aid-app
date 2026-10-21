"use client";

import { useEffect } from "react";
import { useUI } from "@/components/app/ui";
import { useQT } from "@/lib/app/quiz-copy";
import { onSyncWake } from "@/lib/app/session/background-sync";
import { net } from "@/lib/app/session/net";
import { OUTBOX_STUDENT_KEY } from "@/lib/app/session/outbox-store";
import { outbox } from "@/lib/app/session/send";

/**
 * Keeps the answer outbox going for as long as the app is open (spec F-08). When a student is signed in
 * it reads what was saved on the phone, which is how a reload or a killed app still gets its answers
 * sent, and sends it. It sends again whenever the connection may be back: the phone's `online` event,
 * the page coming back to the front, the browser's Background Sync wake-up. (The lesson's own realtime
 * link opening again flushes too; see the session controller.) And it tells the student when an answer
 * arrived too late or after the lesson had ended, when they are not in the quiz, whose own screens say it.
 */
const remembered = () => {
  try {
    return window.localStorage.getItem(OUTBOX_STUDENT_KEY);
  } catch {
    return null;
  }
};

export function OutboxRunner({ meId }: { meId: string | undefined }) {
  const { toast } = useUI();
  const { t } = useQT();

  useEffect(() => {
    if (meId) {
      try {
        window.localStorage.setItem(OUTBOX_STUDENT_KEY, meId);
      } catch {
        // blocked storage: only the count while the server is out of reach is lost
      }
      void outbox.start(meId);
    } else {
      outbox.stop();
      const last = remembered();
      if (last) void outbox.peek(last);
    }
  }, [meId]);

  useEffect(() => {
    const flush = () => void outbox.flush();
    const visible = () => document.visibilityState === "visible" && flush();
    window.addEventListener("online", flush);
    window.addEventListener("pageshow", flush);
    document.addEventListener("visibilitychange", visible);
    const stopWake = onSyncWake(flush);
    const stopStatus = outbox.onStatus(() => net.setOutbox(outbox.getStatus()));
    net.setOutbox(outbox.getStatus());
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("pageshow", flush);
      document.removeEventListener("visibilitychange", visible);
      stopWake();
      stopStatus();
    };
  }, []);

  useEffect(
    () =>
      outbox.subscribe((o) => {
        // In the quiz the screen says it itself (the verdict's line, the ending's note); a toast would only sit on top of it.
        if (window.location.pathname.startsWith("/app/play")) return;
        if (o.type === "late") toast(t("ans.tooLate"));
        else if (o.type === "ended") toast(t("ans.ended"));
      }),
    [toast, t],
  );

  return null;
}
