"use client";

import type { Locale } from "./api/types";

export type Text = Record<Locale, string>;

export type Question =
  | { id: string; kind: "mc"; text: Text; options: [Text, Text, Text, Text]; answer: 0 | 1 | 2 | 3 }
  | { id: string; kind: "tf"; text: Text; answer: 0 | 1 };

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

export type Stage = "joined" | "lobby" | "question" | "reveal" | "between";

/**
 * What the quiz screen draws at each moment. Today the demo's session driver produces it (api/mock/quiz.ts);
 * the live session engine will produce the same picture from the server's snapshots and events.
 */
export type QuizRun = {
  stage: Stage;
  index: number;
  total: number;
  last: boolean;
  question: Question;
  duration: number;
  stageAt: number;
  elapsed: number;
  secondsLeft: number;
  picked: number | null;
  /** How many of the others have answered, out of `classSize`. */
  answered: number;
  classSize: number;
  /** The others in this session, in the script the school wrote them: names for the faces and the ranking. */
  classmates: string[];
  joined: number;
  /** Indexes into `classmates` of the last few to join, newest first. */
  joinedRecent: number[];
  points: number;
  gain: number;
  bonus: number;
  correct: boolean;
  right: number;
  rank: number;
  rankBefore: number;
  /** The others' points in this session, by index into `classmates`. */
  theirs: number[];
  pick: (option: number) => void;
};
