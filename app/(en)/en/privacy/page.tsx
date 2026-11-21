import { LegalPage, legalMetadata } from "@/components/site-v2/LegalPage";
import { en } from "@/content/site-v2/en";
import { privacy, privacyLegal } from "@/content/site-v2/privacy";

const doc = privacy.en;

export const metadata = legalMetadata(doc, privacyLegal);

export default function PrivacyEn() {
  return <LegalPage t={en} doc={doc} legal={privacyLegal} />;
}
