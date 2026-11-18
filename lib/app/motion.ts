// The student app's springs, defined once as SwiftUI's spring(duration:bounce:). The CSS linear()
// curves in app/(app)/app.css are sampled from these values by sampleSpring, and Motion springs
// take the stiffness and damping from springPhysics. tests/unit/motion-tokens.test.ts fails when
// the CSS and these values drift apart.

export type Spring = { duration: number; bounce: number };

export const SPRINGS = {
  press: { duration: 0.15, bounce: 0 }, // touch-down: answers within a frame or two
  pop: { duration: 0.2, bounce: 0.6 }, // release past 1 after a press, small arrivals; 25% overshoot so a 0.06 press travel is seen
  snappy: { duration: 0.3, bounce: 0.15 }, // small state changes
  smooth: { duration: 0.4, bounce: 0 }, // sheets, morphs, screen moves
  bouncy: { duration: 0.5, bounce: 0.3 }, // medium arrivals
  big: { duration: 0.31, bounce: 0.5 }, // the big moment only
} as const satisfies Record<string, Spring>;

// SwiftUI's mapping with mass 1: stiffness (2 pi / duration)^2, damping 4 pi (1 - bounce) / duration.
export function springPhysics({ duration, bounce }: Spring) {
  return {
    stiffness: (2 * Math.PI / duration) ** 2,
    damping: (4 * Math.PI * (1 - bounce)) / duration,
    mass: 1,
  };
}

// Position at time t seconds of the spring released from 0 towards 1 (zeta = 1 - bounce, below 1). `v0` is the
// starting speed in goals per second (a finger leaving at 800 px/s towards a goal 400 px away is 2): zero by default.
export function position({ duration, bounce }: Spring, t: number, v0 = 0) {
  const w = (2 * Math.PI) / duration;
  const z = 1 - bounce;
  if (z >= 1) return 1 - (1 + (w - v0) * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w - v0) / wd) * Math.sin(wd * t));
}

// The settle time is the last moment the spring is more than 0.002 from 1, rounded up to 10 ms
// (this reproduces the original press, snappy, smooth and bouncy durations). Points are equally
// spaced over that time, about one per 1/60 s, and the last one is forced to 1.
export function sampleSpring(spring: Spring) {
  let last = 0;
  for (let t = 0; t < 3; t += 0.0001) if (Math.abs(position(spring, t) - 1) > 0.002) last = t;
  const ms = Math.ceil((last * 1000) / 10) * 10;
  const n = Math.round(ms / (1000 / 60));
  const points = Array.from({ length: n }, (_, i) => Number(position(spring, (ms / 1000) * (i / n)).toFixed(4)));
  return { curve: `linear(${[...points, 1].join(", ")})`, ms };
}

/**
 * The same spring as keyframes for the Web Animations API, for a move that starts with the finger's speed (a released swipe or
 * sheet). `points` run 0 to 1 about every 1/60 s; `ms` is the settle time; `reach` is when it first gets to 1, the moment a
 * thing thrown off the screen is gone; `near` is when it is 90% of the way, with the last tenth of the travel left to the spring's tail. The speed is capped so a wild flick cannot throw the spring into a long ring.
 */
export function sampleThrow(spring: Spring, v0: number) {
  const v = Math.max(-12, Math.min(12, v0));
  let last = 0;
  let reach = 0;
  let near = 0;
  for (let t = 0; t < 3; t += 0.0005) {
    const p = position(spring, t, v);
    if (Math.abs(p - 1) > 0.002) last = t;
    if (!near && p >= 0.9) near = t;
    if (!reach && p >= 1) reach = t;
  }
  const ms = Math.max(50, Math.ceil((last * 1000) / 10) * 10);
  const n = Math.max(2, Math.round(ms / (1000 / 60)));
  const points = Array.from({ length: n }, (_, i) => position(spring, (ms / 1000) * (i / n), v));
  return { points: [...points, 1], ms, reach: Math.min(ms, Math.round((reach || last) * 1000)), near: Math.min(ms, Math.round((near || last) * 1000)) };
}

/**
 * Move `el` along one axis from `from` to `to` px on `spring`, starting at `v` px per ms (the finger's speed, signed like the
 * move). It runs on the compositor as keyframes, so it keeps its pace while the page works. The caller owns the end state: set
 * the inline transform to `to` before the animation ends, and cancel the animation to take the element over.
 */
export function throwTo(el: HTMLElement, axis: "x" | "y", from: number, to: number, v: number, spring: Spring) {
  const dist = to - from;
  const sampled = sampleThrow(spring, Math.abs(dist) < 1 ? 0 : (v * 1000) / dist);
  const animation = el.animate(
    sampled.points.map((p) => ({ transform: `translate${axis.toUpperCase()}(${from + dist * p}px)` })),
    { duration: sampled.ms, easing: "linear" },
  );
  return { animation, reach: sampled.reach, near: sampled.near };
}
