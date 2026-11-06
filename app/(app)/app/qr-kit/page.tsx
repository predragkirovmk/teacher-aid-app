"use client";

import { PrinterIcon } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { notFound } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Top } from "@/components/app/Top";
import { demoOnly } from "@/lib/app/api";
import { CLASS_CODES } from "@/lib/app/demo";
import { useT } from "@/lib/app/i18n";
import { checkinLink } from "@/lib/app/scan";
import { subjectLabel } from "@/lib/app/subjects";

const noop = () => () => {};

/** Printable test codes for the demo's classes. A real class code comes from the teacher's screen. */
export default function QrKit() {
  const { t } = useT();
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  if (!demoOnly) notFound();

  return (
    <main className="screen">
      <Top title={t("kit.title")} />
      <p className="t-cap sub">{t("kit.sub")}</p>
      {origin && (
        <div className="kit">
          {CLASS_CODES.map((s) => (
            <figure key={s.subjectId}>
              <QRCodeSVG value={checkinLink(origin, s.code)} level="M" marginSize={1} fgColor="#07162f" bgColor="#ffffff" title={s.code} />
              <figcaption>
                {subjectLabel(t, s.subjectId, s.subjectId)}
                <small>{s.code}</small>
              </figcaption>
            </figure>
          ))}
          <figure>
            <QRCodeSVG value="TeacherAid demo: this is not a class code." level="M" marginSize={1} fgColor="#07162f" bgColor="#ffffff" title="Other" />
            <figcaption>
              {t("kit.other")}
              <small>{t("kit.otherHint")}</small>
            </figcaption>
          </figure>
          <figure>
            <QRCodeSVG value={checkinLink(origin, "BIO-9A")} level="M" marginSize={1} fgColor="#07162f" bgColor="#ffffff" title="BIO-9A" />
            <figcaption>
              BIO-9A
              <small>{t("res.unknown.title")}</small>
            </figcaption>
          </figure>
        </div>
      )}
      <button className="btn btn--ghost btn--block" style={{ marginTop: 24 }} onClick={() => window.print()}>
        <PrinterIcon size={20} aria-hidden="true" />
        {t("kit.print")}
      </button>
    </main>
  );
}
