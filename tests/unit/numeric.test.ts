import { describe, expect, it } from "vitest";
import { formatNumeric, parseNumeric, toggleMinus, withUnit, withinTolerance } from "@/lib/app/numeric";

const value = (s: string, neg = false) => {
  const r = parseNumeric(s, neg);
  return r.ok ? r.value : r.problem;
};

describe("parseNumeric", () => {
  it("takes a comma or a point as the decimal separator (EC-Q-01)", () => {
    expect(value("0,2")).toBe("0.2");
    expect(value("0.2")).toBe("0.2");
    expect(value("3,25")).toBe("3.25");
  });

  it("reads 2601,0 as 2601 (AC-ANS-04)", () => {
    expect(value("2601,0")).toBe("2601");
    expect(value("2601.00")).toBe("2601");
  });

  it("is canonical: no leading or trailing zeros, no bare separator", () => {
    expect(value("007")).toBe("7");
    expect(value("0,50")).toBe("0.5");
    expect(value(",5")).toBe("0.5");
    expect(value("5,")).toBe("5");
    expect(value("  12  ")).toBe("12");
    expect(value("0")).toBe("0");
    expect(value("000")).toBe("0");
  });

  it("says empty for nothing at all, however many spaces", () => {
    expect(value("")).toBe("empty");
    expect(value("   ")).toBe("empty");
  });

  it("says not a number for letters, two separators, inner spaces and a lone sign or separator", () => {
    for (const s of ["abc", "1a", "1.000,5", "1,2,3", "1 000", ",", ".", "-", "+", "1e5", "--1", "0x10"]) expect(value(s, true), s).toBe("not_number");
  });

  it("takes a minus only where the question allows one", () => {
    expect(value("-3", true)).toBe("-3");
    expect(value("-2,5", true)).toBe("-2.5");
    expect(value("−2,5", true)).toBe("-2.5");
    expect(value("-3", false)).toBe("negative");
    expect(value("+3", false)).toBe("3");
  });

  it("makes minus zero plain zero", () => {
    expect(value("-0", true)).toBe("0");
    expect(value("-0,00", true)).toBe("0");
  });

  it("refuses a number longer than anyone means", () => {
    expect(value("1".repeat(15))).toBe("1".repeat(15));
    expect(value("1".repeat(16))).toBe("not_number");
  });
});

describe("formatNumeric and withUnit", () => {
  it("writes a comma in Macedonian and a point in English, with a true minus", () => {
    expect(formatNumeric("3.25", "mk")).toBe("3,25");
    expect(formatNumeric("3.25", "en")).toBe("3.25");
    expect(formatNumeric("-2.5", "mk")).toBe("−2,5");
    expect(formatNumeric("12", "mk")).toBe("12");
  });

  it("keeps the unit on the number's line", () => {
    expect(withUnit("5", "m/s²")).toBe("5 m/s²");
    expect(withUnit("5", null)).toBe("5");
  });
});

describe("withinTolerance", () => {
  it("follows AC-ANS-04: 2601 within 10 takes 2595 and 2611, not 2590", () => {
    expect(withinTolerance("2595", "2601", 10)).toBe(true);
    expect(withinTolerance("2611", "2601", 10)).toBe(true);
    expect(withinTolerance("2590", "2601", 10)).toBe(false);
    expect(withinTolerance("2612", "2601", 10)).toBe(false);
  });

  it("takes only the exact value at tolerance 0, and survives float noise at the edge", () => {
    expect(withinTolerance("3.25", "3.25", 0)).toBe(true);
    expect(withinTolerance("3.26", "3.25", 0)).toBe(false);
    expect(withinTolerance("0.3", "0.1", 0.2)).toBe(true);
  });
});

describe("toggleMinus", () => {
  it("adds and takes away the sign, also on text that is not a number yet", () => {
    expect(toggleMinus("")).toBe("-");
    expect(toggleMinus("3,5")).toBe("-3,5");
    expect(toggleMinus("-3,5")).toBe("3,5");
    expect(toggleMinus("−3")).toBe("3");
  });
});
