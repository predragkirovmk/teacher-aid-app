"use client";

import { KeyboardIcon, QrCodeIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties } from "react";
import { CodeForm, Joining, Miss } from "@/components/app/JoinCode";
import { startJoin } from "@/lib/app/api/hooks";
import { toApiError, type ApiErrorCode } from "@/lib/app/api/errors";
import { HAPTICS, buzz } from "@/lib/app/haptics";
import { useT } from "@/lib/app/i18n";
import { FORWARD } from "@/lib/app/nav";
import { interpretCode } from "@/lib/app/scan";

/** The Scan tab: the way into a lesson. A big call to action opens the camera; a typed code does the same without one. */
export default function Join() {
  const { t } = useT();
  const router = useRouter();
  const [typing, setTyping] = useState(false);
  const [miss, setMiss] = useState<{ code?: ApiErrorCode } | null>(null);
  const joining = useRef(false);
  const form = useRef<HTMLDivElement>(null);

  const [waiting, setWaiting] = useState(false);
  const last = useRef<string | null>(null);

  // The same path a scan takes: the API says whether the code opens a session, then the quiz carries on.
  const join = (typed: string) => {
    if (joining.current) return;
    // The field accepts what a scan gives too (a TA: tag), so the code is read out of it as the scanner does; the tag is not a code.
    const scan = interpretCode(typed);
    if (scan.kind !== "code") return;
    const code = scan.code;
    last.current = code;
    joining.current = true;
    setMiss(null);
    setWaiting(true);
    startJoin(code, true).then(
      () => {
        buzz(HAPTICS.send);
        router.push(`/app/play/${code}`, FORWARD);
      },
      (e) => {
        joining.current = false;
        setWaiting(false);
        setMiss({ code: toApiError(e).code });
      },
    );
  };

  // The sheet held the focus; give it back to the field so the next try is typed at once.
  const tryAgain = () => {
    setMiss(null);
    form.current?.querySelector("input")?.focus();
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
            <span className="join-cta__label">{t("nav.scanJoin")}</span>
          </span>
        </Link>
      </div>

      <div ref={form} className="rise" style={{ "--i": 2 } as CSSProperties}>
        {typing ? (
          <CodeForm onCode={join} />
        ) : (
          <button className="btn btn--ghost btn--block" onClick={() => setTyping(true)}>
            <KeyboardIcon size={20} aria-hidden="true" />
            {t("scan.code")}
          </button>
        )}
      </div>

      {waiting && <Joining clearOfTabs />}
      {miss && <Miss clearOfTabs code={miss.code} again={t("join.again")} onAgain={tryAgain} onRetry={() => join(last.current!)} />}
    </main>
  );
}
