// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import { MOCK_ROSTER } from "@/lib/app/api/mock/roster";
import { finishMockSignIn } from "@/lib/app/api/mock/signin";
import { actions } from "@/lib/app/api/mock/store";
import { getSessionEnd, startSession } from "@/lib/app/api/session";

// hooks.ts loads the mock quiz driver with a build-time `require` that vitest cannot resolve; the quiz is not under test.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_MODE = "live";
});

vi.mock("@/lib/app/report", () => ({ reportError: vi.fn() }));
// The app's own wiring (index.ts picks the adapter with a build-time require): the mock, watched for the session ending.
vi.mock("@/lib/app/api/index", async () => {
  const { mockClient } = await import("@/lib/app/api/mock");
  const { watchSession } = await import("@/lib/app/api/session");
  return { client: watchSession(mockClient), serverClient: null };
});

const { client } = await import("@/lib/app/api");
const { signOut, startSignIn, useAuth } = await import("@/lib/app/api/hooks");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMAIL = MOCK_ROSTER[0];
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

const roots: Root[] = [];
function mountAuth() {
  const seen: ReturnType<typeof useAuth>[] = [];
  const Probe = () => {
    seen.push(useAuth());
    return null;
  };
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  act(() => root.render(createElement(Probe)));
  return { last: () => seen[seen.length - 1] };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  actions.reset();
  actions.signIn(); // the tests below are about a student who is in, unless they say otherwise
  startSession();
});
afterEach(() => {
  roots.splice(0).forEach((r) => act(() => r.unmount()));
  vi.restoreAllMocks();
});

describe("who is signed in", () => {
  it("is signed in for the demo's student", () => {
    expect(mountAuth().last()).toMatchObject({ status: "signedIn", reason: undefined });
  });

  it("is signed out by choice after signOut, and the cache and the student's local traces are gone", async () => {
    window.localStorage.setItem("teacheraid-shown-attendance", "88");
    window.localStorage.setItem("teacheraid-achievements-seen", "answer");
    window.localStorage.setItem("teacheraid-locale", "mk");
    const auth = mountAuth();
    await signOut();
    await flush();
    expect(auth.last()).toMatchObject({ status: "signedOut", reason: "signed_out" });
    expect(getSessionEnd()).toBe("signed_out");
    expect(window.localStorage.getItem("teacheraid-shown-attendance")).toBeNull();
    expect(window.localStorage.getItem("teacheraid-achievements-seen")).toBeNull();
    // The phone's own setting is not the student's.
    expect(window.localStorage.getItem("teacheraid-locale")).toBe("mk");
  });

  it("learns that another device signed in from any call, and keeps that reason", async () => {
    const auth = mountAuth();
    actions.signOutElsewhere();
    await flush();
    expect(auth.last()).toMatchObject({ status: "signedOut", reason: "signed_in_elsewhere" });
    // A call that has nothing to do with Home's own query says the same thing.
    await expect(client.listBadges()).rejects.toMatchObject({ code: "signed_in_elsewhere" });
    expect(getSessionEnd()).toBe("signed_in_elsewhere");
  });

  it("is signed in again once the provider has sent the browser back, with no reason left over", async () => {
    const auth = mountAuth();
    actions.signOutElsewhere();
    await flush();
    expect(auth.last().reason).toBe("signed_in_elsewhere");

    // The browser leaves for the provider and comes back to a page loaded afresh: the app starts over and asks who is in.
    const redirect = await startSignIn({ provider: "microsoft", returnTo: "/app/welcome" });
    expect(redirect.method).toBe("redirect");
    expect(finishMockSignIn("marko", "/app/welcome")).toBe("/app/welcome");
    startSession();
    await expect(client.getMe()).resolves.toMatchObject({ schoolEmail: EMAIL });
    expect(getSessionEnd()).toBeNull();
  });
});

describe("signing out", () => {
  it("stays signed in when the server cannot be reached, and says why", async () => {
    vi.spyOn(client, "signOut").mockRejectedValue(new ApiError("network"));
    await expect(signOut()).rejects.toMatchObject({ code: "network" });
    expect(getSessionEnd()).toBeNull();
  });

  it("counts a session the server already ended as signed out", async () => {
    vi.spyOn(client, "signOut").mockRejectedValue(new ApiError("unauthenticated"));
    await signOut();
    expect(getSessionEnd()).toBe("signed_out");
  });
});

describe("signing in", () => {
  it("does not sign anyone in with a personal account, and sends the browser back with the reason", async () => {
    actions.signOut();
    await startSignIn({ provider: "google" });
    expect(finishMockSignIn("personal", "/app/welcome?next=%2Fapp%2Fcheckin%2FMATH-7B")).toBe(
      "/app/welcome?next=%2Fapp%2Fcheckin%2FMATH-7B&error=unknown_email",
    );
    await expect(client.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("does not sign anyone in when the student cancels at the provider", async () => {
    actions.signOut();
    expect(finishMockSignIn("cancel", "/app/welcome")).toBe("/app/welcome?error=sign_in_failed");
    await expect(client.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("comes back only to a path of the app", () => {
    actions.signOut();
    expect(finishMockSignIn("marko", "https://evil.example/app")).toBe("/app/welcome");
    expect(finishMockSignIn("marko", "//evil.example")).toBe("/app/welcome");
  });

  it("cannot start without a network, as for real", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(startSignIn({ provider: "google" })).rejects.toMatchObject({ code: "network" });
  });
});
