import { TermsPage, termsMetadata } from "@/components/site-v2/TermsPage";
import { en } from "@/content/site-v2/en";
import { terms } from "@/content/site-v2/terms";

const doc = terms.en;

export const metadata = termsMetadata(doc);

export default function TermsEn() {
  return <TermsPage t={en} doc={doc} />;
}
