"use client";

import { BuildingsIcon, ClockIcon, EnvelopeSimpleIcon, EyeIcon, ShieldCheckIcon, type Icon } from "@phosphor-icons/react";
import { Document } from "@/components/app/Document";
import { useT } from "@/lib/app/i18n";
import { PRIVACY } from "@/lib/app/privacy-copy";

/** One icon for each line of the short version, in the order they are written. */
const SUMMARY_ICONS: Icon[] = [BuildingsIcon, EyeIcon, ShieldCheckIcon, EnvelopeSimpleIcon, ClockIcon];

/**
 * The privacy notice: written for the students themselves (12 to 15 and up), a short version first and the details below, each
 * with an anchor so the screens that mention something can link to it (`#focus`, `#alerts`, `#ask`, `#phone`). It can be read
 * without signing in.
 */
export default function PrivacyPage() {
  const { locale } = useT();
  const doc = PRIVACY[locale];
  return (
    <Document
      doc={doc}
      summary={
        <section className="card doc__summary" aria-labelledby="doc-summary">
          <h2 id="doc-summary" className="t-title">
            {doc.summaryTitle}
          </h2>
          <ul className="doc__sum">
            {doc.summary.map((line, i) => {
              const Glyph = SUMMARY_ICONS[i];
              return (
                <li key={line} className="doc__sum-row">
                  <span className="item__icon">
                    <Glyph size={22} aria-hidden="true" />
                  </span>
                  <span className="t-body">{line}</span>
                </li>
              );
            })}
          </ul>
        </section>
      }
    />
  );
}
