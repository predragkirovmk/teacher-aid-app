"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const noop = () => () => {};
const calmNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["--yellow", "--ice", "--yellow-soft", "--ice-2"];
/** The longest a piece lives: its animation plus its delay, with a little room. The container leaves the DOM after it. */
export const CONFETTI_MS = 1700;

/** Where each piece goes: spread evenly round the circle, with a little variety, and no randomness so the layout is the same every time. */
export function confettiPieces(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 360 + (i % 3) * 9;
    const rad = (angle * Math.PI) / 180;
    const reach = 70 + ((i * 37) % 6) * 14;
    return {
      color: COLORS[i % COLORS.length],
      x: Math.round(Math.sin(rad) * reach * 1.15),
      up: Math.round(Math.max(30, -Math.cos(rad) * reach) + 24),
      fall: 70 + ((i * 53) % 5) * 12,
      spin: (i % 2 ? 1 : -1) * (240 + ((i * 29) % 4) * 80),
      delay: 120 + (i % 5) * 30,
      round: i % 4 === 0,
    };
  });
}

/**
 * One shot of confetti from the middle of its parent, which must be `position: relative`. It sits behind the badge it surrounds, takes no
 * touches, and removes itself when it has played. Under reduced motion it renders nothing: the reward is the badge and the numbers.
 */
export function Confetti({ count = 28 }: { count?: number }) {
  // Read here, not imported from the quiz parts: the achievements page would otherwise load the whole quiz chrome for it.
  const calm = useSyncExternalStore(noop, calmNow, () => false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDone(true), CONFETTI_MS);
    return () => clearTimeout(id);
  }, []);
  if (calm || done) return null;
  return (
    <span className="confetti" aria-hidden="true">
      {confettiPieces(count).map((p, i) => (
        <i
          key={i}
          data-round={p.round}
          style={
            {
              "--c": `var(${p.color})`,
              "--x": `${p.x}px`,
              "--up": `${p.up}px`,
              "--fall": `${p.fall}px`,
              "--spin": `${p.spin}deg`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
