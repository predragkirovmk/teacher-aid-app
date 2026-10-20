import { describe, expect, it } from "vitest";
import { mergeClock, sampleClock, toLocal, toServer } from "@/lib/app/session/clock";

describe("the server clock", () => {
  it("is the server's time against the middle of the round trip", () => {
    // Sent at 1000, answered at 1200 by a server that read 5100: the server read 5000 at local 1100 on average.
    const c = sampleClock(5100, 1000, 1200);
    expect(c.rtt).toBe(200);
    expect(c.offset).toBe(5100 - 1100);
    expect(toServer(c, 1100)).toBe(5100);
  });

  it("converts both ways", () => {
    const c = sampleClock(10_000, 0, 0);
    expect(toLocal(c, toServer(c, 777))).toBe(777);
  });

  it("is the phone's own time until something is measured", () => {
    expect(toServer(null, 42)).toBe(42);
    expect(toLocal(null, 42)).toBe(42);
  });

  it("copes with a phone clock minutes off, in either direction", () => {
    const fast = sampleClock(1_000_000, 1_090_000, 1_090_000);
    const slow = sampleClock(1_000_000, 910_000, 910_000);
    expect(toServer(fast, 1_095_000)).toBe(1_005_000);
    expect(toServer(slow, 915_000)).toBe(1_005_000);
  });

  it("never reports a negative round trip", () => {
    expect(sampleClock(1, 500, 400).rtt).toBe(0);
  });

  describe("merging samples", () => {
    const good = sampleClock(1000, 0, 40);
    const worse = { ...sampleClock(1100, 100, 400), takenAt: 400 };

    it("keeps the sample with the shorter round trip", () => {
      expect(mergeClock(good, worse)).toBe(good);
      expect(mergeClock(worse, good)).toBe(good);
    });

    it("takes the first sample", () => {
      expect(mergeClock(null, worse)).toBe(worse);
    });

    it("lets a slow new sample replace an old one, because the phone's clock drifts", () => {
      const late = { ...worse, takenAt: good.takenAt + 130_000 };
      expect(mergeClock(good, late)).toBe(late);
    });
  });
});
