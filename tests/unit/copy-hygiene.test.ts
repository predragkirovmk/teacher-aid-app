import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/app/i18n";
import { dictionaries as quizDictionaries } from "@/lib/app/quiz-copy";

/**
 * Copy that looks right and is wrong: a zero-width character or a no-break space hides in a string and breaks search
 * and wrapping, and a Latin look-alike letter inside a Macedonian word (or a Cyrillic one inside an English word)
 * makes the word fail to match itself. The numeric answer's no-break space before a unit (lib/app/numeric.ts) is the one
 * deliberate exception and is not in a dictionary.
 */
const INVISIBLE = new RegExp("[\\u200B-\\u200F\\u2060\\uFEFF\\u00AD\\u00A0\\u202F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]");
const CYRILLIC = new RegExp("[\\u0400-\\u04FF]");
const LATIN = /[A-Za-z]/;

const entries = (all: Record<string, Record<string, string>>) =>
  Object.entries(all).flatMap(([locale, dict]) => Object.entries(dict).map(([key, value]) => ({ locale, key, value })));

for (const [name, all] of [
  ["lib/app/i18n.ts", dictionaries],
  ["lib/app/quiz-copy.ts", quizDictionaries],
] as const) {
  describe(`${name} copy`, () => {
    const rows = entries(all as Record<string, Record<string, string>>);

    it("has no zero-width character, soft hyphen, BOM or no-break space", () => {
      expect(rows.filter((r) => INVISIBLE.test(r.value) || INVISIBLE.test(r.key)).map((r) => `${r.locale}:${r.key}`)).toEqual([]);
    });

    it("has no word that mixes Cyrillic and Latin letters", () => {
      const mixed = rows.flatMap((r) =>
        (r.value.match(/\p{L}+/gu) ?? []).filter((w) => CYRILLIC.test(w) && LATIN.test(w)).map((w) => `${r.locale}:${r.key}:${w}`),
      );
      expect(mixed).toEqual([]);
    });
  });
}

describe("the app manifest", () => {
  it("opens the join screen from its shortcut", () => {
    const manifest = JSON.parse(readFileSync("public/app.webmanifest", "utf8")) as { shortcuts: { url: string }[] };
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(["/app/join"]);
  });
});

describe("the student copy names no class", () => {
  // Classes, class assignments and subjects do not exist in the product; "час" (a lesson) and "соученици" are fine.
  const NAMES_A_CLASS = /клас|груп|\bclass(es)?\b|\bgroups?\b/iu;
  // Every string the privacy copy shows; the `id` fields are anchors, not words.
  const words = (v: unknown): string[] =>
    typeof v === "string"
      ? [v]
      : Array.isArray(v)
        ? v.flatMap(words)
        : v && typeof v === "object"
          ? Object.entries(v).flatMap(([k, x]) => (k === "id" ? [] : words(x)))
          : [];

  for (const [name, all] of [
    ["lib/app/i18n.ts", dictionaries],
    ["lib/app/quiz-copy.ts", quizDictionaries],
  ] as const) {
    it(`has no class or group word in ${name}`, () => {
      const rows = entries(all as Record<string, Record<string, string>>);
      expect(rows.filter((r) => NAMES_A_CLASS.test(r.value)).map((r) => `${r.locale}:${r.key}`)).toEqual([]);
    });
  }

  it("has no class or group word in the privacy copy", async () => {
    const mod = (await import("@/lib/app/privacy-copy")) as Record<string, unknown>;
    const text = words(mod).filter((s) => NAMES_A_CLASS.test(s));
    expect(text).toEqual([]);
  });
});
