import { describe, expect, test } from "vitest";
import { GUIDE_STEPS, isLastStep, stepAfter } from "@/lib/teacher/guide";
import { dictionaries, translate } from "@/lib/teacher/i18n";

describe("the guide", () => {
  test("is three short steps: prepare a lesson, hold it, see who was there", () => {
    expect(GUIDE_STEPS).toHaveLength(3);
    expect(GUIDE_STEPS.map((s) => s.icon)).toEqual(["prepare", "hold", "review"]);
  });

  test("every step has a title and a sentence in both languages", () => {
    for (const locale of ["mk", "en"] as const) {
      for (const step of GUIDE_STEPS) {
        for (const key of [step.title, step.body]) {
          expect(dictionaries[locale][key], `${locale} ${key}`).toBeDefined();
          expect(translate(locale, "school", key).trim().length).toBeGreaterThan(8);
        }
      }
    }
  });

  test("speaks of the students of a school and of a university", () => {
    expect(translate("mk", "school", "guide.2.body")).toContain("ученици");
    expect(translate("mk", "university", "guide.2.body")).toContain("студенти");
  });

  test("moving stays inside it", () => {
    expect(stepAfter(0, 1)).toBe(1);
    expect(stepAfter(1, 1)).toBe(2);
    expect(stepAfter(2, 1)).toBe(2);
    expect(stepAfter(2, -1)).toBe(1);
    expect(stepAfter(0, -1)).toBe(0);
  });

  test("Next becomes the way out on the last step only", () => {
    expect([0, 1, 2].map(isLastStep)).toEqual([false, false, true]);
  });
});

describe("the sign-in copy", () => {
  test("names the school, the faculty or, until it is known, the institution, and the Macedonian uses the polite form", () => {
    expect(translate("mk", "school", "signin.sub.known")).toBe("Најавете се со сметката од Вашето училиште.");
    expect(translate("mk", "university", "signin.sub.known")).toBe("Најавете се со сметката од Вашиот факултет.");
    expect(translate("mk", "school", "signin.sub")).toBe("Најавете се со сметката од Вашата установа.");
    expect(translate("mk", "school", "signin.google")).toBe("Најави се со Google");
    expect(translate("mk", "school", "signin.microsoft")).toBe("Најави се со Microsoft");
    expect(translate("mk", "school", "signin.help")).toBe("Потребна е помош?");
    expect(translate("mk", "school", "signin.note.signed_out")).toBe("Успешно се одјавивте.");
    expect(translate("mk", "school", "signin.note.expired")).toBe("Ве одјавивме поради безбедност. Најавете се повторно.");
  });

  test("the sign-in screen never asks for a password or a code", () => {
    for (const locale of ["mk", "en"] as const) {
      for (const key of Object.keys(dictionaries[locale]).filter((k) => k.startsWith("signin.") || k.startsWith("demo.sheet."))) {
        expect(translate(locale, "school", key as keyof typeof dictionaries.en), key).not.toMatch(/лозинк|password|код за|one-time/i);
      }
    }
  });

  test("the demo sheet says it is a demo", () => {
    expect(translate("mk", "school", "demo.sheet.tag")).toBe("Демо");
    expect(translate("mk", "school", "demo.sheet.note", { provider: "Google" })).toContain("демо");
    expect(translate("en", "school", "demo.sheet.note", { provider: "Google" })).toContain("demo");
  });
});
