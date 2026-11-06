"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Which screen of the review the projector shows (see `reviewScreens`): the teacher steps through them from the console, and the projector follows. Two
 * windows of one browser say it to each other over a BroadcastChannel, with no server in it, as the heartbeat does (windows.ts). The place is not kept
 * by the API: a projector that is opened or reloaded asks the console, which answers with where it is; a console that is reloaded starts again at the
 * first screen and tells the projector so. With no BroadcastChannel the projector shows the first screen.
 */

const channelName = (sessionId: string) => `teacheraid-review-screen-${sessionId}`;
type Message = { kind: "ask" } | { kind: "at"; at: number };
const isMessage = (v: unknown): v is Message =>
  !!v && typeof v === "object" && ((v as Message).kind === "ask" || ((v as Message).kind === "at" && Number.isInteger((v as { at: unknown }).at)));

const open = (sessionId: string): BroadcastChannel | null => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName(sessionId)));

/** The console's place in the review, and the way to change it; the projector is told at once and whenever it asks. */
export function useReviewScreenController(sessionId: string): [number, (at: number) => void] {
  const [at, setAt] = useState(0);
  const latest = useRef(0);
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
    channel.current?.postMessage({ kind: "at", at: next } satisfies Message);
  };
  return [at, change];
}

/** The projector's place in the review: wherever the console says it is, the first screen until it does. */
export function useReviewScreenFollower(sessionId: string): number {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const c = open(sessionId);
    if (!c) return;
    c.onmessage = (e: MessageEvent<unknown>) => {
      if (isMessage(e.data) && e.data.kind === "at") setAt(e.data.at);
    };
    c.postMessage({ kind: "ask" } satisfies Message);
    return () => c.close();
  }, [sessionId]);
  return at;
}
