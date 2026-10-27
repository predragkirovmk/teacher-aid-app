// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient, mockServerClient } from "@/lib/app/api/mock";
import { BASE_ATTENDED } from "@/lib/app/api/mock/data";
import { resetMockSessions } from "@/lib/app/api/mock/session";
import { actions, DEFAULT_STATE, getState } from "@/lib/app/api/mock/store";
import { setLocale } from "@/lib/app/locale";
import { NOTICE_VERSION, needsNotice } from "@/lib/app/privacy";
import { resetDemo, showNoticeAgain } from "@/lib/app/demo";

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
  setLocale("mk");
  actions.reset();
  actions.signIn();
  // A phone that has never been used has seen no notice, whoever reset the demo before.
  actions.acknowledgeNotice(null);
});

describe("acknowledging the notice", () => {
  it("is none for a student who has not, so the notice is shown", async () => {
    const me = await mockClient.getMe();
    expect(me.acknowledgement).toBeNull();
    expect(needsNotice(me)).toBe(true);
    expect(DEFAULT_STATE.noticeVersion).toBeNull();
  });

  it("records the version and the time, and the notice is no longer needed", async () => {
    const before = Date.now();
    const me = await mockClient.acknowledgeNotice(NOTICE_VERSION);
    expect(me.acknowledgement).toEqual({ version: NOTICE_VERSION, at: expect.any(Number) });
    expect(me.acknowledgement!.at).toBeGreaterThanOrEqual(before);
    expect(needsNotice(me)).toBe(false);
    expect((await mockClient.getMe()).acknowledgement?.version).toBe(NOTICE_VERSION);
  });

  it("is shown again when the version changes, for a student who acknowledged an older one", async () => {
    await mockClient.acknowledgeNotice("2026-01-01");
    expect(needsNotice(await mockClient.getMe())).toBe(true);
    await mockClient.acknowledgeNotice(NOTICE_VERSION);
    expect(needsNotice(await mockClient.getMe())).toBe(false);
  });

  it("is kept when the demo is started over, and taken back by the demo's own button", async () => {
    await mockClient.acknowledgeNotice(NOTICE_VERSION);
    resetDemo();
    expect(getState().noticeVersion).toBe(NOTICE_VERSION);
    showNoticeAgain();
    expect(needsNotice(await mockClient.getMe())).toBe(true);
  });

  it("needs a signed-in student, like every other call", async () => {
    actions.signOut();
    await expect(mockClient.acknowledgeNotice(NOTICE_VERSION)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("is not something the server render writes", async () => {
    await expect(mockServerClient.acknowledgeNotice(NOTICE_VERSION)).rejects.toMatchObject({ code: "unknown" });
  });
});

describe("the data summary", () => {
  it("counts the student's records from the same data the screens show", async () => {
    const s = await mockClient.getDataSummary();
    expect(s.attendance).toBe(BASE_ATTENDED);
    expect(s.answers).toBeGreaterThan(0);
    expect(s.practiceAnswers).toBeGreaterThan(0);
    expect(s.notifications).toBeGreaterThan(0);
    expect(s).toMatchObject({ reasons: 0, questionsToTeacher: 0, focusEvents: 0, pushSubscription: false });
  });

  it("grows with a check-in, a question to the teacher, a reason and a time away from the quiz", async () => {
    const before = await mockClient.getDataSummary();
    actions.checkIn("math");
    actions.countAsk();
    actions.countReason();
    actions.countFocusLost(2);
    const after = await mockClient.getDataSummary();
    expect(after.attendance).toBe(before.attendance + 1);
    expect(after.questionsToTeacher).toBe(before.questionsToTeacher + 1);
    expect(after.reasons).toBe(before.reasons + 1);
    expect(after.focusEvents).toBe(before.focusEvents + 2);
  });

  it("is numbers and a yes or no: nothing a question or an answer said", async () => {
    actions.countAsk();
    const s = await mockClient.getDataSummary();
    for (const value of Object.values(s)) expect(["number", "boolean"]).toContain(typeof value);
  });

  it("is for a signed-in student", async () => {
    actions.signOut();
    await expect(mockClient.getDataSummary()).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
