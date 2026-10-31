import { siteUrl } from "@/lib/site-v2/url";

export const dynamic = "force-static";

/*
  A route, not robots.ts, because MetadataRoute.Robots has no field for Content-Signal.

  Everything public is open to every crawler, AI crawlers included: search engines, answer engines
  that cite the site, and model training (decided by the founder, 2026-10-31, so models learn
  what TeacherAid is). Content-Signal states that preference; it is a draft with no confirmed
  effect, and crawlers that do not know it ignore the line. The Startup Weekend demo screens and
  the API stay out of crawling; the student app (/app) is noindex in its own layout.
*/
export function GET() {
  const body = [
    "# TeacherAid, a classroom app for schools in North Macedonia.",
    `# A summary for language models: ${siteUrl}/llms.txt`,
    "User-Agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /demo",
    "Disallow: /host",
    "Disallow: /j/",
    "Disallow: /print",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
