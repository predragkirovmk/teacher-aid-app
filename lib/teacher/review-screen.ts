"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Which screen of the review the projector shows (see `reviewScreens`): the teacher steps through them from the console, and the projector follows. The place is
 * kept in the browser, in `localStorage` under the session, so that a console or a projector that is reloaded or opened again is back where it was, and both
 * windows read the one number. The two windows also say it to each other over a BroadcastChannel, with no server in it, as the heartbeat does (windows.ts), so a
 * change shows at once; a projector that is opened or reloaded still asks the console. Nothing is kept by the API. The console clears the place whenever the lesson
 * is not in review (`forgetReviewScreen`), so a lesson that is started again under the same id begins at the first screen.
 */

const channelName = (sessionId: string) => `teacheraid-review-screen-${sessionId}`;
const storeKey = (sessionId: string) => `teacheraid-review-at-${sessionId}`;
type Message = { kind: "ask" } | { kind: "at"; at: number };
const isMessage = (v: unknown): v is Message =>
  !!v && typeof v === "object" && ((v as Message).kind === "ask" || ((v as Message).kind === "at" && Number.isInteger((v as { at: unknown }).at)));

const open = (sessionId: string): BroadcastChannel | null => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName(sessionId)));

function read(sessionId: string): number {
  try {
    const n = Number(window.localStorage.getItem(storeKey(sessionId)));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
function write(sessionId: string, at: number) {
  try {
    window.localStorage.setItem(storeKey(sessionId), String(at));
  } catch {
    // Storage that is shut is a place that is not kept; the two windows still follow each other.
  }
}

/** The lesson is not in review: nothing is kept of a review that is over or has not begun. */
export function forgetReviewScreen(sessionId: string) {
  try {
    window.localStorage.removeItem(storeKey(sessionId));
  } catch {
    // Nothing to forget.
  }
}

/** The console's place in the review, and the way to change it; the projector is told at once and whenever it asks. */
export function useReviewScreenController(sessionId: string): [number, (at: number) => void] {
  // The review is only drawn once the console's snapshot has been read, in the browser, so the stored place is there to be read at the first render.
  const [at, setAt] = useState(() => read(sessionId));
  const latest = useRef(at);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const c = open(sessionId);
    channel.current = c;
    if (c) {
      c.onmessage = (e: MessageEvent<unknown>) => {
        if (isMessage(e.data) && e.data.kind === "ask") c.postMessage({ kind: "at", at: latest.current } satisfies Message);
      };
      c.postMessage({ kind: "at", at: latest.current } satisfies Message);
    }
    return () => {
      c?.close();
      channel.current = null;
    };
  }, [sessionId]);
  const change = (next: number) => {
    latest.current = next;
    setAt(next);
    write(sessionId, next);
    channel.current?.postMessage({ kind: "at", at: next } satisfies Message);
  };
  return [at, change];
}

/** The projector's place in the review: the one the console kept, then wherever the console says it is. */
export function useReviewScreenFollower(sessionId: string): number {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const c = open(sessionId);
    const later = setTimeout(() => setAt(read(sessionId)), 0);
    if (!c) return () => clearTimeout(later);
    c.onmessage = (e: MessageEvent<unknown>) => {
      if (isMessage(e.data) && e.data.kind === "at") setAt(e.data.at);
    };
    c.postMessage({ kind: "ask" } satisfies Message);
    return () => {
      clearTimeout(later);
      c.close();
    };
  }, [sessionId]);
  return at;
}
