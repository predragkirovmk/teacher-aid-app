import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, ApiError } from "@/lib/app/api/errors";
import { dictionaries as quizDictionaries, type QKey } from "@/lib/app/quiz-copy";
import { dictionaries, errorCopy, errorKey, hasKey, translate, type Key } from "@/lib/app/i18n";

const CYRILLIC = /\p{Script=Cyrillic}/u;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("error copy", () => {
  it.each(API_ERROR_CODES)("has Macedonian and English copy for %s", (code) => {
    const key = errorKey(code);
    expect(hasKey(key)).toBe(true);
    const mk = dictionaries.mk[key];
    const en = dictionaries.en[key];
    expect(mk.trim()).not.toBe("");
    expect(en.trim()).not.toBe("");
    expect(mk).toMatch(CYRILLIC);
    expect(en).not.toMatch(CYRILLIC);
  });

  it("names a code's copy err.<code>", () => {
    expect(errorKey("token_expired")).toBe("err.token_expired");
  });

  it("says what went wrong in the student's language, whatever was thrown", () => {
    const mk = (k: Key, v?: Record<string, string | number>) => translate("mk", k, v);
    const en = (k: Key, v?: Record<string, string | number>) => translate("en", k, v);
    expect(errorCopy(mk, new ApiError("session_ended"))).toBe(dictionaries.mk["err.session_ended"]);
    expect(errorCopy(en, new ApiError("session_ended"))).toBe(dictionaries.en["err.session_ended"]);
    expect(errorCopy(en, new Error("anything"))).toBe(dictionaries.en["err.unknown"]);
    expect(errorCopy(mk, undefined)).toBe(dictionaries.mk["err.unknown"]);
  });
});

describe("dictionaries", () => {
  const keys = Object.keys(dictionaries.en) as Key[];

  it("have the same keys", () => {
    expect(Object.keys(dictionaries.mk).sort()).toEqual([...keys].sort());
  });

  it("have no empty string", () => {
    for (const key of keys) {
      expect(dictionaries.en[key].trim(), `en ${key}`).not.toBe("");
      expect(dictionaries.mk[key].trim(), `mk ${key}`).not.toBe("");
    }
  });

  it("use the same {placeholders} in both languages", () => {
    for (const key of keys) {
      expect(placeholders(dictionaries.mk[key]), key).toEqual(placeholders(dictionaries.en[key]));
    }
  });

  it("fill their placeholders", () => {
    expect(translate("en", "home.afternoon", { name: "Ana" })).toBe("Good afternoon, Ana");
    expect(translate("mk", "home.inMin", { n: 5 })).toContain("5");
    expect(translate("en", "home.inMin", { n: 5 })).not.toContain("{n}");
  });
});

describe("quiz and profile dictionaries", () => {
  const keys = Object.keys(quizDictionaries.en) as QKey[];

  it("have the same keys, none empty, and the same {placeholders} in both languages", () => {
    expect(Object.keys(quizDictionaries.mk).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(quizDictionaries.en[key].trim(), `en ${key}`).not.toBe("");
      expect(quizDictionaries.mk[key].trim(), `mk ${key}`).not.toBe("");
      expect(placeholders(quizDictionaries.mk[key]), key).toEqual(placeholders(quizDictionaries.en[key]));
    }
  });
});
