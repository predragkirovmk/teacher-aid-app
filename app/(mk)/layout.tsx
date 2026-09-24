import { SiteDocument, siteMetadata, siteViewport } from "@/components/site/SiteDocument";
import { mk } from "@/content/site/mk";

export const metadata = siteMetadata(mk);
export const viewport = siteViewport;

export default function MacedonianLayout({ children }: LayoutProps<"/">) {
  return <SiteDocument lang="mk">{children}</SiteDocument>;
}
