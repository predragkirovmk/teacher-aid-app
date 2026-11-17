import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SPRINGS, sampleSpring, springPhysics } from "@/lib/app/motion";

const css = readFileSync("app/(app)/app.css", "utf8");

const curves = new Map(
  [...css.matchAll(/--spring-([a-z]+): linear\(([^)]*)\);/g)].map((m) => [m[1], m[2].split(",").map(Number)]),
);
const durs = new Map([...css.matchAll(/--spring-([a-z]+)-dur: (\d+)ms;/g)].map((m) => [m[1], Number(m[2])]));
const names = Object.keys(SPRINGS) as (keyof typeof SPRINGS)[];

// The highest value the curve reaches above 1, as a fraction of the 0 to 1 travel.
const overshoot = (name: keyof typeof SPRINGS) =>
  Math.max(...sampleSpring(SPRINGS[name]).curve.slice(7, -1).split(",").map(Number)) - 1;

describe("the spring tokens in app.css", () => {
  it("has a curve and a settle time for every spring in lib/app/motion.ts and nothing else", () => {
    expect([...curves.keys()].sort()).toEqual([...names].sort());
    expect([...durs.keys()].sort()).toEqual([...names].sort());
  });

  it.each(names)("keeps the %s curve and settle time the sampler makes", (name) => {
    const want = sampleSpring(SPRINGS[name]);
    const wantPoints = want.curve.slice(7, -1).split(",").map(Number);
    const got = curves.get(name)!;
    expect(got).toHaveLength(wantPoints.length);
    got.forEach((p, i) => expect(Math.abs(p - wantPoints[i])).toBeLessThanOrEqual(0.002));
    expect(got[0]).toBe(0);
    expect(got.at(-1)).toBe(1);
    expect(durs.get(name)).toBe(want.ms);
  });

  // A press travels only 0.04 to 0.06, so the release needs about 25% overshoot to reach past 1 by a visible 1.5%.
  it("makes pop overshoot 20 to 30 percent and settle within about 500 ms", () => {
    expect(overshoot("pop")).toBeGreaterThanOrEqual(0.2);
    expect(overshoot("pop")).toBeLessThanOrEqual(0.3);
    expect(sampleSpring(SPRINGS.pop).ms).toBeLessThanOrEqual(500);
  });

  it("makes big overshoot 15 to 20 percent and settle within about 620 ms", () => {
    expect(overshoot("big")).toBeGreaterThanOrEqual(0.15);
    expect(overshoot("big")).toBeLessThanOrEqual(0.2);
    expect(sampleSpring(SPRINGS.big).ms).toBeLessThanOrEqual(620);
  });

  it("makes press answer at once and never overshoot", () => {
    expect(SPRINGS.press).toEqual({ duration: 0.15, bounce: 0 });
    expect(Math.max(...curves.get("press")!)).toBe(1);
  });
});

describe("the Motion physics of a spring", () => {
  it.each(names)("gives %s stiffness (2 pi / duration)^2, damping 4 pi (1 - bounce) / duration and mass 1", (name) => {
    const { duration, bounce } = SPRINGS[name];
    const p = springPhysics(SPRINGS[name]);
    expect(p.stiffness).toBeCloseTo((2 * Math.PI / duration) ** 2, 6);
    expect(p.damping).toBeCloseTo((4 * Math.PI * (1 - bounce)) / duration, 6);
    expect(p.mass).toBe(1);
  });
});
