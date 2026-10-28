"use client";

import { useSyncExternalStore } from "react";

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
