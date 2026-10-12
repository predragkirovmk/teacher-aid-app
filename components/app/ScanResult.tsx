"use client";

import { CircleCheck, QrCode, ScanLine, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ScanResult } from "@/lib/app/scan";
import type { Checkin } from "@/lib/app/store";
import { formatTime } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";

export function ScanResultView({
  result,
  entry,
  onAgain,
  onDone,
}: {
  result: ScanResult;
  entry: Checkin | null;
  onAgain: () => void;
  onDone: () => void;
}) {
  const { t } = useT();

  if (result.kind === "class" && entry) {
    return (
      <div className="result-screen" role="status" aria-live="polite">
        <span className="badge">
          <CircleCheck size={60} strokeWidth={2} aria-hidden="true" />
        </span>
        <h1 className="t-display">{t("res.ok.title")}</h1>
        <p className="t-body" style={{ margin: 0, fontWeight: 600 }}>
          {t("res.ok.sub", { subject: t(`subj.${result.subject.id}`), teacher: t(`teacher.${result.subject.id}`) })}
        </p>
        <p className="t-cap" style={{ margin: 0 }}>
          {t("res.ok.time", { time: formatTime(entry.at) })}
        </p>
        <div className="stack" style={{ width: "100%", marginTop: 26 }}>
          <button className="btn btn--primary btn--block" onClick={onDone}>
            {t("res.done")}
          </button>
          <Link href="/app/attendance" className="btn btn--ghost btn--block">
            {t("res.attendance")}
          </Link>
        </div>
      </div>
    );
  }

  const unknown = result.kind === "unknown-class";
  return (
    <div className="result-screen" role="alert">
      <span className="badge badge--quiet">
        {unknown ? <TriangleAlert size={56} strokeWidth={2} aria-hidden="true" /> : <QrCode size={56} strokeWidth={2} aria-hidden="true" />}
      </span>
      <h1 className="t-display" style={{ fontSize: 30 }}>
        {unknown ? t("res.unknown.title") : t("res.other.title")}
      </h1>
      <p className="t-body" style={{ margin: 0 }}>
        {unknown ? t("res.unknown.sub", { code: result.code }) : t("res.other.sub")}
      </p>
      {!unknown && <div className="raw">{result.raw.slice(0, 300)}</div>}
      <div className="stack" style={{ width: "100%", marginTop: 26 }}>
        <button className="btn btn--primary btn--block" onClick={onAgain}>
          <ScanLine size={22} strokeWidth={2} aria-hidden="true" />
          {t("res.again")}
        </button>
        <button className="btn btn--ghost btn--block" onClick={onDone}>
          {t("res.done")}
        </button>
      </div>
    </div>
  );
}
