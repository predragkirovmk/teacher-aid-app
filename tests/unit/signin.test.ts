import { describe, expect, it } from "vitest";
import { PROVIDERS, isAppPath, isProvider, providerName, safeNext, welcomeUrl, withError } from "@/lib/app/signin";

describe("where signing in goes next", () => {
  it("is a screen of the app, such as a check-in link", () => {
    expect(safeNext("/app")).toBe("/app");
    expect(safeNext("/app/checkin/MATH-7B")).toBe("/app/checkin/MATH-7B");
    expect(safeNext("/app/play/AbC_123-x.y")).toBe("/app/play/AbC_123-x.y");
    expect(safeNext("/app/checkin/%D0%9C%D0%90")).toBe("/app/checkin/%D0%9C%D0%90");
  });

  it("is nothing for anything else", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "/app/welcome",
      "/",
      "/other",
      "//evil.example/app",
      "https://evil.example/app",
      "/app/../admin",
      "/app/%2e%2e/admin",
      "/app/./x",
      "/app/x?y=1",
      "/app/x#y",
      "/appx",
      "/app//x",
      "javascript:alert(1)",
    ]) {
      expect(safeNext(bad), String(bad)).toBeNull();
    }
  });

  it("is carried through the welcome screen in the address", () => {
    expect(welcomeUrl("/app/checkin/MATH-7B")).toBe("/app/welcome?next=%2Fapp%2Fcheckin%2FMATH-7B");
    expect(welcomeUrl("/app")).toBe("/app/welcome?next=%2Fapp");
    expect(welcomeUrl()).toBe("/app/welcome");
    // and read back unchanged
    const url = new URL(welcomeUrl("/app/checkin/MATH-7B"), "https://x.test");
    expect(safeNext(url.searchParams.get("next"))).toBe("/app/checkin/MATH-7B");
  });
});

describe("the providers", () => {
  it("are Google and Microsoft, in that order, and nothing else", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(["google", "microsoft"]);
    expect(providerName("microsoft")).toBe("Microsoft");
    expect(isProvider("google")).toBe(true);
    for (const other of ["yahoo", "", null, undefined, "Google"]) expect(isProvider(other), String(other)).toBe(false);
  });
});

describe("where a sign-in may come back to", () => {
  it("is a path of the app, with a query if it has one", () => {
    expect(isAppPath("/app")).toBe(true);
    expect(isAppPath("/app/welcome?next=%2Fapp%2Fcheckin%2FMATH-7B")).toBe(true);
    for (const bad of [null, undefined, "", "/", "/appx", "/app-x", "//evil.example/app", "https://evil.example/app", "app/welcome"]) {
      expect(isAppPath(bad), String(bad)).toBe(false);
    }
  });

  it("is told of a refusal in the query, added to one that is there", () => {
    expect(withError("/app/welcome", "unknown_email")).toBe("/app/welcome?error=unknown_email");
    expect(withError("/app/welcome?next=%2Fapp", "sign_in_failed")).toBe("/app/welcome?next=%2Fapp&error=sign_in_failed");
  });
});
