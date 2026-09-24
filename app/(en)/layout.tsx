import { SiteDocument, siteMetadata, siteViewport } from "@/components/site/SiteDocument";
import { en } from "@/content/site/en";

export const metadata = siteMetadata(en);
export const viewport = siteViewport;

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <SiteDocument lang="en">{children}</SiteDocument>;
}
