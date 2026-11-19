import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/teacher/api/errors";
import { backFromLesson, FROM_LIBRARY, lessonUrl, liveUrl } from "@/lib/teacher/routes";
import { startNotice } from "@/lib/teacher/start";

describe("what a start that did not go through says", () => {
  test("a lesson that is already open is news with the way back, not an error", () => {
    expect(startNotice(new ApiError("session_open", { status: 409 }))).toBe("running");
  });

  test("any other failure is said as it is", () => {
    for (const code of ["network", "not_found", "server_error", "rate_limited"] as const) expect(startNotice(new ApiError(code))).toBe("failed");
    expect(startNotice(new Error("boom"))).toBe("failed");
    expect(startNotice(null)).toBe("failed");
  });
});

describe("addresses and Back", () => {
  test("a lesson is linked with where the teacher came from, and the live lesson by its session", () => {
    expect(lessonUrl("l-procenti")).toBe("/teacher/lessons/l-procenti");
    expect(lessonUrl("l-procenti", FROM_LIBRARY)).toBe("/teacher/lessons/l-procenti?from=library");
    expect(liveUrl("s-n1")).toBe("/teacher/live/s-n1");
    // An id is one segment of the path, whatever it holds.
    expect(lessonUrl("a/b?c")).toBe("/teacher/lessons/a%2Fb%3Fc");
  });

  test("Back goes to the Library when the teacher came from it, and to the lessons otherwise", () => {
    expect(backFromLesson("library")).toEqual({ href: "/teacher/library", label: "back.library" });
    expect(backFromLesson(null)).toEqual({ href: "/teacher", label: "back.lessons" });
    expect(backFromLesson("")).toEqual({ href: "/teacher", label: "back.lessons" });
    expect(backFromLesson("somewhere-else")).toEqual({ href: "/teacher", label: "back.lessons" });
  });
});
