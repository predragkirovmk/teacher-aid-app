import { LegalPage, legalMetadata } from "@/components/site-v2/LegalPage";
import { mk } from "@/content/site-v2/mk";
import { privacy, privacyLegal } from "@/content/site-v2/privacy";

const doc = privacy.mk;

export const metadata = legalMetadata(doc, privacyLegal);

export default function PrivacyMk() {
  return <LegalPage t={mk} doc={doc} legal={privacyLegal} />;
}
