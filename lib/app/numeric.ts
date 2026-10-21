import type { Locale } from "./api/types";

/**
 * Numeric answers (spec FR-ANS-02, EC-Q-01, AC-ANS-04). A student types a number the way their phone's keypad
 * gives it: Macedonian writes 0,2, a keypad in English gives 0.2, and iOS's decimal pad has no minus at all, so
 * both separators are accepted and the sign is a key of its own where the question allows one. What goes to
 * the server is the number as plain text with a point (`"0.2"`, `"-3"`), never a float, so it cannot change
 * on the way (0.1 + 0.2 is not 0.3).
 */

/** The most digits an answer may have; longer is not a number a quiz asks for. */
export const NUMERIC_MAX_DIGITS = 15;

export type NumericProblem = "empty" | "not_number" | "negative";
export type NumericParse = { ok: true; value: string } | { ok: false; problem: NumericProblem };

/** U+2212 and the dashes a keyboard may give for a minus. */
const MINUS = /[−‒–—]/g;

/**
 * What a student typed as the number it is, in canonical text, or what is wrong with it. Spaces at the ends
 * go; a space inside, two separators ("1.000,5") or letters make it "not a number". `-0` is `0`.
 */
export function parseNumeric(input: string, allowNegative: boolean): NumericParse {
  const text = input.replace(MINUS, "-").trim();
  if (text === "") return { ok: false, problem: "empty" };
  const m = /^([-+])?(\d*)(?:[.,](\d*))?$/.exec(text);
  if (!m) return { ok: false, problem: "not_number" };
  const [, sign, whole = "", fraction = ""] = m;
  if (whole === "" && fraction === "") return { ok: false, problem: "not_number" };
  if (whole.length + fraction.length > NUMERIC_MAX_DIGITS) return { ok: false, problem: "not_number" };
  const int = whole.replace(/^0+(?=\d)/, "") || "0";
  const frac = fraction.replace(/0+$/, "");
  const zero = /^0*$/.test(whole) && frac === "";
  if (sign === "-" && !allowNegative) return { ok: false, problem: "negative" };
  return { ok: true, value: `${sign === "-" && !zero ? "-" : ""}${int}${frac ? `.${frac}` : ""}` };
}

/** A canonical number as the student reads it: a comma in Macedonian, a point in English, a true minus sign. */
export function formatNumeric(value: string, locale: Locale): string {
  const out = value.replace("-", "−");
  return locale === "mk" ? out.replace(".", ",") : out;
}

/** The number with its unit, a no-break space between so they never part across a line. */
export const withUnit = (shown: string, unit: string | null) => (unit ? `${shown} ${unit}` : shown);

/** Whether `response` is right for `correct` within the author's absolute tolerance, edges included (AC-ANS-04). */
export function withinTolerance(response: string, correct: string, tolerance: number): boolean {
  const a = Number(response);
  const b = Number(correct);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tolerance + 1e-9;
}

/** Flip the sign of what is typed: the minus key. Works on text that is not a number yet ("", "3,"). */
export function toggleMinus(input: string): string {
  const text = input.replace(MINUS, "-");
  return text.startsWith("-") ? text.slice(1) : `-${text}`;
}
