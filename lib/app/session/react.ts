"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { client } from "../api";
import { endSession } from "../api/session";
import { invalidate } from "../api/query";
import { useMe } from "../api/hooks";
import type { Id } from "../api/types";
import { createTransport } from "./connect";
import { createSessionHandle, type SessionHandle, type SessionRunView } from "./controller";
import { createEngine } from "./engine";
import { sendAnswer } from "./send";
import { viewOf } from "./view";

const IDLE: SessionRunView = { ...viewOf(createEngine({ sessionId: "", meId: "" }), 0), connection: "connecting", syncing: false, failed: null };

/**
 * Where the session's handle lives while the effect that makes it is running. The screen reads it
 * through useSyncExternalStore, so there is no state to set from inside the effect: the effect just
 * hands the holder the handle, and the holder tells whoever is reading.
 */
function createHolder() {
  let handle: SessionHandle | null = null;
  let stopInner = () => {};
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    set(next: SessionHandle | null) {
      stopInner();
      handle = next;
      stopInner = next ? next.subscribe(notify) : () => {};
      notify();
    },
    get: () => handle,
    getView: () => (handle ? handle.getView() : IDLE),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Run the student's side of a session they have joined, for as long as the screen is up. The view is
 * what the quiz screen draws; `answer` is the student's tap, `retry` loads the session again when it
 * could not be loaded.
 */
export function useSession(sessionId: Id, late: boolean) {
  const meId = useMe().data?.id;
  const [holder] = useState(createHolder);

  useEffect(() => {
    if (!meId) return;
    const h = createSessionHandle({
      sessionId,
      meId,
      late,
      transport: createTransport(sessionId),
      getSnapshot: (id) => client.getStudentState(id),
      sendAnswer,
      onSignedInElsewhere: () => endSession("signed_in_elsewhere"),
      onNotification: () => invalidate("notifications"),
      // Points are settled and attendance and results written when the session ends (BR-PTS-10, F-10).
      onEnded: () => invalidate("results", "attendance", "notifications", "leaderboard"),
    });
    holder.set(h);
    // A phone that slept or lost its signal asks again the moment the student is back.
    const wake = () => {
      if (document.visibilityState === "visible") h.wake();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      h.dispose();
      holder.set(null);
    };
  }, [holder, sessionId, meId, late]);

  const run = useSyncExternalStore(holder.subscribe, holder.getView, () => IDLE);
  return { run, answer: (response: string) => holder.get()?.answer(response), retry: () => holder.get()?.retry() };
}
