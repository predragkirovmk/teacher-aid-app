import { describe, expect, test } from "vitest";
import { accessOf, authStatusOf, destinationOf, viewOf, type AuthStatus, type EndReason } from "@/lib/teacher/guard";

const input = (pathname: string, status: AuthStatus, extra: { reason?: EndReason | null; firstRunDone?: boolean } = {}) => ({ pathname, status, ...extra });

describe("which pages need a teacher", () => {
  test("the sign-in screen and Help are open; every other page is protected, including ones nobody has built yet", () => {
    expect(accessOf("/teacher/sign-in")).toBe("sign-in");
    expect(accessOf("/teacher/help")).toBe("either");
    for (const path of ["/teacher", "/teacher/lessons", "/teacher/lessons/new", "/teacher/classes", "/teacher/library", "/teacher/settings", "/teacher/welcome", "/teacher/lessons/l-1/live", "/teacher/nowhere", "/teacher/help/more", "/teacher/sign-in/x"]) {
      expect(accessOf(path), path).toBe("private");
    }
  });

  test("a trailing slash does not open a protected page, and does not close the open ones", () => {
    expect(accessOf("/teacher/sign-in/")).toBe("sign-in");
    expect(accessOf("/teacher/help/")).toBe("either");
    expect(accessOf("/teacher/classes/")).toBe("private");
  });
});

describe("whether a teacher is signed in", () => {
  test("a refusal of GET /me is signed out; any other failure to find out is not", () => {
    expect(authStatusOf({ ended: null, me: "loading", failure: null })).toBe("loading");
    expect(authStatusOf({ ended: null, me: "ready", failure: null })).toBe("signedIn");
    expect(authStatusOf({ ended: null, me: "error", failure: "unauthenticated" })).toBe("signedOut");
    expect(authStatusOf({ ended: null, me: "error", failure: "network" })).toBe("error");
    expect(authStatusOf({ ended: null, me: "error", failure: "server_error" })).toBe("error");
  });

  test("a session that ended is signed out, whatever is still on screen", () => {
    expect(authStatusOf({ ended: "expired", me: "ready", failure: null })).toBe("signedOut");
    expect(authStatusOf({ ended: "signed_out", me: "ready", failure: null })).toBe("signedOut");
    expect(authStatusOf({ ended: "signed_out", me: "loading", failure: null })).toBe("signedOut");
  });

  test("a refresh that failed while the teacher was already known leaves them signed in unless the session ended", () => {
    expect(authStatusOf({ ended: null, me: "ready", failure: "network" })).toBe("signedIn");
  });
});

describe("what is drawn", () => {
  test("nothing protected is drawn until the teacher is known to be signed in", () => {
    expect(viewOf(input("/teacher/classes", "loading"))).toBe("wait");
    expect(viewOf(input("/teacher/classes", "signedOut"))).toBe("wait");
    expect(viewOf(input("/teacher/classes", "signedOut", { reason: "expired" }))).toBe("wait");
    expect(viewOf(input("/teacher/classes", "signedIn", { firstRunDone: true }))).toBe("page");
  });

  test("when the teacher cannot be found out, the page asks to try again instead of sending them away", () => {
    expect(viewOf(input("/teacher/classes", "error"))).toBe("retry");
  });

  test("a first run is sent to the guide, and the guide itself is drawn", () => {
    expect(viewOf(input("/teacher", "signedIn", { firstRunDone: false }))).toBe("wait");
    expect(viewOf(input("/teacher/welcome", "signedIn", { firstRunDone: false }))).toBe("page");
    expect(viewOf(input("/teacher/welcome", "signedIn", { firstRunDone: true }))).toBe("page");
  });

  test("the sign-in screen is drawn at once for anyone not signed in, and not at all for a teacher who is (they are on their way)", () => {
    expect(viewOf(input("/teacher/sign-in", "loading"))).toBe("page");
    expect(viewOf(input("/teacher/sign-in", "signedOut"))).toBe("page");
    expect(viewOf(input("/teacher/sign-in", "error"))).toBe("page");
    expect(viewOf(input("/teacher/sign-in", "signedIn", { firstRunDone: true }))).toBe("wait");
  });

  test("Help waits for the answer, then is drawn for a teacher and for nobody alike", () => {
    expect(viewOf(input("/teacher/help", "loading"))).toBe("wait");
    for (const status of ["signedIn", "signedOut", "error"] as const) expect(viewOf(input("/teacher/help", status, { firstRunDone: false })), status).toBe("page");
  });
});

describe("where a teacher is sent", () => {
  test("signed out on a protected page: to sign in, remembering the page", () => {
    expect(destinationOf(input("/teacher/classes", "signedOut"), "/teacher/classes", null)).toBe("/teacher/sign-in?next=%2Fteacher%2Fclasses");
    // Today is where a sign-in goes anyway.
    expect(destinationOf(input("/teacher", "signedOut"), "/teacher", null)).toBe("/teacher/sign-in");
  });

  test("a session that ended mid-use says so, and still remembers the page", () => {
    expect(destinationOf(input("/teacher/lessons", "signedOut", { reason: "expired" }), "/teacher/lessons", null)).toBe(
      "/teacher/sign-in?reason=expired&next=%2Fteacher%2Flessons",
    );
  });

  test("after the teacher's own sign-out nothing is remembered, and the screen says they signed out", () => {
    expect(destinationOf(input("/teacher/lessons", "signedOut", { reason: "signed_out" }), "/teacher/lessons", null)).toBe("/teacher/sign-in?reason=signed_out");
  });

  test("a page that is not safe to come back to is not remembered", () => {
    expect(destinationOf(input("/teacher/welcome", "signedOut"), "/teacher/welcome", null)).toBe("/teacher/sign-in");
  });

  test("nothing is loaded while the answer is not known, and a failure to find out stays where it is", () => {
    expect(destinationOf(input("/teacher/classes", "loading"), "/teacher/classes", null)).toBeNull();
    expect(destinationOf(input("/teacher/classes", "error"), "/teacher/classes", null)).toBeNull();
  });

  test("signed in on the sign-in screen: on to the page that was asked for, or Today", () => {
    expect(destinationOf(input("/teacher/sign-in", "signedIn", { firstRunDone: true }), "/teacher/sign-in", "/teacher/classes")).toBe("/teacher/classes");
    expect(destinationOf(input("/teacher/sign-in", "signedIn", { firstRunDone: true }), "/teacher/sign-in", null)).toBe("/teacher");
  });

  test("an address that is not safe is not followed after signing in", () => {
    for (const bad of ["//evil.example", "https://evil.example", "/app", "/teacher/x?y=1", "/teacher/sign-in", "javascript:alert(1)"]) {
      expect(destinationOf(input("/teacher/sign-in", "signedIn", { firstRunDone: true }), "/teacher/sign-in", bad), bad).toBe("/teacher");
    }
  });

  test("a first run goes by way of the guide, which remembers where it was heading", () => {
    expect(destinationOf(input("/teacher/sign-in", "signedIn", { firstRunDone: false }), "/teacher/sign-in", null)).toBe("/teacher/welcome");
    expect(destinationOf(input("/teacher/sign-in", "signedIn", { firstRunDone: false }), "/teacher/sign-in", "/teacher/classes")).toBe(
      "/teacher/welcome?next=%2Fteacher%2Fclasses",
    );
    expect(destinationOf(input("/teacher/classes", "signedIn", { firstRunDone: false }), "/teacher/classes", null)).toBe("/teacher/welcome?next=%2Fteacher%2Fclasses");
    expect(destinationOf(input("/teacher", "signedIn", { firstRunDone: false }), "/teacher", null)).toBe("/teacher/welcome");
  });

  test("the guide does not send the teacher to the guide, and once the first run is done nothing does", () => {
    expect(destinationOf(input("/teacher/welcome", "signedIn", { firstRunDone: false }), "/teacher/welcome", null)).toBeNull();
    expect(destinationOf(input("/teacher/welcome", "signedIn", { firstRunDone: true }), "/teacher/welcome", null)).toBeNull();
    expect(destinationOf(input("/teacher/classes", "signedIn", { firstRunDone: true }), "/teacher/classes", null)).toBeNull();
  });

  test("Help sends nobody anywhere, signed in or not, first run or not", () => {
    for (const status of ["signedIn", "signedOut", "loading", "error"] as const) {
      expect(destinationOf(input("/teacher/help", status, { firstRunDone: false }), "/teacher/help", "/teacher/classes"), status).toBeNull();
    }
  });

  test("the sign-in screen sends nobody who is not signed in anywhere", () => {
    for (const status of ["signedOut", "loading", "error"] as const) {
      expect(destinationOf(input("/teacher/sign-in", status), "/teacher/sign-in", "/teacher/classes"), status).toBeNull();
    }
  });
});
