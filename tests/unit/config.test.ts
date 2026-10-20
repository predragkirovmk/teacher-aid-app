import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

const load = () => import("@/lib/app/api/config");

describe("api config", () => {
  it("runs on the mock, with the demo-only features on, unless built as live", async () => {
    const c = await load();
    expect(c.apiMode).toBe("mock");
    expect(c.demoOnly).toBe(true);
  });

  it("hides the demo-only features in live mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    const c = await load();
    expect(c.apiMode).toBe("live");
    expect(c.demoOnly).toBe(false);
  });

  it("takes anything but 'live' as mock", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "LIVE");
    expect((await load()).apiMode).toBe("mock");
  });

  it("puts the API under /api/v1 of its origin, same-origin when there is none", async () => {
    expect((await load()).apiBase).toBe("/api/v1");
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test//");
    expect((await load()).apiBase).toBe("https://api.example.test/api/v1");
  });
});
