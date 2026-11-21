import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { termsMetadata } from "@/components/site-v2/TermsPage";
import { CONTACT, operatorCity, team, terms, termsPaths } from "@/content/site-v2/terms";

/**
 * The terms of service (content/site-v2/terms.ts). Macedonian is the binding text and English its translation, so the two
 * must be the same document clause for clause: a clause added to one and not the other would make them differ in law.
 */
describe("the terms of service", () => {
  const blocks = (lang: "mk" | "en") =>
    terms[lang].sections.map((s) =>
      s.blocks.map((b) =>
        "p" in b
          ? `p:${b.p.match(/^(\d+\.\d+)\./)?.[1] ?? ""}`
          : `ul:${b.ul.length}`,
      ),
    );

  it("has the same sections, in the same order, in both languages", () => {
    expect(terms.en.sections.map((s) => s.id)).toEqual(
      terms.mk.sections.map((s) => s.id),
    );
    terms.mk.sections.forEach((s, i) =>
      expect(terms.en.sections[i].title.split(".")[0]).toBe(
        s.title.split(".")[0],
      ),
    );
  });

  it("has the same clauses and lists, numbered the same, in both languages", () => {
    expect(blocks("en")).toEqual(blocks("mk"));
    expect(terms.en.summary.length).toBe(terms.mk.summary.length);
  });

  it("numbers the sections 1 to 24 without a gap", () => {
    expect(terms.mk.sections.map((s) => Number(s.title.split(".")[0]))).toEqual(
      terms.mk.sections.map((_, i) => i + 1),
    );
  });

  it("refers only to clauses that exist", () => {
    for (const lang of ["mk", "en"] as const) {
      const text = JSON.stringify(terms[lang].sections);
      const clauses = new Set(
        terms[lang].sections.flatMap((s) =>
          s.blocks.flatMap((b) =>
            "p" in b ? (b.p.match(/^(\d+\.\d+)\./)?.slice(1) ?? []) : [],
          ),
        ),
      );
      const sections = new Set(
        terms[lang].sections.map((s) => s.title.split(".")[0]),
      );
      const refs = [
        ...text.matchAll(
          /(?:точка|точките|points?) ((?:\d+(?:\.\d+)?(?:, | и | and )?)+)/g,
        ),
      ]
        .flatMap((m) => m[1].split(/, | и | and /))
        .filter(Boolean);
      expect(refs.length).toBeGreaterThan(5);
      for (const ref of refs)
        expect(
          ref.includes(".") ? clauses.has(ref) : sections.has(ref),
          `${lang} ${ref}`,
        ).toBe(true);
    }
  });

  it("names the court in Bitola and the one contact address", () => {
    expect(JSON.stringify(terms.mk)).toContain("суд во Битола");
    expect(JSON.stringify(terms.en)).toContain(
      "court with subject-matter jurisdiction in Bitola",
    );
    expect(CONTACT).toBe("hello@teacheraid.education");
    expect(operatorCity.mk).toBe("Битола");
    // The team that runs the service is named, in full, where the terms say who provides it and in the contact.
    for (const lang of ["mk", "en"] as const) {
      const who = terms[lang].sections.find((x) => x.id === "who")!;
      const contact = terms[lang].sections.find((x) => x.id === "contact")!;
      for (const name of team) {
        expect(JSON.stringify(who.blocks), `${lang} ${name}`).toContain(name);
        expect(JSON.stringify(contact.blocks), `${lang} ${name}`).toContain(name);
      }
    }
  });

  it("has no blank left to fill in: no [bracketed] text anywhere", () => {
    for (const lang of ["mk", "en"] as const) {
      const words = [...terms[lang].summary, ...terms[lang].sections.flatMap((s) => s.blocks.flatMap((b) => ("p" in b ? [b.p] : b.ul)))];
      for (const w of words) expect(w, w).not.toMatch(/\[[^\]]*\]/);
    }
  });

  it("stays out of search results and the sitemap, with each language naming the other", () => {
    for (const lang of ["mk", "en"] as const) {
      const meta = termsMetadata(terms[lang]);
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe(termsPaths[lang]);
    }
    expect(
      sitemap().some(
        (e) => e.url.endsWith(termsPaths.mk) || e.url.endsWith(termsPaths.en),
      ),
    ).toBe(false);
  });
});
