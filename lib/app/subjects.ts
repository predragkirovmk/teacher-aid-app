import { dictionaries, type Key } from "./i18n";

export type Tone = "yellow" | "ice" | "deep";

/** How a subject looks: the colour of its card, the glyphs behind its name and the letter that marks it. */
export type SubjectStyle = {
  tone: Tone;
  glyphs: string;
  /** A letter where the subject has one (π, Ω, Ѓ, Aa, Ä); the rest use an icon (SubjectMark). */
  mark?: string;
};

/** The look of the subjects the app has drawn. The API names a subject; the look is the app's own. */
const STYLES: Record<string, SubjectStyle> = {
  mkd: { tone: "deep", glyphs: "Ѓ  Љ  Њ  Ќ", mark: "Ѓ" },
  math: { tone: "yellow", glyphs: "÷ 3,14 × ∑", mark: "π" },
  english: { tone: "yellow", glyphs: "Aa  Bb  Zz", mark: "Aa" },
  german: { tone: "ice", glyphs: "Ää  Öö  ß", mark: "Ä" },
  physics: { tone: "ice", glyphs: "F=ma  ν  Ω", mark: "Ω" },
  biology: { tone: "yellow", glyphs: "CO₂  H₂O" },
  history: { tone: "deep", glyphs: "1903  1944  1991" },
  geography: { tone: "ice", glyphs: "41°N  21°E" },
  informatics: { tone: "deep", glyphs: "</>  {}  01" },
  art: { tone: "yellow", glyphs: "RGB  CMYK" },
  music: { tone: "ice", glyphs: "♩ ♪ ♫ ♬" },
  pe: { tone: "deep", glyphs: "4×100  1:0" },
};

const TONES: Tone[] = ["yellow", "ice", "deep"];

/** A subject the app has not drawn gets a tone from its code and its first letter, so it still reads as its own. */
export function subjectStyle(subjectId: string, subjectName: string): SubjectStyle {
  const known = STYLES[subjectId];
  if (known) return known;
  let h = 0;
  for (const ch of subjectId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { tone: TONES[h % TONES.length], glyphs: "", mark: Array.from(subjectName.trim())[0]?.toUpperCase() };
}

/** The subject's name in the app's own words where it has them, else as the school wrote it. */
export function subjectLabel(t: (key: Key) => string, subjectId: string, subjectName: string): string {
  const key = `subj.${subjectId}`;
  return key in dictionaries.en ? t(key as Key) : subjectName;
}
