import { describe, expect, test } from "vitest";
import { firstName, initials, personName, schoolTypeOf, transliterate } from "@/lib/teacher/format";
import { isValidContent, isValidQuestion } from "@/lib/teacher/lessons";
import { bankQuestions, BANK } from "@/lib/teacher/api/mock-bank";

describe("names", () => {
  test("Macedonian Cyrillic becomes Latin in the English interface (EC-NAME-01)", () => {
    expect(transliterate("Марија Петровска")).toBe("Marija Petrovska");
    expect(transliterate("Ѓорѓи Џонов Љубица Његош Ќамил Ѕвезда Шаренков Чавче")).toBe("Gjorgji Dzhonov Ljubica Njegosh Kjamil Dzvezda Sharenkov Chavche");
    expect(personName("Марија Петровска", "en")).toBe("Marija Petrovska");
    expect(personName("Марија Петровска", "mk")).toBe("Марија Петровска");
    expect(personName("Marija O'Neil 3", "en")).toBe("Marija O'Neil 3");
  });

  test("initials and the first name", () => {
    expect(initials("Марија Петровска")).toBe("МП");
    expect(initials("Марија Ана Петровска")).toBe("МП");
    expect(initials("Марија")).toBe("МА");
    expect(initials("  ")).toBe("");
    expect(firstName("Марија Петровска")).toBe("Марија");
    expect(firstName("")).toBe("");
  });
});

describe("school type", () => {
  test("a faculty is a university; every other school is a secondary school", () => {
    expect(schoolTypeOf("faculty")).toBe("university");
    expect(schoolTypeOf("gymnasium")).toBe("school");
    expect(schoolTypeOf("vocational")).toBe("school");
    expect(schoolTypeOf("arts")).toBe("school");
  });
});

describe("questions and lessons (BR-Q-01, BR-Q-02)", () => {
  const good = bankQuestions(BANK[0], "q");

  test("every question of the demo bank is valid, and every lesson has 5 to 8 questions of a valid shape", () => {
    for (const lesson of BANK) {
      const questions = bankQuestions(lesson, lesson.key);
      expect(questions.length, lesson.key).toBeGreaterThanOrEqual(5);
      expect(questions.length, lesson.key).toBeLessThanOrEqual(8);
      expect(questions.every(isValidQuestion), lesson.key).toBe(true);
      expect(isValidContent({ title: lesson.title, review_summary: lesson.summary, questions }), lesson.key).toBe(true);
    }
  });

  test("the demo bank has all three kinds in every lesson", () => {
    for (const lesson of BANK) {
      const kinds = new Set(bankQuestions(lesson, lesson.key).map((q) => q.kind));
      expect(kinds, lesson.key).toEqual(new Set(["multiple_choice", "true_false", "numeric"]));
    }
  });

  test("a multiple-choice question needs two to four options and a correct one among them", () => {
    const mc = good.find((q) => q.kind === "multiple_choice")!;
    expect(isValidQuestion({ ...mc, options: ["only one"], correct: "0" })).toBe(false);
    expect(isValidQuestion({ ...mc, options: ["a", "b", "c", "d", "e"], correct: "0" })).toBe(false);
    expect(isValidQuestion({ ...mc, correct: "9" })).toBe(false);
    expect(isValidQuestion({ ...mc, options: ["a", " "], correct: "0" })).toBe(false);
  });

  test("a true or false question is true or false, and a number is a number with a tolerance", () => {
    const tf = good.find((q) => q.kind === "true_false")!;
    const num = good.find((q) => q.kind === "numeric")!;
    expect(isValidQuestion({ ...tf, correct: "maybe" })).toBe(false);
    expect(isValidQuestion({ ...num, correct: "abc" })).toBe(false);
    expect(isValidQuestion({ ...num, tolerance: -1 })).toBe(false);
    expect(isValidQuestion({ ...num, allow_negative: "no" })).toBe(false);
  });

  test("a timer is between 5 and 300 seconds, and the prompt is not empty", () => {
    expect(isValidQuestion({ ...good[0], timer_seconds: 2 })).toBe(false);
    expect(isValidQuestion({ ...good[0], timer_seconds: 900 })).toBe(false);
    expect(isValidQuestion({ ...good[0], prompt: "  " })).toBe(false);
    expect(isValidQuestion({ ...good[0], kind: "ordering" })).toBe(false);
    expect(isValidQuestion(null)).toBe(false);
  });

  test("a lesson needs a title and five to eight questions", () => {
    const content = { title: "Лекција", review_summary: "", questions: good };
    expect(isValidContent(content)).toBe(true);
    expect(isValidContent({ ...content, title: " " })).toBe(false);
    expect(isValidContent({ ...content, questions: good.slice(0, 4) })).toBe(false);
    expect(isValidContent({ ...content, questions: [...good, ...good, ...good] })).toBe(false);
  });
});
