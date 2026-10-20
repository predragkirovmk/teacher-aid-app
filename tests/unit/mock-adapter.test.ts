// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import { createMockClient, mockClient, mockServerClient } from "@/lib/app/api/mock";
import { CLASS_SUBJECTS, LEADERBOARD, MOCK_CODE, MOCK_ROSTER, NOTIFS, BASE_ATTENDED, BASE_TOTAL } from "@/lib/app/api/mock/data";
import { CODE_LENGTH, CODE_TTL_MS, LOCK_SECONDS, MAX_WRONG_CODES, RESEND_AFTER_MS } from "@/lib/app/api/mock/signin";
import { QUIZZES } from "@/lib/app/api/mock/quiz";
import { actions, getState } from "@/lib/app/api/mock/store";
import { getLocale, setLocale } from "@/lib/app/locale";

const MY_START = LEADERBOARD.find((l) => l.me)!.points;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  setLocale("mk");
  actions.reset();
});

const code = (token: string) => ({ token });

describe("every call answers with a settled promise", () => {
  it("so a hook can read the value in the render that asks", () => {
    const p = mockClient.getMe() as unknown as { settled: { ok: boolean } };
    expect(p.settled.ok).toBe(true);
    const failing = mockClient.joinSession(code("NOPE-1")) as unknown as { settled: { ok: boolean } };
    expect(failing.settled.ok).toBe(false);
  });
});

const EMAIL = MOCK_ROSTER[0];

describe("sign-in", () => {
  afterEach(() => vi.useRealTimers());

  it("starts signed in, as the demo always has", async () => {
    expect((await mockClient.getMe()).fullName).toBe("Марко Трајковски");
  });

  it("refuses getMe with unauthenticated after sign-out, and signs back in with the emailed code", async () => {
    await mockClient.signOut();
    await expect(mockClient.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
    const challenge = await mockClient.startSignIn({ schoolEmail: EMAIL });
    expect(challenge).toMatchObject({ method: "code", codeLength: CODE_LENGTH });
    const me = await mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE });
    expect(me.id).toBe("student-marko");
    await expect(mockClient.getMe()).resolves.toMatchObject({ id: "student-marko" });
  });

  it("takes the email in any case and with spaces round it", async () => {
    await mockClient.signOut();
    await expect(mockClient.startSignIn({ schoolEmail: `  ${EMAIL.toUpperCase()} ` })).resolves.toMatchObject({ method: "code" });
    await expect(mockClient.completeSignIn({ schoolEmail: ` ${EMAIL.toUpperCase()}`, code: " 123 456 " })).resolves.toMatchObject({
      id: "student-marko",
    });
  });

  it("times the code: it can be resent after 30 seconds and stops working after 10 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));
    const c = await mockClient.startSignIn({ schoolEmail: EMAIL });
    if (c.method !== "code") throw new Error("expected a code");
    expect(c.resendAt - Date.now()).toBe(RESEND_AFTER_MS);
    expect(c.expiresAt - Date.now()).toBe(CODE_TTL_MS);
    vi.advanceTimersByTime(CODE_TTL_MS + 1);
    await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE })).rejects.toMatchObject({ code: "code_expired" });
  });

  it("refuses an email on no roster, and one that is not an email", async () => {
    await expect(mockClient.startSignIn({ schoolEmail: "nobody@student.example.mk" })).rejects.toMatchObject({ code: "unknown_email" });
    await expect(mockClient.startSignIn({ schoolEmail: "not an email" })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("refuses a wrong code and a code nobody asked for, and signs nobody in", async () => {
    await mockClient.signOut();
    await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE })).rejects.toMatchObject({ code: "code_expired" });
    await mockClient.startSignIn({ schoolEmail: EMAIL });
    await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: "000000" })).rejects.toMatchObject({ code: "invalid_code" });
    await expect(mockClient.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("locks after too many wrong codes, with how long to wait, even for the right one", async () => {
    vi.useFakeTimers();
    await mockClient.signOut();
    await mockClient.startSignIn({ schoolEmail: EMAIL });
    for (let i = 1; i < MAX_WRONG_CODES; i++) {
      await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: "000000" })).rejects.toMatchObject({ code: "invalid_code" });
    }
    await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: "000000" })).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: LOCK_SECONDS,
    });
    vi.advanceTimersByTime(10_000);
    await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE })).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: LOCK_SECONDS - 10,
    });
    vi.advanceTimersByTime(LOCK_SECONDS * 1000);
    await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE })).resolves.toMatchObject({ id: "student-marko" });
  });

  it("spends a code: it works once", async () => {
    await mockClient.signOut();
    await mockClient.startSignIn({ schoolEmail: EMAIL });
    await mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE });
    await mockClient.signOut();
    await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE })).rejects.toMatchObject({ code: "code_expired" });
  });

  it("needs a connection, as the real one will", async () => {
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await expect(mockClient.startSignIn({ schoolEmail: EMAIL })).rejects.toMatchObject({ code: "network" });
    await expect(mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE })).rejects.toMatchObject({ code: "network" });
    online.mockRestore();
  });
});

describe("signed in elsewhere (BR-AUTH-03)", () => {
  it("answers every call with signed_in_elsewhere, until the student signs in again", async () => {
    actions.signOutElsewhere();
    const calls: [string, () => Promise<unknown>][] = [
      ["getMe", () => mockClient.getMe()],
      ["listCourses", () => mockClient.listCourses()],
      ["getAttendance", () => mockClient.getAttendance()],
      ["listResults", () => mockClient.listResults()],
      ["getLeaderboard", () => mockClient.getLeaderboard()],
      ["listBadges", () => mockClient.listBadges()],
      ["listNotifications", () => mockClient.listNotifications()],
      ["markNotificationsRead", () => mockClient.markNotificationsRead("all")],
      ["updateProfile", () => mockClient.updateProfile({ displayName: "Ана" })],
      ["updateSettings", () => mockClient.updateSettings({ notificationsOn: false })],
      ["joinSession", () => mockClient.joinSession({ token: "MATH-7B" })],
    ];
    for (const [name, call] of calls) await expect(call(), name).rejects.toMatchObject({ code: "signed_in_elsewhere" });

    await mockClient.startSignIn({ schoolEmail: EMAIL });
    await mockClient.completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE });
    await expect(mockClient.getMe()).resolves.toMatchObject({ id: "student-marko" });
    expect(getState().endedElsewhere).toBe(false);
  });

  it("is not the same as signing out by choice", async () => {
    await mockClient.signOut();
    await expect(mockClient.listCourses()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("survives a reload: the saved state still says why", () => {
    actions.signOutElsewhere();
    expect(JSON.parse(window.localStorage.getItem("teacheraid-app-v1")!)).toMatchObject({ signedIn: false, endedElsewhere: true });
  });
});

describe("the display name (BR-STU-01)", () => {
  it("saves a name of 2 to 24 characters, tidied", async () => {
    const me = await mockClient.updateProfile({ displayName: "  Мики   Т " });
    expect(me.displayName).toBe("Мики Т");
    expect((await mockClient.updateProfile({ displayName: "А".repeat(24) })).displayName).toBe("А".repeat(24));
  });

  it("goes back to the school account's name on null", async () => {
    await mockClient.updateProfile({ displayName: "Мики" });
    expect((await mockClient.updateProfile({ displayName: null })).displayName).toBeNull();
  });

  it("refuses an empty, a one-letter, a 25-letter and a symbol name, and keeps the old one", async () => {
    await mockClient.updateProfile({ displayName: "Мики" });
    for (const bad of ["", "   ", "М", "А".repeat(25), "Ана1", "😀😀"]) {
      await expect(mockClient.updateProfile({ displayName: bad }), JSON.stringify(bad)).rejects.toMatchObject({ code: "validation_failed" });
    }
    expect((await mockClient.getMe()).displayName).toBe("Мики");
  });
});

describe("joining a session", () => {
  it("opens the lobby of the class's quiz and records the attendance", async () => {
    const j = await mockClient.joinSession(code("MATH-7B"));
    expect(j.session).toMatchObject({ courseId: "math", state: "lobby", id: "mock-session-math" });
    expect(j.session.questionCount).toBe(QUIZZES.math!.questions.length);
    expect(j.attendance).toMatchObject({ subjectId: "math", status: "present" });
    expect(j.attendance.joinedAt).not.toBeNull();
    expect(getState().checkins).toHaveLength(1);
  });

  it("is idempotent: joining again is the same attendance, not a second one", async () => {
    const first = await mockClient.joinSession(code("MATH-7B"));
    const again = await mockClient.joinSession(code("MATH-7B"));
    expect(again.attendance.id).toBe(first.attendance.id);
    expect(again.session.id).toBe(first.session.id);
    expect(getState().checkins).toHaveLength(1);
    const att = await mockClient.getAttendance();
    expect(att.attended).toBe(BASE_ATTENDED + 1);
    expect(att.total).toBe(BASE_TOTAL + 1);
  });

  it("takes the code in any case, with spaces round it, as a token or a short code", async () => {
    const a = await mockClient.joinSession(code("  math-7b "));
    const b = await mockClient.joinSession({ shortCode: "MATH-7B" });
    expect(b.attendance.id).toBe(a.attendance.id);
  });

  it("counts a different subject separately", async () => {
    await mockClient.joinSession(code("MATH-7B"));
    await mockClient.joinSession(code("PHYS-7B"));
    expect(getState().checkins.map((c) => c.subject).sort()).toEqual(["math", "physics"]);
  });

  it("opens a quiz for every class code", async () => {
    for (const s of CLASS_SUBJECTS) {
      const j = await mockClient.joinSession(code(s.code));
      expect(j.session.courseId).toBe(s.id);
    }
  });

  it("treats a code it never issued as an expired token", async () => {
    await expect(mockClient.joinSession(code("NOPE-9"))).rejects.toMatchObject({ code: "token_expired" });
    expect(getState().checkins).toHaveLength(0);
  });

  it("needs a signed-in student", async () => {
    await mockClient.signOut();
    await expect(mockClient.joinSession(code("MATH-7B"))).rejects.toMatchObject({ code: "unauthenticated" });
    expect(getState().checkins).toHaveLength(0);
  });

  it("reports the quiz's state again after a reconnect, and refuses a session it does not know", async () => {
    const { session } = await mockClient.joinSession(code("MATH-7B"));
    const state = await mockClient.getStudentState(session.id);
    expect(state.session.id).toBe(session.id);
    expect(state).toMatchObject({ question: null, result: null, sessionPoints: 0 });
    await expect(mockClient.getStudentState("other-1")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("check-in earns no points", () => {
  it("leaves the leaderboard where it was (decided 13 Oct 2026)", async () => {
    const before = await mockClient.getLeaderboard();
    await mockClient.joinSession(code("MATH-7B"));
    await mockClient.joinSession(code("PHYS-7B"));
    const after = await mockClient.getLeaderboard();
    const me = (b: typeof before) => b.rows.find((r) => r.isMe)!;
    expect(me(after).points).toBe(MY_START);
    expect(me(after).points).toBe(me(before).points);
    expect(me(after).rank).toBe(me(before).rank);
    expect(getState().quizPoints).toBe(0);
  });

  it("while quiz points and achievements do", async () => {
    actions.addQuizPoints(40);
    const board = await mockClient.getLeaderboard();
    expect(board.rows.find((r) => r.isMe)!.points).toBe(MY_START + 40);
  });

  it("lets a tie go to the student", async () => {
    const mila = LEADERBOARD.find((l) => l.id === "mila")!.points;
    actions.addQuizPoints(mila - MY_START);
    const { rows } = await mockClient.getLeaderboard();
    const me = rows.findIndex((r) => r.isMe);
    expect(rows[me].points).toBe(mila);
    expect(rows[me].rank).toBe(rows.findIndex((r) => r.name === "Мила Јованова"));
    expect(rows[me].rank).toBeLessThan(rows.find((r) => r.name === "Мила Јованова")!.rank);
  });
});

describe("profile and settings", () => {
  it("shows the school account's name until the student chooses one", async () => {
    expect((await mockClient.getMe()).displayName).toBeNull();
    const me = await mockClient.updateProfile({ displayName: "Марко Т" });
    expect(me.displayName).toBe("Марко Т");
    expect((await mockClient.getMe()).displayName).toBe("Марко Т");
  });

  it("changes the language of the answers, and writes the student's name in that script", async () => {
    await mockClient.updateSettings({ locale: "en" });
    expect(getLocale()).toBe("en");
    const me = await mockClient.getMe();
    expect(me.settings.locale).toBe("en");
    expect(me.fullName).toBe("Marko Trajkovski");
    expect(me.class.name).toBe("7B");
    expect((await mockClient.listCourses())[0].subjectName).toBe("Macedonian");
  });

  it("changes the notifications switch", async () => {
    expect((await mockClient.getMe()).settings.notificationsOn).toBe(true);
    await mockClient.updateSettings({ notificationsOn: false });
    expect((await mockClient.getMe()).settings.notificationsOn).toBe(false);
  });

  it("stores and removes a photo", async () => {
    const preview = "data:image/jpeg;base64,AAAA";
    expect((await mockClient.setPhoto({ blob: new Blob(["x"]), preview })).photoUrl).toBe(preview);
    expect((await mockClient.removePhoto()).photoUrl).toBeNull();
  });
});

describe("notifications", () => {
  const unread = async () => (await mockClient.listNotifications()).filter((n) => n.readAt === null);

  it("starts with two unread: a late mark is a record, not news", async () => {
    const all = await mockClient.listNotifications();
    expect(all).toHaveLength(NOTIFS.length);
    expect((await unread()).map((n) => n.id).sort()).toEqual(["n-math", "n-physics"]);
    expect(all.find((n) => n.id === "n-late")!.kind).toBe("marked_late");
  });

  it("marks one read, then all", async () => {
    await mockClient.markNotificationsRead(["n-math"]);
    expect((await unread()).map((n) => n.id)).toEqual(["n-physics"]);
    await mockClient.markNotificationsRead("all");
    expect(await unread()).toHaveLength(0);
  });

  it("lists them newest first", async () => {
    const all = await mockClient.listNotifications();
    const times = all.map((n) => n.createdAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe("answers", () => {
  const answer = (key: string) => ({ sessionQuestionId: "q", response: "1", answeredAt: Date.now(), idempotencyKey: key });

  it("accepts an answer once and reports a retry with the same key as a duplicate", async () => {
    const first = await mockClient.submitAnswer("mock-session-math", answer("key-retry"));
    const retry = await mockClient.submitAnswer("mock-session-math", answer("key-retry"));
    const other = await mockClient.submitAnswer("mock-session-math", answer("key-other"));
    expect(first).toEqual({ accepted: true, duplicate: false });
    expect(retry).toEqual({ accepted: true, duplicate: true });
    expect(other.duplicate).toBe(false);
  });

  it("refuses a session it does not know", async () => {
    await expect(mockClient.submitAnswer("elsewhere", answer("key-x"))).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("results and badges", () => {
  it("has one finished quiz, 4 of 5, and can filter it by course", async () => {
    const all = await mockClient.listResults();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ right: 4, total: 5, courseId: "math" });
    expect(await mockClient.listResults("physics")).toHaveLength(0);
    expect(await mockClient.listResults("math")).toHaveLength(1);
  });

  it("unlocks First answer and Perfect quiz when the student earns them", async () => {
    const earned = async () => (await mockClient.listBadges()).filter((b) => b.earned).map((b) => b.code);
    expect(await earned()).toEqual(["ontime"]);
    actions.markQuizAnswered();
    actions.markPerfectQuiz();
    expect((await earned()).sort()).toEqual(["answer", "ontime", "perfect"]);
  });
});

describe("the server render's client", () => {
  it("reads the defaults and never writes", async () => {
    const me = await mockServerClient.getMe();
    expect(me.fullName).toBe("Марко Трајковски");
    await expect(mockServerClient.joinSession(code("MATH-7B"))).rejects.toBeInstanceOf(ApiError);
    await expect(mockServerClient.markNotificationsRead("all")).rejects.toBeInstanceOf(ApiError);
    expect(getState().checkins).toHaveLength(0);
  });
});

describe("subscribe", () => {
  it("tells a listener when the local data changes, and stops when asked", () => {
    let calls = 0;
    const stop = mockClient.subscribe(() => calls++);
    actions.markRead("n-math");
    expect(calls).toBeGreaterThan(0);
    const seen = calls;
    stop();
    actions.markRead("n-physics");
    expect(calls).toBe(seen);
  });

  it("also hears a language change", () => {
    let calls = 0;
    const stop = mockClient.subscribe(() => calls++);
    setLocale("en");
    expect(calls).toBe(1);
    stop();
  });
});

describe("a client over a custom source", () => {
  it("answers from the state it is given", async () => {
    const c = createMockClient({ state: () => ({ ...getState(), signedIn: false }), locale: () => "en", writable: false });
    await expect(c.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
    const elsewhere = createMockClient({ state: () => ({ ...getState(), signedIn: false, endedElsewhere: true }), locale: () => "en", writable: false });
    await expect(elsewhere.getMe()).rejects.toMatchObject({ code: "signed_in_elsewhere" });
  });
});
