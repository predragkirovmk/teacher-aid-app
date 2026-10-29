import { afterEach, describe, expect, test, vi } from "vitest";
import { createBrowserMock } from "@/lib/teacher/api/mock-browser";
import { MOCK_KEY, MOCK_VERSION, startOfDay } from "@/lib/teacher/api/mock-state";

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

const memory = (saved?: string) => {
  const map = new Map<string, string>(saved === undefined ? [] : [[MOCK_KEY, saved]]);
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
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
    browser({
      getItem: () => {
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

  test("no storage at all gives a working demo too", async () => {
    browser("blocked");
    const { api } = createBrowserMock();
    expect((await api.listCourses()).length).toBe(3);
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
