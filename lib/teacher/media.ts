"use client";

import { useSyncExternalStore } from "react";

/** The width below which the sidebar becomes a top bar and a drawer. Keep in step with teacher.css. */
const NARROW = "(max-width: 63.9375rem)";

function subscribe(listener: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** True in the narrow layout. The server renders the wide one, and CSS covers the first paint. */
export const useNarrow = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
