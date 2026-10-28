import { SiteV2Document, siteV2Metadata, siteV2Viewport } from "@/components/site-v2/Document";
import { en } from "@/content/site-v2/en";

export const metadata = siteV2Metadata(en);
export const viewport = siteV2Viewport;

export default function EnglishV2Layout({ children }: { children: React.ReactNode }) {
  return <SiteV2Document lang="en">{children}</SiteV2Document>;
}
