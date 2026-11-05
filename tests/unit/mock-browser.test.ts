import { afterEach, describe, expect, test, vi } from "vitest";
import { createBrowserMock, createServerMock, SERVER_ANCHOR } from "@/lib/teacher/api/mock-browser";
import { MOCK_SESSION_KEY } from "@/lib/teacher/api/mock-session";
import { freshState, MOCK_KEY, MOCK_VERSION, serializeState, startOfDay } from "@/lib/teacher/api/mock-state";

/** A browser whose localStorage is the one given; the mock reads `window.localStorage` when it first needs the state. */
function browser(storage: Pick<Storage, "getItem" | "setItem"> | "blocked") {
  vi.stubGlobal("window", {
    addEventListener: () => {},
    get localStorage() {
      if (storage === "blocked") throw new DOMException("denied", "SecurityError");
      return storage;
    },
  });
}

/** A storage with the demo's save in it (or none) and a teacher signed in, as the sign-in leaves it. */
const memory = (saved?: string, session: string | null = JSON.stringify({ persona: "veteran" })) => {
  const map = new Map<string, string>(saved === undefined ? [] : [[MOCK_KEY, saved]]);
  if (session !== null) map.set(MOCK_SESSION_KEY, session);
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("the demo in the browser", () => {
  test("a first visit saves the demo as of today, so its history does not slide tomorrow", async () => {
    const storage = memory();
    browser(storage);
    await createBrowserMock().api.getMe();
    const saved = JSON.parse(storage.map.get(MOCK_KEY)!);
    expect(saved.v).toBe(MOCK_VERSION);
    expect(saved.anchor).toBe(startOfDay(Date.now()));
  });

  test("a save that cannot be read is replaced by a fresh one, saved the same way", async () => {
    const storage = memory("{not json");
    browser(storage);
    await createBrowserMock().api.getMe();
    expect(JSON.parse(storage.map.get(MOCK_KEY)!).anchor).toBe(startOfDay(Date.now()));
  });

  test("a good save keeps the day it started on", async () => {
    const lastWeek = startOfDay(Date.now() - 7 * 86_400_000);
    const storage = memory(JSON.stringify({ v: MOCK_VERSION, anchor: lastWeek }));
    browser(storage);
    await createBrowserMock().api.getMe();
    expect(JSON.parse(storage.map.get(MOCK_KEY)!).anchor).toBe(lastWeek);
  });

  test("storage that refuses to be read or written still gives a working demo", async () => {
    // The session is the browser's cookie: with storage that cannot be read there is none, so the mock is let sign in the one
    // way left to it, in memory, as the tests of the adapter do. Here the demo's own save is what is under test.
    browser({
      getItem: (k: string) => {
        if (k === MOCK_SESSION_KEY) return JSON.stringify({ persona: "veteran" });
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    });
    const { api } = createBrowserMock();
    expect((await api.getMe()).name).toBe("Марија Петровска");
    await api.updateCourse((await api.listCourses())[0].id, { speed_bonus_on: false });
    expect((await api.listCourses())[0].speed_bonus_on).toBe(false);
  });

  test("no storage at all gives no session: nobody can be signed in, and the calls say so", async () => {
    browser("blocked");
    const { api } = createBrowserMock();
    await expect(api.listCourses()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("Reset starts the demo over, and the fresh start is saved", async () => {
    const storage = memory();
    browser(storage);
    const { api, demo } = createBrowserMock();
    const [course] = await api.listCourses();
    await api.updateCourse(course.id, { speed_bonus_on: false });
    expect(JSON.parse(storage.map.get(MOCK_KEY)!).school.speed_bonus).toEqual({ [course.id]: false });
    demo.reset();
    expect((await api.listCourses())[0].speed_bonus_on).toBe(true);
    expect(JSON.parse(storage.map.get(MOCK_KEY)!).school.speed_bonus).toEqual({});
  });
});

describe("two windows of one browser", () => {
  test("a window told of a change takes the state from the message, and never saves the old text it can still read over the new", async () => {
    // The other window's write has not reached this window's localStorage yet (another process): a read here still gives the old text.
    vi.stubGlobal("document", { documentElement: {}, addEventListener: () => {}, removeEventListener: () => {} });
    const old = memory(serializeState(freshState(startOfDay(Date.now()))));
    const sets: string[] = [];
    browser({ getItem: old.getItem, setItem: (k: string) => void sets.push(k) });
    const { api } = createBrowserMock();
    const [course] = await api.listCourses();
    expect(course.speed_bonus_on).toBe(true);
    const heard = vi.fn();
    api.subscribe(heard);

    const next = freshState(startOfDay(Date.now()));
    next.school.speed_bonus = { [course.id]: false };
    const other = new BroadcastChannel("teacheraid-teacher-mock-changed");
    other.postMessage(serializeState(next));
    await vi.waitFor(() => expect(heard).toHaveBeenCalled());
    other.close();

    expect((await api.listCourses())[0].speed_bonus_on).toBe(false);
    // The first read saved nothing: the old text was a good save.
    expect(sets).toEqual([]);
  });
});

describe("the demo the server renders", () => {
  test("has nobody signed in, so the server never draws a teacher's page and the hydrating render agrees with it", async () => {
    const server = createServerMock();
    await expect(server.getMe()).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
    await expect(server.listLessons()).rejects.toMatchObject({ code: "unauthenticated" });
    // Starting a sign-in needs no session.
    expect((await server.startSignIn({ provider: "google" })).method).toBe("redirect");
  });

  test("answers every read as a failure that is already settled, so the first render knows it", () => {
    const answer = createServerMock().getMe() as unknown as { settled?: { ok: boolean } };
    expect(answer.settled?.ok).toBe(false);
  });

  test("keeps its fixed day: the anchor and the clock it would serve a teacher with", () => {
    expect(SERVER_ANCHOR).toBe(new Date(2026, 9, 28).getTime());
  });
});
