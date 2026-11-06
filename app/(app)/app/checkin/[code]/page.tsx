"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/app/api/hooks";

const noop = () => () => {};

/**
 * What a phone's own camera app opens when it scans a class QR. It hands over to the live quiz,
 * which records the check-in; logged out, the shell sends it through the welcome screen first.
 */
export default function CheckinLink() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const signedIn = useAuth().status === "signedIn";
  // False while hydrating, when signedIn is still the server default rather than the saved value.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (hydrated && signedIn) router.replace(`/app/play/${encodeURIComponent(code)}`);
  }, [hydrated, signedIn, code, router]);

  return null;
}
