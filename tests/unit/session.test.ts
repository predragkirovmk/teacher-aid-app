import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TeacherApi } from "@/lib/teacher/api/client";
import { ApiError } from "@/lib/teacher/api/errors";
import { endSession, getSessionEnd, noteFailure, noteSignedIn, resetSession, subscribeSessionEnd, watchSession } from "@/lib/teacher/api/session";

beforeEach(() => resetSession());

/** A stand-in adapter whose calls answer as told. */
const adapter = (answers: Partial<Record<keyof TeacherApi, () => Promise<unknown>>>) =>
  new Proxy({} as Record<string, unknown>, {
    ownKeys: () => Object.keys(answers),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (_, key: string) => answers[key as keyof TeacherApi] ?? (() => Promise.resolve(undefined)),
  }) as unknown as TeacherApi;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const refused = () => Promise.reject(new ApiError("unauthenticated", { status: 401 }));

describe("a session that ends", () => {
  test("a refusal on a first visit is not the end of a session: nobody was signed in to be signed out", () => {
    noteFailure(new ApiError("unauthenticated"));
    expect(getSessionEnd()).toBeNull();
  });

  test("once a teacher has been seen signed in, a refusal on any call is the end of their session", () => {
    noteSignedIn();
    noteFailure(new ApiError("unauthenticated"));
    expect(getSessionEnd()).toBe("expired");
  });

  test("no other failure ends it: offline, a server error, a refused upload", () => {
    noteSignedIn();
    for (const code of ["network", "server_error", "validation_failed", "not_found", "rate_limited", "generation_failed"] as const) noteFailure(new ApiError(code));
    noteFailure(new Error("boom"));
    noteFailure(null);
    expect(getSessionEnd()).toBeNull();
  });

  test("the teacher's own sign-out wins over a guess that the session ran out, whichever comes first", () => {
    noteSignedIn();
    endSession("signed_out");
    noteFailure(new ApiError("unauthenticated"));
    expect(getSessionEnd()).toBe("signed_out");
    resetSession();
    noteSignedIn();
    noteFailure(new ApiError("unauthenticated"));
    expect(getSessionEnd()).toBe("expired");
    endSession("signed_out");
    expect(getSessionEnd()).toBe("signed_out");
  });

  test("whoever listens is told, once per change", () => {
    const heard: (string | null)[] = [];
    const stop = subscribeSessionEnd(() => heard.push(getSessionEnd()));
    noteSignedIn();
    noteFailure(new ApiError("unauthenticated"));
    noteFailure(new ApiError("unauthenticated")); // already over: not news
    expect(heard).toEqual(["expired"]);
    stop();
    endSession("signed_out");
    expect(heard).toEqual(["expired"]);
  });
});

describe("watching every call", () => {
  test("a call that is refused ends the session once a teacher has been seen, and the caller still gets the refusal", async () => {
    const api = watchSession(adapter({ getMe: () => Promise.resolve({ id: "t" }), listLessons: refused }));
    await api.getMe();
    await flush();
    await expect(api.listLessons()).rejects.toMatchObject({ code: "unauthenticated" });
    await flush();
    expect(getSessionEnd()).toBe("expired");
  });

  test("GET /me refused on a first visit is only an answer: there is no session to end", async () => {
    const api = watchSession(adapter({ getMe: refused }));
    await expect(api.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
    await flush();
    expect(getSessionEnd()).toBeNull();
  });

  test("a call that works says the teacher was signed in only when it is GET /me", async () => {
    const api = watchSession(adapter({ listCourses: () => Promise.resolve([]), listLessons: refused }));
    await api.listCourses();
    await flush();
    await expect(api.listLessons()).rejects.toBeDefined();
    await flush();
    expect(getSessionEnd()).toBeNull();
  });

  test("signing in and out, and listening, are not watched: a refusal there is about the attempt", async () => {
    const api = watchSession(adapter({ getMe: () => Promise.resolve({}), startSignIn: refused, signOut: refused }));
    await api.getMe();
    await flush();
    await expect(api.startSignIn({ provider: "google" })).rejects.toBeDefined();
    await expect(api.signOut()).rejects.toBeDefined();
    await flush();
    expect(getSessionEnd()).toBeNull();
  });

  test("the promise a call returns is the adapter's own, so a settled answer stays settled", () => {
    const settled = Object.assign(Promise.resolve("x"), { settled: { ok: true as const, value: "x" } });
    const api = watchSession(adapter({ listCourses: () => settled }));
    expect(api.listCourses()).toBe(settled);
  });

  test("arguments go through unchanged", async () => {
    const getLesson = vi.fn(() => Promise.resolve({}));
    const api = watchSession(adapter({ getLesson }));
    await api.getLesson("l-1");
    expect(getLesson).toHaveBeenCalledWith("l-1");
  });
});
