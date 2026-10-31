import { describe, expect, test } from "vitest";
import { backFromLesson, draftUrl, FROM_GUIDE, FROM_TODAY, fromOf, isSaved, lessonUrl, liveUrl, newLessonUrl, savedLessonUrl, showsOpenLesson } from "@/lib/teacher/routes";

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

  test("a draft whose refinement was undone says so once, in the address", () => {
    expect(draftUrl("d1", undefined, true)).toBe("/teacher/lessons/drafts/d1?undone=1");
    expect(draftUrl("d1", FROM_TODAY, true)).toBe("/teacher/lessons/drafts/d1?from=today&undone=1");
    expect(draftUrl("d1", FROM_TODAY, false)).toBe("/teacher/lessons/drafts/d1?from=today");
  });

  test("the first lesson is prepared from the guide, and Back goes back to it", () => {
    expect(newLessonUrl(FROM_GUIDE)).toBe("/teacher/lessons/new?from=guide");
    expect(newLessonUrl(FROM_TODAY)).toBe("/teacher/lessons/new?from=today");
    expect(newLessonUrl()).toBe("/teacher/lessons/new");
    expect(backFromLesson("guide")).toEqual({ href: "/teacher/welcome", label: "back.guide" });
    expect(draftUrl("d1", FROM_GUIDE)).toBe("/teacher/lessons/drafts/d1?from=guide");
  });

  test("only the two places a page knows are passed on to the next", () => {
    expect(fromOf("today")).toBe("today");
    expect(fromOf("guide")).toBe("guide");
    expect(fromOf("elsewhere")).toBeUndefined();
    expect(fromOf(null)).toBeUndefined();
  });

  test("a lesson that has just been saved says so, in the address, and only a save says it", () => {
    expect(savedLessonUrl("l-n1", "new")).toBe("/teacher/lessons/l-n1?saved=new");
    expect(savedLessonUrl("l-n1", "changes", FROM_TODAY)).toBe("/teacher/lessons/l-n1?from=today&saved=changes");
    expect(isSaved("new")).toBe(true);
    expect(isSaved("changes")).toBe(true);
    expect(isSaved("yes")).toBe(false);
    expect(isSaved(null)).toBe(false);
  });
});
