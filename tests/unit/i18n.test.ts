import { describe, expect, test } from "vitest";
import { ApiError, API_ERROR_CODES, IMAGE_REASONS, VALIDATION_REASONS } from "@/lib/teacher/api/errors";
import { fileSize } from "@/lib/teacher/prepare";
import { IMAGE_MAX_BYTES } from "@/lib/teacher/images";
import { isOne } from "@/lib/teacher/format";
import { dictionaries, errorKey, translate, type Key } from "@/lib/teacher/i18n";

const keys = Object.keys(dictionaries.en) as Key[];
/** Whole words, for Cyrillic too: \b only knows Latin letters. */
const word = (alternatives: string) => new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, "iu");
const entryText = (locale: "mk" | "en", key: Key) => {
  const e = dictionaries[locale][key];
  return typeof e === "string" ? [e] : [e.school, e.uni];
};

describe("the dictionaries", () => {
  test("Macedonian and English have the same keys", () => {
    expect(Object.keys(dictionaries.mk).sort()).toEqual(keys.slice().sort());
  });

  test("a string with a variable other than the school words names one the app supplies", () => {
    const known = new Set([
      "students", "classes", "teacher", "name", "seconds", "provider", "n", "total",
      "weekday", "day", "month", "when", "time", "roman", "title", "course", "subject", "tolerance", "class",
      "days", "min", "max", "count", "option", "size", "alt", "label", "what", "answer", "prompt", "letter", "unit", "percent", "missed", "joined", "done", "score", "lesson", "topic", "right", "times", "people", "date",
    ]);
    for (const locale of ["mk", "en"] as const) {
      for (const key of keys) {
        for (const text of entryText(locale, key)) {
          for (const [, name] of text.matchAll(/\{(\w+)\}/g)) expect(known.has(name), `${locale} ${key}: {${name}}`).toBe(true);
        }
      }
    }
  });

  test("a school entry and a university entry both have text", () => {
    for (const key of keys) for (const locale of ["mk", "en"] as const) for (const text of entryText(locale, key)) expect(text.trim()).not.toBe("");
  });
});

describe("school type wording", () => {
  test("a secondary school says classes and students, a university groups and students", () => {
    expect(translate("en", "school", "nav.classes")).toBe("Classes");
    expect(translate("en", "university", "nav.classes")).toBe("Groups");
    expect(translate("mk", "school", "nav.classes")).toBe("Класови");
    expect(translate("mk", "university", "nav.classes")).toBe("Групи");
  });

  test("the school words fill {students}, {classes} and {teacher}", () => {
    expect(translate("mk", "school", "start.classes.failed")).toContain("класови");
    expect(translate("mk", "school", "course.empty.body")).toContain("ученици");
    expect(translate("mk", "university", "start.classes.failed")).toContain("групи");
    expect(translate("mk", "university", "course.empty.body")).toContain("студенти");
    expect(translate("mk", "school", "settings.who", { name: "Марија" })).toBe("Марија, наставник");
    expect(translate("mk", "university", "settings.who", { name: "Марија" })).toBe("Марија, професор");
    expect(translate("en", "university", "settings.who", { name: "Marija" })).toBe("Marija, professor");
  });

  test("a message that depends on the kind of class is worded for it", () => {
    expect(translate("mk", "school", "err.not_enrolled")).toContain("клас");
    expect(translate("mk", "university", "err.not_enrolled")).toContain("група");
    expect(translate("en", "school", "err.not_enrolled")).toContain("student");
  });

  test("the window that starts a lesson asks for a class at a school and a group at a faculty", () => {
    expect(translate("mk", "school", "start.title")).toBe("Со кој клас?");
    expect(translate("mk", "university", "start.title")).toBe("Со која група?");
    expect(translate("en", "school", "start.title")).toBe("Which class?");
    expect(translate("en", "university", "start.title")).toBe("Which group?");
    expect(translate("mk", "school", "start.count", { n: 26 })).toBe("26 ученици");
    expect(translate("mk", "university", "start.count", { n: 26 })).toBe("26 студенти");
    expect(translate("mk", "school", "start.count.one", { n: 1 })).toBe("1 ученик");
    expect(translate("mk", "university", "start.count.one", { n: 21 })).toBe("21 студент");
    expect(translate("mk", "university", "start.noclass.body", { subject: "Физика" })).toContain("ни на една група");
  });

  test("a lesson's year is a Roman numeral at a school and a study year at a faculty", () => {
    expect(translate("mk", "school", "lesson.year", { n: 2, roman: "II" })).toBe("II година");
    expect(translate("mk", "university", "lesson.year", { n: 2, roman: "II" })).toBe("2. година");
    expect(translate("en", "school", "lesson.year", { n: 2, roman: "II" })).toBe("Year 2");
  });

  test("a lesson that is already running is a lesson to go back to, not an error about a class", () => {
    expect(translate("mk", "school", "err.session_open")).toBe(translate("mk", "university", "err.session_open"));
    expect(translate("mk", "school", "err.session_open")).toContain("час во тек");
  });

  test("a variable that is not given stays visible instead of vanishing", () => {
    expect(translate("en", "school", "today.greet.morning")).toBe("Good morning, {name}");
    expect(translate("en", "school", "today.greet.morning", { name: "Marija" })).toBe("Good morning, Marija");
  });
});

describe("error messages", () => {
  test("every code the client knows has a sentence in both languages", () => {
    for (const code of API_ERROR_CODES) {
      const { key } = errorKey(new ApiError(code));
      expect(dictionaries.en[key], `en ${code}`).toBeDefined();
      expect(dictionaries.mk[key], `mk ${code}`).toBeDefined();
      expect(translate("mk", "school", key).length).toBeGreaterThan(10);
    }
  });

  test("a code gets its own sentence", () => {
    expect(errorKey(new ApiError("network")).key).toBe("err.network");
    expect(errorKey(new ApiError("generation_failed")).key).toBe("err.generation_failed");
    expect(translate("mk", "school", errorKey(new ApiError("network")).key)).toContain("врска");
  });

  test("a refused upload says what was wrong with it", () => {
    for (const reason of VALIDATION_REASONS) {
      const { key } = errorKey(new ApiError("validation_failed", { reason }));
      expect(key).toBe(`err.validation_failed.${reason}`);
      expect(dictionaries.mk[key]).toBeDefined();
    }
    expect(errorKey(new ApiError("validation_failed")).key).toBe("err.validation_failed");
  });

  test("a rate limit says how long to wait when the server said", () => {
    const wait = errorKey(new ApiError("rate_limited", { retryAfter: 30 }));
    expect(wait.key).toBe("err.rate_limited.wait");
    expect(translate("mk", "school", wait.key, wait.vars)).toContain("30 секунди");
    expect(errorKey(new ApiError("rate_limited")).key).toBe("err.rate_limited");
  });

  test("anything that is not an ApiError reads as an unknown failure", () => {
    expect(errorKey(new Error("boom")).key).toBe("err.unknown");
    expect(errorKey("text").key).toBe("err.unknown");
    expect(errorKey(null).key).toBe("err.unknown");
  });

  test("the Macedonian messages use the polite form and no jargon", () => {
    for (const key of keys.filter((k) => k.startsWith("err."))) {
      for (const text of entryText("mk", key)) {
        expect(text, key).not.toMatch(word("сесија|конзола|токен|сервер|API"));
        expect(text, key).not.toMatch(word("провери|обиди се|најави|избери|напиши|почекај")); // the informal imperative
      }
    }
  });
});

describe("a count is in the singular when the language says so", () => {
  const phrase = (locale: "mk" | "en", n: number, one: Key, many: Key) => translate(locale, "school", isOne(n, locale) ? one : many, { n });

  test("in Macedonian every number that ends in 1 but 11 takes the singular, the others the plural", () => {
    expect([1, 2, 5, 11, 12, 21, 26, 31, 101, 111].map((n) => phrase("mk", n, "start.count.one", "start.count"))).toEqual([
      "1 ученик", "2 ученици", "5 ученици", "11 ученици", "12 ученици", "21 ученик", "26 ученици", "31 ученик", "101 ученик", "111 ученици",
    ]);
    expect([1, 7, 21].map((n) => phrase("mk", n, "lesson.questions.one", "lesson.questions.many"))).toEqual(["1 прашање", "7 прашања", "21 прашање"]);
    expect([1, 12, 21, 61, 111].map((n) => phrase("mk", n, "running.min1", "running.min"))).toEqual(["Трае 1 минута", "Трае 12 минути", "Трае 21 минута", "Трае 61 минута", "Трае 111 минути"]);
    expect([1, 15, 21].map((n) => phrase("mk", n, "question.timer.one", "question.timer"))).toEqual(["Време: 1 секунда", "Време: 15 секунди", "Време: 21 секунда"]);
  });

  test("in English only one is singular", () => {
    expect([1, 2, 21].map((n) => phrase("en", n, "start.count.one", "start.count"))).toEqual(["1 student", "2 students", "21 students"]);
    expect([1, 21].map((n) => phrase("en", n, "lesson.questions.one", "lesson.questions.many"))).toEqual(["1 question", "21 questions"]);
    expect([1, 21].map((n) => phrase("en", n, "running.min1", "running.min"))).toEqual(["Running for 1 minute", "Running for 21 minutes"]);
  });
});

describe("the words about the picture of a question", () => {
  test("a refused picture says what was wrong in both languages, and the size is the one the app holds", () => {
    for (const locale of ["mk", "en"] as const) {
      for (const reason of IMAGE_REASONS) {
        const { key } = errorKey(new ApiError("validation_failed", { reason }));
        expect(translate(locale, "school", key).length, `${locale} ${reason}`).toBeGreaterThan(20);
      }
      expect(translate(locale, "school", "err.validation_failed.image_too_large")).toContain(fileSize(IMAGE_MAX_BYTES, locale));
      expect(translate(locale, "school", "image.rules", { size: fileSize(IMAGE_MAX_BYTES, locale) })).toContain("10 MB");
    }
  });

  test("the picture's button names say what they do, and the one that is a label says more than it shows (WCAG 2.5.3)", () => {
    expect(translate("mk", "school", "image.add")).toBe("Додај слика");
    expect(translate("mk", "school", "image.replace")).toBe("Замени");
    expect(translate("mk", "school", "image.remove")).toBe("Отстрани");
    for (const locale of ["mk", "en"] as const) {
      const visible = translate(locale, "school", "image.replace");
      expect(`${visible}${translate(locale, "school", "image.replace.label")}`.toLowerCase()).toContain(visible.toLowerCase());
      expect(translate(locale, "school", "image.remove.label").toLowerCase()).toContain(translate(locale, "school", "image.remove").toLowerCase());
    }
  });

  test("the words about what is in the picture are asked as a question, explained in a line, and not demanded", () => {
    expect(translate("mk", "school", "image.alt")).toBe("Што има на сликата?");
    expect(translate("mk", "school", "image.alt.hint")).toContain("ученици");
    expect(translate("mk", "university", "image.alt.hint")).toContain("студенти");
    expect(translate("mk", "school", "image.alt.hint")).toContain("Не е задолжително");
  });
});

describe("the library and the lessons that were deleted", () => {
  test("the library is worded for the school and for the faculty", () => {
    expect(translate("mk", "school", "library.sub")).toContain("училиште");
    expect(translate("mk", "university", "library.sub")).toContain("факултет");
    expect(translate("mk", "school", "library.empty.body")).toContain("училиште");
    expect(translate("mk", "university", "library.empty.body")).toContain("факултет");
    expect(translate("en", "school", "library.empty.body")).toContain("school");
    expect(translate("en", "university", "library.empty.body")).toContain("faculty");
  });

  test("deleting says what goes and what stays, in plain words", () => {
    const body = translate("mk", "school", "lesson.delete.body");
    expect(body).toContain("исчезне од Вашите лекции");
    expect(body).toContain("одржале и нивните резултати остануваат");
    expect(body).toContain("колеги остануваат");
    // The same two answers as every other question of the app ("Не, остани" / "Да, одјави ме"): the safe one says "No", the other "Yes".
    expect(translate("mk", "school", "lesson.delete.stay")).toBe("Не, задржи ја");
    expect(translate("mk", "school", "lesson.delete.confirm")).toBe("Да, избриши ја");
    expect(translate("en", "school", "lesson.delete.stay")).toBe("No, keep it");
    expect(translate("en", "school", "lesson.delete.confirm")).toBe("Yes, delete it");
    expect(translate("mk", "school", "lesson.delete.running")).toBe("Прво завршете го часот");
    expect(translate("mk", "school", "lesson.delete.title", { title: "Низи" })).toBe("Дали сакате да ја избришете лекцијата „Низи“?");
  });

  test("a section says how many it holds, and a choice of subject says how many lessons it shows, in Macedonian's own forms", () => {
    expect(translate("mk", "school", "list.count", { label: "Одржани", n: 12 })).toBe("Одржани (12)");
    expect(translate("mk", "school", "list.shown.one", { n: 1, what: "Физика" })).toBe("Прикажана е 1 лекција: Физика.");
    expect(translate("mk", "school", "list.shown.many", { n: 5, what: "Математика" })).toBe("Прикажани се 5 лекции: Математика.");
    expect(translate("en", "school", "list.shown.one", { n: 1, what: "Physics" })).toBe("Showing 1 lesson: Physics.");
    expect(translate("en", "school", "list.shown.many", { n: 5, what: "All subjects" })).toBe("Showing 5 lessons: All subjects.");
  });

  test("Today's link counts what is not finished", () => {
    expect(translate("mk", "school", "today.drafts.all", { n: 5 })).toBe("Сите недовршени (5)");
  });
});

describe("the editor's choice of the right answer", () => {
  const words = (locale: "mk" | "en", key: Key) => translate(locale, "school", key, { n: 2 });

  test("the row that is right says so, and no other row says anything but what pressing it does", () => {
    expect(words("mk", "edit.option.right")).toBe("Точен одговор");
    expect(words("mk", "edit.option.mark")).toBe("Означи како точен");
    expect(words("en", "edit.option.right")).toBe("Correct answer");
    expect(words("en", "edit.option.mark")).toBe("Mark as correct");
    // The words of a row that is not the right one never say it is (so no row reads as right by default).
    expect(words("mk", "edit.option.mark")).not.toMatch(word("Точен одговор"));
    expect(words("en", "edit.option.mark").toLowerCase()).not.toContain("correct answer");
  });

  test("what a screen reader says holds the words that are on the screen (WCAG 2.5.3), whichever language", () => {
    for (const locale of ["mk", "en"] as const) {
      for (const [visible, label] of [["edit.option.right", "edit.option.right.label"], ["edit.option.mark", "edit.option.mark.label"]] as const) {
        expect(words(locale, label).toLowerCase(), `${locale} ${label}`).toContain(words(locale, visible).toLowerCase());
        expect(words(locale, label), `${locale} ${label} says which answer`).toContain("2");
      }
    }
  });

  test("the kind that is a choice of answers is one short phrase in both places it is said", () => {
    expect(words("mk", "question.kind.multiple_choice")).toBe("Понудени одговори");
    expect(words("mk", "edit.options")).not.toBe(words("mk", "question.kind.multiple_choice"));
    expect(words("en", "edit.options")).not.toBe(words("en", "question.kind.multiple_choice"));
    for (const locale of ["mk", "en"] as const) expect(words(locale, "question.kind.multiple_choice").length).toBeLessThanOrEqual(20);
  });

  test("the words about saving say changes, so that they are never read as the lesson being saved", () => {
    expect(words("mk", "editor.status.saved")).toBe("Промените се зачувани.");
    expect(words("mk", "editor.status.failed")).toContain("Промените не се зачувани");
    expect(words("en", "editor.status.saved")).toContain("changes");
    expect(words("en", "editor.status.failed")).toContain("changes");
  });
});
