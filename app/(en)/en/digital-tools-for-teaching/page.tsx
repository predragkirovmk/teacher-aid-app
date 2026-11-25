import { ArticlePage } from "@/components/site-v2/ArticlePage";
import { articleMetadata } from "@/components/site-v2/Document";
import { en } from "@/content/site-v2/en";
import { pages } from "@/content/site-v2/pages";

const page = pages.tools.en;

export const metadata = articleMetadata(page);

export default function DigitalToolsEn() {
  return <ArticlePage t={en} page={page} />;
}
