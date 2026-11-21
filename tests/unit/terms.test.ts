import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { legalMetadata } from "@/components/site-v2/LegalPage";
import { privacy, privacyLegal } from "@/content/site-v2/privacy";
import { CONTACT, operatorCity, team, terms, termsLegal, type TermsDict } from "@/content/site-v2/terms";

/**
 * The terms of service (content/site-v2/terms.ts) and the privacy policy (content/site-v2/privacy.ts). Macedonian is the
 * binding text and English its translation, so the two must be the same document clause for clause: a clause added to
 * one and not the other would make them differ in law.
 */
const DOCS = [
  { name: "terms", doc: terms, legal: termsLegal },
  { name: "privacy policy", doc: privacy, legal: privacyLegal },
] as const;

const clauseOf = (p: string) => p.match(/^(\d+\.\d+)\./)?.[1] ?? "";
const shape = (d: TermsDict) => d.sections.map((s) => s.blocks.map((b) => ("p" in b ? `p:${clauseOf(b.p)}` : `ul:${b.ul.length}`)));
const words = (d: TermsDict) => [...d.summary, ...d.sections.flatMap((s) => s.blocks.flatMap((b) => ("p" in b ? [b.p] : b.ul)))];

describe.each(DOCS)("the $name", ({ doc, legal }) => {
  it("has the same sections, clauses and lists, numbered the same, in both languages", () => {
    expect(doc.en.sections.map((s) => s.id)).toEqual(doc.mk.sections.map((s) => s.id));
    doc.mk.sections.forEach((s, i) => expect(doc.en.sections[i].title.split(".")[0]).toBe(s.title.split(".")[0]));
    expect(shape(doc.en)).toEqual(shape(doc.mk));
    expect(doc.en.summary.length).toBe(doc.mk.summary.length);
  });

  it("numbers its sections from 1 without a gap", () => {
    expect(doc.mk.sections.map((s) => Number(s.title.split(".")[0]))).toEqual(doc.mk.sections.map((_, i) => i + 1));
  });

  it("has no blank left to fill in: no [bracketed] text anywhere", () => {
    for (const lang of ["mk", "en"] as const) for (const w of words(doc[lang])) expect(w, w).not.toMatch(/\[[^\]]*\]/);
  });

  it("names the team that runs TeacherAid, in full, where it says who we are and in the contact", () => {
    expect(operatorCity.mk).toBe("Битола");
    for (const lang of ["mk", "en"] as const) {
      for (const id of ["who", "contact"]) {
        const text = JSON.stringify(doc[lang].sections.find((s) => s.id === id)!.blocks);
        for (const name of team) expect(text, `${lang} ${id} ${name}`).toContain(name);
        expect(text).toContain(CONTACT);
      }
    }
  });

  it("stays out of search results and the sitemap, with each language naming the other", () => {
    for (const lang of ["mk", "en"] as const) {
      const meta = legalMetadata(doc[lang], legal);
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(legal.paths[lang]);
    }
    expect(sitemap().some((e) => e.url.endsWith(legal.paths.mk) || e.url.endsWith(legal.paths.en))).toBe(false);
  });
});

describe("the terms of service", () => {
  it("refers only to points that exist", () => {
    for (const lang of ["mk", "en"] as const) {
      const text = JSON.stringify(terms[lang].sections);
      const clauses = new Set(terms[lang].sections.flatMap((s) => s.blocks.flatMap((b) => ("p" in b && clauseOf(b.p) ? [clauseOf(b.p)] : []))));
      const sections = new Set(terms[lang].sections.map((s) => s.title.split(".")[0]));
      const refs = [...text.matchAll(/(?:точка|точките|points?) ((?:\d+(?:\.\d+)?(?:, | и | and )?)+)/g)]
        .flatMap((m) => m[1].split(/, | и | and /))
        .filter(Boolean);
      expect(refs.length).toBeGreaterThan(5);
      for (const ref of refs) expect(ref.includes(".") ? clauses.has(ref) : sections.has(ref), `${lang} ${ref}`).toBe(true);
    }
  });

  it("names the court in Bitola", () => {
    expect(JSON.stringify(terms.mk)).toContain("суд во Битола");
    expect(JSON.stringify(terms.en)).toContain("court with subject-matter jurisdiction in Bitola");
  });

  it("points to the privacy policy, in the reader's language, where it speaks of personal data", () => {
    expect(JSON.stringify(terms.mk.sections.find((s) => s.id === "data"))).toContain("teacheraid.education/privatnost");
    expect(JSON.stringify(terms.en.sections.find((s) => s.id === "data"))).toContain("teacheraid.education/en/privacy");
  });
});

describe("the privacy policy", () => {
  it("points to the students' own notice and to the Agency", () => {
    for (const lang of ["mk", "en"] as const) {
      const text = JSON.stringify(privacy[lang].sections);
      expect(text).toContain("teacheraid.education/app/privacy");
      expect(text).toContain("azlp.mk");
    }
  });

  it("refers only to points of the terms of service that exist", () => {
    const clauses = new Set(terms.mk.sections.flatMap((s) => s.blocks.flatMap((b) => ("p" in b && clauseOf(b.p) ? [clauseOf(b.p)] : []))));
    for (const lang of ["mk", "en"] as const) {
      for (const [, ref] of JSON.stringify(privacy[lang].sections).matchAll(/(?:точка|point) (\d+\.\d+)\)/g)) expect(clauses.has(ref), ref).toBe(true);
    }
  });
});
