"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  classViewStatus,
  HEARTBEAT_MS,
  isWindowMessage,
  openClassWindow,
  windowChannelName,
  type ClassViewStatus,
  type ClassWindow,
  type WindowMessage,
} from "./live";
import { classViewUrl } from "./routes";

/**
 * The two windows of a lesson, the console and the projected class view, and what they say to each other over a BroadcastChannel (the
 * same browser, the same origin, so no server is in it): the class view beats every two seconds and says when it is closing, the console
 * listens, and knows whether the projector still has its window. A window the console opened itself is known to be open as long as the browser
 * says it is, whatever the beats say.
 */

type Watch = {
  since: number;
  lastBeat: number | null;
  listeners: Set<() => void>;
  channel: BroadcastChannel | null;
  timer: ReturnType<typeof setInterval>;
};

const watches = new Map<string, Watch>();
const hasChannels = () => typeof BroadcastChannel !== "undefined";

/** That the projector was open for this lesson, kept in the tab: a console that is reloaded still knows its window was open and is gone if no beat comes. */
const openedKey = (sessionId: string) => `teacheraid-class-view-opened-${sessionId}`;
const wasOpen = (sessionId: string): boolean => {
  try {
    return window.sessionStorage.getItem(openedKey(sessionId)) === "1";
  } catch {
    return false;
  }
};
const rememberOpen = (sessionId: string) => {
  try {
    window.sessionStorage.setItem(openedKey(sessionId), "1");
  } catch {
    // ignore
  }
};

/** The window this page opened, if it did: a second press brings it forward. A reload of the console forgets it, and the name finds it again. */
let opened: { sessionId: string; window: ClassWindow } | null = null;

function subscribeWatch(sessionId: string, listener: () => void) {
  let watch = watches.get(sessionId);
  if (!watch) {
    const created: Watch = {
      since: Date.now(),
      lastBeat: null,
      listeners: new Set(),
      channel: hasChannels() ? new BroadcastChannel(windowChannelName(sessionId)) : null,
      timer: setInterval(() => created.listeners.forEach((l) => l()), 1000),
    };
    if (created.channel) {
      created.channel.onmessage = (e: MessageEvent<unknown>) => {
        if (!isWindowMessage(e.data)) return;
        // A window that says it is closing is closed at once, without waiting for its beats to run out.
        if (e.data.kind === "beat") {
          created.lastBeat = Date.now();
          rememberOpen(sessionId);
        } else if (e.data.kind === "closing") created.lastBeat = Number.NEGATIVE_INFINITY;
        else return;
        created.listeners.forEach((l) => l());
      };
      created.channel.postMessage({ kind: "hello" } satisfies WindowMessage);
    }
    watches.set(sessionId, created);
    watch = created;
  }
  watch.listeners.add(listener);
  const held = watch;
  return () => {
    held.listeners.delete(listener);
    if (held.listeners.size > 0) return;
    clearInterval(held.timer);
    held.channel?.close();
    watches.delete(sessionId);
  };
}

function statusOf(sessionId: string): ClassViewStatus {
  if (opened && opened.sessionId === sessionId && !opened.window.closed) return "open";
  const watch = watches.get(sessionId);
  return watch ? classViewStatus(watch.lastBeat, watch.since, Date.now(), { supported: hasChannels(), wasOpen: wasOpen(sessionId) }) : "never";
}

/** Whether the projector still has its window, for the console. "never" until it has been opened, "unknown" where nothing can be told. */
export function useClassViewStatus(sessionId: string): ClassViewStatus {
  const subscribe = useMemo(() => (listener: () => void) => subscribeWatch(sessionId, listener), [sessionId]);
  return useSyncExternalStore(subscribe, () => statusOf(sessionId), (): ClassViewStatus => "never");
}

/** The class view is alive: it beats for the console, answers when asked, and says so when it is closing. */
export function useClassViewBeat(sessionId: string): void {
  useEffect(() => {
    if (!hasChannels()) return;
    const channel = new BroadcastChannel(windowChannelName(sessionId));
    const say = (message: WindowMessage) => channel.postMessage(message);
    channel.onmessage = (e: MessageEvent<unknown>) => {
      if (isWindowMessage(e.data) && e.data.kind === "hello") say({ kind: "beat" });
    };
    say({ kind: "beat" });
    const timer = setInterval(() => say({ kind: "beat" }), HEARTBEAT_MS);
    const closing = () => say({ kind: "closing" });
    window.addEventListener("pagehide", closing);
    return () => {
      window.removeEventListener("pagehide", closing);
      clearInterval(timer);
      closing();
      channel.close();
    };
  }, [sessionId]);
}

/** Open the projected window, with one click, or bring it back if it is open already. A popup blocker is said as "blocked". */
export function openProjector(sessionId: string): "opened" | "focused" | "blocked" {
  const { result, window: win } = openClassWindow(
    (url, name, features) => window.open(url, name, features),
    classViewUrl(sessionId),
    opened && opened.sessionId === sessionId ? opened.window : null,
  );
  opened = win ? { sessionId, window: win } : null;
  if (win) rememberOpen(sessionId);
  return result;
}
