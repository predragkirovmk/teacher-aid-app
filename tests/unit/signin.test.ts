import { describe, expect, test } from "vitest";
import {
  GUIDE,
  guideUrl,
  isNotice,
  isProvider,
  isRefusal,
  isSafeRedirect,
  isTeacherPath,
  PROVIDERS,
  providerName,
  safeNext,
  SIGN_IN,
  signInUrl,
  TODAY,
  withError,
} from "@/lib/teacher/signin";

describe("where a sign-in goes next", () => {
  test("is a page of the teacher app", () => {
    for (const ok of ["/teacher", "/teacher/classes", "/teacher/lessons/new", "/teacher/lessons/l-nizi", "/teacher/a.b_c~d-e", "/teacher/%D0%9B%D0%B5%D0%BA%D1%86%D0%B8%D0%B8"]) {
      expect(safeNext(ok), ok).toBe(ok);
    }
  });

  test("is nothing for a link to another place: no open redirect", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "/",
      "/other",
      "/app",
      "/app/welcome",
      "//evil.example",
      "//evil.example/teacher",
      "/teacher//evil.example",
      "///evil.example",
      "https://evil.example/teacher",
      "http://localhost/teacher",
      "javascript:alert(1)",
      "data:text/html,x",
      "teacher/classes",
      "/teachers",
      "/teacher.evil.example",
      "/teacher@evil.example",
      "/teacher:80",
      "/teacher\\evil.example",
      "/teacher/\\evil.example",
      "/teacher/%5Cevil.example",
      "/teacher/..",
      "/teacher/../admin",
      "/teacher/%2e%2e/admin",
      "/teacher/%2E%2E",
      "/teacher/./x",
      "/teacher/%2e/x",
      "/teacher/a%2Fb",
      "/teacher/a%5Cb",
      "/teacher/%zz",
      "/teacher/x?y=1",
      "/teacher/x#y",
      "/teacher/ x",
      "/teacher/x\n",
      "/teacher/x\t",
      "/teacher/",
      `/teacher/${"a".repeat(300)}`,
    ]) {
      expect(safeNext(bad), String(bad)).toBeNull();
    }
  });

  test("is never the sign-in screen, the guide or the old signed-out address: that would go in circles", () => {
    expect(safeNext(SIGN_IN)).toBeNull();
    expect(safeNext(GUIDE)).toBeNull();
    expect(safeNext("/teacher/signed-out")).toBeNull();
    // Their sub-paths are not them.
    expect(safeNext("/teacher/sign-in-help")).toBe("/teacher/sign-in-help");
  });
});

describe("the address of the sign-in screen", () => {
  test("carries the page that was asked for, and why the teacher is here", () => {
    expect(signInUrl()).toBe("/teacher/sign-in");
    expect(signInUrl({ next: "/teacher/classes" })).toBe("/teacher/sign-in?next=%2Fteacher%2Fclasses");
    expect(signInUrl({ notice: "signed_out" })).toBe("/teacher/sign-in?reason=signed_out");
    expect(signInUrl({ next: "/teacher/classes", notice: "expired" })).toBe("/teacher/sign-in?reason=expired&next=%2Fteacher%2Fclasses");
  });

  test("does not carry Today (it is where a sign-in goes anyway) or anything unsafe", () => {
    expect(signInUrl({ next: TODAY })).toBe("/teacher/sign-in");
    for (const bad of ["//evil.example", "https://evil.example", "/app", "/teacher/x?y=1", SIGN_IN, GUIDE]) {
      expect(signInUrl({ next: bad }), bad).toBe("/teacher/sign-in");
    }
  });

  test("is read back unchanged", () => {
    const url = new URL(signInUrl({ next: "/teacher/lessons/new" }), "https://x.test");
    expect(safeNext(url.searchParams.get("next"))).toBe("/teacher/lessons/new");
  });

  test("the guide carries the page the first sign-in was heading for", () => {
    expect(guideUrl()).toBe("/teacher/welcome");
    expect(guideUrl(TODAY)).toBe("/teacher/welcome");
    expect(guideUrl("/teacher/classes")).toBe("/teacher/welcome?next=%2Fteacher%2Fclasses");
    expect(guideUrl("//evil.example")).toBe("/teacher/welcome");
  });
});

describe("where a provider's callback may send the browser back to", () => {
  test("is a path of the teacher app, with a query if it has one", () => {
    expect(isTeacherPath("/teacher")).toBe(true);
    expect(isTeacherPath("/teacher/sign-in")).toBe(true);
    expect(isTeacherPath("/teacher/sign-in?next=%2Fteacher%2Fclasses")).toBe(true);
    expect(isTeacherPath("/teacher?x=1")).toBe(true);
  });

  test("is nothing else", () => {
    for (const bad of [null, undefined, "", "/", "/app", "/app/welcome", "/teachers", "/teacher-x", "//evil.example", "https://evil.example/teacher", "/teacher//x", "/teacher\\x", "/teacher/x y", "/teacher#x", "teacher"]) {
      expect(isTeacherPath(bad), String(bad)).toBe(false);
    }
  });

  test("is told of a refusal in the query, added to one that is there", () => {
    expect(withError("/teacher/sign-in", "unknown_email")).toBe("/teacher/sign-in?error=unknown_email");
    expect(withError("/teacher/sign-in?next=%2Fteacher%2Fclasses", "sign_in_failed")).toBe("/teacher/sign-in?next=%2Fteacher%2Fclasses&error=sign_in_failed");
  });

  test("the screen takes only the two refusals the callback sends, and only the two notices it knows", () => {
    expect(isRefusal("unknown_email")).toBe(true);
    expect(isRefusal("sign_in_failed")).toBe(true);
    for (const other of ["network", "unauthenticated", "server_error", "", null, undefined, "UNKNOWN_EMAIL"]) expect(isRefusal(other), String(other)).toBe(false);
    expect(isNotice("signed_out")).toBe(true);
    expect(isNotice("expired")).toBe(true);
    for (const other of ["", "unauthenticated", "<script>", null]) expect(isNotice(other), String(other)).toBe(false);
  });
});

describe("where the browser is sent to reach a provider", () => {
  test("is the provider's own https address, or in the demo a page of this app", () => {
    expect(isSafeRedirect("https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y")).toBe(true);
    expect(isSafeRedirect("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")).toBe(true);
    expect(isSafeRedirect("/teacher/sign-in?demo_provider=google&return_to=%2Fteacher%2Fsign-in")).toBe(true);
  });

  test("is never a script, a plain http address, a protocol-relative one or something that is not text", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://accounts.google.com", "//evil.example", "/\\evil.example", "", "not a url", null, undefined, 7, {}, `https://x.example/${"a".repeat(5000)}`]) {
      expect(isSafeRedirect(bad), String(bad)).toBe(false);
    }
  });
});

describe("the providers", () => {
  test("are Google and Microsoft, in that order, and nothing else", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(["google", "microsoft"]);
    expect(providerName("microsoft")).toBe("Microsoft");
    expect(isProvider("google")).toBe(true);
    for (const other of ["yahoo", "", null, undefined, "Google"]) expect(isProvider(other), String(other)).toBe(false);
  });
});
