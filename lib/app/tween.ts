"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * A number that counts to its target. By default it counts from the value this screen last
 * showed (kept in localStorage under `key`), so a figure that changed while you were elsewhere,
 * like attendance after a check-in, visibly moves when you come back. `fromZero` counts up from
 * 0 every time instead, for a screen whose job is to show the figure.
 */
export function useTween(target: number, key: string, fromZero = false) {
  const [shown, setShown] = useState(target);
  const [counting, setCounting] = useState(false);
  // False during server render and hydration: the store has not loaded yet, so `target` is a default.
  const ready = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!ready) return;
    let from = target;
    if (fromZero) from = 0;
    else {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw !== null) from = Number(raw);
      } catch {
        // ignore
      }
    }
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = from === target || calm ? 0 : 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = dur ? Math.min(1, (now - start) / dur) : 1;
      const e = 1 - Math.pow(1 - t, 4);
      setShown(Math.round(from + (target - from) * e));
      setCounting(t < 1);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        try {
          window.localStorage.setItem(key, String(target));
        } catch {
          // ignore
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, key, fromZero, ready]);

  return { value: shown, counting };
}
