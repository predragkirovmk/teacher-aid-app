import { describe, expect, test } from "vitest";
import type { CourseSummary } from "@/lib/teacher/api/types";
import { backFromLesson, FROM_TODAY, lessonUrl, liveUrl } from "@/lib/teacher/routes";
import { chosenCourse, courseLabel, offeredCourses, onlyCourse, startView } from "@/lib/teacher/start";

const course = (id: string, subject: string, name: string, year: number, students = 25): CourseSummary => ({
  id,
  subject: { id: subject, name: subject === "math" ? "Математика" : "Физика" },
  class: { id: `class-${id}`, name, year },
  student_count: students,
  speed_bonus_on: true,
  lessons_run: 6,
  last_session_at: null,
});

const II4 = course("c1", "math", "II-4", 2, 26);
const III5 = course("c2", "math", "III-5", 3, 24);
const IV1 = course("c3", "math", "IV-1", 4, 28);
const PHYSICS = course("c4", "physics", "II-4", 2);
const lesson = (subject: string, year: number) => ({ subject: { id: subject }, year });

describe("which classes a lesson can be started with", () => {
  test("only the classes of the lesson's subject", () => {
    expect(offeredCourses([II4, PHYSICS, III5], lesson("math", 2)).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(offeredCourses([II4, PHYSICS, III5], lesson("physics", 2)).map((c) => c.id)).toEqual(["c4"]);
  });

  test("the classes in the lesson's own year come first, the rest keep the API's order", () => {
    expect(offeredCourses([II4, III5, IV1], lesson("math", 4)).map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
    expect(offeredCourses([II4, III5, IV1], lesson("math", 3)).map((c) => c.id)).toEqual(["c2", "c1", "c3"]);
    // No class in that year: the order is the API's.
    expect(offeredCourses([II4, III5, IV1], lesson("math", 1)).map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  test("a subject the teacher has no class for offers nothing", () => {
    expect(offeredCourses([II4, III5], lesson("chemistry", 2))).toEqual([]);
    expect(offeredCourses([], lesson("math", 2))).toEqual([]);
  });

  test("the list handed in is not changed", () => {
    const all = [II4, III5, IV1];
    offeredCourses(all, lesson("math", 4));
    expect(all.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });
});

describe("which class is chosen", () => {
  test("one is chosen before the teacher chooses only when there is exactly one", () => {
    expect(onlyCourse([II4])).toBe("c1");
    expect(onlyCourse([II4, III5])).toBeNull();
    expect(onlyCourse([])).toBeNull();
  });

  test("the teacher's pick is used, and the only class when nothing was picked", () => {
    expect(chosenCourse([II4, III5], "c2")).toBe(III5);
    expect(chosenCourse([II4], null)).toBe(II4);
    expect(chosenCourse([II4], "c1")).toBe(II4);
  });

  test("with several classes and no pick, nothing starts", () => {
    expect(chosenCourse([II4, III5], null)).toBeNull();
  });

  test("a pick that is not among the classes offered (the list changed under the window) starts nothing", () => {
    expect(chosenCourse([II4, III5], "c9")).toBeNull();
    expect(chosenCourse([II4], "c9")).toBeNull();
    expect(chosenCourse([], "c1")).toBeNull();
  });
});

describe("what the window says", () => {
  test("a lesson that is already running is told first, whatever the classes are", () => {
    expect(startView(true, [II4, III5])).toBe("running");
    expect(startView(true, [])).toBe("running");
  });

  test("with nothing running: the choice, or that there is no class for the subject", () => {
    expect(startView(false, [II4])).toBe("choose");
    expect(startView(false, [II4, III5])).toBe("choose");
    expect(startView(false, [])).toBe("no-class");
  });

  test("a running lesson is named by its subject and class", () => {
    expect(courseLabel("Математика", "II-4")).toBe("Математика, II-4");
  });
});

describe("addresses and Back", () => {
  test("a lesson is linked with where the teacher came from, and the live lesson by its session", () => {
    expect(lessonUrl("l-procenti")).toBe("/teacher/lessons/l-procenti");
    expect(lessonUrl("l-procenti", FROM_TODAY)).toBe("/teacher/lessons/l-procenti?from=today");
    expect(liveUrl("s-n1")).toBe("/teacher/live/s-n1");
    // An id is one segment of the path, whatever it holds.
    expect(lessonUrl("a/b?c")).toBe("/teacher/lessons/a%2Fb%3Fc");
  });

  test("Back goes to Today when the teacher came from Today, and to the lessons otherwise", () => {
    expect(backFromLesson("today")).toEqual({ href: "/teacher", label: "back.today" });
    expect(backFromLesson(null)).toEqual({ href: "/teacher/lessons", label: "back.lessons" });
    expect(backFromLesson("")).toEqual({ href: "/teacher/lessons", label: "back.lessons" });
    expect(backFromLesson("somewhere-else")).toEqual({ href: "/teacher/lessons", label: "back.lessons" });
  });
});
