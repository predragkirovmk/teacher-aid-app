import { describe, expect, test } from "vitest";
import { ApiError, API_ERROR_CODES, VALIDATION_REASONS } from "@/lib/teacher/api/errors";
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
    expect(translate("mk", "school", "classes.what")).toContain("класови");
    expect(translate("mk", "school", "classes.what")).toContain("ученици");
    expect(translate("mk", "university", "classes.what")).toContain("групи");
    expect(translate("mk", "university", "classes.what")).toContain("студенти");
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
    expect(translate("mk", "school", "start.count.one")).toBe("1 ученик");
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
