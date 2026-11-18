import { describe, expect, test } from "vitest";
import { backFromDraft, backFromLesson, backFromLibraryLesson, draftUrl, FROM_GUIDE, FROM_LIBRARY, fromOf, isSaved, lessonUrl, liveUrl, newLessonUrl, savedLessonUrl, showsOpenLesson, TEMPLATES_ANCHOR } from "@/lib/teacher/routes";

describe("where a lesson that is running is said in the frame", () => {
  test("on every page but the running lesson's own screen", () => {
    for (const path of ["/teacher", "/teacher/lessons/new", "/teacher/lessons/l-procenti", "/teacher/library", "/teacher/settings", "/teacher/help"]) {
      expect(showsOpenLesson(path, "s-1"), path).toBe(true);
    }
    expect(showsOpenLesson(liveUrl("s-1"), "s-1")).toBe(false);
  });

  test("on the screen of a lesson that is not the one running, it still says so", () => {
    expect(showsOpenLesson(liveUrl("s-old"), "s-1")).toBe(true);
  });
});

describe("the addresses of lessons", () => {
  test("a lesson says where it was opened from, and Back goes there", () => {
    expect(lessonUrl("l-a b", FROM_LIBRARY)).toBe("/teacher/lessons/l-a%20b?from=library");
    expect(backFromLesson("library")).toEqual({ href: "/teacher/library", label: "back.library" });
    expect(backFromLesson(null)).toEqual({ href: "/teacher", label: "back.lessons" });
    expect(backFromLesson("elsewhere")).toEqual({ href: "/teacher", label: "back.lessons" });
  });

  test("a draft says where the teacher started too, so its Back goes there", () => {
    expect(draftUrl("d 1")).toBe("/teacher/lessons/drafts/d%201");
    expect(draftUrl("d1", FROM_LIBRARY)).toBe("/teacher/lessons/drafts/d1?from=library");
    expect(backFromLesson("library")).toEqual({ href: "/teacher/library", label: "back.library" });
  });

  test("a draft whose refinement was undone says so once, in the address", () => {
    expect(draftUrl("d1", undefined, true)).toBe("/teacher/lessons/drafts/d1?undone=1");
    expect(draftUrl("d1", FROM_LIBRARY, true)).toBe("/teacher/lessons/drafts/d1?from=library&undone=1");
    expect(draftUrl("d1", FROM_LIBRARY, false)).toBe("/teacher/lessons/drafts/d1?from=library");
  });

  test("a draft of a saved lesson goes back to that lesson, whichever state it is in; a draft of a new one goes where the teacher started", () => {
    expect(backFromDraft("library", "l-1")).toEqual({ href: "/teacher/lessons/l-1?from=library", label: "back.lesson" });
    expect(backFromDraft(null, "l-1")).toEqual({ href: "/teacher/lessons/l-1", label: "back.lesson" });
    // Only the Library is passed on to a lesson: the guide has nothing to do with a lesson that was already saved.
    expect(backFromDraft("guide", "l-1")).toEqual({ href: "/teacher/lessons/l-1", label: "back.lesson" });
    expect(backFromDraft("library", null)).toEqual({ href: "/teacher/library", label: "back.library" });
    expect(backFromDraft(null, undefined)).toEqual({ href: "/teacher", label: "back.lessons" });
  });

  test("the first lesson is prepared from the guide, and Back goes back to it", () => {
    expect(newLessonUrl(FROM_GUIDE)).toBe("/teacher/lessons/new?from=guide");
    expect(newLessonUrl(FROM_LIBRARY)).toBe("/teacher/lessons/new?from=library");
    expect(newLessonUrl()).toBe("/teacher/lessons/new");
    expect(backFromLesson("guide")).toEqual({ href: "/teacher/welcome", label: "back.guide" });
    expect(draftUrl("d1", FROM_GUIDE)).toBe("/teacher/lessons/drafts/d1?from=guide");
  });

  test("only the two places a page knows are passed on to the next", () => {
    expect(fromOf("library")).toBe("library");
    expect(fromOf("guide")).toBe("guide");
    expect(fromOf("elsewhere")).toBeUndefined();
    expect(fromOf(null)).toBeUndefined();
  });

  test("a lesson that has just been saved says so, in the address, and only a save says it", () => {
    expect(savedLessonUrl("l-n1", "new")).toBe("/teacher/lessons/l-n1?saved=new");
    expect(savedLessonUrl("l-n1", "changes", FROM_LIBRARY)).toBe("/teacher/lessons/l-n1?from=library&saved=changes");
    expect(isSaved("new")).toBe(true);
    expect(isSaved("changes")).toBe(true);
    expect(isSaved("yes")).toBe(false);
    expect(isSaved(null)).toBe(false);
  });
});

describe("the Library", () => {
  test("Back from a template goes to the templates, not to the teacher's own lessons", () => {
    expect(backFromLibraryLesson()).toEqual({ href: `/teacher/library#${TEMPLATES_ANCHOR}`, label: "back.library" });
  });
});
