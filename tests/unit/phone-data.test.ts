// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions, getState } from "@/lib/app/api/mock/store";
import { resetMockSessions } from "@/lib/app/api/mock/session";
import { LOCALE_KEY, getLocale, setLocale } from "@/lib/app/locale";
import { clearPhone, unsentCount } from "@/lib/app/phone-data";
import { PRACTICE_CACHE_KEY } from "@/lib/app/practice-cache";
import { net } from "@/lib/app/session/net";
import { OUTBOX_STUDENT_KEY } from "@/lib/app/session/outbox-store";
import { FOCUS_NOTICE_KEY } from "@/lib/app/session/focus-notice";
import { FOCUS_QUEUE_KEY } from "@/lib/app/session/focus-queue";
import { focusQueue, outbox } from "@/lib/app/session/send";

// The app's own wiring (index.ts picks the adapter with a build-time require that vitest cannot resolve): the demo's mock client.
vi.mock("@/lib/app/api/index", async () => {
  const { mockClient } = await import("@/lib/app/api/mock");
  const { watchSession } = await import("@/lib/app/api/session");
  return { client: watchSession(mockClient), serverClient: null, demoOnly: true };
});

beforeEach(() => {
  resetMockSessions();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setLocale("en");
  actions.reset();
  actions.signIn();
  // No signal: an answer given now is saved on the phone and kept.
  net.setForcedOffline(true);
});
afterEach(async () => {
  net.setForcedOffline(false);
  await outbox.clear();
  focusQueue.clear();
  vi.unstubAllGlobals();
});

const save = (key: string, over: Partial<Parameters<typeof outbox.enqueue>[0]> = {}) =>
  outbox.enqueue({ kind: "answer", key, studentId: "student-marko", sessionId: "s1", sessionQuestionId: "q1", response: "1", answeredAt: Date.now(), ...over });

describe("the warning before clearing", () => {
  it("counts the answers and questions saved on the phone and not sent", async () => {
    expect(await unsentCount()).toBe(0);
    await save("k1");
    await save("k2", { kind: "ask", sessionQuestionId: "", response: "Can you repeat?" });
    expect(await unsentCount()).toBe(2);
  });
});

describe("clearing the phone", () => {
  it("drops the saved answers and the events waiting to be sent", async () => {
    await save("k1");
    focusQueue.add({ type: "lost", at: Date.now(), sessionQuestionId: "q1", studentId: "student-marko", sessionId: "s1" });
    expect(await unsentCount()).toBe(1);
    await clearPhone();
    expect(await unsentCount()).toBe(0);
    expect(focusQueue.size("student-marko")).toBe(0);
    expect(window.localStorage.getItem(FOCUS_QUEUE_KEY)).toBeNull();
  });

  it("removes what the app keeps on the phone, here and for the visit, and keeps the language", async () => {
    for (const key of [PRACTICE_CACHE_KEY, OUTBOX_STUDENT_KEY, FOCUS_NOTICE_KEY, "teacheraid-shown-attendance", "teacheraid-camera-intro", "teacheraid-push-optin"]) {
      window.localStorage.setItem(key, "1");
    }
    window.sessionStorage.setItem("teacheraid-session", "{}");
    window.sessionStorage.setItem("teacheraid-home-rise", "1");
    await clearPhone();
    expect(Object.keys(window.localStorage).filter((k) => k !== LOCALE_KEY && !k.startsWith("teacheraid-app-") && !k.startsWith("teacheraid-mock-"))).toEqual([]);
    expect(Object.keys(window.sessionStorage)).toEqual([]);
    expect(getLocale()).toBe("en");
    expect(window.localStorage.getItem(LOCALE_KEY)).toBe("en");
  });

  it("leaves keys that are not the app's alone", async () => {
    window.localStorage.setItem("something-else", "x");
    window.sessionStorage.setItem("__e2e_seeded", "1");
    await clearPhone();
    expect(window.localStorage.getItem("something-else")).toBe("x");
    expect(window.sessionStorage.getItem("__e2e_seeded")).toBe("1");
  });

  it("keeps the demo's stand-in server data, so the demo is not signed out or wiped", async () => {
    actions.checkIn("math");
    const before = getState().checkins;
    await clearPhone();
    expect(window.localStorage.getItem("teacheraid-app-v1")).toBeTruthy();
    expect(getState().signedIn).toBe(true);
    expect(getState().checkins).toEqual(before);
  });

  it("empties the offline worker's caches and no others", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", { keys: async () => ["app-pages", "app-static", "app-meta", "other-cache"], delete: async (n: string) => (deleted.push(n), true) });
    await clearPhone();
    expect(deleted).toEqual(["app-pages", "app-static", "app-meta"]);
  });

  it("finishes the other steps when one fails, and says it failed", async () => {
    vi.stubGlobal("caches", { keys: async () => Promise.reject(new Error("blocked")), delete: async () => true });
    window.localStorage.setItem(PRACTICE_CACHE_KEY, "[]");
    await save("k1");
    await expect(clearPhone()).rejects.toThrow("blocked");
    expect(window.localStorage.getItem(PRACTICE_CACHE_KEY)).toBeNull();
    expect(await unsentCount()).toBe(0);
  });
});
