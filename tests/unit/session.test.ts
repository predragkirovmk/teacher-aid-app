// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, SettledPromise } from "@/lib/app/api/client";
import { ApiError } from "@/lib/app/api/errors";
import { endSession, getSessionEnd, noteFailure, onSessionEnd, startSession, subscribeSessionEnd, watchSession } from "@/lib/app/api/session";

beforeEach(() => startSession());
afterEach(() => startSession());

describe("why a session ended", () => {
  it("starts with no reason", () => {
    expect(getSessionEnd()).toBeNull();
  });

  it("tells whoever listens, once per change", () => {
    const heard = vi.fn();
    const stop = subscribeSessionEnd(heard);
    endSession("unauthenticated");
    endSession("unauthenticated");
    expect(heard).toHaveBeenCalledTimes(1);
    startSession();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(getSessionEnd()).toBeNull();
    stop();
    endSession("signed_out");
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("lets the stronger reason win: another device, then the student's own sign-out, then a plain refusal", () => {
    endSession("unauthenticated");
    endSession("signed_out");
    expect(getSessionEnd()).toBe("signed_out");
    endSession("unauthenticated");
    expect(getSessionEnd()).toBe("signed_out");
    endSession("signed_in_elsewhere");
    expect(getSessionEnd()).toBe("signed_in_elsewhere");
    endSession("signed_out");
    expect(getSessionEnd()).toBe("signed_in_elsewhere");
  });

  it("calls what forgets the student's data each time the reason changes, and not after it is removed", () => {
    const forget = vi.fn();
    const stop = onSessionEnd(forget);
    endSession("unauthenticated");
    endSession("signed_out");
    expect(forget.mock.calls).toEqual([["unauthenticated"], ["signed_out"]]);
    stop();
    endSession("signed_in_elsewhere");
    expect(forget).toHaveBeenCalledTimes(2);
  });
});

describe("a failed call", () => {
  it("ends the session when its code says so", () => {
    noteFailure(new ApiError("signed_in_elsewhere", { status: 401 }));
    expect(getSessionEnd()).toBe("signed_in_elsewhere");
  });

  it("ends it on unauthenticated", () => {
    noteFailure(new ApiError("unauthenticated", { status: 401 }));
    expect(getSessionEnd()).toBe("unauthenticated");
  });

  it.each(["token_expired", "not_enrolled", "rate_limited", "network", "server_error", "unknown_email", "invalid_code"] as const)(
    "does not end it on %s",
    (code) => {
      noteFailure(new ApiError(code));
      expect(getSessionEnd()).toBeNull();
    },
  );

  it("ignores what is not an ApiError", () => {
    noteFailure(new Error("boom"));
    noteFailure("signed_in_elsewhere");
    expect(getSessionEnd()).toBeNull();
  });

  it("is ignored when it was asked before the student signed in again", () => {
    noteFailure(new ApiError("unauthenticated"), -1);
    expect(getSessionEnd()).toBeNull();
  });
});

describe("watching every call", () => {
  const settled = <T,>(v: T): SettledPromise<T> => Object.assign(Promise.resolve(v), { settled: { ok: true as const, value: v } });
  const failed = <T,>(e: unknown): SettledPromise<T> => {
    const p = Object.assign(Promise.reject(e), { settled: { ok: false as const, error: e } });
    p.catch(() => {});
    return p as SettledPromise<T>;
  };
  const adapter = {
    getMe: vi.fn(),
    listCourses: vi.fn(),
    startSignIn: vi.fn(),
    completeSignIn: vi.fn(),
    signOut: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
  const client = watchSession(adapter as unknown as ApiClient);
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("ends the session when any call is told so", async () => {
    adapter.listCourses.mockReturnValue(failed(new ApiError("signed_in_elsewhere")));
    await expect(client.listCourses()).rejects.toMatchObject({ code: "signed_in_elsewhere" });
    await flush();
    expect(getSessionEnd()).toBe("signed_in_elsewhere");
  });

  it("hands back the adapter's own promise, with its settled mark", () => {
    const p = settled("me");
    adapter.getMe.mockReturnValue(p);
    expect(client.getMe()).toBe(p);
  });

  it("passes the arguments through", () => {
    adapter.listCourses.mockReturnValue(settled([]));
    void client.listCourses();
    expect(adapter.listCourses).toHaveBeenCalledWith();
  });

  it("leaves sign-in and sign-out alone: a refusal there is about the attempt", async () => {
    adapter.startSignIn.mockReturnValue(failed(new ApiError("unauthenticated")));
    adapter.signOut.mockReturnValue(failed(new ApiError("unauthenticated")));
    await expect(client.startSignIn({ schoolEmail: "a@b.mk" })).rejects.toBeDefined();
    await expect(client.signOut()).rejects.toBeDefined();
    await flush();
    expect(getSessionEnd()).toBeNull();
  });

  it("does not let a call that was in flight before a new sign-in end the new session", async () => {
    let fail!: (e: unknown) => void;
    adapter.getMe.mockReturnValue(
      Object.assign(new Promise((_, reject) => (fail = reject)), { settled: undefined }),
    );
    const pending = client.getMe().catch(() => {});
    startSession();
    fail(new ApiError("unauthenticated"));
    await pending;
    await flush();
    expect(getSessionEnd()).toBeNull();
  });
});
