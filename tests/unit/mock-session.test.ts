import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEMO_ACCOUNTS,
  demoEmail,
  demoProviderUrl,
  finishSignIn,
  invitedPersona,
  isDemoAccount,
  MOCK_SESSION_KEY,
  readDemoProvider,
  readSession,
  writeSession,
} from "@/lib/teacher/api/mock-session";
import { SCHOOLS } from "@/lib/teacher/api/mock-data";
import { createMockApi, memorySource } from "@/lib/teacher/api/mock";
import { freshState } from "@/lib/teacher/api/mock-state";
import { isTeacherPath } from "@/lib/teacher/signin";

const memory = (saved?: string) => {
  const map = new Map<string, string>(saved === undefined ? [] : [[MOCK_SESSION_KEY, saved]]);
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
};

describe("the mock's session", () => {
  test("is kept in its own key, and read back", () => {
    const storage = memory();
    expect(readSession(storage)).toBeNull();
    writeSession(storage, "novice");
    expect(JSON.parse(storage.map.get(MOCK_SESSION_KEY)!)).toEqual({ persona: "novice" });
    expect(readSession(storage)).toBe("novice");
    writeSession(storage, "veteran");
    expect(readSession(storage)).toBe("veteran");
  });

  test("signing out removes it", () => {
    const storage = memory(JSON.stringify({ persona: "veteran" }));
    writeSession(storage, null);
    expect(storage.map.has(MOCK_SESSION_KEY)).toBe(false);
    expect(readSession(storage)).toBeNull();
  });

  test("anything that is not a teacher of the demo is no session: a bad save, another person, a hand edit, storage that refuses", () => {
    for (const bad of ["", "{not json", "null", "[]", '"veteran"', JSON.stringify({ persona: "admin" }), JSON.stringify({ persona: 7 }), JSON.stringify({})]) {
      expect(readSession(memory(bad)), bad).toBeNull();
    }
    expect(readSession(null)).toBeNull();
    expect(readSession({ getItem: () => { throw new Error("denied"); } })).toBeNull();
  });

  test("a browser that refuses to write keeps no session and does not crash", () => {
    expect(() => writeSession({ setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("full"); } }, "veteran")).not.toThrow();
    expect(() => writeSession(null, "veteran")).not.toThrow();
  });
});

describe("the teachers the admin invited", () => {
  test("are matched by email, in any case, in both demo schools", () => {
    expect(invitedPersona(SCHOOLS.school.teacher.email)).toBe("veteran");
    expect(invitedPersona(SCHOOLS.university.teacher.email)).toBe("veteran");
    expect(invitedPersona(SCHOOLS.school.novice.email)).toBe("novice");
    expect(invitedPersona(SCHOOLS.university.novice.email)).toBe("novice");
    expect(invitedPersona(`  ${SCHOOLS.school.teacher.email.toUpperCase()} `)).toBe("veteran");
  });

  test("anybody else is on no list: a colleague nobody invited, a personal account, nothing", () => {
    expect(invitedPersona("nikola.trajkov@gimnazija-svetlina.example")).toBeNull();
    expect(invitedPersona("marija.petrovska@gmail.com")).toBeNull();
    expect(invitedPersona("")).toBeNull();
  });
});

describe("the demo provider's page returning, as the callback does", () => {
  test("the teacher with history signs in and goes back to where the sign-in was heading", () => {
    expect(finishSignIn("veteran", "/teacher/sign-in?next=%2Fteacher%2Fclasses", "school")).toEqual({
      persona: "veteran",
      location: "/teacher/sign-in?next=%2Fteacher%2Fclasses",
    });
  });

  test("a new teacher signs in the same way, and at a faculty too", () => {
    expect(finishSignIn("novice", "/teacher/sign-in", "school").persona).toBe("novice");
    expect(finishSignIn("novice", "/teacher/sign-in", "university").persona).toBe("novice");
    expect(finishSignIn("veteran", "/teacher/sign-in", "university").persona).toBe("veteran");
  });

  test("an account nobody invited and a personal one are both refused as unknown_email, and nobody is signed in", () => {
    for (const account of ["not_invited", "personal"] as const) {
      expect(finishSignIn(account, "/teacher/sign-in", "school"), account).toEqual({ persona: null, location: "/teacher/sign-in?error=unknown_email" });
    }
    expect(finishSignIn("personal", "/teacher/sign-in?next=%2Fteacher%2Fclasses", "school").location).toBe("/teacher/sign-in?next=%2Fteacher%2Fclasses&error=unknown_email");
  });

  test("a closed provider window comes back as sign_in_failed and nobody is signed in", () => {
    expect(finishSignIn("cancelled", "/teacher/sign-in", "school")).toEqual({ persona: null, location: "/teacher/sign-in?error=sign_in_failed" });
  });

  test("goes only to a path of the teacher app: anything else becomes the sign-in screen", () => {
    for (const bad of ["https://evil.example/teacher", "//evil.example", "/app/welcome", "", "javascript:alert(1)"]) {
      const { location } = finishSignIn("veteran", bad, "school");
      expect(location, bad).toBe("/teacher/sign-in");
      expect(isTeacherPath(location)).toBe(true);
    }
  });

  test("every account but the offline one has an email the callback can match", () => {
    for (const account of DEMO_ACCOUNTS.filter((a) => a !== "offline" && a !== "cancelled")) {
      expect(demoEmail(account as "veteran", "school")).toMatch(/@/);
    }
    expect(DEMO_ACCOUNTS.every(isDemoAccount)).toBe(true);
    expect(isDemoAccount("admin")).toBe(false);
  });
});

describe("the demo's provider page address", () => {
  test("carries the provider and where it returns to, and reads back", () => {
    const url = demoProviderUrl("microsoft", "/teacher/sign-in?next=%2Fteacher%2Fclasses");
    expect(url.startsWith("/teacher/sign-in?")).toBe(true);
    const search = url.slice(url.indexOf("?"));
    expect(readDemoProvider(search)).toEqual({ provider: "microsoft", returnTo: "/teacher/sign-in?next=%2Fteacher%2Fclasses" });
  });

  test("returns only to a path of the teacher app, and only for a provider there is", () => {
    expect(readDemoProvider("?demo_provider=google&return_to=https%3A%2F%2Fevil.example")).toEqual({ provider: "google", returnTo: "/teacher/sign-in" });
    expect(readDemoProvider("?demo_provider=google")).toEqual({ provider: "google", returnTo: "/teacher/sign-in" });
    for (const search of ["", "?demo_provider=yahoo", "?demo_provider=", "?return_to=%2Fteacher", "?next=%2Fteacher"]) expect(readDemoProvider(search), search).toBeNull();
  });
});

describe("the mock adapter's sign-in and sign-out", () => {
  const NOW = new Date(2026, 9, 29, 9, 0).getTime();
  const ANCHOR = new Date(2026, 9, 29).getTime();
  const build = (persona: "veteran" | "novice" | null) => {
    const source = memorySource(freshState(ANCHOR), { now: () => NOW, persona });
    return { source, api: createMockApi(source, { delay: () => Promise.resolve() }) };
  };

  beforeEach(() => vi.unstubAllGlobals());

  test("starting a sign-in answers with a redirect to the demo's provider page, carrying where to return", async () => {
    const { api } = build(null);
    const answer = await api.startSignIn({ provider: "google", return_to: "/teacher/sign-in?next=%2Fteacher%2Fclasses" });
    expect(answer.method).toBe("redirect");
    expect(readDemoProvider(answer.url.slice(answer.url.indexOf("?")))).toEqual({ provider: "google", returnTo: "/teacher/sign-in?next=%2Fteacher%2Fclasses" });
  });

  test("a provider that is not Google or Microsoft is refused as validation_failed", async () => {
    const { api } = build(null);
    for (const provider of ["yahoo", "", undefined]) {
      await expect(api.startSignIn({ provider } as never), String(provider)).rejects.toMatchObject({ code: "validation_failed" });
    }
  });

  test("a computer that is offline cannot start a sign-in, sign out or finish the first run, which then stays not done", async () => {
    const { api, source } = build("novice");
    vi.stubGlobal("navigator", { onLine: false });
    await expect(api.startSignIn({ provider: "google" })).rejects.toMatchObject({ code: "network" });
    await expect(api.signOut()).rejects.toMatchObject({ code: "network" });
    await expect(api.setFirstRunDone()).rejects.toMatchObject({ code: "network" });
    vi.unstubAllGlobals();
    expect((await api.getMe()).first_run_done).toBe(false);
    source.setSession("veteran");
    vi.stubGlobal("navigator", { onLine: false });
    // Still signed in: it said so, and did not pretend.
    expect(source.session()).toBe("veteran");
    expect((await api.getMe()).name).toBe("Марија Петровска");
  });

  test("nobody signed in: every call but signing in and out is refused as unauthenticated (401), reads and changes alike", async () => {
    const { api } = build(null);
    for (const call of [
      () => api.getMe(),
      () => api.setFirstRunDone(),
      () => api.listCourses(),
      () => api.getDashboard("course-ii-4"),
      () => api.listLessons(),
      () => api.getLesson("l-nizi"),
      () => api.listLibrary(),
      () => api.getOpenSession(),
      () => api.createSource({ kind: "typed", text: "x".repeat(60) }),
      () => api.deleteLesson("l-nizi"),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
    }
  });

  test("a refusal is already settled, so the first render knows it and a hook does not flash a loading state", () => {
    const { api } = build(null);
    const answer = api.getMe() as unknown as { settled?: { ok: boolean } };
    expect(answer.settled?.ok).toBe(false);
  });

  test("signing out ends the session for every call after it, and for a second sign-out nothing is left to end", async () => {
    const { api, source } = build("veteran");
    expect((await api.listCourses()).length).toBe(3);
    await api.signOut();
    expect(source.session()).toBeNull();
    await expect(api.listCourses()).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(api.signOut()).resolves.toBeUndefined();
  });

  test("tells whoever is listening that the session changed, so what was on screen is asked for again and refused", async () => {
    const { api, source } = build("veteran");
    let heard = 0;
    api.subscribe(() => heard++);
    source.setSession(null);
    expect(heard).toBe(1);
    await api.signOut();
    expect(heard).toBe(2);
  });
});
