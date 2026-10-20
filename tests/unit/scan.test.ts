import { describe, expect, it } from "vitest";
import { checkinLink, interpretCode } from "@/lib/app/scan";

describe("interpretCode", () => {
  it("reads a check-in link, whatever the host, with or without a slash, query or hash", () => {
    for (const raw of [
      "https://teacher-aid-bitola.vercel.app/app/checkin/MATH-7B",
      "http://localhost:3000/app/checkin/MATH-7B/",
      "https://teacheraid.education/app/checkin/MATH-7B?utm=qr",
      "https://teacheraid.education/app/checkin/MATH-7B#top",
      "/app/checkin/MATH-7B",
    ]) {
      expect(interpretCode(raw), raw).toMatchObject({ kind: "code", code: "MATH-7B" });
    }
  });

  it("reads a TA: string in any case", () => {
    expect(interpretCode("TA:PHYS-7B")).toMatchObject({ kind: "code", code: "PHYS-7B" });
    expect(interpretCode("ta:phys-7b")).toMatchObject({ kind: "code", code: "phys-7b" });
  });

  it("reads the bare code someone types", () => {
    expect(interpretCode("MATH-7B")).toMatchObject({ kind: "code", code: "MATH-7B" });
    expect(interpretCode("eng-7b")).toMatchObject({ kind: "code", code: "eng-7b" });
    expect(interpretCode("MKD-12")).toMatchObject({ kind: "code", code: "MKD-12" });
  });

  it("trims what it is given and keeps the trimmed text as raw", () => {
    expect(interpretCode("  MATH-7B \n")).toEqual({ kind: "code", code: "MATH-7B", raw: "MATH-7B" });
  });

  it("calls everything else other, so it never reaches the API (EC-JOIN-03)", () => {
    for (const raw of [
      "",
      "hello",
      "https://example.com",
      "https://example.com/app/checkin/",
      "https://example.com/app/checkin/MATH 7B",
      "https://example.com/app/checkin/MATH-7B/extra",
      "TA:",
      "TA:has space",
      "MATH7B",
      "M-7B",
      "TOOLONG-7B",
      "MATH-1234",
      "javascript:alert(1)",
    ]) {
      expect(interpretCode(raw), raw).toMatchObject({ kind: "other" });
    }
  });

  it("only takes letters, digits and hyphens as a code", () => {
    const r = interpretCode("https://x.test/app/checkin/MATH-7B%3Cscript%3E");
    expect(r.kind).toBe("other");
  });
});

describe("checkinLink", () => {
  it("builds the link a printed QR carries, which interpretCode reads back", () => {
    const link = checkinLink("https://teacher-aid-bitola.vercel.app", "MATH-7B");
    expect(link).toBe("https://teacher-aid-bitola.vercel.app/app/checkin/MATH-7B");
    expect(interpretCode(link)).toMatchObject({ kind: "code", code: "MATH-7B" });
  });
});
