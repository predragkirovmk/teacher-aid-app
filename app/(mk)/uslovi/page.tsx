import { TermsPage, termsMetadata } from "@/components/site-v2/TermsPage";
import { mk } from "@/content/site-v2/mk";
import { terms } from "@/content/site-v2/terms";

const doc = terms.mk;

export const metadata = termsMetadata(doc);

export default function TermsMk() {
  return <TermsPage t={mk} doc={doc} />;
}
