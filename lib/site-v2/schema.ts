import type { Lang } from "@/content/site-v2/types";

/*
  The website's Schema.org graph, one per page. It names TeacherAid once, as an organisation in
  Bitola with one product, so search engines and answer engines can tell it apart from the other
  products with similar names (TeachAid, Teacher Aide).

  Only types Google still supports and only facts that are on the page. Deliberately absent:
  FAQPage (Google retired FAQ rich results on 2026-05-07), HowTo, speakable, offers and ratings
  (no public price, no reviews yet), and sameAs (no official profiles yet; add them here when
  they exist). The reasoning is in .claude/skills/README.md.
*/

export type PageSchemaInput = {
  /** The site's origin, without a trailing slash. */
  origin: string;
  lang: Lang;
  /** The page's path: "/" for the Macedonian home page. */
  path: string;
  name: string;
  description: string;
  /** ISO date the page's words last changed. */
  updated: string;
  /** The home page is a WebPage; the rest say what they are. */
  type?: "WebPage" | "AboutPage";
  /** Breadcrumb from the home page down to this page, home first. Omitted on the home page. */
  crumbs?: { name: string; path: string }[];
};

const inLanguage: Record<Lang, string> = { mk: "mk", en: "en" };

export function absolute(origin: string, path: string): string {
  return path === "/" ? `${origin}/` : `${origin}${path}`;
}

export function pageSchema(input: PageSchemaInput) {
  const { origin, lang, path, name, description, updated, type = "WebPage", crumbs } = input;
  const org = `${origin}/#organization`;
  const site = `${origin}/#website`;
  const app = `${origin}/#app`;
  const url = absolute(origin, path);
  const page = `${url}#webpage`;

  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": org,
      name: "TeacherAid",
      url: `${origin}/`,
      email: "hello@teacheraid.education",
      logo: {
        "@type": "ImageObject",
        url: `${origin}/brand/teacheraid-app-icon-square.png`,
        width: 1024,
        height: 1024,
      },
      description:
        lang === "mk"
          ? "Тим од Битола што прави апликација за часот за средни училишта и факултети во Македонија."
          : "A team from Bitola making a classroom app for secondary schools and universities in North Macedonia.",
      address: { "@type": "PostalAddress", addressLocality: "Bitola", addressCountry: "MK" },
      areaServed: { "@type": "Country", name: "North Macedonia" },
      knowsLanguage: ["mk", "en"],
    },
    {
      "@type": "WebSite",
      "@id": site,
      url: `${origin}/`,
      name: "TeacherAid",
      inLanguage: ["mk", "en"],
      publisher: { "@id": org },
    },
    {
      "@type": "WebApplication",
      "@id": app,
      name: "TeacherAid",
      url: `${origin}/`,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (runs in a web browser)",
      browserRequirements: "A current web browser; students use their phone's browser.",
      inLanguage: "mk",
      publisher: { "@id": org },
      audience: [
        { "@type": "EducationalAudience", educationalRole: "teacher" },
        { "@type": "EducationalAudience", educationalRole: "administrator" },
      ],
      description:
        lang === "mk"
          ? "Од лекцијата на наставникот прави прашања за часот. Учениците одговараат на своите телефони, присуството се запишува со скенирање на QR-код, а директорот секој месец добива извештај."
          : "Turns the teacher's lesson into questions for class. Students answer on their phones, attendance is taken by scanning a QR code, and the director gets a monthly report.",
      featureList:
        lang === "mk"
          ? [
              "Прашања од лекцијата (PDF, Word или текст), со точни одговори и објаснувања",
              "Прашања во живо на телефоните на учениците",
              "Присуство со QR-код што се менува на секои 30 секунди",
              "Список на присутни, задоцнети и отсутни за е-Дневник",
              "Анонимни прашања од учениците до наставникот",
              "Месечен извештај за директорот, без имиња на ученици",
            ]
          : [
              "Questions from the lesson (PDF, Word or text), with right answers and explanations",
              "Live questions on students' phones",
              "Attendance by a QR code that changes every 30 seconds",
              "A list of present, late and absent students for e-Dnevnik",
              "Anonymous questions from students to the teacher",
              "A monthly report for the director, with no student names",
            ],
    },
    {
      "@type": type,
      "@id": page,
      url,
      name,
      description,
      inLanguage: inLanguage[lang],
      isPartOf: { "@id": site },
      about: { "@id": app },
      publisher: { "@id": org },
      dateModified: updated,
      ...(crumbs ? { breadcrumb: { "@id": `${url}#breadcrumb` } } : {}),
    },
  ];

  if (crumbs) {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: absolute(origin, c.path),
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/** The graph as script text, with "<" escaped so no string can close the tag. */
export function serializeSchema(schema: unknown): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}
