"use client";

import { useSyncExternalStore } from "react";

/**
 * A teacher who finished or skipped the guide, could not be marked as done with it (the save was refused, however many
 * times they tried), and chose to go on anyway. Every page sends a teacher whose first run is not done to the guide, so
 * without this a save that keeps failing would shut them out of the whole app. It lasts until the page is loaded afresh,
 * which is when the server's answer is asked again and the guide is shown once more; nothing is kept.
 */
let left = false;
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function leaveGuideUnsaved() {
  left = true;
  listeners.forEach((l) => l());
}

/** For the tests: forget it, as a page load does. */
export function resetFirstRun() {
  left = false;
  listeners.forEach((l) => l());
}

export const useGuideLeft = () => useSyncExternalStore(subscribe, () => left, () => false);
