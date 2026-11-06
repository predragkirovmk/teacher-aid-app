// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import { createMockClient, mockClient, mockServerClient } from "@/lib/app/api/mock";
import { CLASS_SUBJECTS, LEADERBOARD, NOTIFS, BASE_ATTENDED, BASE_TOTAL } from "@/lib/app/api/mock/data";
import { MOCK_ROSTER } from "@/lib/app/api/mock/roster";
import { finishMockSignIn } from "@/lib/app/api/mock/signin";
import { QUIZZES } from "@/lib/app/api/mock/quiz";
import { resetMockSessions } from "@/lib/app/api/mock/session";
import { actions, DEFAULT_STATE, getState } from "@/lib/app/api/mock/store";
import { getLocale, setLocale } from "@/lib/app/locale";

const MY_START = LEADERBOARD.find((l) => l.me)!.points;

afterEach(() => resetMockSessions());

beforeEach(() => {
  resetMockSessions();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setLocale("mk");
  actions.reset();
  actions.signIn(); // the tests below are about a student who is in, unless they say otherwise
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

describe("sign-in", () => {
  afterEach(() => vi.useRealTimers());

  it("is signed in once the code is typed, as the student the demo plays", async () => {
    expect((await mockClient.getMe()).fullName).toBe("Марко Трајковски");
  });

  it("starts signed out on a phone that has never been used", () => {
    expect(DEFAULT_STATE.signedIn).toBe(false);
  });

  it("does not sign anyone out or in when the demo is started over", () => {
    actions.signOut();
    actions.reset();
    expect(getState().signedIn).toBe(false);
    actions.signIn();
    actions.reset();
    expect(getState().signedIn).toBe(true);
  });

  it("refuses getMe with unauthenticated after sign-out, and signs back in through the provider and its callback", async () => {
    await mockClient.signOut();
    await expect(mockClient.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
    // Always a redirect: here to the demo's stand-in for the provider's page, which carries the way back.
    const redirect = await mockClient.startSignIn({ provider: "google", returnTo: "/app/welcome?next=%2Fapp%2Fcheckin%2FMATH-7B" });
    expect(redirect).toEqual({
      method: "redirect",
      url: `/app/welcome?demo_provider=google&return_to=${encodeURIComponent("/app/welcome?next=%2Fapp%2Fcheckin%2FMATH-7B")}`,
    });
    // The callback checks the account against the roster, signs the student in and goes back to where they were.
    expect(finishMockSignIn("marko", "/app/welcome?next=%2Fapp%2Fcheckin%2FMATH-7B")).toBe("/app/welcome?next=%2Fapp%2Fcheckin%2FMATH-7B");
    await expect(mockClient.getMe()).resolves.toMatchObject({ id: "student-marko", schoolEmail: MOCK_ROSTER[0] });
  });

  it("offers Google and Microsoft and nothing else", async () => {
    await mockClient.signOut();
    await expect(mockClient.startSignIn({ provider: "microsoft" })).resolves.toMatchObject({ method: "redirect", url: expect.stringContaining("demo_provider=microsoft") });
    await expect(mockClient.startSignIn({ provider: "yahoo" as never })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("comes back to the welcome screen when no way back was given", async () => {
    await mockClient.signOut();
    await expect(mockClient.startSignIn({ provider: "google" })).resolves.toMatchObject({ url: `/app/welcome?demo_provider=google&return_to=${encodeURIComponent("/app/welcome")}` });
  });

  it("refuses an account that is on no roster, and a sign-in cancelled at the provider, and signs nobody in", async () => {
    await mockClient.signOut();
    expect(finishMockSignIn("personal", "/app/welcome")).toBe("/app/welcome?error=unknown_email");
    expect(finishMockSignIn("cancel", "/app/welcome?next=%2Fapp")).toBe("/app/welcome?next=%2Fapp&error=sign_in_failed");
    await expect(mockClient.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("needs a connection, as the real one will", async () => {
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await expect(mockClient.startSignIn({ provider: "google" })).rejects.toMatchObject({ code: "network" });
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

    await mockClient.startSignIn({ provider: "google" });
    finishMockSignIn("marko", "/app/welcome");
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
    expect(j.session).toMatchObject({ courseId: "math", state: "lobby" });
    expect(j.session.id).toMatch(/^mock-session-math/);
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

  it("does not know a code it never issued", async () => {
    await expect(mockClient.joinSession(code("NOPE-9"))).rejects.toMatchObject({ code: "not_found" });
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
    expect(state).toMatchObject({ question: null, result: null, sessionPoints: 0, board: null, progress: null, summary: null });
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

  it("starts with three unread: a late mark is a record, not news, and the fractions set is news", async () => {
    const all = await mockClient.listNotifications();
    // The demo's own alerts, and one for each of the two practice sets the teacher sent before it starts.
    expect(all).toHaveLength(NOTIFS.length + 2);
    expect((await unread()).map((n) => n.id).sort()).toEqual(["n-math", "n-physics", "n-practice-ps-session-math-1"]);
    expect(all.find((n) => n.id === "n-late")!.kind).toBe("marked_late");
  });

  it("marks one read, then all", async () => {
    await mockClient.markNotificationsRead(["n-math"]);
    expect((await unread()).map((n) => n.id).sort()).toEqual(["n-physics", "n-practice-ps-session-math-1"]);
    await mockClient.markNotificationsRead("all");
    expect(await unread()).toHaveLength(0);
  });

  it("lists them newest first", async () => {
    const all = await mockClient.listNotifications();
    const times = all.map((n) => n.createdAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("cuts the feed into pages by a cursor: the next `limit` after the last one the page before ended on", async () => {
    const all = await mockClient.listNotifications();
    const first = await mockClient.listNotifications({ limit: 2 });
    expect(first.map((n) => n.id)).toEqual(all.slice(0, 2).map((n) => n.id));
    const second = await mockClient.listNotifications({ limit: 2, before: first[1].id });
    expect(second.map((n) => n.id)).toEqual(all.slice(2, 4).map((n) => n.id));
    expect(await mockClient.listNotifications({ limit: 2, before: all[all.length - 1].id })).toEqual([]);
    // A cursor the server does not know is a page past the end, not the first page again.
    expect(await mockClient.listNotifications({ before: "nope" })).toEqual([]);
  });

  it("announces the result of a lesson played here, with its score and no more than the API's payload", async () => {
    actions.finishSession({
      sessionId: "mock-session-1",
      courseId: "math",
      lessonTitle: "Fractions",
      endedAt: Date.now(),
      right: 3,
      total: 4,
      questions: [],
    });
    const [newest] = await mockClient.listNotifications();
    expect(newest).toMatchObject({ id: "n-result-mock-session-1", kind: "result_ready", readAt: null, payload: { sessionId: "mock-session-1", right: 3, total: 4, courseId: "math" } });
    await mockClient.markNotificationsRead([newest.id]);
    expect((await mockClient.listNotifications()).find((n) => n.id === newest.id)!.readAt).not.toBeNull();
  });

  it("announces nothing for a lesson with no question in it", async () => {
    actions.finishSession({ sessionId: "empty", courseId: "math", lessonTitle: "Nothing", endedAt: Date.now(), right: 0, total: 0, questions: [] });
    expect((await mockClient.listNotifications()).some((n) => n.id === "n-result-empty")).toBe(false);
  });

  it("takes a push subscription and forgets it, with nothing to store, only for a signed-in student", async () => {
    const registration = { endpoint: "https://push.example/s", expirationTime: null, keys: { p256dh: "a", auth: "b" }, platform: "android" as const };
    await expect(mockClient.setPushToken(registration)).resolves.toBeUndefined();
    await expect(mockClient.removePushToken()).resolves.toBeUndefined();
    actions.signOut();
    await expect(mockClient.setPushToken(registration)).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("answers", () => {
  const answer = (key: string, over = {}) => ({ sessionQuestionId: "m1", response: "1", answeredAt: Date.now(), idempotencyKey: key, ...over });

  it("refuses an answer to a question that is not open", async () => {
    const { session } = await mockClient.joinSession(code("MATH-7B"));
    await expect(mockClient.submitAnswer(session.id, answer("key-early"))).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a session it does not know", async () => {
    await expect(mockClient.submitAnswer("elsewhere", answer("key-x"))).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("results and badges", () => {
  it("starts with its history, newest first, the last maths lesson 4 of 5, and can filter it by course", async () => {
    const all = await mockClient.listResults();
    expect(all).toHaveLength(8);
    expect(all[0]).toMatchObject({ sessionId: "session-math-1", right: 4, total: 5, courseId: "math" });
    const times = all.map((r) => r.endedAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect((await mockClient.listResults("physics")).map((r) => r.right)).toEqual([4, 3]);
    expect(await mockClient.listResults("math")).toHaveLength(4);
    expect(await mockClient.listResults("german")).toHaveLength(0);
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
