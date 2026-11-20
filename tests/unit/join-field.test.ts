import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_MODE = "live";
});

vi.mock("@/lib/app/report", () => ({ reportError: vi.fn() }));
const joinSession = vi.fn();
vi.mock("@/lib/app/api/index", () => ({ client: { joinSession }, serverClient: null }));

const { startJoin } = await import("@/lib/app/api/hooks");

const joined = { session: { id: "s1", lessonTitle: "T", questionCount: 1 }, attendance: null };

describe("which field a join code goes in", () => {
  beforeEach(() => {
    joinSession.mockReset();
    joinSession.mockResolvedValue(joined);
  });

  it("sends a bare six-digit code as short_code, scanned or typed", async () => {
    await startJoin("482913");
    await startJoin("482913", true);
    expect(joinSession.mock.calls).toEqual([[{ shortCode: "482913" }], [{ shortCode: "482913" }]]);
  });

  it("still sends a scanned token as token", async () => {
    await startJoin("a1b2c3d4-token");
    expect(joinSession).toHaveBeenCalledWith({ token: "a1b2c3d4-token" });
  });
});
