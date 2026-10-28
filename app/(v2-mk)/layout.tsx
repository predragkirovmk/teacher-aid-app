import { SiteV2Document, siteV2Metadata, siteV2Viewport } from "@/components/site-v2/Document";
import { mk } from "@/content/site-v2/mk";

export const metadata = siteV2Metadata(mk);
export const viewport = siteV2Viewport;

export default function MacedonianV2Layout({ children }: { children: React.ReactNode }) {
  return <SiteV2Document lang="mk">{children}</SiteV2Document>;
}
