"use client";

import { useMemo, useSyncExternalStore } from "react";

export type DayPart = "morning" | "day" | "evening";

const part = (): DayPart => {
  const h = new Date().getHours();
  return h < 5 ? "evening" : h < 12 ? "morning" : h < 18 ? "day" : "evening";
};

function subscribe(listener: () => void) {
  // The greeting changes at a few fixed hours, so a check once a minute is plenty.
  const timer = setInterval(listener, 60_000);
  return () => clearInterval(timer);
}

/** The part of the day on this computer. The server cannot know it, so it renders null (a plain welcome). */
export const useDayPart = () =>
  useSyncExternalStore(
    subscribe,
    part,
    (): DayPart | null => null,
  );

function subscribeEvery(ms: number) {
  return (listener: () => void) => {
    const timer = setInterval(listener, ms);
    return () => clearInterval(timer);
  };
}

const everyMinute = subscribeEvery(60_000);
const startOfToday = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** The moment today began on this computer (a day changes in the middle of the night, so it is checked once a minute). The server renders null. */
export const useToday = (): number | null => useSyncExternalStore(everyMinute, startOfToday, (): number | null => null);

/**
 * The moment now on the server's clock, for a lesson that began at `startedAt`, brought up to date a whole minute at a time so
 * that a count of minutes changes when a minute has passed. The server said what time it was when it answered (`server_now`);
 * this carries that on by this computer's own clock, so a computer whose clock is a few minutes off still counts right. The
 * server render gets null.
 */
export function useRunningNow(serverNow: string, startedAt: string): number | null {
  const clock = useMemo(() => runningClock(Date.parse(serverNow), Date.parse(startedAt)), [serverNow, startedAt]);
  return useSyncExternalStore(clock.subscribe, clock.snapshot, (): number | null => null);
}

function runningClock(serverNow: number, startedAt: number) {
  const skew = serverNow - Date.now();
  return {
    subscribe: subscribeEvery(15_000),
    snapshot: () => startedAt + Math.floor((Date.now() + skew - startedAt) / 60_000) * 60_000,
  };
}
