import { afterEach, describe, expect, it, vi } from "vitest";
import { HAPTICS, buzz } from "@/lib/app/haptics";

// The unit environment is node, so the two browser globals the helper reads are stubbed.
function browser(nav: Record<string, unknown>, visibility = "visible") {
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("document", { visibilityState: visibility });
}

afterEach(() => vi.unstubAllGlobals());

describe("buzz", () => {
  it("passes the pattern to navigator.vibrate", () => {
    const vibrate = vi.fn();
    browser({ vibrate, userActivation: { hasBeenActive: true } });
    buzz(HAPTICS.right);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(HAPTICS.right);
  });

  it("works where userActivation does not exist", () => {
    const vibrate = vi.fn();
    browser({ vibrate });
    buzz(HAPTICS.send);
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it("does nothing, and does not throw, without navigator.vibrate", () => {
    browser({});
    expect(() => buzz(HAPTICS.right)).not.toThrow();
  });

  it("does nothing on a hidden page", () => {
    const vibrate = vi.fn();
    browser({ vibrate }, "hidden");
    buzz(HAPTICS.right);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does nothing before the first gesture", () => {
    const vibrate = vi.fn();
    browser({ vibrate, userActivation: { hasBeenActive: false } });
    buzz(HAPTICS.right);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("swallows a vibrate that throws", () => {
    browser({
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    expect(() => buzz(HAPTICS.right)).not.toThrow();
  });

  it("keeps the done pattern short and the wrong one light", () => {
    expect(HAPTICS.done.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(150);
    expect(HAPTICS.wrong).toBeLessThanOrEqual(20);
  });
});
