import type { MetadataRoute } from "next";
import { siteUrl } from "@/components/site/SiteDocument";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { mk: `${siteUrl}/`, en: `${siteUrl}/en` };
  return [
    { url: `${siteUrl}/`, lastModified: new Date("2026-09-24"), alternates: { languages } },
    { url: `${siteUrl}/en`, lastModified: new Date("2026-09-24"), alternates: { languages } },
  ];
}
