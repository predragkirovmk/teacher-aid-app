"use client";

import { PrinterIcon } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { useSyncExternalStore } from "react";
import { Top } from "@/components/app/Top";
import { SUBJECTS } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";
import { checkinLink } from "@/lib/app/scan";

const noop = () => () => {};

export default function QrKit() {
  const { t } = useT();
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");

  return (
    <main className="screen">
      <Top title={t("kit.title")} />
      <p className="t-cap sub">{t("kit.sub")}</p>
      {origin && (
        <div className="kit">
          {SUBJECTS.map((s) => (
            <figure key={s.id}>
              <QRCodeSVG value={checkinLink(origin, s.code)} level="M" marginSize={1} fgColor="#07162f" bgColor="#ffffff" title={s.code} />
              <figcaption>
                {t(`subj.${s.id}`)}
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
