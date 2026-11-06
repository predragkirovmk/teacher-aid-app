import { describe, expect, it } from "vitest";
import { formatDate, formatLongDate, formatPoints, formatTime } from "@/lib/app/format";
import { initials, personName, transliterate } from "@/lib/app/quiz";

import { NAME_MAX, NAME_MIN, PHOTO_MAX_BYTES, cleanName, nameError } from "@/lib/app/profile-rules";

describe("dates and numbers", () => {
  const ms = new Date(2026, 9, 2, 7, 5).getTime();

  it("writes a short date by hand in both languages", () => {
    expect(formatDate(ms, "mk")).toBe("2 окт");
    expect(formatDate(ms, "en")).toBe("2 Oct");
  });

  it("writes a long date with the whole month", () => {
    expect(formatLongDate(ms, "mk")).toBe("2 октомври");
    expect(formatLongDate(ms, "en")).toBe("2 October");
  });

  it("writes a time with two digits each", () => {
    expect(formatTime(ms)).toBe("07:05");
  });

  it("groups thousands the local way", () => {
    expect(formatPoints(1480, "mk")).toBe("1.480");
    expect(formatPoints(1480, "en")).toBe("1,480");
    expect(formatPoints(999, "mk")).toBe("999");
    expect(formatPoints(1_234_567, "en")).toBe("1,234,567");
    expect(formatPoints(0, "en")).toBe("0");
  });
});

describe("names", () => {
  it("writes Macedonian in Latin letters for the English interface", () => {
    expect(transliterate("Марко Трајковски")).toBe("Marko Trajkovski");
    expect(transliterate("Ѓорѓи Наумов")).toBe("Gjorgji Naumov");
    expect(transliterate("Џемо Шарац")).toBe("Dzhemo Sharac");
    expect(transliterate("Њега Љубов Ќе")).toBe("Njega Ljubov Kje");
    expect(transliterate("Ana 7B")).toBe("Ana 7B");
  });

  it("leaves a name alone in Macedonian", () => {
    expect(personName("Ана Георгиевска", "mk")).toBe("Ана Георгиевска");
    expect(personName("Ана Георгиевска", "en")).toBe("Ana Georgievska");
  });

  it("takes the first and last initial, or the first two letters of one name", () => {
    expect(initials("Марко Трајковски")).toBe("МТ");
    expect(initials("Ана Марија Ѓорѓиева")).toBe("АЃ");
    expect(initials("  ана  ")).toBe("АН");
    expect(initials("")).toBe("");
  });
});

describe("the display name", () => {
  it("is 2 to 24 characters", () => {
    expect([NAME_MIN, NAME_MAX]).toEqual([2, 24]);
    expect(nameError("")).toBe("empty");
    expect(nameError("   ")).toBe("empty");
    expect(nameError("А")).toBe("short");
    expect(nameError("Ан")).toBeNull();
    expect(nameError("А".repeat(NAME_MAX))).toBeNull();
    expect(nameError("А".repeat(NAME_MAX + 1))).toBe("long");
  });

  it("counts letters, not UTF-16 units, and collapses spaces first", () => {
    expect(cleanName("  Марко   Т ")).toBe("Марко Т");
    expect(nameError(" А ")).toBe("short");
    expect(nameError("А   Б")).toBeNull();
    // Letters outside the basic plane take two UTF-16 units but count once.
    expect(nameError("𐐀".repeat(NAME_MAX))).toBeNull();
    expect(nameError(`${"А".repeat(NAME_MAX)}   `)).toBeNull();
  });

  it("takes letters of any script with spaces, hyphens, apostrophes and full stops", () => {
    for (const ok of ["Ана-Марија", "O'Neil", "Марко Т.", "Zoë", "Ана Марија Ѓорѓиева"]) expect(nameError(ok), ok).toBeNull();
  });

  it("refuses digits, symbols and emoji, and a name that starts with a mark", () => {
    for (const bad of ["Ана1", "1Ана", "Ана!", "Ана@", "😀😀", "-Ана", ".Ана"]) expect(nameError(bad), bad).toBe("chars");
  });

  it("limits a photo to 200 KB", () => {
    expect(PHOTO_MAX_BYTES).toBe(200 * 1024);
  });
});
