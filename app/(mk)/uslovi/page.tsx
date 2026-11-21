import { LegalPage, legalMetadata } from "@/components/site-v2/LegalPage";
import { mk } from "@/content/site-v2/mk";
import { terms, termsLegal } from "@/content/site-v2/terms";

const doc = terms.mk;

export const metadata = legalMetadata(doc, termsLegal);

export default function TermsMk() {
  return <LegalPage t={mk} doc={doc} legal={termsLegal} />;
}
