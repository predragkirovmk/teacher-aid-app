"use client";

import { useEffect, useState } from "react";
import { serverOffset } from "./live";

/**
 * The server's time as this computer carries it on: the moment a snapshot was made (`serverNow`) and how long ago this computer received it, so
 * a computer whose own clock is wrong still counts a countdown right (BR-TIME-03). It ticks four times a second while `active`, so a number that
 * changes by the second never shows a second late. Until the first tick it is the time of the snapshot itself.
 */
export function useServerNow(serverNow: string | undefined, active: boolean): number {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!serverNow || !active) return;
    const offset = serverOffset(serverNow, Date.now());
    const update = () => setNow(Date.now() + offset);
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [serverNow, active]);
  return now ?? (serverNow ? Date.parse(serverNow) : 0);
}
