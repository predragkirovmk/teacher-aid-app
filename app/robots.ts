import type { MetadataRoute } from "next";
import { siteUrl } from "@/components/site/SiteDocument";

// The site is public; the Startup Weekend demo screens stay out of search.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/demo", "/host", "/j/", "/print"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
