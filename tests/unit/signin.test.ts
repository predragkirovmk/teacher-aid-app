import { describe, expect, it } from "vitest";
import { cleanCode, emailError, normalizeEmail, safeNext, welcomeUrl } from "@/lib/app/signin";

describe("the email field", () => {
  it("is empty, incomplete or fine", () => {
    expect(emailError("")).toBe("empty");
    expect(emailError("   ")).toBe("empty");
    for (const bad of ["marko", "marko@", "@school.mk", "marko@school", "mar ko@school.mk", "a@b@c.mk", "marko@school."]) {
      expect(emailError(bad), bad).toBe("invalid");
    }
    for (const ok of ["marko.trajkovski@student.gnaumov.edu.mk", " Marko@School.MK ", "m+tag@a.mk"]) expect(emailError(ok), ok).toBeNull();
  });

  it("is sent trimmed and in lower case", () => {
    expect(normalizeEmail("  Marko.T@School.MK ")).toBe("marko.t@school.mk");
  });
});

describe("the code field", () => {
  it("keeps only digits, as many as the code has", () => {
    expect(cleanCode("123456", 6)).toBe("123456");
    expect(cleanCode("12 34-56", 6)).toBe("123456");
    expect(cleanCode("1234567", 6)).toBe("123456");
    expect(cleanCode("code: 98", 6)).toBe("98");
    expect(cleanCode("abc", 6)).toBe("");
  });
});

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
