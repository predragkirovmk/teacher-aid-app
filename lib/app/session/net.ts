"use client";

import { useSyncExternalStore } from "react";
import type { ConnectionState } from "./transport";

/**
 * What the student is told about the connection, in one place so the quiz and the rest of the app say
 * the same thing and never say it twice. Four things feed it:
 *
 * - the phone: `navigator.onLine` and its `online` and `offline` events
 * - the realtime link of the lesson being played, and whether its snapshot call is failing (the quiz)
 * - whether the answer outbox has had to give up an attempt (outbox.ts)
 * - how many answers are saved and waiting
 *
 * and three things come out: "offline" (the phone says so, at once), "reconnecting" (the phone thinks it
 * is online but the lesson's link or the server is not answering; only shown once it has lasted a moment,
 * so a blip does not flash) and "back" (the way out of either, shown briefly). `sent` is a brief "your
 * saved answers arrived" for when the outbox empties. Nothing here is an alarm: no colour, no sound.
 */

export type Banner = "offline" | "reconnecting" | "back";

export type NetInput = {
  online: boolean;
  /** The lesson's realtime link; null outside a lesson. */
  link: ConnectionState | null;
  /** The lesson's snapshot call is failing and being retried. */
  syncing: boolean;
  /** The outbox's last attempt failed and another is waiting. */
  failing: boolean;
};

export type NetView = {
  banner: Banner | null;
  /** Answers (and questions to the teacher) saved and not yet sent. */
  pending: number;
  /** Of those, the questions to the teacher. */
  asks: number;
  /** Answers that were waiting have just arrived. */
  sent: boolean;
};

/** "Reconnecting" is said only when it has lasted this long. */
export const RECONNECT_SHOW_MS = 1500;
/** "Back online" and "Sent" stay this long. */
export const FLASH_MS = 2600;

/** What is wrong right now, before any delay. */
export function badOf(i: NetInput): "offline" | "reconnecting" | null {
  if (!i.online) return "offline";
  return i.link === "reconnecting" || i.syncing || i.failing ? "reconnecting" : null;
}

export const QUIET: NetView = { banner: null, pending: 0, asks: 0, sent: false };

const sameView = (a: NetView, b: NetView) => a.banner === b.banner && a.pending === b.pending && a.asks === b.asks && a.sent === b.sent;

export function createNetStore(now: () => number = Date.now) {
  let input: NetInput = { online: true, link: null, syncing: false, failing: false };
  let forcedOffline = false;
  let pending = 0;
  let asks = 0;
  let badSince: number | null = null;
  let shown: "offline" | "reconnecting" | null = null;
  let backUntil = 0;
  let sentUntil = 0;
  let view: NetView = QUIET;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wired = false;
  const listeners = new Set<() => void>();

  const effective = (): NetInput => ({ ...input, online: input.online && !forcedOffline });

  function recompute() {
    const t = now();
    const bad = badOf(effective());
    let next: number | null = null;
    if (bad === null) {
      if (shown !== null) backUntil = t + FLASH_MS;
      shown = null;
      badSince = null;
    } else {
      badSince ??= t;
      const ripe = t - badSince >= RECONNECT_SHOW_MS;
      if (bad === "offline" || ripe || shown !== null) shown = bad;
      else next = badSince + RECONNECT_SHOW_MS;
    }
    for (const until of [backUntil, sentUntil]) if (until > t) next = next === null ? until : Math.min(next, until);

    const out: NetView = { banner: shown ?? (t < backUntil ? "back" : null), pending, asks, sent: t < sentUntil };
    if (!sameView(view, out)) {
      view = out;
      listeners.forEach((l) => l());
    }
    clearTimeout(timer);
    timer = next === null ? undefined : setTimeout(recompute, Math.max(0, next - t) + 1);
  }

  // The events only say "look again": the phone's own answer is what counts, so a pretend outage's
  // synthetic event cannot make a phone that really is offline look online.
  const onChange = () => {
    input = { ...input, online: navigator.onLine !== false };
    recompute();
  };

  function wire() {
    if (wired || typeof window === "undefined") return;
    wired = true;
    input = { ...input, online: navigator.onLine !== false };
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    recompute();
  }

  return {
    getView: () => view,
    subscribe(listener: () => void) {
      wire();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** The lesson being played reports its link, or null when the quiz is left. */
    setLink(link: ConnectionState | null, syncing = false) {
      if (input.link === link && input.syncing === syncing) return;
      input = { ...input, link, syncing };
      recompute();
    },
    /** The outbox reports how many answers wait, and whether it is failing to send them. */
    setOutbox(status: { pending: number; pendingAsks?: number; failing: boolean }) {
      const emptied = pending > 0 && status.pending === 0 && !status.failing;
      pending = status.pending;
      asks = status.pendingAsks ?? 0;
      input = { ...input, failing: status.failing };
      if (emptied) sentUntil = now() + FLASH_MS;
      recompute();
    },
    /** A demo's pretend outage (the mock lesson's special code): the phone says nothing, but nothing gets through. */
    setForcedOffline(forced: boolean) {
      if (forcedOffline === forced) return;
      forcedOffline = forced;
      // The page can only hear an `online` event from the real one; tell it ourselves so it wakes up and retries.
      if (typeof window !== "undefined") window.dispatchEvent(new Event(forced ? "offline" : "online"));
      recompute();
    },
    /** Whether the phone, or the demo's pretend outage, says there is no connection. */
    isOffline: () => (typeof navigator !== "undefined" && navigator.onLine === false) || forcedOffline,
  };
}

export const net = createNetStore();

export const useNet = (): NetView => useSyncExternalStore(net.subscribe, net.getView, () => QUIET);
