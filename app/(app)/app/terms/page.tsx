"use client";

import { Document } from "@/components/app/Document";
import { useT } from "@/lib/app/i18n";
import { TERMS } from "@/lib/app/privacy-copy";

/** The terms of use: a few rules in plain words for a student. It can be read without signing in. */
export default function TermsPage() {
  const { locale } = useT();
  return <Document doc={TERMS[locale]} jumpList={false} />;
}
