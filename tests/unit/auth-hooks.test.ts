// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import { MOCK_CODE, MOCK_ROSTER } from "@/lib/app/api/mock/roster";
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
const { completeSignIn, signOut, startSignIn, useAuth } = await import("@/lib/app/api/hooks");

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

  it("is signed in again after the code is typed, with no reason left over", async () => {
    const auth = mountAuth();
    actions.signOutElsewhere();
    await flush();
    expect(auth.last().reason).toBe("signed_in_elsewhere");

    const challenge = await startSignIn({ schoolEmail: EMAIL });
    expect(challenge.method).toBe("code");
    await act(async () => {
      await completeSignIn({ schoolEmail: EMAIL, code: MOCK_CODE });
    });
    expect(auth.last()).toMatchObject({ status: "signedIn", reason: undefined });
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
  it("does not sign anyone in on a wrong code", async () => {
    actions.signOut();
    await startSignIn({ schoolEmail: EMAIL });
    await expect(completeSignIn({ schoolEmail: EMAIL, code: "000000" })).rejects.toMatchObject({ code: "invalid_code" });
    await expect(client.getMe()).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
