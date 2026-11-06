import { describe, expect, it } from "vitest";
import { homePaths, pageOrder, pagePaths, pages, pageUpdated } from "@/content/site-v2/pages";
import { pageSchema, serializeSchema } from "@/lib/site-v2/schema";
import sitemap from "@/app/sitemap";

const ORIGIN = "https://teacheraid.education";

describe("website pages", () => {
  it("has every page in both languages, at distinct paths", () => {
    const paths = [homePaths.mk, homePaths.en, ...pageOrder.flatMap((k) => [pagePaths[k].mk, pagePaths[k].en])];
    expect(new Set(paths).size).toBe(paths.length);
    for (const key of pageOrder) {
      expect(pages[key].mk.lang).toBe("mk");
      expect(pages[key].en.lang).toBe("en");
      expect(pagePaths[key].en.startsWith("/en/")).toBe(true);
      expect(pagePaths[key].mk.startsWith("/en")).toBe(false);
    }
  });

  it("gives every page a title and description that fit a search result", () => {
    for (const key of pageOrder) {
      for (const lang of ["mk", "en"] as const) {
        const { title, description } = pages[key][lang].meta;
        expect(title.length).toBeLessThanOrEqual(75);
        expect(description.length).toBeGreaterThan(80);
        expect(description.length).toBeLessThanOrEqual(240);
      }
    }
  });

  it("keeps the two language versions of a page the same shape", () => {
    for (const key of pageOrder) {
      const mk = pages[key].mk.sections;
      const en = pages[key].en.sections;
      expect(en.length).toBe(mk.length);
      mk.forEach((s, i) => expect(en[i].items?.length ?? 0).toBe(s.items?.length ?? 0));
    }
  });
});

describe("structured data", () => {
  const schema = pageSchema({
    origin: ORIGIN,
    lang: "mk",
    path: "/prasanja",
    name: "Прашања",
    description: "Опис",
    updated: "2026-10-31",
    crumbs: [
      { name: "Почетна", path: "/" },
      { name: "Прашања", path: "/prasanja" },
    ],
  });
  const types = schema["@graph"].map((n) => n["@type"]);

  it("describes the organisation, the site, the app, the page and its breadcrumb", () => {
    expect(types).toEqual(["Organization", "WebSite", "WebApplication", "WebPage", "BreadcrumbList"]);
  });

  it("uses no type Google has retired", () => {
    const text = JSON.stringify(schema);
    for (const retired of ["FAQPage", "HowTo", "SpeakableSpecification"]) expect(text).not.toContain(retired);
  });

  it("links the breadcrumb to absolute URLs, home with its trailing slash", () => {
    const crumbs = schema["@graph"][4] as { itemListElement: { item: string }[] };
    expect(crumbs.itemListElement.map((i) => i.item)).toEqual([`${ORIGIN}/`, `${ORIGIN}/prasanja`]);
  });

  it("cannot close its own script tag", () => {
    expect(serializeSchema({ x: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});

describe("sitemap", () => {
  it("lists every page in both languages with its real date and its pair", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(2 + pageOrder.length * 2);
    const faq = entries.find((e) => e.url.endsWith("/prasanja"));
    expect(faq?.lastModified).toEqual(new Date(pageUpdated.faq));
    expect(Object.keys(faq?.alternates?.languages ?? {})).toEqual(["mk", "en"]);
  });
});
