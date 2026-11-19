"use client";

import { KeyboardIcon, QrCodeIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties } from "react";
import { CodeForm, Miss } from "@/components/app/JoinCode";
import { startJoin } from "@/lib/app/api/hooks";
import { toApiError, type ApiErrorCode } from "@/lib/app/api/errors";
import { HAPTICS, buzz } from "@/lib/app/haptics";
import { useT } from "@/lib/app/i18n";
import { FORWARD } from "@/lib/app/nav";

/** The Scan tab: the way into a lesson. A big call to action opens the camera; a typed code does the same without one. */
export default function Join() {
  const { t } = useT();
  const router = useRouter();
  const [typing, setTyping] = useState(false);
  const [miss, setMiss] = useState<{ code?: ApiErrorCode } | null>(null);
  const joining = useRef(false);

  // The same path a scan takes: the API says whether the code opens a session, then the quiz carries on.
  const join = (code: string) => {
    if (joining.current) return;
    joining.current = true;
    startJoin(code, true).then(
      () => {
        buzz(HAPTICS.send);
        router.push(`/app/play/${code}`, FORWARD);
      },
      (e) => {
        joining.current = false;
        setMiss({ code: toApiError(e).code });
      },
    );
  };

  return (
    <main className="screen join">
      <div className="rise" style={{ "--i": 0 } as CSSProperties}>
        <h1 className="large" style={{ marginBottom: 8 }}>
          {t("join.title")}
        </h1>
        <p className="t-body muted" style={{ margin: 0 }}>
          {t("join.line")}
        </p>
      </div>

      <div className="join__stage rise" style={{ "--i": 1 } as CSSProperties}>
        <Link href="/app/scan" className="join-cta" transitionTypes={["nav-forward"]}>
          <span className="join-cta__halo" aria-hidden="true" />
          <span className="join-cta__face">
            <QrCodeIcon className="join-cta__glyph" size={44} weight="bold" aria-hidden="true" />
            {t("nav.scanJoin")}
          </span>
        </Link>
      </div>

      <div className="rise" style={{ "--i": 2 } as CSSProperties}>
        {typing ? (
          <CodeForm onCode={join} />
        ) : (
          <button className="btn btn--ghost btn--block" onClick={() => setTyping(true)}>
            <KeyboardIcon size={20} aria-hidden="true" />
            {t("scan.code")}
          </button>
        )}
      </div>

      {miss && <Miss clearOfTabs code={miss.code} again={t("join.again")} onAgain={() => setMiss(null)} />}
    </main>
  );
}
