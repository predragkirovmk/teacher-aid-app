"use client";

import { useSyncExternalStore } from "react";

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
