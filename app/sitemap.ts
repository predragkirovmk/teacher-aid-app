import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-v2/url";
import { homePaths, pageOrder, pagePaths, pageUpdated } from "@/content/site-v2/pages";
import type { Lang } from "@/content/site-v2/types";

const LANGS: Lang[] = ["mk", "en"];

const url = (path: string) => (path === "/" ? `${siteUrl}/` : `${siteUrl}${path}`);

// Every public page in both languages, each listing its pair. lastModified is the date the
// page's words last changed (content/site-v2/pages.ts), never the build date.
export default function sitemap(): MetadataRoute.Sitemap {
  const entries = [
    { paths: homePaths, updated: pageUpdated.home },
    ...pageOrder.map((key) => ({ paths: pagePaths[key], updated: pageUpdated[key] })),
  ];
  return entries.flatMap(({ paths, updated }) => {
    const languages = { mk: url(paths.mk), en: url(paths.en) };
    return LANGS.map((lang) => ({ url: url(paths[lang]), lastModified: new Date(updated), alternates: { languages } }));
  });
}
