import { ArticlePage } from "@/components/site-v2/ArticlePage";
import { articleMetadata } from "@/components/site-v2/Document";
import { mk } from "@/content/site-v2/mk";
import { pages } from "@/content/site-v2/pages";

const page = pages.mentimeter.mk;

export const metadata = articleMetadata(page);

export default function MentimeterMk() {
  return <ArticlePage t={mk} page={page} />;
}
