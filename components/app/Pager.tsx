"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { SPRINGS, throwTo } from "@/lib/app/motion";

/** The tab roots, in tab-bar order. Swiping moves along this list. */
export const TAB_ORDER = ["/app", "/app/subjects", "/app/notifications", "/app/profile"];

/**
 * Every move of the pager is the app's own spring, started with the finger's speed (sampleThrow in lib/app/motion.ts), so a
 * flick travels and a slow release settles, and each can be taken over by a new touch from wherever it is. A swipe takes the
 * small `snappy` spring like every other small state change.
 */
const SPRING = SPRINGS.snappy;
/** Swipes that start this close to a screen edge belong to the system's back and forward gestures. */
const EDGE = 24;
/** If the next section has not rendered this long after the exit, bring the old one back. */
const WATCHDOG_MS = 900;

/** `base` is where the screen was when the finger came down (not 0 when it caught a settle), `pos` where the finger has put it. */
type Gesture = { id: number; x0: number; y0: number; x: number; t: number; v: number; lock: "h" | "v" | null; base: number; pos: number };

/**
 * Swipe sideways to move between the tab roots, like the sections of a pager. The screen follows
 * the finger, resists at either end, and on release either slides off (far or fast enough) and
 * the next section slides in from the other side, or springs back. Vertical scrolling is
 * untouched, and a swipe that starts at either edge is left to the system: Android takes back from
 * both sides, Safari takes back from the left and forward from the right.
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
  const timers = useRef<{ push?: ReturnType<typeof setTimeout>; dog?: ReturnType<typeof setTimeout> }>({});
  const pathRef = useRef(pathname);
  /** The move in progress, if any. */
  const anim = useRef<Animation | null>(null);
  /** The speed the section left at, px per ms, carried into the one that comes in. */
  const flick = useRef(0);
  const index = TAB_ORDER.indexOf(pathname);

  /**
   * Move the screen from `from` to `to` px on the spring, starting at `v` px per ms. The end state is set at once, under the
   * animation, so nothing flashes when it ends; a screen that comes to rest at 0 then drops its inline style.
   */
  const move = (from: number, to: number, v: number) => {
    const el = ref.current;
    if (!el) return { reach: 0 };
    anim.current?.cancel();
    const { animation: a, reach } = throwTo(el, "x", from, to, v, SPRING);
    el.style.transform = `translateX(${to}px)`;
    anim.current = a;
    a.onfinish = () => {
      if (anim.current !== a) return;
      anim.current = null;
      if (to === 0) el.style.transform = "";
    };
    return { reach };
  };

  /** Where the screen is now, in px. A move in progress is stopped and left exactly there. */
  const catchScreen = () => {
    const el = ref.current;
    if (!el || !anim.current) return 0;
    const x = new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
    anim.current.cancel();
    anim.current = null;
    el.style.transform = `translateX(${x}px)`;
    return x;
  };

  // The route changed. If a swipe caused it, the new section comes in from the side it came from, carrying the flick's speed.
  useLayoutEffect(() => {
    pathRef.current = pathname;
    clearTimeout(timers.current.dog);
    const el = ref.current;
    const dir = incoming.current;
    if (!el || !dir) return;
    incoming.current = 0;
    // Free from here: a touch now takes the section from wherever it is.
    busy.current = false;
    move(dir * el.clientWidth, 0, flick.current);
  }, [pathname]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.push);
      clearTimeout(t.dog);
      anim.current?.cancel();
    };
  }, []);

  const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Put the screen back in place: on the spring with the speed it has, or at once with Reduce Motion. */
  const springBack = (v = 0) => {
    const el = ref.current;
    if (!el) return;
    busy.current = false;
    const x = calm() ? 0 : new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
    if (calm() || Math.abs(x) < 0.5) {
      anim.current?.cancel();
      anim.current = null;
      el.style.transform = "";
      return;
    }
    move(x, 0, v);
  };

  return (
    <div
      ref={ref}
      className="pager"
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        const atEdge = e.clientX < EDGE || e.clientX > window.innerWidth - EDGE;
        if (busy.current || index < 0 || atEdge || target.closest("input, textarea, [role=slider]")) return;
        // A screen still settling from the last release is caught where it is, and the finger carries on from there.
        const base = catchScreen();
        g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t: e.timeStamp, v: 0, lock: null, base, pos: base };
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
        s.pos = s.base + (edge ? dx * 0.25 : dx);
        el.style.transform = `translateX(${s.pos}px)`;
      }}
      onPointerUp={(e) => {
        const s = g.current;
        const el = ref.current;
        g.current = null;
        if (!s || !el) return;
        // A finger that stopped before it lifted leaves with no speed.
        const v = e.timeStamp - s.t > 100 ? 0 : s.v;
        // A touch that caught a settling screen but never became a swipe lets it go again.
        if (s.lock !== "h") return s.base ? springBack() : undefined;
        // A flick decides the way it goes; a slow drag decides by where the screen has got to.
        const dir = Math.abs(v) > 0.5 ? (v < 0 ? 1 : -1) : s.pos < 0 ? 1 : -1;
        const next = index + dir;
        const far = Math.abs(s.pos) > el.clientWidth * 0.28 || Math.abs(v) > 0.5;
        if (!(far && next >= 0 && next < TAB_ORDER.length)) return springBack(v);

        const from = pathRef.current;
        busy.current = true;
        // With Reduce Motion nothing slid out, so nothing slides in either: the section is just there, under the fade.
        incoming.current = calm() ? 0 : dir;
        flick.current = v;
        const go = () => {
          // Sections are tabs, not pages: switching replaces the history entry instead of adding one.
          // The swipe has already moved the screen, so it asks for no view transition of its own ("swipe" has no class in
          // Shell): a crossfade after the slide would be a second animation. With reduced motion nothing slid, so the
          // fade is the whole change.
          router.replace(TAB_ORDER[next], { transitionTypes: [calm() ? "tab" : "swipe"] });
          // If the route never changes (slow network, cancelled navigation), do not leave a blank screen.
          timers.current.dog = setTimeout(() => {
            if (pathRef.current !== from) return;
            incoming.current = 0;
            springBack();
          }, WATCHDOG_MS);
        };
        if (calm()) {
          anim.current?.cancel();
          anim.current = null;
          el.style.transform = "";
          busy.current = false;
          return go();
        }
        // The section leaves on the spring at the speed of the release, and the route changes as it gets off the screen.
        const gone = move(s.pos, -dir * el.clientWidth, v);
        timers.current.push = setTimeout(go, Math.max(0, gone.reach - 15));
      }}
      onPointerCancel={() => {
        const s = g.current;
        g.current = null;
        if (!busy.current && s) springBack();
      }}
    >
      {children}
    </div>
  );
}
