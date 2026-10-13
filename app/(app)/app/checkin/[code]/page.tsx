"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ScanResultView } from "@/components/app/ScanResult";
import { interpretCode } from "@/lib/app/scan";
import { actions, useApp } from "@/lib/app/store";

const noop = () => () => {};

/** What a phone's own camera app opens when it scans a class QR. */
export default function CheckinLink() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { checkins, signedIn } = useApp();
  const scan = useMemo(() => interpretCode(`TA:${code}`), [code]);
  const subjectId = scan.kind === "class" ? scan.subject.id : null;
  // False while hydrating, when signedIn is still the server default rather than the saved value.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  // Logged out, the shell sends this link through the welcome screen first; record it on return.
  useEffect(() => {
    if (hydrated && subjectId && signedIn) actions.checkIn(subjectId);
  }, [hydrated, subjectId, signedIn]);

  const entry = subjectId ? (checkins.find((c) => c.subject === subjectId) ?? null) : null;
  if (scan.kind === "class" && !entry) return null;

  return (
    <main className="screen screen--bare" style={{ padding: 0 }}>
      <ScanResultView
        result={scan}
        entry={entry}
        // This screen is where a class link lands, so leaving it replaces it rather than stacking on it.
        onAgain={() => router.replace("/app/scan")}
        onDone={() => router.replace("/app")}
      />
    </main>
  );
}
