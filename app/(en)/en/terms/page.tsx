import { LegalPage, legalMetadata } from "@/components/site-v2/LegalPage";
import { en } from "@/content/site-v2/en";
import { terms, termsLegal } from "@/content/site-v2/terms";

const doc = terms.en;

export const metadata = legalMetadata(doc, termsLegal);

export default function TermsEn() {
  return <LegalPage t={en} doc={doc} legal={termsLegal} />;
}
