import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

async function csp(): Promise<string> {
  const config = (await import("../../next.config")).default;
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === "/(.*)")!;
  return all.headers.find((h) => h.key === "Content-Security-Policy")!.value;
}

describe("the Content-Security-Policy", () => {
  it("upgrades insecure requests in a production build", async () => {
    expect(await csp()).toContain("upgrade-insecure-requests");
  });

  it("drops only that directive for the end-to-end build over http://localhost", async () => {
    const prod = await csp();
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_E2E", "1");
    const e2e = await csp();
    expect(e2e).not.toContain("upgrade-insecure-requests");
    expect(e2e.split("; ").filter((d) => d !== "upgrade-insecure-requests")).toEqual(
      prod.split("; ").filter((d) => d !== "upgrade-insecure-requests"),
    );
  });

  it("ignores the flag on a Vercel production deploy", async () => {
    vi.stubEnv("NEXT_PUBLIC_E2E", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await csp()).toContain("upgrade-insecure-requests");
  });

  it("only means 1", async () => {
    vi.stubEnv("NEXT_PUBLIC_E2E", "true");
    expect(await csp()).toContain("upgrade-insecure-requests");
  });

  it("allows the API's origin to be fetched from in a live build, and nothing else new", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/anything");
    const policy = await csp();
    expect(policy).toContain("connect-src 'self' https://api.example.test");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
