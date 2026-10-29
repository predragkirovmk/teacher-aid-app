import type { SchoolKind } from "./api/types";
import type { Locale, SchoolType } from "./store";

const LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ѓ: "gj", е: "e", ж: "zh", з: "z", ѕ: "dz", и: "i", ј: "j",
  к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ќ: "kj",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", џ: "dzh", ш: "sh",
};

/** Macedonian Cyrillic to Latin, the official scheme without diacritics. Anything else is left as it is. */
export function transliterate(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const lower = ch.toLowerCase();
      const out = LATIN[lower];
      if (out === undefined) return ch;
      return ch === lower ? out : out.charAt(0).toUpperCase() + out.slice(1);
    })
    .join("");
}

/** A person's name as the API holds it (one script); the English interface writes it in Latin letters (EC-NAME-01). */
export const personName = (name: string, locale: Locale) => (locale === "en" ? transliterate(name) : name);

/** The first word of a name: "Марија Петровска" gives "Марија". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Initials from a name: "Марија Петровска" gives "МП"; a single name gives its first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.length > 1 ? [words[0], words[words.length - 1]].map((w) => w[0]) : Array.from(words[0]).slice(0, 2);
  return letters.join("").toUpperCase();
}

/** A faculty is worded as a university ("студенти", "група"); every other kind of school as a secondary school. */
export const schoolTypeOf = (kind: SchoolKind): SchoolType => (kind === "faculty" ? "university" : "school");

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** A school year as the Roman numeral a secondary school writes it ("II година"); a number past X is left as it is. */
export const romanYear = (year: number): string => ROMAN[year] || String(year);

/** A number written with a point (the API's way, 3.2) as the interface writes it: Macedonian puts a comma ("3,5"). */
export const decimal = (text: string, locale: Locale): string => (locale === "mk" ? text.replace(".", ",") : text);
