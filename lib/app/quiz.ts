"use client";

import type { Locale } from "./api/types";

export type Text = Record<Locale, string>;

export type Question =
  | { id: string; kind: "mc"; text: Text; options: [Text, Text, Text, Text]; answer: 0 | 1 | 2 | 3 }
  | { id: string; kind: "tf"; text: Text; answer: 0 | 1 }
  /** A number; `answer` is plain text with a point (lib/app/numeric.ts), `tolerance` an absolute distance it may be off by. */
  | { id: string; kind: "num"; text: Text; answer: string; tolerance: number; unit?: string; allowNegative?: boolean };

/**
 * The lesson's opener (spec 4.3). A prediction has 3 or 4 options and a right one; a debate is a claim to
 * agree or disagree with and has no right side (OPEN-07). `reasons` is what the simulated class writes,
 * without names.
 */
export type Opener =
  | { id: string; kind: "prediction"; text: Text; options: Text[]; answer: number; reasons: Text[] }
  | { id: string; kind: "debate"; text: Text; agreeShare: number; reasons: { agree: Text[]; disagree: Text[] } };

const LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ѓ: "gj", е: "e", ж: "zh", з: "z", ѕ: "dz", и: "i", ј: "j",
  к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ќ: "kj",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", џ: "dzh", ш: "sh",
};

/** Macedonian Cyrillic to Latin, the official scheme without diacritics. */
export function transliterate(s: string) {
  return Array.from(s)
    .map((ch) => {
      const low = ch.toLowerCase();
      const out = LATIN[low];
      if (out === undefined) return ch;
      return ch === low ? out : out.charAt(0).toUpperCase() + out.slice(1);
    })
    .join("");
}

export const personName = (name: string, locale: Locale) => (locale === "en" ? transliterate(name) : name);

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? "");
  return (first + last).toUpperCase();
}

export const LETTERS: Record<Locale, string[]> = { mk: ["А", "Б", "В", "Г"], en: ["A", "B", "C", "D"] };
