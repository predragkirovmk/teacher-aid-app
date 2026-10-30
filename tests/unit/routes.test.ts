import { describe, expect, test } from "vitest";
import { backFromLesson, draftUrl, FROM_TODAY, lessonUrl, liveUrl, showsOpenLesson } from "@/lib/teacher/routes";

describe("where a lesson that is running is said in the frame", () => {
  test("on every page but Today, which has its band, and the running lesson's own screen", () => {
    for (const path of ["/teacher/lessons", "/teacher/lessons/new", "/teacher/lessons/l-procenti", "/teacher/classes", "/teacher/library", "/teacher/settings", "/teacher/help"]) {
      expect(showsOpenLesson(path, "s-1"), path).toBe(true);
    }
    expect(showsOpenLesson("/teacher", "s-1")).toBe(false);
    expect(showsOpenLesson(liveUrl("s-1"), "s-1")).toBe(false);
  });

  test("on the screen of a lesson that is not the one running, it still says so", () => {
    expect(showsOpenLesson(liveUrl("s-old"), "s-1")).toBe(true);
  });
});

describe("the addresses of lessons", () => {
  test("a lesson says where it was opened from, and Back goes there", () => {
    expect(lessonUrl("l-a b", FROM_TODAY)).toBe("/teacher/lessons/l-a%20b?from=today");
    expect(backFromLesson("today")).toEqual({ href: "/teacher", label: "back.today" });
    expect(backFromLesson(null)).toEqual({ href: "/teacher/lessons", label: "back.lessons" });
    expect(backFromLesson("elsewhere")).toEqual({ href: "/teacher/lessons", label: "back.lessons" });
  });

  test("a draft says where the teacher started too, so its Back goes there", () => {
    expect(draftUrl("d 1")).toBe("/teacher/lessons/drafts/d%201");
    expect(draftUrl("d1", FROM_TODAY)).toBe("/teacher/lessons/drafts/d1?from=today");
    expect(backFromLesson("today")).toEqual({ href: "/teacher", label: "back.today" });
  });
});
