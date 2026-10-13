"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

/** The tab roots, in tab-bar order. Swiping moves along this list. */
export const TAB_ORDER = ["/app", "/app/notifications", "/app/profile"];

const EXIT_MS = 190;
const IN_MS = 300;
const IN = `transform ${IN_MS}ms cubic-bezier(0.23, 1, 0.32, 1)`;
/** The snappy spring from app.css, so a cancelled swipe settles like every other small state change. */
const SPRING_MS = 390;
const SPRING = `transform ${SPRING_MS}ms var(--spring-snappy)`;
/** If the next section has not rendered this long after the exit, bring the old one back. */
const WATCHDOG_MS = 900;

type Gesture = { id: number; x0: number; y0: number; x: number; t: number; v: number; lock: "h" | "v" | null };

/**
 * Swipe sideways to move between the tab roots, like the sections of a pager. The screen follows
 * the finger, resists at either end, and on release either slides off (far or fast enough) and
 * the next section slides in from the other side, or springs back. Vertical scrolling is
 * untouched, and a swipe that starts at the very left edge is left to the system back gesture.
 *
 * The section being swiped away is gone once the route changes, so every path that can leave the
 * screen off to one side has a way back: a watchdog if navigation stalls, a guard against a second
 * swipe while one is in flight, and cleanup on unmount.
 */
export function Pager({ pathname, children }: { pathname: string; children: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef<Gesture | null>(null);
  const incoming = useRef<1 | -1 | 0>(0);
  /** True from release until the next section has settled; new swipes are ignored meanwhile. */
  const busy = useRef(false);
  const timers = useRef<{ push?: ReturnType<typeof setTimeout>; dog?: ReturnType<typeof setTimeout>; settle?: ReturnType<typeof setTimeout> }>({});
  const pathRef = useRef(pathname);
  const index = TAB_ORDER.indexOf(pathname);

  /** Put the screen back in place with no leftover inline styles, after `ms`. */
  const rest = (ms: number) => {
    clearTimeout(timers.current.settle);
    timers.current.settle = setTimeout(() => {
      const el = ref.current;
      if (el) {
        el.style.transition = "";
        el.style.transform = "";
      }
      busy.current = false;
    }, ms + 40);
  };

  // The route changed. If a swipe caused it, slide the new section in from the side it came from.
  useLayoutEffect(() => {
    pathRef.current = pathname;
    clearTimeout(timers.current.dog);
    const el = ref.current;
    const dir = incoming.current;
    if (!el || !dir) return;
    incoming.current = 0;
    el.style.transition = "none";
    el.style.transform = `translateX(${dir * 100}%)`;
    void el.offsetWidth;
    el.style.transition = IN;
    el.style.transform = "translateX(0)";
    rest(IN_MS);
  }, [pathname]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.push);
      clearTimeout(t.dog);
      clearTimeout(t.settle);
    };
  }, []);

  const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const springBack = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = calm() ? "" : SPRING;
    el.style.transform = "translateX(0)";
    rest(calm() ? 0 : SPRING_MS);
  };

  return (
    <div
      ref={ref}
      className="pager"
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        if (busy.current || index < 0 || e.clientX < 24 || target.closest("input, textarea, [role=slider]")) return;
        g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t: e.timeStamp, v: 0, lock: null };
      }}
      onPointerMove={(e) => {
        const s = g.current;
        const el = ref.current;
        if (!s || !el || s.id !== e.pointerId || s.lock === "v") return;
        const dx = e.clientX - s.x0;
        const dy = e.clientY - s.y0;
        if (!s.lock) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (s.lock = "v");
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            s.lock = "h";
            try {
              el.setPointerCapture(e.pointerId);
            } catch {
              // a synthetic or already-ended pointer: the gesture still works through bubbling
            }
            // Warm the neighbours so the route is ready by release.
            for (const d of [-1, 1]) if (TAB_ORDER[index + d]) router.prefetch(TAB_ORDER[index + d]);
          } else return;
        }
        const dt = Math.max(1, e.timeStamp - s.t);
        s.v = 0.8 * s.v + 0.2 * ((e.clientX - s.x) / dt);
        s.x = e.clientX;
        s.t = e.timeStamp;
        // At the first and last section the screen resists instead of moving freely.
        const edge = (index === 0 && dx > 0) || (index === TAB_ORDER.length - 1 && dx < 0);
        clearTimeout(timers.current.settle);
        el.style.transition = "none";
        el.style.transform = `translateX(${edge ? dx * 0.25 : dx}px)`;
      }}
      onPointerUp={(e) => {
        const s = g.current;
        const el = ref.current;
        g.current = null;
        if (!s || !el || s.lock !== "h") return;
        const dx = e.clientX - s.x0;
        const next = dx < 0 ? index + 1 : index - 1;
        const far = Math.abs(dx) > el.clientWidth * 0.28 || Math.abs(s.v) > 0.5;
        if (!(far && next >= 0 && next < TAB_ORDER.length)) return springBack();

        const dir = dx < 0 ? 1 : -1;
        const from = pathRef.current;
        busy.current = true;
        incoming.current = dir;
        const go = () => {
          // Sections are tabs, not pages: switching replaces the history entry instead of adding one.
          router.replace(TAB_ORDER[next]);
          // If the route never changes (slow network, cancelled navigation), do not leave a blank screen.
          timers.current.dog = setTimeout(() => {
            if (pathRef.current !== from) return;
            incoming.current = 0;
            springBack();
          }, WATCHDOG_MS);
        };
        if (calm()) {
          el.style.transition = "";
          el.style.transform = "";
          go();
          rest(0);
          return;
        }
        // A flick keeps its speed: the section leaves at the release velocity instead of starting
        // again from rest. A slow drag past the threshold still accelerates away.
        const left = el.clientWidth - Math.abs(dx);
        const speed = Math.max(0, -dir * s.v);
        const flung = speed > 0 && left / speed < EXIT_MS;
        const ms = flung ? Math.max(100, Math.round(left / speed)) : EXIT_MS;
        el.style.transition = `transform ${ms}ms ${flung ? "linear" : "cubic-bezier(0.4, 0, 1, 1)"}`;
        el.style.transform = `translateX(${-dir * 100}%)`;
        timers.current.push = setTimeout(go, ms - 15);
      }}
      onPointerCancel={() => {
        g.current = null;
        if (!busy.current) springBack();
      }}
    >
      {children}
    </div>
  );
}
