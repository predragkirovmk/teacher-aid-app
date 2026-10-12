"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ScanResultView } from "@/components/app/ScanResult";
import { interpretCode } from "@/lib/app/scan";
import { actions, useApp } from "@/lib/app/store";

/** What a phone's own camera app opens when it scans a class QR. */
export default function CheckinLink() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { checkins } = useApp();
  const scan = useMemo(() => interpretCode(`TA:${code}`), [code]);
  const subjectId = scan.kind === "class" ? scan.subject.id : null;

  useEffect(() => {
    if (subjectId) actions.checkIn(subjectId);
  }, [subjectId]);

  const entry = subjectId ? (checkins.find((c) => c.subject === subjectId) ?? null) : null;
  if (scan.kind === "class" && !entry) return null;

  return (
    <main className="screen screen--bare" style={{ padding: 0 }}>
      <ScanResultView
        result={scan}
        entry={entry}
        onAgain={() => router.push("/app/scan")}
        onDone={() => router.push("/app")}
      />
    </main>
  );
}
