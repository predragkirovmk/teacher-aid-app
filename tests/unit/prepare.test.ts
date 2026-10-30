import { describe, expect, test } from "vitest";
import { ApiError, VALIDATION_REASONS } from "@/lib/teacher/api/errors";
import type { CourseSummary } from "@/lib/teacher/api/types";
import { dictionaries, translate, type Key } from "@/lib/teacher/i18n";
import { EMPHASIS_MAX_CHARS, LESSON_UPLOAD_MAX_BYTES, TYPED_TEXT_MIN_CHARS } from "@/lib/teacher/lessons";
import {
  checkFile,
  checkForm,
  checkText,
  chosenSubject,
  chosenYear,
  classesOf,
  emphasisOf,
  failureOf,
  fileSize,
  firstProblem,
  focusKeyOf,
  hasWork,
  materialProblemOf,
  showsEmphasisCount,
  sourceToKeep,
  STILL_WORKING_MS,
  subjectsOf,
  WAIT_LIMIT_MS,
  yearsOf,
  type FormInput,
} from "@/lib/teacher/prepare";

const course = (id: string, subject: string, className: string, year: number): CourseSummary => ({
  id,
  subject: { id: subject, name: subject.toUpperCase() },
  class: { id: `c-${className}`, name: className, year },
  student_count: 20,
  speed_bonus_on: true,
  lessons_run: 0,
  last_session_at: null,
});

const SCHOOL = [course("1", "math", "IV-1", 4), course("2", "math", "II-4", 2), course("3", "math", "II-6", 2), course("4", "physics", "III-5", 3)];
const MATH_ONLY = SCHOOL.filter((c) => c.subject.id === "math");

describe("the subjects and years a teacher is offered (part 1)", () => {
  test("the subjects of the teacher's courses, each once, in the API's order", () => {
    expect(subjectsOf(SCHOOL).map((s) => s.id)).toEqual(["math", "physics"]);
    expect(subjectsOf([])).toEqual([]);
  });

  test("the years are the teacher's own classes' years in that subject, each once, the first year first", () => {
    expect(yearsOf(SCHOOL, "math")).toEqual([2, 4]);
    expect(yearsOf(SCHOOL, "physics")).toEqual([3]);
    expect(yearsOf(SCHOOL, "chemistry")).toEqual([]);
    // Until a subject is chosen no year is offered.
    expect(yearsOf(SCHOOL, null)).toEqual([]);
  });

  test("a year can be told by its classes", () => {
    expect(classesOf(SCHOOL, "math", 2)).toEqual(["II-4", "II-6"]);
    expect(classesOf(SCHOOL, "math", 3)).toEqual([]);
    expect(classesOf(SCHOOL, "physics", 3)).toEqual(["III-5"]);
  });

  test("a subject or a year that is the only one is chosen already; nothing else is", () => {
    const [math, physics] = subjectsOf(SCHOOL);
    expect(chosenSubject([math], null)).toBe("math");
    expect(chosenSubject([math, physics], null)).toBeNull();
    expect(chosenSubject([math, physics], "physics")).toBe("physics");
    // A pick that is not offered is no pick.
    expect(chosenSubject([math, physics], "chemistry")).toBeNull();
    expect(chosenSubject([], null)).toBeNull();
    expect(chosenYear([3], null)).toBe(3);
    expect(chosenYear([2, 4], null)).toBeNull();
    expect(chosenYear([2, 4], 4)).toBe(4);
    expect(chosenYear([2, 4], 3)).toBeNull();
    expect(chosenYear([], null)).toBeNull();
  });

  test("a teacher with one subject and several years is offered the years only", () => {
    expect(subjectsOf(MATH_ONLY)).toHaveLength(1);
    expect(yearsOf(MATH_ONLY, chosenSubject(subjectsOf(MATH_ONLY), null))).toEqual([2, 4]);
  });
});

describe("a document, judged before it is sent (BR-LES-05)", () => {
  test("a PDF or a Word (.docx) file is taken, whatever the case of its name", () => {
    expect(checkFile({ name: "план.pdf", size: 1000 })).toBeNull();
    expect(checkFile({ name: "План.DOCX", size: 1000 })).toBeNull();
    expect(checkFile({ name: "a.b.c.pdf", size: 1 })).toBeNull();
  });

  test("anything else is the wrong type, the old .doc too", () => {
    for (const name of ["план.doc", "слика.png", "табела.xlsx", "pdf", "план.pdf.exe", ""]) expect(checkFile({ name, size: 1000 }), name).toBe("file_type");
  });

  test("an empty file is empty, and one over 20 MB is too large; 20 MB itself is fine", () => {
    expect(checkFile({ name: "празен.pdf", size: 0 })).toBe("empty");
    expect(checkFile({ name: "голем.pdf", size: LESSON_UPLOAD_MAX_BYTES })).toBeNull();
    expect(checkFile({ name: "голем.pdf", size: LESSON_UPLOAD_MAX_BYTES + 1 })).toBe("file_too_large");
  });

  test("the type is judged first: a picture that is empty is not a PDF", () => {
    expect(checkFile({ name: "празна.png", size: 0 })).toBe("file_type");
  });
});

describe("typed sentences, judged before they are sent (BR-LES-06)", () => {
  test("nothing, and only spaces, is none", () => {
    expect(checkText("")).toBe("text_none");
    expect(checkText("   \n  ")).toBe("text_none");
  });

  test("fewer than 40 characters is too short, 40 is enough, and spaces around do not count", () => {
    expect(checkText("x".repeat(TYPED_TEXT_MIN_CHARS - 1))).toBe("text_too_short");
    expect(checkText("x".repeat(TYPED_TEXT_MIN_CHARS))).toBeNull();
    expect(checkText(`  ${"x".repeat(TYPED_TEXT_MIN_CHARS - 1)}  `)).toBe("text_too_short");
    expect(checkText(`  ${"x".repeat(TYPED_TEXT_MIN_CHARS)}  `)).toBeNull();
  });
});

describe("the whole form", () => {
  const good: FormInput = { subject: "math", year: 2, needsYear: true, kind: "typed", file: null, text: "x".repeat(60) };

  test("a form with everything in it has no problems", () => {
    expect(checkForm(good)).toEqual({});
    expect(checkForm({ ...good, kind: "file", file: { name: "план.pdf", size: 10 }, text: "" })).toEqual({});
  });

  test("nothing chosen asks for the subject and for how the material is added, and not yet for the year", () => {
    expect(checkForm({ subject: null, year: null, needsYear: false, kind: null, file: null, text: "" })).toEqual({ subject: true, material: "pick" });
  });

  test("a subject with no year chosen asks for the year", () => {
    expect(checkForm({ ...good, year: null })).toEqual({ year: true });
  });

  test("the document kind with no document says so; with a wrong one it says what is wrong", () => {
    expect(checkForm({ ...good, kind: "file" })).toEqual({ material: "no_file" });
    expect(checkForm({ ...good, kind: "file", file: { name: "план.doc", size: 10 } })).toEqual({ material: "file_type" });
    expect(checkForm({ ...good, kind: "file", file: { name: "план.pdf", size: 0 } })).toEqual({ material: "empty" });
    expect(checkForm({ ...good, kind: "file", file: { name: "план.pdf", size: LESSON_UPLOAD_MAX_BYTES + 1 } })).toEqual({ material: "file_too_large" });
  });

  test("a document left over from before the teacher chose to type is not looked at", () => {
    expect(checkForm({ ...good, kind: "typed", file: { name: "план.doc", size: 10 } })).toEqual({});
  });

  test("typed sentences that are missing or short say so", () => {
    expect(checkForm({ ...good, text: "" })).toEqual({ material: "text_none" });
    expect(checkForm({ ...good, text: "Кратко." })).toEqual({ material: "text_too_short" });
  });

  test("the first problem is the top-most one, and the focus goes to the control that fixes it", () => {
    expect(firstProblem({})).toBeNull();
    expect(firstProblem({ material: "pick", year: true })).toBe("year");
    expect(firstProblem({ material: "pick", subject: true })).toBe("subject");
    expect(firstProblem({ material: "no_file" })).toBe("material");
    expect(focusKeyOf("subject", { subject: true }, null)).toBe("subject");
    expect(focusKeyOf("year", { year: true }, null)).toBe("year");
    expect(focusKeyOf("material", { material: "pick" }, null)).toBe("kind");
    expect(focusKeyOf("material", { material: "no_file" }, "file")).toBe("file");
    expect(focusKeyOf("material", { material: "no_text" }, "file")).toBe("file");
    expect(focusKeyOf("material", { material: "text_too_short" }, "typed")).toBe("text");
  });
});

describe("a refusal of the material, said at part 2 (EC-LES-06, EC-LES-07)", () => {
  const refused = (reason?: (typeof VALIDATION_REASONS)[number]) => new ApiError("validation_failed", { status: 422, reason });

  test("every reason the API gives is its own problem", () => {
    for (const reason of VALIDATION_REASONS) expect(materialProblemOf(refused(reason))).toBe(reason);
  });

  test("every reason has its own words, in both languages", () => {
    for (const reason of VALIDATION_REASONS) {
      for (const locale of ["mk", "en"] as const) {
        expect(dictionaries[locale][`prepare.problem.${reason}.title` as Key], `${locale} ${reason} title`).toBeTruthy();
        expect(dictionaries[locale][`prepare.problem.${reason}.body` as Key], `${locale} ${reason} body`).toBeTruthy();
      }
    }
  });

  test("a refusal with no reason is a problem the form has no sentence for; anything else is not a refusal of the material", () => {
    expect(materialProblemOf(refused())).toBe("other");
    expect(materialProblemOf(new ApiError("network"))).toBeNull();
    expect(materialProblemOf(new ApiError("generation_failed"))).toBeNull();
    expect(materialProblemOf(new Error("x"))).toBeNull();
    expect(materialProblemOf(null)).toBeNull();
  });
});

describe("what the teacher would have to do again (leaving the form asks first)", () => {
  const empty = { file: null, text: "", emphasis: "" };

  test("a form with nothing typed or chosen as a document holds no work, however many years and kinds were picked", () => {
    expect(hasWork(empty)).toBe(false);
    expect(hasWork({ ...empty, text: "   \n " })).toBe(false);
    expect(hasWork({ ...empty, emphasis: "  " })).toBe(false);
  });

  test("sentences, a document, or only the sentence of emphasis are work", () => {
    expect(hasWork({ ...empty, text: "Равенки" })).toBe(true);
    expect(hasWork({ ...empty, file: { name: "план.pdf" } })).toBe(true);
    expect(hasWork({ ...empty, emphasis: "Повеќе примери." })).toBe(true);
  });
});

describe("the sentence of emphasis (BR-LES-07)", () => {
  test("it is sent trimmed and cut at 200 characters, or not at all", () => {
    expect(emphasisOf("  Повеќе примери.  ")).toBe("Повеќе примери.");
    expect(emphasisOf("   ")).toBeNull();
    expect(emphasisOf("")).toBeNull();
    expect(emphasisOf("x".repeat(250))).toHaveLength(EMPHASIS_MAX_CHARS);
  });

  test("its count shows only near the limit", () => {
    expect(showsEmphasisCount(0)).toBe(false);
    expect(showsEmphasisCount(100)).toBe(false);
    expect(showsEmphasisCount(159)).toBe(false);
    expect(showsEmphasisCount(160)).toBe(true);
    expect(showsEmphasisCount(EMPHASIS_MAX_CHARS)).toBe(true);
  });
});

describe("a file's size in words", () => {
  test("kilobytes below a megabyte, megabytes with a comma in Macedonian", () => {
    expect(fileSize(0, "mk")).toBe("0 KB");
    expect(fileSize(300, "mk")).toBe("1 KB");
    expect(fileSize(240 * 1024, "mk")).toBe("240 KB");
    expect(fileSize(1.5 * 1024 * 1024, "mk")).toBe("1,5 MB");
    expect(fileSize(1.5 * 1024 * 1024, "en")).toBe("1.5 MB");
    expect(fileSize(20 * 1024 * 1024, "en")).toBe("20 MB");
  });
});

describe("the wait", () => {
  test("it gives up at 3 minutes (BR-LES-09) and says it is still working at 20 seconds", () => {
    expect(WAIT_LIMIT_MS).toBe(180_000);
    expect(STILL_WORKING_MS).toBe(20_000);
  });

  test("the failure is told by why the screen stopped waiting first, then by what the API said", () => {
    expect(failureOf(new ApiError("network"), "timeout")).toBe("timeout");
    expect(failureOf(new ApiError("network"), "offline")).toBe("offline");
    expect(failureOf(new ApiError("network"), null)).toBe("offline");
    expect(failureOf(new ApiError("generation_failed", { status: 502 }), null)).toBe("generation");
    expect(failureOf(new ApiError("server_error", { status: 500 }), null)).toBe("other");
    expect(failureOf(new ApiError("validation_failed", { status: 422 }), null)).toBe("other");
    expect(failureOf(new Error("x"), null)).toBe("other");
  });

  test("a retry keeps the source it has, unless the API no longer knows it", () => {
    expect(sourceToKeep("src-1", new ApiError("generation_failed"))).toBe("src-1");
    expect(sourceToKeep("src-1", new ApiError("network"))).toBe("src-1");
    expect(sourceToKeep("src-1", new ApiError("not_found", { status: 404 }))).toBeNull();
    expect(sourceToKeep(null, new ApiError("network"))).toBeNull();
  });
});

describe("the words of the page", () => {
  test("every key of the page and the draft is in both languages and the numbers in them are the rules' numbers", () => {
    const keys = (Object.keys(dictionaries.en) as Key[]).filter((k) => k.startsWith("prepare.") || k.startsWith("draft."));
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) expect(dictionaries.mk[key], key).toBeTruthy();
    for (const locale of ["mk", "en"] as const) {
      expect(translate(locale, "school", "prepare.typed.hint")).toContain(String(TYPED_TEXT_MIN_CHARS));
      expect(translate(locale, "school", "prepare.problem.text_too_short.body")).toContain(String(TYPED_TEXT_MIN_CHARS));
      expect(translate(locale, "school", "prepare.file.rules")).toContain(String(LESSON_UPLOAD_MAX_BYTES / 1024 / 1024));
      expect(translate(locale, "school", "prepare.problem.file_too_large.body")).toContain(String(LESSON_UPLOAD_MAX_BYTES / 1024 / 1024));
      expect(translate(locale, "school", "prepare.emphasis.count", { n: 170 })).toContain(String(EMPHASIS_MAX_CHARS));
      expect(translate(locale, "school", "prepare.emphasis.max")).toContain(String(EMPHASIS_MAX_CHARS));
    }
  });

  test("the third part says it is optional once, the draft says it is a suggestion, and the failure's second button does not say Back", () => {
    for (const locale of ["mk", "en"] as const) {
      expect(translate(locale, "school", "prepare.emphasis.hint")).not.toMatch(/не мора|do not have to/i);
      expect(translate(locale, "school", "prepare.fail.change")).not.toBe(translate(locale, "school", "back"));
      expect(translate(locale, "school", "draft.note.lead").length + translate(locale, "school", "draft.note.body").length).toBeLessThan(170);
      expect(translate(locale, "school", "prepare.leave.form.body")).not.toBe(translate(locale, "school", "prepare.leave.body"));
    }
    expect(translate("mk", "school", "prepare.optional")).toBe("По желба");
    // The year of a teacher with one year is said by its number alone, after "Година:".
    expect(translate("mk", "school", "prepare.year.value", { n: 2, roman: "II" })).toBe("II");
    expect(translate("mk", "university", "prepare.year.value", { n: 2, roman: "II" })).toBe("2");
  });

  test("the page is worded for a faculty too: groups, students", () => {
    expect(translate("mk", "school", "prepare.none.title")).toContain("клас");
    expect(translate("mk", "university", "prepare.none.title")).toContain("група");
    expect(translate("mk", "school", "prepare.file.privacy")).toContain("ученици");
    expect(translate("mk", "university", "prepare.file.privacy")).toContain("студенти");
    expect(translate("en", "university", "prepare.go.note")).toContain("students");
  });
});
