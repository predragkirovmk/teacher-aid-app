"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { SPRINGS, throwTo } from "@/lib/app/motion";

type Seen = { node: HTMLElement; top: number; left: number; width: number; rel: { top: number; left: number } };

const EXIT_MS = 160;
const EXIT_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * A grouped list whose rows leave and move instead of vanishing and jumping. After every commit it compares the rows with the
 * last ones it saw (by DOM node, so a keyed row that stays is the same node):
 *  - a row that is gone is put back where it was, out of the flow, and fades up 6 px for 160 ms before it is removed for good;
 *  - a row that stayed but changed place slides from where it was on --spring-snappy (a FLIP: transform only).
 * New rows are left to their own entrance. With Reduce Motion a leaving row only fades and the rest swap places.
 *
 * It keeps no state and never touches React's own nodes: the ghosts are the nodes React has already taken out, added back
 * after the rest, and removed by this component when they have faded.
 */
export function MotionList({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const seen = useRef<Seen[]>([]);

  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rows = Array.from(ul.children).filter((n): n is HTMLElement => n instanceof HTMLElement && !n.dataset.leaving);
    const box = ul.getBoundingClientRect();
    const before = new Map(seen.current.map((s) => [s.node, s]));

    for (const old of seen.current) {
      if (rows.includes(old.node) || old.node.isConnected) continue;
      const ghost = old.node;
      ghost.dataset.leaving = "true";
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      Object.assign(ghost.style, { position: "absolute", top: `${old.rel.top}px`, left: `${old.rel.left}px`, width: `${old.width}px`, pointerEvents: "none" });
      ul.append(ghost);
      ul.dataset.leaving = "true";
      const gone = ghost.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: calm ? "none" : "translateY(-6px)" },
        ],
        { duration: EXIT_MS, easing: EXIT_EASE, fill: "forwards" },
      );
      gone.onfinish = () => {
        ghost.remove();
        if (!ul.querySelector(":scope > [data-leaving]")) delete ul.dataset.leaving;
      };
    }

    const next: Seen[] = [];
    for (const node of rows) {
      const r = node.getBoundingClientRect();
      const was = before.get(node);
      if (was && !calm && Math.abs(was.top - r.top) >= 0.5) {
        const a = throwTo(node, "y", was.top - r.top, 0, 0, SPRINGS.snappy).animation;
        a.onfinish = () => a.cancel();
      }
      next.push({ node, top: r.top, left: r.left, width: r.width, rel: { top: r.top - box.top, left: r.left - box.left } });
    }
    seen.current = next;
  });

  return (
    <ul className="list list--motion" ref={ref}>
      {children}
    </ul>
  );
}
