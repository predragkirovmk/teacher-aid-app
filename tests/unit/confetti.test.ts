import { describe, expect, it } from "vitest";
import { confettiPieces } from "@/components/app/Confetti";

describe("confettiPieces", () => {
  it("lays out the same pieces every time, spread round the circle", () => {
    const a = confettiPieces(28);
    expect(a).toEqual(confettiPieces(28));
    expect(a).toHaveLength(28);
    expect(Math.min(...a.map((p) => p.x))).toBeLessThan(-40);
    expect(Math.max(...a.map((p) => p.x))).toBeGreaterThan(40);
  });

  it("uses only the app's blue and yellow tokens and waits at most a fifth of a second", () => {
    for (const p of confettiPieces(28)) {
      expect(["--yellow", "--yellow-soft", "--ice", "--ice-2"]).toContain(p.color);
      expect(p.delay).toBeLessThanOrEqual(240);
    }
  });
});
