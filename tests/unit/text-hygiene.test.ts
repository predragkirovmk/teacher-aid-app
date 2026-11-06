import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { dictionaries } from "@/lib/teacher/i18n";

/**
 * Invisible characters and look-alike letters hide in pasted text: a word that reads right and does not match itself. These
 * tests read every string the teacher app shows and every source file that holds copy.
 */

const INVISIBLE = new RegExp("[\\u00AD\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF\\u180E\\u061C\\uFFF9-\\uFFFB]", "u");
/** A space that is not an ordinary one. A no-break space is allowed in the source, where typography wants it. */
const ODD_SPACE = new RegExp("[\\u2000-\\u200A\\u202F\\u205F\\u3000]", "u");
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]", "u");

const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
/** The Latin letters that look like a Cyrillic one, and the Cyrillic letters that look like a Latin one. */
const LATIN_LOOKALIKE = /[AaBCcEeHKMOoPpTXxy]/u;
const CYRILLIC_LOOKALIKE = /[АаВСсЕеНКМОоРрТХхУу]/u;

const entries = (locale: "mk" | "en") =>
  Object.entries(dictionaries[locale]).flatMap(([key, e]) => (typeof e === "string" ? [[key, e]] : [[`${key}.school`, e.school], [`${key}.uni`, e.uni]])) as [string, string][];

/** Words made of both scripts: a Latin letter among Cyrillic ones, or the reverse. Placeholders ({n}) and the tag names are not words. */
function mixedWords(text: string): string[] {
  return (text.replace(/\{\w+\}/g, " ").match(/[\p{L}\p{M}]+/gu) ?? []).filter((w) => LATIN.test(w) && CYRILLIC.test(w));
}

describe("the strings of the app", () => {
  for (const locale of ["mk", "en"] as const) {
    test(`${locale}: no invisible character, odd space or control character`, () => {
      for (const [key, text] of entries(locale)) {
        expect(INVISIBLE.test(text), `${locale} ${key} has an invisible character`).toBe(false);
        expect(ODD_SPACE.test(text), `${locale} ${key} has an odd space`).toBe(false);
        expect(CONTROL.test(text), `${locale} ${key} has a control character`).toBe(false);
      }
    });

    test(`${locale}: no word mixes Latin and Cyrillic letters`, () => {
      for (const [key, text] of entries(locale)) expect(mixedWords(text), `${locale} ${key}`).toEqual([]);
    });
  }

  test("the English strings hold no Cyrillic letter, except where Macedonian is the point", () => {
    const allowed = new Set(["lang.mk", "signin.lang.mk", "help.projector.win.2", "att.hint.school", "att.hint.uni", "att.copied"]);
    for (const [key, text] of entries("en")) {
      if (allowed.has(key)) continue;
      expect(CYRILLIC.test(text), `en ${key}: ${text}`).toBe(false);
    }
  });

  test("a Latin look-alike never stands among Cyrillic letters, and the reverse", () => {
    // A word that is wholly one script passes; a one-letter word is judged by the neighbours.
    for (const [key, text] of entries("mk")) {
      for (const word of text.match(/[\p{L}]+/gu) ?? []) {
        if (CYRILLIC.test(word)) expect(LATIN_LOOKALIKE.test(word), `mk ${key}: ${word}`).toBe(false);
      }
    }
    for (const [key, text] of entries("en")) {
      for (const word of text.match(/[\p{L}]+/gu) ?? []) {
        if (LATIN.test(word)) expect(CYRILLIC_LOOKALIKE.test(word), `en ${key}: ${word}`).toBe(false);
      }
    }
  });
});

describe("the offline page", () => {
  const html = readFileSync(join(process.cwd(), "public/teacher-offline.html"), "utf8");
  test("says what the dictionary says, in both languages", () => {
    for (const locale of ["mk", "en"] as const) {
      const d = dictionaries[locale] as Record<string, string>;
      for (const key of ["offline.title", "offline.body", "offline.retry"]) expect(html, `${locale} ${key}`).toContain(d[key]);
    }
  });
  test("holds no invisible character or look-alike", () => {
    expect(INVISIBLE.test(html)).toBe(false);
    for (const w of html.match(/[\p{L}\p{M}]+/gu) ?? []) expect(LATIN.test(w) && CYRILLIC.test(w), w).toBe(false);
  });
});

/** The text of the source files that hold copy or mock data: every string literal in them is read, the code between is not. */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []));
}
describe("the source of the teacher app", () => {
  const roots = ["lib/teacher", "components/teacher", "app/(teacher)"].map((r) => join(process.cwd(), r));
  test("no invisible character anywhere, and no word mixing Latin and Cyrillic letters in a string or a comment", () => {
    for (const root of roots) {
      for (const file of files(root)) {
        const text = readFileSync(file, "utf8");
        expect(INVISIBLE.test(text.replace(/\u00A0/g, " ")), `${file} has an invisible character`).toBe(false);
        expect(mixedWords(text.replace(/[A-Za-z]+[-_.][A-Za-z]+/g, " ")), file).toEqual([]);
      }
    }
  });
});
